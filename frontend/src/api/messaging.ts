import api from '@/lib/apiClient'
import type { Conversation, Message, PaginatedResponse } from '@/types'

export const messagingApi = {
  conversations: (page = 1) => api.get<PaginatedResponse<Conversation>>(`/conversations/?page=${page}`),
  list: (page = 1) => api.get<PaginatedResponse<Conversation>>(`/conversations/?page=${page}`),
  startConversation: (d: { landlord_id: string; listing_id?: number; initial_message?: string }) =>
    api.post<Conversation>('/conversations/', d),
  startSupportConversation: (d: { initial_message?: string } = {}) =>
    api.post<Conversation>('/conversations/', { support: true, ...d }),
  create: (d: { listing: number }) =>
    api.post<Conversation>('/conversations/', { listing_id: d.listing }),
  get: (id: number) => api.get<Conversation>(`/conversations/${id}`),
  messages: (convId: number, page = 1) =>
    api.get<PaginatedResponse<Message>>(`/conversations/${convId}/messages?page=${page}`),
  sendMessage: (convId: number, d: { body?: string; content?: string; client_key?: string }) =>
    api.post<Message>(`/conversations/${convId}/messages`, { body: d.body ?? d.content, client_key: d.client_key }),
}
