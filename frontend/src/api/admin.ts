import api from '@/lib/apiClient'
import type { Listing, User, Verification, FraudReport, PaginatedResponse } from '@/types'

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
