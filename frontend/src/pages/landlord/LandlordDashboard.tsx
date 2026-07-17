import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listingsApi, messagingApi, verificationApi } from '@/api'
import { useAuthStore } from '@/lib/auth'
import { formatPrice } from '@/lib/intl'

export default function ProviderDashboard() {
  const user = useAuthStore((s) => s.user)
  const isAgent = user?.role === 'agent'

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
  const displayName = user?.full_name || user?.email.split('@')[0] || 'there'

  return (
    <div className="space-y-8">
      <section className="rounded-[1.75rem] border border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-6 shadow-sm dark:border-emerald-900/40 dark:from-emerald-900/20 dark:via-gray-900 dark:to-teal-900/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">
              {isAgent ? 'Agent hub' : 'Landlord hub'}
            </p>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Welcome, {displayName}
            </h1>
            <p className="mt-1 text-gray-600 dark:text-gray-300">
              {isAgent
                ? 'Manage listings for landlords and connect with prospective tenants from one workspace.'
                : 'Manage your listings and conversations from one polished workspace.'}
            </p>
          </div>
          <Link to="/listings/create" className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700">
            + New listing
          </Link>
        </div>
      </section>

      {(!verification || verification.status !== 'approved') && (
        <div className={`rounded-[1.35rem] border p-4 shadow-sm ${
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
                className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">
                Start verification
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Total listings', value: listings?.count ?? 0, href: '/my-listings' },
          { label: 'Approved', value: approvedListings, href: '/my-listings' },
          { label: 'Pending review', value: pendingListings, href: '/my-listings' },
          { label: 'Messages', value: conversations?.count ?? 0, href: '/conversations' },
        ].map((s) => (
          <Link key={s.label} to={s.href}
            className="rounded-[1.2rem] border border-gray-200 bg-white p-5 transition duration-200 hover:-translate-y-1 hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
            <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{s.value}</div>
            <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{s.label}</div>
          </Link>
        ))}
      </div>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Your listings</h2>
          <div className="flex gap-3">
            <Link to="/my-listings" className="self-center text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400">View all</Link>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {listings?.results.slice(0, 5).map((l) => (
            <div key={l.id} className="flex items-center gap-4 rounded-[1.1rem] border border-gray-200 bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700">
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
            <div className="rounded-[1.1rem] border border-gray-200 bg-white py-10 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
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
