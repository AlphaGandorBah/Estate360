import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { savedApi } from '@/api'
import ListingCard from '@/components/listings/ListingCard'

export default function SavedListingsPage() {
  const [page, setPage] = useState(1)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['saved', page],
    queryFn: () => savedApi.list(page).then((r) => r.data),
  })

  const unsaveMut = useMutation({
    mutationFn: (id: number) => savedApi.unsave(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved'] }),
  })

  if (isLoading) return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-64 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
      ))}
    </div>
  )

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Saved listings</h1>
      <p className="mt-1 text-gray-500 dark:text-gray-400">{data?.count ?? 0} saved</p>

      {!data?.results.length && (
        <div className="mt-8 rounded-xl border border-gray-200 bg-white py-16 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
          You haven't saved any listings yet
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.results.map((s) => (
          <ListingCard key={s.id} listing={s.listing}
            saved
            onSave={() => unsaveMut.mutate(s.listing.id)} />
        ))}
      </div>

      {(data?.next || data?.previous) && (
        <div className="mt-8 flex justify-center gap-3">
          <button disabled={!data.previous} onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300">← Prev</button>
          <button disabled={!data.next} onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300">Next →</button>
        </div>
      )}
    </div>
  )
}
