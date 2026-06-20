import api from '@/lib/apiClient'
import type { User } from '@/types'

const idemHeaders = (key?: string) => (key ? { headers: { 'Idempotency-Key': key } } : undefined)

export const authApi = {
  register: (d: { email: string; full_name: string; phone?: string; role: string; password: string }, idempotencyKey?: string) =>
    api.post('/auth/register', d, idemHeaders(idempotencyKey)),
  login: (d: { email: string; password: string }) =>
    api.post<{ access: string; user: User }>('/auth/login', d),
  refresh: () => api.post<{ access: string }>('/auth/refresh'),
  logout: (idempotencyKey?: string) => api.post('/auth/logout', {}, idemHeaders(idempotencyKey)),
  verifyEmail: (d: { email: string; code: string }) => api.post('/auth/verify-email', d),
  resendOtp: (d: { email: string }) => api.post('/auth/verify-email/resend', d),
  passwordReset: (d: { email: string }, idempotencyKey?: string) =>
    api.post('/auth/password-reset', d, idemHeaders(idempotencyKey)),
  passwordResetConfirm: (d: { email: string; code: string; new_password: string }, idempotencyKey?: string) =>
    api.post('/auth/password-reset/confirm', d, idemHeaders(idempotencyKey)),
}
