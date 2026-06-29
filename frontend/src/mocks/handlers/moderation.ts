import { http, HttpResponse } from 'msw'
import { mockUsers } from '../fixtures'
import type { FraudReport } from '@/types'

let nextReportId = 100

export const moderationHandlers = [
  http.post('/api/v1/reports/', async ({ request }) => {
    const body = await request.json() as {
      reason?: string; description?: string; listing_id?: number; reported_user_id?: string
    }
    if (!body.listing_id && !body.reported_user_id) {
      return HttpResponse.json(
        { code: 'validation_error', detail: 'Either listing_id or reported_user_id is required.' },
        { status: 400 },
      )
    }
    const reportedUser = body.reported_user_id ? mockUsers.find((u) => u.id === body.reported_user_id) : undefined
    const report: FraudReport = {
      id: nextReportId++,
      reporter_id: 'u1',
      reporter_name: 'Aminata Koroma',
      listing_id: body.listing_id ?? null,
      reported_user_id: body.reported_user_id ?? null,
      reported_user_name: reportedUser?.full_name ?? null,
      reason: (body.reason ?? 'other') as FraudReport['reason'],
      description: body.description ?? '',
      status: 'open',
      resolution_notes: '',
      created_at: new Date().toISOString(),
      resolved_at: null,
    }
    return HttpResponse.json(report, { status: 201 })
  }),
]
