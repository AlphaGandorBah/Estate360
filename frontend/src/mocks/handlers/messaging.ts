import { http, HttpResponse } from 'msw'
import { mockConversations, mockMessages } from '../fixtures'
import type { Conversation, Message } from '@/types'

let conversations = [...mockConversations]
let messages = [...mockMessages]
let nextConvId = 100
let nextMsgId = 100

export const messagingHandlers = [
  http.get('/api/v1/conversations/', () =>
    HttpResponse.json({ count: conversations.length, next: null, previous: null, results: conversations })),

  http.post('/api/v1/conversations/', async ({ request }) => {
    const body = await request.json() as {
      support?: boolean; landlord_id?: string; listing_id?: number; initial_message?: string
    }
    const conv: Conversation = body.support
      ? {
          id: nextConvId++, initiator_id: 'u1', initiator_name: 'Aminata Koroma', initiator_role: 'tenant',
          landlord_id: null, landlord_name: null, is_support: true,
          listing_id: null, last_message_at: new Date().toISOString(),
          unread_count: 0, created_at: new Date().toISOString(),
        }
      : {
          id: nextConvId++, initiator_id: 'u1', initiator_name: 'Aminata Koroma', initiator_role: 'tenant',
          landlord_id: body.landlord_id ?? 'u2', landlord_name: 'Mohamed Bah', is_support: false,
          listing_id: body.listing_id ?? null, last_message_at: new Date().toISOString(),
          unread_count: 0, created_at: new Date().toISOString(),
        }
    conversations = [...conversations, conv]
    if (body.initial_message) {
      messages = [...messages, {
        id: nextMsgId++, sender_id: 'u1', sender_name: 'Aminata Koroma',
        body: body.initial_message, client_key: null, read_at: null, created_at: new Date().toISOString(),
      }]
    }
    return HttpResponse.json(conv, { status: 201 })
  }),

  http.get('/api/v1/conversations/:id', ({ params }) => {
    const conv = conversations.find((c) => c.id === Number(params.id))
    if (!conv) return HttpResponse.json({ code: 'not_found', detail: 'Conversation not found.' }, { status: 404 })
    return HttpResponse.json(conv)
  }),

  http.get('/api/v1/conversations/:id/messages', () =>
    HttpResponse.json({ count: messages.length, next: null, previous: null, results: messages })),

  http.post('/api/v1/conversations/:id/messages', async ({ request }) => {
    const body = await request.json() as { body?: string; client_key?: string }
    const msg: Message = {
      id: nextMsgId++, sender_id: 'u1', sender_name: 'Aminata Koroma',
      body: body.body ?? '', client_key: body.client_key ?? null, read_at: null, created_at: new Date().toISOString(),
    }
    messages = [...messages, msg]
    return HttpResponse.json(msg, { status: 201 })
  }),
]
