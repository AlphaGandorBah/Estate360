import api from '@/lib/apiClient'
import type { FraudReport } from '@/types'

export const reportsApi = {
  submit: (d: { reason: string; description: string; listing_id?: number; reported_user_id?: string }) =>
    api.post<FraudReport>('/reports/', d),
  create: (d: { listing: number; reason: string; description: string }) =>
    api.post<FraudReport>('/reports/', { listing_id: d.listing, reason: d.reason, description: d.description }),
  reportUser: (d: { reported_user_id: string; reason: string; description: string }) =>
    api.post<FraudReport>('/reports/', { reported_user_id: d.reported_user_id, reason: d.reason, description: d.description }),
}
