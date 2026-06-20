import api from '@/lib/apiClient'
import type { Panorama, PaginatedResponse } from '@/types'

export const panoramasApi = {
  list: (listingId: number) => api.get<PaginatedResponse<Panorama>>(`/listings/${listingId}/panoramas/`),
  upload: (listingId: number, form: FormData) =>
    api.post<Panorama>(`/listings/${listingId}/panoramas/`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  get: (id: number) => api.get<Panorama>(`/panoramas/${id}`),
  delete: (id: number) => api.delete(`/panoramas/${id}`),
}
