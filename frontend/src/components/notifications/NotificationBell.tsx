import { useState, useEffect, useCallback, useRef } from 'react'
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
  const triggerRef = useRef<HTMLButtonElement | null>(null)

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
      // The conversation list/dashboard previews have no WS room of their
      // own (only an open conversation's detail page does) — without this
      // they'd only pick up a new message on the next manual refresh.
      if (msg.kind === 'new_message') {
        qc.invalidateQueries({ queryKey: ['conversations'] })
      }
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
    const closeWithKeyboard = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      requestAnimationFrame(() => triggerRef.current?.focus())
    }
    if (open) {
      document.addEventListener('click', close)
      document.addEventListener('keydown', closeWithKeyboard)
    }
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', closeWithKeyboard)
    }
  }, [open])

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="notification-menu"
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
      >
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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
        <>
        <button
          type="button"
          aria-label="Close notifications"
          className="fixed inset-0 z-40 cursor-default bg-slate-950/20 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
        <div
          id="notification-menu"
          className="fixed inset-x-3 top-[4.5rem] z-50 w-auto rounded-xl border border-gray-200 bg-white shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 dark:border-gray-700 dark:bg-gray-800"
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Notifications</h3>
            {unread > 0 && (
              <button
                type="button"
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
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => handleMark(n)}
                  className={`w-full px-4 py-3 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 dark:hover:bg-gray-700 ${!n.is_read ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''}`}
                >
                  <span className="block text-sm font-medium capitalize text-gray-900 dark:text-gray-100">{n.type.replace(/_/g, ' ')}</span>
                  <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">{formatRelative(n.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-gray-200 px-4 py-2 dark:border-gray-700">
            <button type="button" onClick={() => { navigate('/notifications'); setOpen(false) }}
              className="w-full text-center text-xs text-emerald-600 hover:underline dark:text-emerald-400">
              View all
            </button>
          </div>
        </div>
        </>
      )}
    </div>
  )
}
