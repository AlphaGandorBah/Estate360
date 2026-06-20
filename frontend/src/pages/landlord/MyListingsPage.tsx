import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listingsApi } from '@/api'
import { formatPrice } from '@/lib/utils'

export default function MyListingsPage() {
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['my-listings', page],
    queryFn: () => listingsApi.myListings(page).then((r) => r.data),
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">My listings</h1>
        <Link to="/listings/create"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
          + New listing
        </Link>
      </div>

      {!data?.results.length && (
        <div className="mt-8 rounded-xl border border-gray-200 bg-white py-16 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
          No listings yet.{' '}
          <Link to="/listings/create" className="text-emerald-600 hover:underline dark:text-emerald-400">Create one now</Link>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {data?.results.map((l) => (
          <div key={l.id} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 text-xs font-medium uppercase dark:bg-emerald-900/30 dark:text-emerald-400">
              {l.property_type.slice(0, 3)}
            </div>
            <div className="flex-1 min-w-0">
              <Link to={`/listings/${l.id}`}
                className="font-medium text-gray-900 hover:text-emerald-600 truncate block dark:text-gray-100 dark:hover:text-emerald-400">
                {l.title}
              </Link>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {formatPrice(l.price_annual, l.currency)}/yr · {l.bedrooms} bed · {l.bathrooms} bath
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
              className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
              Edit
            </Link>
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
