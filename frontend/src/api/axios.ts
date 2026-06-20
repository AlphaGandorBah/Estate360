import axios from 'axios'
import { v4 as uuid } from 'uuid'
import { useAuthStore } from '@/store/auth'
import { pushToast } from '@/lib/toast'
import { toAppError } from '@/lib/utils'

const IDEMPOTENT_URLS = [
  '/auth/register', '/auth/logout', '/auth/password-reset',
  '/auth/password-reset/confirm', '/listings/', '/submit',
  '/save', '/conversations/', '/messages', '/verification/',
  '/decision', '/resolve', '/reports/',
]

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
})

api.interceptors.request.use((config) => {
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

let refreshing: Promise<string> | null = null

/**
 * Single-flight token refresh: concurrent callers (failed REST requests, a
 * dropped WebSocket) share one in-flight refresh instead of each firing their
 * own. Returns the new access token, or throws if the refresh itself fails
 * (caller is responsible for clearing the session in that case).
 */
export function refreshAccessToken(): Promise<string> {
  if (!refreshing) {
    refreshing = axios
      .post('/api/v1/auth/refresh', {}, {
        withCredentials: true,
        headers: { 'X-Requested-With': 'estate360-web' },
      })
      .then((r) => r.data.access as string)
      .finally(() => { refreshing = null })
  }
  return refreshing
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    const status = err.response?.status

    if (status === 401 && !original._retry) {
      original._retry = true
      try {
        const access = await refreshAccessToken()
        useAuthStore.getState().setAccess(access)
        original.headers.Authorization = `Bearer ${access}`
        return api(original)
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
        return api(original)
      }
      pushToast(`Too many requests — please wait ${Math.ceil(delayMs / 1000)}s and try again.`, 'info')
      return Promise.reject(err)
    }

    if (status === 409 && !original._retried409) {
      original._retried409 = true
      pushToast('Still processing your last request, retrying…', 'info')
      await sleep(1000)
      return api(original)
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

    return Promise.reject(err)
  },
)

export default api
