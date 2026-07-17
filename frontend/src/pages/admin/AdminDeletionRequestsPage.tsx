import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '@/api'
import { formatDate } from '@/lib/intl'
import { getErrorMessage } from '@/lib/utils'
import { pushToast } from '@/lib/toast'

type FilterStatus = 'pending' | 'approved' | 'rejected'
const STATUS_TABS: FilterStatus[] = ['pending', 'approved', 'rejected']

export default function AdminDeletionRequestsPage() {
  const [status, setStatus] = useState<FilterStatus>('pending')
  const [page, setPage] = useState(1)
  const [resolveId, setResolveId] = useState<number | null>(null)
  const [resolveDecision, setResolveDecision] = useState<'approved' | 'rejected'>('rejected')
  const [resolveNote, setResolveNote] = useState('')
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin-deletion-requests', status, page],
    queryFn: () => adminApi.deletionRequests({ status, page }).then((r) => r.data as {
      count: number; next: string | null; previous: string | null;
      results: { id: number; user_email: string; user_name: string; reason: string; status: string; requested_at: string; resolved_at: string | null; resolution_notes: string }[]
    }),
  })

  const resolveMut = useMutation({
    mutationFn: ({ id, decision, notes }: { id: number; decision: 'approved' | 'rejected'; notes: string }) =>
      adminApi.resolveDeletionRequest(id, { decision, notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-deletion-requests'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      setResolveId(null)
      setResolveNote('')
      pushToast('Request resolved.', 'success')
    },
    onError: (err) => pushToast(getErrorMessage(err, 'Failed to resolve request'), 'error'),
  })

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Account deletion requests</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Approve to permanently deactivate the account, or reject to dismiss the request.
      </p>

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
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
          ))}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {data?.results.map((req) => (
          <div key={req.id} className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">{req.user_name}</div>
                <div className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  {req.user_email} · Requested {formatDate(req.requested_at)}
                </div>
                {req.reason && (
                  <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                    <span className="font-medium">Reason: </span>{req.reason}
                  </div>
                )}
                {req.resolution_notes && (
                  <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    <span className="font-medium">Notes: </span>{req.resolution_notes}
                  </div>
                )}
              </div>

              <div className="shrink-0">
                {status === 'pending' ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setResolveId(req.id); setResolveDecision('approved') }}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
                      Approve deletion
                    </button>
                    <button
                      onClick={() => { setResolveId(req.id); setResolveDecision('rejected') }}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
                      Reject
                    </button>
                  </div>
                ) : (
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                    status === 'approved'
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                  }`}>
                    {status}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {!data?.results.length && !isLoading && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white py-12 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
          No {status} deletion requests
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

      {resolveId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 dark:bg-gray-800">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {resolveDecision === 'approved' ? 'Approve deletion?' : 'Reject deletion request'}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {resolveDecision === 'approved'
                ? 'The user account and all draft listings will be permanently deactivated. This cannot be undone.'
                : 'The user will keep their account. You may optionally provide a reason.'}
            </p>
            <textarea
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              placeholder="Notes for the user (optional)…"
              rows={3}
              className="mt-4 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            <div className="mt-4 flex gap-3">
              <button onClick={() => { setResolveId(null); setResolveNote('') }}
                className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-300">
                Cancel
              </button>
              <button
                onClick={() => resolveMut.mutate({ id: resolveId, decision: resolveDecision, notes: resolveNote })}
                disabled={resolveMut.isPending}
                className={`flex-1 rounded-lg py-2.5 text-sm text-white disabled:opacity-50 ${
                  resolveDecision === 'approved' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}>
                {resolveMut.isPending ? 'Saving…' : resolveDecision === 'approved' ? 'Confirm deletion' : 'Reject request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
