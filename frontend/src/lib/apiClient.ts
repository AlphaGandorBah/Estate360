import axios from 'axios'
import { v4 as uuid } from 'uuid'
import { useAuthStore, refreshAccessToken } from '@/lib/auth'
import { pushToast } from '@/lib/toast'
import { toAppError } from '@/lib/utils'

const IDEMPOTENT_URLS = [
  '/auth/register', '/auth/logout', '/auth/password-reset',
  '/auth/password-reset/confirm', '/listings/', '/submit',
  '/save', '/conversations/', '/messages', '/verification/',
  '/decision', '/resolve', '/reports/', '/action',
]

const apiClient = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
})

apiClient.interceptors.request.use((config) => {
  const access = useAuthStore.getState().access
  if (access) config.headers.Authorization = `Bearer ${access}`

  // Sent on every request (not just refresh/logout): browsers won't attach
  // this cross-origin without a CORS preflight, which the backend rejects
  // from unexpected origins — CSRF defense-in-depth alongside SameSite.
  config.headers['X-Requested-With'] = 'estate360-web'

  const url = config.url ?? ''
  const isIdempotent = IDEMPOTENT_URLS.some((u) => url.includes(u))
  const isWrite = ['post', 'put', 'patch', 'delete'].includes(config.method ?? '')
  if (isIdempotent && isWrite && !config.headers['Idempotency-Key']) {
    config.headers['Idempotency-Key'] = uuid()
  }

  return config
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// A page with several concurrent queries (notifications, conversations, etc.)
// can have every one of them 401 around the same moment, each independently
// retrying and failing — without this guard each would push its own toast
// and redirect. Only the first one gets to react; the page is on its way to
// /login by the time the rest reject anyway.
let sessionEndHandled = false

async function endSession(err: unknown, fallbackMessage: string) {
  if (sessionEndHandled) return
  sessionEndHandled = true
  useAuthStore.getState().clearAuth()
  // A plain expired session redirects silently — that's normal and expected.
  // A ban is not, so give the user a reason before bouncing them, instead of
  // leaving them to guess why they were suddenly logged out.
  const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code
  if (code === 'account_banned') {
    const appError = toAppError(err, fallbackMessage)
    pushToast(appError.detail, 'error', appError.requestId)
    await sleep(1500)
  }
  // Preserve where the user was headed so login can return them there
  // afterward, instead of always dropping them on the default landing page.
  const current = window.location.pathname + window.location.search
  const loginUrl = current && current !== '/' && !current.startsWith('/login')
    ? `/login?next=${encodeURIComponent(current)}`
    : '/login'
  window.location.href = loginUrl
}

apiClient.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    const status = err.response?.status

    // A 401 only means "your session expired, try a silent refresh" for a
    // request that was actually sent WITH a bearer token. A request with no
    // Authorization header (login, register, verify-email, password reset)
    // returning 401 means "those credentials/code were wrong" — routing
    // that through the refresh-then-redirect-to-login dance would force a
    // full-page redirect back to /login before the caller's own catch block
    // (and the "Invalid email or password" message it shows) ever runs.
    const hadBearerToken = Boolean(original.headers?.Authorization)
    if (status === 401 && hadBearerToken && !original._retry) {
      original._retry = true
      try {
        const access = await refreshAccessToken()
        useAuthStore.getState().setAccess(access)
        original.headers.Authorization = `Bearer ${access}`
        return apiClient(original)
      } catch (refreshErr) {
        await endSession(refreshErr, 'Your account has been suspended.')
      }
      return Promise.reject(err)
    }

    if (status === 429) {
      const retryAfterSec = Number(err.response.headers?.['retry-after']) || 1
      const delayMs = Math.min(retryAfterSec * 1000, 30000)
      const isSafeRead = (original.method ?? 'get').toLowerCase() === 'get'
      original._retryCount = (original._retryCount ?? 0) + 1
      if (isSafeRead && original._retryCount <= 3) {
        await sleep(delayMs)
        return apiClient(original)
      }
      pushToast(`Too many requests — please wait ${Math.ceil(delayMs / 1000)}s and try again.`, 'info')
      return Promise.reject(err)
    }

    if (status === 409 && !original._retried409) {
      original._retried409 = true
      pushToast('Still processing your last request, retrying…', 'info')
      await sleep(1000)
      return apiClient(original)
    }

    if (status === 403) {
      if (err.response?.data?.code === 'account_banned') {
        await endSession(err, 'Your account has been suspended.')
        return Promise.reject(err)
      }

      const appError = toAppError(err, 'You do not have permission to do that.')
      pushToast(appError.detail, 'error', appError.requestId)
      if (window.location.pathname !== '/') {
        // window.location.href is a full page reload, which would wipe the
        // toast we just pushed (it lives in an in-memory store) before the
        // user ever sees it. Give it a moment to render first.
        await sleep(1500)
        window.location.href = '/'
      }
      return Promise.reject(err)
    }

    if (status === 503) {
      const appError = toAppError(err, 'Service temporarily unavailable. Please try again.')
      pushToast(appError.detail, 'error', appError.requestId)
      return Promise.reject(err)
    }

    if (status === undefined) {
      // No response at all: dead backend, dropped connection, CORS rejection,
      // or timeout. Without this branch these fail completely silently and
      // every action on the page looks like a dead button.
      const message = err.code === 'ECONNABORTED'
        ? 'Request timed out. Please try again.'
        : "Can't reach the server — check your connection and try again."
      pushToast(message, 'error')
      return Promise.reject(err)
    }

    if (status >= 500) {
      // An unexpected server error (vs. a 4xx a page often handles itself
      // with inline validation) — without this, callers that only restore
      // their own state on failure (e.g. giving a draft back) look like
      // they silently did nothing.
      const appError = toAppError(err, 'Something went wrong on our end. Please try again.')
      pushToast(appError.detail, 'error', appError.requestId)
      return Promise.reject(err)
    }

    return Promise.reject(err)
  },
)

export default apiClient
