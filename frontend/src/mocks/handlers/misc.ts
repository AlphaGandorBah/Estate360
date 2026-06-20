import { http, HttpResponse } from 'msw'
import { mockNotifications } from '../fixtures'

let notifications = [...mockNotifications]

export const chatbotHandlers = [
  http.post('/api/v1/chatbot/query', async ({ request }) => {
    const { message } = await request.json() as { message: string }
    return HttpResponse.json({
      reply: `(mock) You asked: "${message}". The real assistant answers this from the knowledge base once the backend is connected.`,
      intent: null,
      confidence: 0,
      followups: ['How do I save a listing?', 'How does verification work?'],
    })
  }),
]

export const notificationsHandlers = [
  http.get('/api/v1/notifications/', () =>
    HttpResponse.json({ count: notifications.length, next: null, previous: null, results: notifications })),

  http.post('/api/v1/notifications/:id/read', ({ params }) => {
    notifications = notifications.map((n) => (n.id === Number(params.id) ? { ...n, is_read: true } : n))
    return HttpResponse.json({}, { status: 200 })
  }),

  http.post('/api/v1/notifications/read-all', () => {
    notifications = notifications.map((n) => ({ ...n, is_read: true }))
    return HttpResponse.json({}, { status: 200 })
  }),
]
