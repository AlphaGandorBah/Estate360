import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminApi } from '@/api'
import { formatDate } from '@/lib/intl'
import type { AdminActionType } from '@/types'

const ACTION_LABELS: Record<AdminActionType, string> = {
  ban_user: 'Banned user',
  unban_user: 'Unbanned user',
  restrict_user: 'Restricted user',
  unrestrict_user: 'Unrestricted user',
  reset_password: 'Sent password reset',
  delete_user: 'Deleted user',
  delete_listing: 'Deleted listing',
}

export default function AdminActionLogPage() {
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-action-log', page],
    queryFn: () => adminApi.actionLog(page).then((r) => r.data),
  })

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Admin action log</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Audit trail of moderation actions taken on users and listings.
      </p>

      {isLoading && (
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
          ))}
        </div>
      )}

      <div className="mt-4 space-y-2">
        {data?.results.map((entry) => (
          <div key={entry.id} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-gray-900 dark:text-gray-100">
                {ACTION_LABELS[entry.action] ?? entry.action}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {entry.admin_email ?? 'Unknown admin'}
                {entry.target_user_email && <> → {entry.target_user_email}</>}
                {entry.target_listing_title && <> → "{entry.target_listing_title}"</>}
              </div>
              {entry.notes && (
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Note: {entry.notes}</div>
              )}
            </div>
            <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
              {formatDate(entry.created_at)}
            </span>
          </div>
        ))}
      </div>

      {!data?.results.length && !isLoading && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white py-12 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
          No admin actions recorded yet
        </div>
      )}

      {(data?.next || data?.previous) && (
        <div className="mt-6 flex justify-center gap-3">
          <button disabled={!data.previous} onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300">← Prev</button>
          <button disabled={!data.next} onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300">Next →</button>
        </div>
      )}
    </div>
  )
}
