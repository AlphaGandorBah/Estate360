import api from './axios'
import type {
  Listing, ListingWritePayload, ListingFilters,
  Panorama, SavedListing, Verification,
  Conversation, Message, Notification,
  SearchPreference, FraudReport, User, PublicUser,
  PaginatedResponse,
} from '@/types'

// ─── Auth ─────────────────────────────────────────────────────────────────────

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

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersApi = {
  me: () => api.get<User>('/users/me'),
  updateMe: (d: Partial<Pick<User, 'full_name' | 'phone'>>) => api.patch<User>('/users/me', d),
  deleteMe: () => api.delete('/users/me'),
  publicProfile: (id: string) => api.get<PublicUser>(`/users/${id}/public`),
  getProfile: (id: number | string) => api.get<PublicUser>(`/users/${id}/public`),
}

// ─── Listings ─────────────────────────────────────────────────────────────────

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
    return api.post(`/listings/${id}/photos/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  deletePhoto: (listingId: number, photoId: number) =>
    api.delete(`/listings/${listingId}/photos/${photoId}/`),
}

// ─── Saved ────────────────────────────────────────────────────────────────────

export const savedApi = {
  list: (page = 1) => api.get<PaginatedResponse<SavedListing>>(`/saved/?page=${page}`),
  save: (id: number) => listingsApi.save(id),
  unsave: (id: number) => listingsApi.unsave(id),
}

// ─── Panoramas ────────────────────────────────────────────────────────────────

export const panoramasApi = {
  list: (listingId: number) => api.get<PaginatedResponse<Panorama>>(`/listings/${listingId}/panoramas/`),
  upload: (listingId: number, form: FormData) =>
    api.post<Panorama>(`/listings/${listingId}/panoramas/`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  get: (id: number) => api.get<Panorama>(`/panoramas/${id}`),
  delete: (id: number) => api.delete(`/panoramas/${id}`),
}

// ─── Verification ─────────────────────────────────────────────────────────────

export const verificationApi = {
  me: () => api.get<Verification>('/verification/me'),
  myStatus: () => api.get<Verification>('/verification/me'),
  submit: (
    d: { document_type: string; notes?: string },
    files: { front: File; back?: File | null; selfie: File },
  ) => {
    const fd = new FormData()
    fd.append('document_type', d.document_type)
    if (d.notes) fd.append('notes', d.notes)
    fd.append('document_front', files.front)
    if (files.back) fd.append('document_back', files.back)
    fd.append('selfie', files.selfie)
    return api.post<Verification>('/verification/', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

// ─── Messaging ────────────────────────────────────────────────────────────────

export const messagingApi = {
  conversations: (page = 1) => api.get<PaginatedResponse<Conversation>>(`/conversations/?page=${page}`),
  list: (page = 1) => api.get<PaginatedResponse<Conversation>>(`/conversations/?page=${page}`),
  startConversation: (d: { landlord_id: string; listing_id?: number; initial_message?: string }) =>
    api.post<Conversation>('/conversations/', d),
  create: (d: { listing: number }) =>
    api.post<Conversation>('/conversations/', { listing_id: d.listing }),
  get: (id: number) => api.get<Conversation>(`/conversations/${id}/`),
  messages: (convId: number, page = 1) =>
    api.get<PaginatedResponse<Message>>(`/conversations/${convId}/messages/?page=${page}`),
  sendMessage: (convId: number, d: { body?: string; content?: string; client_key?: string }) =>
    api.post<Message>(`/conversations/${convId}/messages/`, { body: d.body ?? d.content, client_key: d.client_key }),
}

// ─── Notifications ────────────────────────────────────────────────────────────

export const notificationsApi = {
  list: (page = 1) => api.get<PaginatedResponse<Notification>>(`/notifications/?page=${page}`),
  markRead: (id: number) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
}

// ─── Recommendations ──────────────────────────────────────────────────────────

export const recommendationsApi = {
  list: () => api.get<PaginatedResponse<Listing>>('/recommendations/'),
  preferences: () => api.get<SearchPreference>('/preferences/me'),
  getPreferences: () => api.get<SearchPreference>('/preferences/me'),
  setPreferences: (d: Partial<SearchPreference>) => api.put<SearchPreference>('/preferences/set', d),
  savePreferences: (d: Partial<SearchPreference>) => api.put<SearchPreference>('/preferences/set', d),
}

// ─── Chatbot ──────────────────────────────────────────────────────────────────

export const chatbotApi = {
  query: (message: string) =>
    api.post<{ reply: string; intent: string | null; confidence: number; followups: string[] }>(
      '/chatbot/query', { message },
    ),
}

// ─── Fraud reports ────────────────────────────────────────────────────────────

export const reportsApi = {
  submit: (d: { reason: string; description: string; listing_id?: number; reported_user_id?: string }) =>
    api.post<FraudReport>('/reports/', d),
  create: (d: { listing: number; reason: string; description: string }) =>
    api.post<FraudReport>('/reports/', { listing_id: d.listing, reason: d.reason, description: d.description }),
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export const adminApi = {
  stats: () => api.get<Record<string, number>>('/admin/stats/'),
  users: (opts: number | { role?: string; page?: number } = 1) => {
    if (typeof opts === 'number') return api.get<PaginatedResponse<User>>(`/admin/users/?page=${opts}`)
    const { role, page = 1 } = opts
    const q = role ? `?role=${role}&page=${page}` : `?page=${page}`
    return api.get<PaginatedResponse<User>>(`/admin/users/${q}`)
  },
  listings: (opts: number | { status?: string; page?: number } = 1) => {
    if (typeof opts === 'number') return api.get<PaginatedResponse<Listing>>(`/admin/listings/?page=${opts}`)
    const { status, page = 1 } = opts
    const q = status ? `?status=${status}&page=${page}` : `?page=${page}`
    return api.get<PaginatedResponse<Listing>>(`/admin/listings/${q}`)
  },
  listingDecision: (id: number, d: { decision: string; notes?: string }) =>
    api.post<Listing>(`/admin/listings/${id}/decision`, d),
  approveListing: (id: number) =>
    api.post<Listing>(`/admin/listings/${id}/decision`, { decision: 'approved' }),
  rejectListing: (id: number, notes: string) =>
    api.post<Listing>(`/admin/listings/${id}/decision`, { decision: 'rejected', notes }),
  verifications: (opts: number | { status?: string; page?: number } = 1) => {
    if (typeof opts === 'number') return api.get<PaginatedResponse<Verification>>(`/admin/verifications/?page=${opts}`)
    const { status, page = 1 } = opts
    const q = status ? `?status=${status}&page=${page}` : `?page=${page}`
    return api.get<PaginatedResponse<Verification>>(`/admin/verifications/${q}`)
  },
  verificationDecision: (id: number, d: { decision: string; notes?: string }) =>
    api.post<Verification>(`/admin/verifications/${id}/decision`, d),
  approveVerification: (id: number) =>
    api.post<Verification>(`/admin/verifications/${id}/decision`, { decision: 'approved' }),
  rejectVerification: (id: number, notes: string) =>
    api.post<Verification>(`/admin/verifications/${id}/decision`, { decision: 'rejected', notes }),
  reports: (opts: number | { page?: number } = 1) => {
    const page = typeof opts === 'number' ? opts : (opts.page ?? 1)
    return api.get<PaginatedResponse<FraudReport>>(`/admin/reports/?page=${page}`)
  },
  resolveReport: (id: number, resolutionOrObj: string | { decision: string; notes?: string }, note?: string) => {
    const d = typeof resolutionOrObj === 'string'
      ? { decision: resolutionOrObj, notes: note }
      : resolutionOrObj
    return api.post<FraudReport>(`/admin/reports/${id}/resolve`, d)
  },
}
