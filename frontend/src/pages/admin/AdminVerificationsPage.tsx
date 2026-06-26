import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '@/api'
import { formatDate } from '@/lib/intl'
import { getErrorMessage } from '@/lib/utils'
import { pushToast } from '@/lib/toast'
import Avatar from '@/components/common/Avatar'

type FilterStatus = 'pending' | 'approved' | 'rejected'

const STATUS_TABS: FilterStatus[] = ['pending', 'approved', 'rejected']

export default function AdminVerificationsPage() {
  const [status, setStatus] = useState<FilterStatus>('pending')
  const [page, setPage] = useState(1)
  const [rejectId, setRejectId] = useState<number | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin-verifications', status, page],
    queryFn: () => adminApi.verifications({ status, page }).then((r) => r.data),
  })

  const approveMut = useMutation({
    mutationFn: (id: number) => adminApi.approveVerification(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-verifications'] }),
    onError: (err) => pushToast(getErrorMessage(err, 'Failed to approve verification'), 'error'),
  })

  const rejectMut = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes: string }) =>
      adminApi.rejectVerification(id, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-verifications'] })
      setRejectId(null)
      setRejectNote('')
    },
    onError: (err) => pushToast(getErrorMessage(err, 'Failed to reject verification'), 'error'),
  })

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Landlord verifications</h1>

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
            <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
          ))}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {data?.results.map((v) => (
          <div key={v.id} className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <Avatar name={v.user_name} />
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {v.user_name}
                  </div>
                  <div className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                    {v.document_type.replace(/_/g, ' ')} · Submitted {formatDate(v.submitted_at)}
                  </div>
                  {v.notes && (
                    <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">"{v.notes}"</div>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a href={v.document_front_url} target="_blank" rel="noreferrer"
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
                  ID front
                </a>
                {v.document_back_url && (
                  <a href={v.document_back_url} target="_blank" rel="noreferrer"
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
                    ID back
                  </a>
                )}
                {v.selfie_url && (
                  <a href={v.selfie_url} target="_blank" rel="noreferrer"
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
                    Selfie
                  </a>
                )}
                {status === 'pending' ? (
                  <>
                    <button onClick={() => approveMut.mutate(v.id)}
                      disabled={approveMut.isPending}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                      Approve
                    </button>
                    <button onClick={() => setRejectId(v.id)}
                      className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30">
                      Reject
                    </button>
                  </>
                ) : (
                  <span className={`rounded-full px-2 py-1 text-xs font-medium capitalize ${
                    status === 'approved'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
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
          No {status} verifications
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
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Reject verification</h2>
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
