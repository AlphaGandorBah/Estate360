// API timestamps are UTC ISO 8601. Freetown is UTC+00:00 with no DST, so
// numerically these render the same as UTC — but the timeZone is set
// explicitly so that doesn't depend on the reader's locale assumptions.
const FREETOWN_TZ = 'Africa/Freetown'

export function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat('en-SL', { style: 'currency', currency }).format(amount)
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: FREETOWN_TZ }).format(new Date(iso))
}

export function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return formatDate(iso)
}
