import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationsApi } from '@/api'
import { formatRelative } from '@/lib/intl'

export default function NotificationsPage() {
  const [page, setPage] = useState(1)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', page],
    queryFn: () => notificationsApi.list(page).then((r) => r.data),
  })

  const readMut = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const readAllMut = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
      ))}
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Notifications</h1>
        {(data?.results.some((n) => !n.is_read)) && (
          <button onClick={() => readAllMut.mutate()}
            className="text-sm text-emerald-600 hover:underline dark:text-emerald-400">
            Mark all read
          </button>
        )}
      </div>

      {!data?.results.length && (
        <div className="mt-8 rounded-xl border border-gray-200 bg-white py-16 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
          No notifications yet
        </div>
      )}

      <div className="mt-4 space-y-2">
        {data?.results.map((n) => (
          <div key={n.id}
            onClick={() => !n.is_read && readMut.mutate(n.id)}
            className={`flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition ${
              n.is_read
                ? 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
                : 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800'
            }`}>
            <div className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${n.is_read ? 'bg-gray-300 dark:bg-gray-600' : 'bg-emerald-500'}`} />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 capitalize dark:text-gray-100">
                {n.type.replace(/_/g, ' ')}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">
                {typeof n.payload.message === 'string'
                  ? n.payload.message
                  : Object.entries(n.payload).map(([k, v]) => `${k}: ${v}`).join(' · ')}
              </div>
              <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">{formatRelative(n.created_at)}</div>
            </div>
          </div>
        ))}
      </div>

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
