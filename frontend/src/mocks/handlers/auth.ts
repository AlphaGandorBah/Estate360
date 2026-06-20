import { http, HttpResponse } from 'msw'
import { mockUsers } from '../fixtures'

// MSW intercepts at the network layer, so there's no real httpOnly cookie
// jar to drive a refresh — this in-memory flag simulates "a valid refresh
// session exists" well enough to exercise the silent-refresh code path.
let hasSession = false
let currentUser = mockUsers[0]

export const authHandlers = [
  http.post('/api/v1/auth/register', async ({ request }) => {
    const body = await request.json() as { email: string; role: string }
    return HttpResponse.json({ id: 'new-user', email: body.email, role: body.role }, { status: 201 })
  }),

  http.post('/api/v1/auth/login', async ({ request }) => {
    const body = await request.json() as { email: string; password: string }
    const user = mockUsers.find((u) => u.email === body.email)
    if (!user) {
      return HttpResponse.json({ code: 'invalid_credentials', detail: 'Invalid email or password.' }, { status: 401 })
    }
    hasSession = true
    currentUser = user
    return HttpResponse.json({ access: 'mock-access-token', user })
  }),

  http.post('/api/v1/auth/refresh', () => {
    if (!hasSession) {
      return HttpResponse.json({ code: 'no_session', detail: 'No active session.' }, { status: 401 })
    }
    return HttpResponse.json({ access: 'mock-access-token-refreshed' })
  }),

  http.post('/api/v1/auth/logout', () => {
    hasSession = false
    return HttpResponse.json({}, { status: 204 })
  }),

  http.post('/api/v1/auth/verify-email', () => HttpResponse.json({}, { status: 200 })),
  http.post('/api/v1/auth/verify-email/resend', () => HttpResponse.json({}, { status: 200 })),
  http.post('/api/v1/auth/password-reset', () => HttpResponse.json({}, { status: 200 })),
  http.post('/api/v1/auth/password-reset/confirm', () => HttpResponse.json({}, { status: 200 })),

  http.get('/api/v1/users/me', () => {
    if (!hasSession) return HttpResponse.json({ code: 'unauthenticated', detail: 'Not logged in.' }, { status: 401 })
    return HttpResponse.json(currentUser)
  }),
]
