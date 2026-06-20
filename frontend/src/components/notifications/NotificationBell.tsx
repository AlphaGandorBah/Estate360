import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { notificationsApi } from '@/api'
import { useWebSocket } from '@/lib/ws'
import { useAuthStore } from '@/lib/auth'
import { formatRelative } from '@/lib/intl'
import type { Notification } from '@/types'

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)

  const { data } = useQuery({
    queryKey: ['notifications', 1],
    queryFn: () => notificationsApi.list(1).then((r) => r.data),
    enabled: !!user,
    refetchInterval: 30000,
  })

  const unread = data?.results.filter((n) => !n.is_read).length ?? 0

  const onMessage = useCallback((msg: Record<string, unknown>) => {
    if (msg.type === 'notification.new') {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    }
  }, [qc])

  useWebSocket('/ws/notifications/', { onMessage }, !!user)

  const handleMark = async (n: Notification) => {
    if (!n.is_read) await notificationsApi.markRead(n.id)
    qc.invalidateQueries({ queryKey: ['notifications'] })
    const p = n.payload as Record<string, unknown>
    if (n.type === 'listing_decision' && p.listing_id) navigate(`/listings/${p.listing_id}`)
    if (n.type === 'new_message' && p.conversation_id) navigate(`/conversations/${p.conversation_id}`)
    setOpen(false)
  }

  useEffect(() => {
    const close = () => setOpen(false)
    if (open) document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen((o) => !o)} className="relative p-2">
        <svg className="h-6 w-6 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Notifications</h3>
            {unread > 0 && (
              <button
                onClick={() => notificationsApi.markAllRead().then(() => qc.invalidateQueries({ queryKey: ['notifications'] }))}
                className="text-xs text-emerald-600 hover:underline dark:text-emerald-400"
              >
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-80 divide-y divide-gray-200 overflow-y-auto dark:divide-gray-700">
            {!data?.results.length && (
              <li className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">No notifications</li>
            )}
            {data?.results.map((n) => (
              <li
                key={n.id}
                onClick={() => handleMark(n)}
                className={`cursor-pointer px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 ${!n.is_read ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''}`}
              >
                <p className="text-sm font-medium capitalize text-gray-900 dark:text-gray-100">{n.type.replace(/_/g, ' ')}</p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{formatRelative(n.created_at)}</p>
              </li>
            ))}
          </ul>
          <div className="border-t border-gray-200 px-4 py-2 dark:border-gray-700">
            <button onClick={() => { navigate('/notifications'); setOpen(false) }}
              className="w-full text-center text-xs text-emerald-600 hover:underline dark:text-emerald-400">
              View all
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
