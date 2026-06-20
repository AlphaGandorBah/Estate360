import axios from 'axios'
import { v4 as uuid } from 'uuid'
import { useAuthStore, refreshAccessToken } from '@/lib/auth'
import { pushToast } from '@/lib/toast'
import { toAppError } from '@/lib/utils'

const IDEMPOTENT_URLS = [
  '/auth/register', '/auth/logout', '/auth/password-reset',
  '/auth/password-reset/confirm', '/listings/', '/submit',
  '/save', '/conversations/', '/messages', '/verification/',
  '/decision', '/resolve', '/reports/',
]

const apiClient = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
})

apiClient.interceptors.request.use((config) => {
  const access = useAuthStore.getState().access
  if (access) config.headers.Authorization = `Bearer ${access}`

  const url = config.url ?? ''
  if (url.includes('/auth/refresh') || url.includes('/auth/logout')) {
    config.headers['X-Requested-With'] = 'estate360-web'
  }

  const isIdempotent = IDEMPOTENT_URLS.some((u) => url.includes(u))
  const isWrite = ['post', 'put', 'patch', 'delete'].includes(config.method ?? '')
  if (isIdempotent && isWrite && !config.headers['Idempotency-Key']) {
    config.headers['Idempotency-Key'] = uuid()
  }

  return config
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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
      } catch {
        useAuthStore.getState().clearAuth()
        window.location.href = '/login'
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
      const appError = toAppError(err, 'You do not have permission to do that.')
      pushToast(appError.detail, 'error', appError.requestId)
      if (window.location.pathname !== '/') window.location.href = '/'
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

    return Promise.reject(err)
  },
)

export default apiClient
