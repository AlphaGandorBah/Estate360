import api from '@/lib/apiClient'
import type { AdminActionLog, Listing, User, Verification, FraudReport, PaginatedResponse } from '@/types'

export const adminApi = {
  stats: () => api.get<Record<string, number>>('/admin/stats/'),
  users: (opts: number | { role?: string; page?: number } = 1) => {
    if (typeof opts === 'number') return api.get<PaginatedResponse<User>>(`/admin/users/?page=${opts}`)
    const { role, page = 1 } = opts
    const q = role ? `?role=${role}&page=${page}` : `?page=${page}`
    return api.get<PaginatedResponse<User>>(`/admin/users/${q}`)
  },
  banUser: (id: string) => api.post<User>(`/admin/users/${id}/action`, { action: 'ban' }),
  unbanUser: (id: string) => api.post<User>(`/admin/users/${id}/action`, { action: 'unban' }),
  restrictUser: (id: string) => api.post<User>(`/admin/users/${id}/action`, { action: 'restrict' }),
  unrestrictUser: (id: string) => api.post<User>(`/admin/users/${id}/action`, { action: 'unrestrict' }),
  resetUserPassword: (id: string) => api.post<User>(`/admin/users/${id}/action`, { action: 'reset_password' }),
  deleteUser: (id: string) => api.delete(`/admin/users/${id}`),
  actionLog: (page = 1) => api.get<PaginatedResponse<AdminActionLog>>(`/admin/action-log/?page=${page}`),
  deleteListing: (id: number) => api.delete(`/admin/listings/${id}`),
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
  reports: (opts: number | { status?: string; page?: number } = 1) => {
    if (typeof opts === 'number') return api.get<PaginatedResponse<FraudReport>>(`/admin/reports/?page=${opts}`)
    const { status, page = 1 } = opts
    const q = status ? `?status=${status}&page=${page}` : `?page=${page}`
    return api.get<PaginatedResponse<FraudReport>>(`/admin/reports/${q}`)
  },
  resolveReport: (id: number, d: { decision: string; action?: string; notes?: string }) =>
    api.post<FraudReport>(`/admin/reports/${id}/resolve`, d),
  deletionRequests: (opts: { status?: string; page?: number } = {}) => {
    const { status = 'pending', page = 1 } = opts
    return api.get(`/admin/deletion-requests/?status=${status}&page=${page}`)
  },
  resolveDeletionRequest: (id: number, d: { decision: 'approved' | 'rejected'; notes?: string }) =>
    api.post(`/admin/deletion-requests/${id}/resolve`, d),
}
