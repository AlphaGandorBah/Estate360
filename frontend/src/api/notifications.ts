import api from '@/lib/apiClient'
import type { Notification, PaginatedResponse } from '@/types'

export const notificationsApi = {
  list: (page = 1) => api.get<PaginatedResponse<Notification>>(`/notifications/?page=${page}`),
  markRead: (id: number) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
}
