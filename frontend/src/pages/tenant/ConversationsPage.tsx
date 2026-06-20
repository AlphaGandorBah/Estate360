import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { messagingApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import { formatRelative } from '@/lib/utils'
import type { Conversation } from '@/types'

export default function ConversationsPage() {
  const [page, setPage] = useState(1)
  const user = useAuthStore((s) => s.user)

  const { data, isLoading } = useQuery({
    queryKey: ['conversations', page],
    queryFn: () => messagingApi.conversations(page).then((r) => r.data),
  })

  const otherName = (c: Conversation) =>
    user?.role === 'landlord' ? c.tenant_name : c.landlord_name

  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
      ))}
    </div>
  )

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Messages</h1>
      <p className="mt-1 text-gray-500 dark:text-gray-400">{data?.count ?? 0} conversations</p>

      {!data?.results.length && (
        <div className="mt-8 rounded-xl border border-gray-200 bg-white py-16 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
          No conversations yet
        </div>
      )}

      <div className="mt-4 space-y-2">
        {data?.results.map((c) => (
          <Link key={c.id} to={`/conversations/${c.id}`}
            className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50 transition dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              {otherName(c)?.[0] ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-gray-900 truncate dark:text-gray-100">{otherName(c)}</span>
                <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
                  {c.last_message_at ? formatRelative(c.last_message_at) : ''}
                </span>
              </div>
              <div className="text-sm text-gray-500 truncate dark:text-gray-400">
                {c.listing_id ? `Listing #${c.listing_id}` : 'General enquiry'}
              </div>
            </div>
            {c.unread_count > 0 && (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs text-white">
                {c.unread_count}
              </span>
            )}
          </Link>
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
