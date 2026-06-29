import api from '@/lib/apiClient'
import type { Listing, ListingWritePayload, ListingFilters, SavedListing, PaginatedResponse } from '@/types'

export const listingsApi = {
  list: (filters: ListingFilters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return
      if (Array.isArray(v)) v.forEach((i) => params.append(k, String(i)))
      else params.set(k, String(v))
    })
    return api.get<PaginatedResponse<Listing>>(`/listings/?${params}`)
  },
  create: (d: ListingWritePayload) => api.post<Listing>('/listings/', d),
  get: (id: number) => api.get<Listing>(`/listings/${id}`),
  update: (id: number, d: Partial<ListingWritePayload>) => api.patch<Listing>(`/listings/${id}`, d),
  delete: (id: number) => api.delete(`/listings/${id}`),
  submit: (id: number) => api.post<Listing>(`/listings/${id}/submit`),
  save: (id: number) => api.post<SavedListing>(`/listings/${id}/save`),
  unsave: (id: number) => api.delete(`/listings/${id}/save`),
  myListings: (page = 1) =>
    api.get<PaginatedResponse<Listing>>(`/listings/?my=true&page=${page}`),
  uploadPhoto: (id: number, file: File) => {
    const fd = new FormData(); fd.append('image', file)
    return api.post(`/listings/${id}/photos/`, fd)
  },
  deletePhoto: (listingId: number, photoId: number) =>
    api.delete(`/listings/${listingId}/photos/${photoId}/`),
}

export const savedApi = {
  list: (page = 1) => api.get<PaginatedResponse<SavedListing>>(`/saved/?page=${page}`),
  save: (id: number) => listingsApi.save(id),
  unsave: (id: number) => listingsApi.unsave(id),
}
