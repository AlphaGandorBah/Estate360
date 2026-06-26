import api from '@/lib/apiClient'
import type { User, PublicUser } from '@/types'

export const usersApi = {
  me: () => api.get<User>('/users/me'),
  updateMe: (d: Partial<Pick<User, 'full_name' | 'phone'>>) => api.patch<User>('/users/me', d),
  deleteMe: () => api.delete('/users/me'),
  publicProfile: (id: string) => api.get<PublicUser>(`/users/${id}/public`),
  getProfile: (id: number | string) => api.get<PublicUser>(`/users/${id}/public`),
  uploadAvatar: (file: File) => {
    const fd = new FormData(); fd.append('avatar', file)
    return api.post<User>('/users/me/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  deleteAvatar: () => api.delete<User>('/users/me/avatar'),
}
