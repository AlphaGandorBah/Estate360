import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminApi } from '@/api'
import { formatDate } from '@/lib/intl'
import type { Role } from '@/types'

type FilterRole = 'all' | Role

const ROLE_TABS: FilterRole[] = ['all', 'tenant', 'landlord', 'admin']

export default function AdminUsersPage() {
  const [role, setRole] = useState<FilterRole>('all')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', role, page],
    queryFn: () => adminApi.users({ role: role === 'all' ? undefined : role, page }).then((r) => r.data),
  })

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
        {data?.results.map((u) => (
          <div key={u.id} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 dark:text-gray-100">
                {u.full_name}
                {u.is_verified && (
                  <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    Verified
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
          </div>
        ))}
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
