import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listingsApi, savedApi } from '@/api'
import ListingCard from '@/components/listings/ListingCard'
import { useAuthStore } from '@/store/auth'
import { AREA_LABELS, PROPERTY_LABELS } from '@/lib/utils'
import type { ListingFilters, LocationArea, PropertyType } from '@/types'

const AREAS = Object.keys(AREA_LABELS) as LocationArea[]
const TYPES = Object.keys(PROPERTY_LABELS) as PropertyType[]

export default function ListingsPage() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const [filters, setFilters] = useState<ListingFilters>({})
  const [page, setPage] = useState(1)

  const { data: listingRes, isLoading } = useQuery({
    queryKey: ['listings', filters, page],
    queryFn: () => listingsApi.list({ ...filters, page }).then((r) => r.data),
    staleTime: 30000,
  })

  const { data: savedData } = useQuery({
    queryKey: ['saved', 1],
    queryFn: () => savedApi.list(1).then((r) => r.data),
    enabled: user?.role === 'tenant',
  })
  const savedIds = new Set(savedData?.results.map((s) => s.listing.id) ?? [])

  const setFilter = (k: keyof ListingFilters, v: unknown) => {
    setFilters((f) => ({ ...f, [k]: v || undefined }))
    setPage(1)
  }

  const toggleArr = (k: 'area' | 'property_type', val: string) => {
    const cur = (filters[k] as string[] | undefined) ?? []
    const next = cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val]
    setFilter(k, next.length ? next : undefined)
  }

  const handleSave = async (id: number) => {
    if (!user) return
    if (savedIds.has(id)) await listingsApi.unsave(id)
    else await listingsApi.save(id)
    qc.invalidateQueries({ queryKey: ['saved'] })
  }

  return (
    <div className="flex gap-6">
      {/* Filters sidebar */}
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Filters</h2>

          <div className="mt-4">
            <label className="block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Search</label>
            <input placeholder="Keywords…"
              onChange={(e) => setFilter('q', e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Area</label>
            <div className="mt-2 space-y-1.5">
              {AREAS.map((a) => (
                <label key={a} className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox"
                    checked={(filters.area ?? []).includes(a)}
                    onChange={() => toggleArr('area', a)}
                    className="rounded border-gray-300 text-emerald-600 dark:border-gray-600 dark:bg-gray-700" />
                  {AREA_LABELS[a]}
                </label>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Property type</label>
            <div className="mt-2 space-y-1.5">
              {TYPES.map((t) => (
                <label key={t} className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox"
                    checked={(filters.property_type ?? []).includes(t)}
                    onChange={() => toggleArr('property_type', t)}
                    className="rounded border-gray-300 text-emerald-600 dark:border-gray-600 dark:bg-gray-700" />
                  {PROPERTY_LABELS[t]}
                </label>
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Min price</label>
              <input type="number" placeholder="0"
                onChange={(e) => setFilter('min_price', e.target.value ? +e.target.value : undefined)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Max price</label>
              <input type="number" placeholder="Any"
                onChange={(e) => setFilter('max_price', e.target.value ? +e.target.value : undefined)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Min bedrooms</label>
            <input type="number" min={0} placeholder="Any"
              onChange={(e) => setFilter('min_bedrooms', e.target.value ? +e.target.value : undefined)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Sort</label>
            <select onChange={(e) => setFilter('sort', e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
              <option value="">Newest</option>
              <option value="price_annual">Price: Low → High</option>
              <option value="-price_annual">Price: High → Low</option>
              <option value="bedrooms">Bedrooms</option>
            </select>
          </div>
        </div>
      </aside>

      {/* Results */}
      <div className="flex-1">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {listingRes?.count ?? 0} listings found
          </h1>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-64 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
            ))}
          </div>
        )}

        {!isLoading && !listingRes?.results.length && (
          <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
            No listings match your filters
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {listingRes?.results.map((l) => (
            <ListingCard key={l.id} listing={l}
              saved={savedIds.has(l.id)}
              onSave={user?.role === 'tenant' ? handleSave : undefined} />
          ))}
        </div>

        {(listingRes?.next || listingRes?.previous) && (
          <div className="mt-8 flex justify-center gap-3">
            <button disabled={!listingRes.previous} onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300">← Prev</button>
            <button disabled={!listingRes.next} onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300">Next →</button>
          </div>
        )}
      </div>
    </div>
  )
}
