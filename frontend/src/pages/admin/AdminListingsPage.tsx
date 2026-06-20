import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '@/api'
import { formatPrice } from '@/lib/utils'
import type { ListingStatus } from '@/types'

type FilterStatus = 'pending' | 'approved' | 'rejected' | 'archived'

export default function AdminListingsPage() {
  const [status, setStatus] = useState<FilterStatus>('pending')
  const [page, setPage] = useState(1)
  const [rejectId, setRejectId] = useState<number | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin-listings', status, page],
    queryFn: () => adminApi.listings({ status, page }).then((r) => r.data),
  })

  const approveMut = useMutation({
    mutationFn: (id: number) => adminApi.approveListing(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-listings'] }),
  })

  const rejectMut = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes: string }) => adminApi.rejectListing(id, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-listings'] })
      setRejectId(null)
      setRejectNote('')
    },
  })

  const STATUS_TABS: FilterStatus[] = ['pending', 'approved', 'rejected', 'archived']

  const statusColor = (s: ListingStatus) => {
    if (s === 'approved') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    if (s === 'pending') return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
    if (s === 'rejected') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Manage listings</h1>

      <div className="mt-4 flex gap-2 border-b border-gray-200 dark:border-gray-700">
        {STATUS_TABS.map((s) => (
          <button key={s} onClick={() => { setStatus(s); setPage(1) }}
            className={`pb-2 px-3 text-sm capitalize transition border-b-2 ${
              status === s
                ? 'border-emerald-600 text-emerald-700 font-medium dark:text-emerald-400'
                : 'border-transparent text-gray-500 dark:text-gray-400'
            }`}>
            {s}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
          ))}
        </div>
      )}

      <div className="mt-4 space-y-2">
        {data?.results.map((l) => (
          <div key={l.id} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex-1 min-w-0">
              <Link to={`/listings/${l.id}`}
                className="font-medium text-gray-900 hover:text-emerald-600 truncate block dark:text-gray-100 dark:hover:text-emerald-400">
                {l.title}
              </Link>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {l.owner_name} · {formatPrice(l.price_annual, l.currency)}/yr · {l.location_area.replace('_', ' ')}
              </div>
              {l.rejection_notes && (
                <div className="mt-1 text-xs text-red-600 dark:text-red-400">Note: {l.rejection_notes}</div>
              )}
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(l.status)}`}>
              {l.status}
            </span>
            {status === 'pending' && (
              <div className="flex shrink-0 gap-2">
                <button onClick={() => approveMut.mutate(l.id)}
                  disabled={approveMut.isPending}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  Approve
                </button>
                <button onClick={() => setRejectId(l.id)}
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30">
                  Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {!data?.results.length && !isLoading && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white py-12 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
          No {status} listings
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

      {rejectId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 dark:bg-gray-800">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Reject listing</h2>
            <textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Reason for rejection (shown to landlord)…" rows={4}
              className="mt-4 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            <div className="mt-4 flex gap-3">
              <button onClick={() => setRejectId(null)}
                className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-300">Cancel</button>
              <button onClick={() => rejectMut.mutate({ id: rejectId, notes: rejectNote })}
                disabled={rejectMut.isPending}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm text-white disabled:opacity-50">
                {rejectMut.isPending ? 'Rejecting…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
