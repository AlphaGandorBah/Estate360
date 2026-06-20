import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { savedApi, messagingApi, notificationsApi, recommendationsApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import ListingCard from '@/components/listings/ListingCard'
import type { Conversation } from '@/types'

export default function TenantDashboard() {
  const user = useAuthStore((s) => s.user)

  const { data: saved } = useQuery({
    queryKey: ['saved', 1],
    queryFn: () => savedApi.list(1).then((r) => r.data),
  })

  const { data: conversations } = useQuery({
    queryKey: ['conversations', 1],
    queryFn: () => messagingApi.conversations(1).then((r) => r.data),
  })

  const { data: notifications } = useQuery({
    queryKey: ['notifications', 1],
    queryFn: () => notificationsApi.list(1).then((r) => r.data),
  })

  const { data: recs } = useQuery({
    queryKey: ['recommendations'],
    queryFn: () => recommendationsApi.list().then((r) => r.data),
    staleTime: 120000,
  })

  const unreadNotifs = notifications?.results.filter((n) => !n.is_read).length ?? 0
  const unreadConvs = conversations?.results.filter((c) => c.unread_count > 0).length ?? 0
  const displayName = user?.email.split('@')[0] ?? 'there'

  const otherName = (c: Conversation) =>
    user?.role === 'landlord' ? c.tenant_name : c.landlord_name

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Welcome back, {displayName}
        </h1>
        <p className="mt-1 text-gray-500 dark:text-gray-400">Find your next home in Freetown</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Saved listings', value: saved?.count ?? 0, href: '/saved' },
          { label: 'Conversations', value: conversations?.count ?? 0, href: '/conversations' },
          { label: 'Unread messages', value: unreadConvs, href: '/conversations' },
          { label: 'Notifications', value: unreadNotifs, href: '/notifications' },
        ].map((s) => (
          <Link key={s.label} to={s.href}
            className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-sm transition dark:border-gray-700 dark:bg-gray-800">
            <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{s.value}</div>
            <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{s.label}</div>
          </Link>
        ))}
      </div>

      {/* Recommendations */}
      {(recs?.results?.length ?? 0) > 0 && (
        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Recommended for you</h2>
            <Link to="/listings" className="text-sm text-emerald-600 hover:underline dark:text-emerald-400">View all</Link>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recs!.results.slice(0, 3).map((l) => <ListingCard key={l.id} listing={l} />)}
          </div>
        </section>
      )}

      {/* Recent conversations */}
      {(conversations?.results.length ?? 0) > 0 && (
        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Recent conversations</h2>
            <Link to="/conversations" className="text-sm text-emerald-600 hover:underline dark:text-emerald-400">View all</Link>
          </div>
          <div className="mt-3 space-y-2">
            {conversations?.results.slice(0, 3).map((c) => (
              <Link key={c.id} to={`/conversations/${c.id}`}
                className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate dark:text-gray-100">{otherName(c)}</div>
                  <div className="text-sm text-gray-500 truncate dark:text-gray-400">
                    {c.last_message_at ? new Date(c.last_message_at).toLocaleDateString() : 'No messages yet'}
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
        </section>
      )}
    </div>
  )
}
