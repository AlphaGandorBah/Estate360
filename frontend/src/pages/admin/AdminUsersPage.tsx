import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '@/api'
import { formatDate } from '@/lib/intl'
import { getErrorMessage } from '@/lib/utils'
import { pushToast } from '@/lib/toast'
import Avatar from '@/components/common/Avatar'
import type { Role, User } from '@/types'

type FilterRole = 'all' | Role

const ROLE_TABS: FilterRole[] = ['all', 'tenant', 'landlord', 'agent', 'admin']

export default function AdminUsersPage() {
  const [role, setRole] = useState<FilterRole>('all')
  const [page, setPage] = useState(1)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', role, page],
    queryFn: () => adminApi.users({ role: role === 'all' ? undefined : role, page }).then((r) => r.data),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-users'] })
  const onActionError = (err: unknown) => pushToast(getErrorMessage(err, 'Action failed'), 'error')

  const banMut = useMutation({ mutationFn: (id: string) => adminApi.banUser(id), onSuccess: invalidate, onError: onActionError })
  const unbanMut = useMutation({ mutationFn: (id: string) => adminApi.unbanUser(id), onSuccess: invalidate, onError: onActionError })
  const restrictMut = useMutation({ mutationFn: (id: string) => adminApi.restrictUser(id), onSuccess: invalidate, onError: onActionError })
  const unrestrictMut = useMutation({ mutationFn: (id: string) => adminApi.unrestrictUser(id), onSuccess: invalidate, onError: onActionError })
  const resetPwMut = useMutation({
    mutationFn: (id: string) => adminApi.resetUserPassword(id),
    onSuccess: () => pushToast('Password reset email sent.', 'success'),
    onError: onActionError,
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteUser(id),
    onSuccess: invalidate,
    onError: onActionError,
  })

  const busyId = [banMut, unbanMut, restrictMut, unrestrictMut, resetPwMut, deleteMut]
    .find((m) => m.isPending)?.variables as string | undefined

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Registered users</h1>

      <div className="mt-4 flex gap-2 border-b border-gray-200 dark:border-gray-700">
        {ROLE_TABS.map((r) => (
          <button key={r} onClick={() => { setRole(r); setPage(1) }}
            className={`pb-2 px-3 text-sm capitalize transition border-b-2 ${
              role === r
                ? 'border-emerald-600 text-emerald-700 font-medium dark:text-emerald-400'
                : 'border-transparent text-gray-500 dark:text-gray-400'
            }`}>
            {r}
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
        {data?.results.map((u: User) => {
          const isBanned = u.is_active === false
          const isRestricted = !!u.is_restricted
          const isSelfManaged = u.role === 'admin'
          const busy = busyId === u.id

          return (
            <div key={u.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <Avatar name={u.full_name} imageUrl={u.avatar_url} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
                  {u.full_name}
                  {u.is_verified && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                      Verified
                    </span>
                  )}
                  {isBanned && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      Banned
                    </span>
                  )}
                  {isRestricted && (
                    <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                      Restricted
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {u.email} · Joined {formatDate(u.date_joined)}
                </div>
              </div>

              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                {u.role}
              </span>

              {!isSelfManaged && (
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button onClick={() => (isBanned ? unbanMut.mutate(u.id) : banMut.mutate(u.id))}
                    disabled={busy}
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30">
                    {isBanned ? 'Unban' : 'Ban'}
                  </button>
                  <button onClick={() => (isRestricted ? unrestrictMut.mutate(u.id) : restrictMut.mutate(u.id))}
                    disabled={busy}
                    className="rounded-lg border border-yellow-300 px-3 py-1.5 text-xs font-semibold text-yellow-700 hover:bg-yellow-50 disabled:opacity-50 dark:border-yellow-700 dark:text-yellow-400 dark:hover:bg-yellow-900/30">
                    {isRestricted ? 'Unrestrict' : 'Restrict'}
                  </button>
                  <button onClick={() => resetPwMut.mutate(u.id)} disabled={busy}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
                    Reset password
                  </button>
                  <button
                    onClick={() => { if (confirm(`Delete ${u.full_name}'s account? This archives their listings and cannot be undone from here.`)) deleteMut.mutate(u.id) }}
                    disabled={busy}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                    Delete
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!data?.results.length && !isLoading && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white py-12 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
          No users found
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
    </div>
  )
}
