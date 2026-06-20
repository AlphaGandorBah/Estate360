import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '@/api'
import { formatRelative } from '@/lib/intl'

type Resolution = 'dismissed' | 'warning_issued' | 'listing_removed'

export default function AdminReportsPage() {
  const [page, setPage] = useState(1)
  const [resolveId, setResolveId] = useState<number | null>(null)
  const [resolution, setResolution] = useState<Resolution>('dismissed')
  const [note, setNote] = useState('')
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin-reports', page],
    queryFn: () => adminApi.reports({ page }).then((r) => r.data),
  })

  const resolveMut = useMutation({
    mutationFn: ({ id, resolution, note }: { id: number; resolution: Resolution; note: string }) =>
      adminApi.resolveReport(id, resolution, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-reports'] })
      setResolveId(null)
      setNote('')
    },
  })

  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
      ))}
    </div>
  )

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Fraud reports</h1>

      {!data?.results.length && (
        <div className="mt-8 rounded-xl border border-gray-200 bg-white py-16 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
          No open reports
        </div>
      )}

      <div className="mt-4 space-y-3">
        {data?.results.map((r) => (
          <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 capitalize dark:bg-red-900/30 dark:text-red-400">
                    {r.reason.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{formatRelative(r.created_at)}</span>
                </div>
                {r.listing_id ? (
                  <Link to={`/listings/${r.listing_id}`}
                    className="mt-1 block font-medium text-gray-900 hover:text-emerald-600 truncate dark:text-gray-100 dark:hover:text-emerald-400">
                    Listing #{r.listing_id}
                  </Link>
                ) : (
                  <div className="mt-1 font-medium text-gray-900 dark:text-gray-100">No listing attached</div>
                )}
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Reporter ID: {r.reporter_id}
                </div>
                {r.description && (
                  <div className="mt-1 text-sm text-gray-600 italic dark:text-gray-300">"{r.description}"</div>
                )}
                {r.resolution_notes && (
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Resolution: {r.resolution_notes}</div>
                )}
              </div>
              {r.status === 'open' && (
                <button onClick={() => setResolveId(r.id)}
                  className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
                  Resolve
                </button>
              )}
              {r.status !== 'open' && (
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600 capitalize dark:bg-gray-700 dark:text-gray-300">
                  {r.status.replace(/_/g, ' ')}
                </span>
              )}
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

      {resolveId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 dark:bg-gray-800">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Resolve report</h2>
            <div className="mt-4">
              <label className="label">Resolution</label>
              <select value={resolution} onChange={(e) => setResolution(e.target.value as Resolution)}
                className="input">
                <option value="dismissed">Dismiss</option>
                <option value="warning_issued">Issue warning to landlord</option>
                <option value="listing_removed">Remove listing</option>
              </select>
            </div>
            <div className="mt-3">
              <label className="label">Notes (optional)</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)}
                rows={3} className="input resize-none" />
            </div>
            <div className="mt-4 flex gap-3">
              <button onClick={() => setResolveId(null)}
                className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-300">Cancel</button>
              <button onClick={() => resolveMut.mutate({ id: resolveId, resolution, note })}
                disabled={resolveMut.isPending}
                className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm text-white disabled:opacity-50">
                {resolveMut.isPending ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
