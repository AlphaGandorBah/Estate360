import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listingsApi, messagingApi, verificationApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import { formatPrice } from '@/lib/utils'

export default function LandlordDashboard() {
  const user = useAuthStore((s) => s.user)

  const { data: listings } = useQuery({
    queryKey: ['my-listings', 1],
    queryFn: () => listingsApi.myListings(1).then((r) => r.data),
  })

  const { data: conversations } = useQuery({
    queryKey: ['conversations', 1],
    queryFn: () => messagingApi.list(1).then((r) => r.data),
  })

  const { data: verification } = useQuery({
    queryKey: ['my-verification'],
    queryFn: () => verificationApi.myStatus().then((r) => r.data).catch(() => null),
  })

  const approvedListings = listings?.results.filter((l) => l.status === 'approved').length ?? 0
  const pendingListings = listings?.results.filter((l) => l.status === 'pending').length ?? 0
  const displayName = user?.email.split('@')[0] ?? 'there'

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Welcome, {displayName}
        </h1>
        <p className="mt-1 text-gray-500 dark:text-gray-400">Manage your listings and conversations</p>
      </div>

      {/* Verification banner */}
      {(!verification || verification.status !== 'approved') && (
        <div className={`rounded-xl border p-4 ${
          verification?.status === 'pending' ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20' :
          verification?.status === 'rejected' ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20' :
          'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20'
        }`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                {!verification ? 'Get verified' :
                 verification.status === 'pending' ? 'Verification pending' :
                 'Verification rejected'}
              </div>
              <div className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">
                {!verification
                  ? 'Submit your ID to get a verified badge on your listings.'
                  : verification.status === 'pending'
                  ? 'Your documents are under review. This usually takes 1–2 business days.'
                  : `Rejection reason: ${verification.notes || 'See admin for details.'}`}
              </div>
            </div>
            {!verification && (
              <Link to="/verification"
                className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                Start verification
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Total listings', value: listings?.count ?? 0, href: '/my-listings' },
          { label: 'Approved', value: approvedListings, href: '/my-listings' },
          { label: 'Pending review', value: pendingListings, href: '/my-listings' },
          { label: 'Messages', value: conversations?.count ?? 0, href: '/conversations' },
        ].map((s) => (
          <Link key={s.label} to={s.href}
            className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-sm transition dark:border-gray-700 dark:bg-gray-800">
            <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{s.value}</div>
            <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{s.label}</div>
          </Link>
        ))}
      </div>

      {/* Recent listings */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Your listings</h2>
          <div className="flex gap-3">
            <Link to="/listings/create"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
              + New listing
            </Link>
            <Link to="/my-listings" className="text-sm text-emerald-600 hover:underline self-center dark:text-emerald-400">View all</Link>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {listings?.results.slice(0, 5).map((l) => (
            <div key={l.id} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate dark:text-gray-100">{l.title}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {formatPrice(l.price_annual, l.currency)}/yr
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                l.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                l.status === 'pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                l.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
              }`}>
                {l.status}
              </span>
              <Link to={`/listings/${l.id}/edit`}
                className="shrink-0 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                Edit
              </Link>
            </div>
          ))}

          {!listings?.results.length && (
            <div className="rounded-xl border border-gray-200 bg-white py-10 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              No listings yet.{' '}
              <Link to="/listings/create" className="text-emerald-600 hover:underline dark:text-emerald-400">
                Create your first listing
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
