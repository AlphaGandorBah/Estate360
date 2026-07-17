import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { savedApi, messagingApi, notificationsApi, recommendationsApi, verificationApi } from '@/api'
import { useAuthStore } from '@/lib/auth'
import ListingCard from '@/components/listings/ListingCard'
import Avatar from '@/components/common/Avatar'
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

  const { data: verification } = useQuery({
    queryKey: ['my-verification'],
    queryFn: () => verificationApi.myStatus().then((r) => r.data).catch(() => null),
  })

  const unreadNotifs = notifications?.results.filter((n) => !n.is_read).length ?? 0
  const unreadConvs = conversations?.results.filter((c) => c.unread_count > 0).length ?? 0
  const displayName = user?.full_name || user?.email.split('@')[0] || 'there'

  const otherName = (c: Conversation) =>
    c.is_support ? 'Admin Support' : (c.provider_name ?? c.landlord_name ?? 'Listing provider')

  return (
    <div className="space-y-8">
      <section className="rounded-[1.75rem] border border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-6 shadow-sm dark:border-emerald-900/40 dark:from-emerald-900/20 dark:via-gray-900 dark:to-teal-900/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Welcome back</p>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Welcome back, {displayName}
            </h1>
            <p className="mt-1 text-gray-600 dark:text-gray-300">Find your next home in Freetown with a more confident search experience.</p>
          </div>
          <Link to="/listings" className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700">
            Explore homes
          </Link>
        </div>
      </section>

      {(!user?.is_verified) && (
        <div className={`rounded-[1.35rem] border p-4 shadow-sm ${
          verification?.status === 'pending'
            ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20'
            : verification?.status === 'rejected'
            ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
            : 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20'
        }`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                {!verification
                  ? 'Verify your identity'
                  : verification.status === 'pending'
                  ? 'Verification pending'
                  : 'Verification rejected'}
              </div>
              <div className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">
                {!verification
                  ? 'Submit a photo of your ID to get a verified badge and full platform access.'
                  : verification.status === 'pending'
                  ? 'Your documents are under review. This usually takes 1–2 business days.'
                  : `Rejection reason: ${verification.notes || 'See admin for details.'}`}
              </div>
            </div>
            {(!verification || verification.status === 'rejected') && (
              <Link to="/verification"
                className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">
                {verification?.status === 'rejected' ? 'Resubmit' : 'Get verified'}
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Saved listings', value: saved?.count ?? 0, href: '/saved' },
          { label: 'Conversations', value: conversations?.count ?? 0, href: '/conversations' },
          { label: 'Unread messages', value: unreadConvs, href: '/conversations' },
          { label: 'Notifications', value: unreadNotifs, href: '/notifications' },
        ].map((s) => (
          <Link key={s.label} to={s.href}
            className="rounded-[1.2rem] border border-gray-200 bg-white p-5 transition duration-200 hover:-translate-y-1 hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
            <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{s.value}</div>
            <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{s.label}</div>
          </Link>
        ))}
      </div>

      {(recs?.results?.length ?? 0) > 0 && (
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Recommended for you</h2>
            <Link to="/listings" className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400">View all</Link>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recs!.results.slice(0, 3).map((l) => <ListingCard key={l.id} listing={l} />)}
          </div>
        </section>
      )}

      {(conversations?.results.length ?? 0) > 0 && (
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Recent conversations</h2>
            <Link to="/conversations" className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400">View all</Link>
          </div>
          <div className="mt-3 space-y-2">
            {conversations?.results.slice(0, 3).map((c) => (
              <Link key={c.id} to={`/conversations/${c.id}`}
                className="flex items-center gap-4 rounded-[1.1rem] border border-gray-200 bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700">
                <Avatar name={otherName(c)} />
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
