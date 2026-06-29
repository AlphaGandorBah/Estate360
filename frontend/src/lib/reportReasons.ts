import type { ReportReason } from '@/types'

export const LISTING_REPORT_REASONS: ReportReason[] = [
  'fake_listing', 'misleading', 'scam', 'wrong_price', 'not_available', 'other',
]

export const USER_REPORT_REASONS: ReportReason[] = [
  'harassment', 'abusive_behavior', 'non_payment', 'property_damage', 'unresponsive', 'scam', 'other',
]

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  fake_listing: 'Fake listing',
  misleading: 'Misleading information',
  scam: 'Scam',
  wrong_price: 'Wrong price',
  not_available: 'Not available',
  harassment: 'Harassment',
  abusive_behavior: 'Abusive behavior',
  non_payment: 'Non-payment',
  property_damage: 'Property damage',
  unresponsive: 'Unresponsive',
  other: 'Other',
}
