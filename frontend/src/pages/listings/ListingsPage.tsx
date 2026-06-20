import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listingsApi, savedApi } from '@/api'
import ListingCard from '@/components/listings/ListingCard'
import { useAuthStore } from '@/store/auth'
import { AREA_LABELS, PROPERTY_LABELS } from '@/lib/utils'
import type { ListingFilters, LocationArea, PropertyType } from '@/types'

const AREAS = Object.keys(AREA_LABELS) as LocationArea[]
const TYPES = Object.keys(PROPERTY_LABELS) as PropertyType[]

function filtersFromParams(params: URLSearchParams): ListingFilters {
  const area = params.getAll('area') as LocationArea[]
  const property_type = params.getAll('property_type') as PropertyType[]
  return {
    q: params.get('q') || undefined,
    area: area.length ? area : undefined,
    property_type: property_type.length ? property_type : undefined,
    min_price: params.get('min_price') ? Number(params.get('min_price')) : undefined,
    max_price: params.get('max_price') ? Number(params.get('max_price')) : undefined,
    min_bedrooms: params.get('min_bedrooms') ? Number(params.get('min_bedrooms')) : undefined,
    currency: (params.get('currency') as ListingFilters['currency']) || undefined,
    sort: params.get('sort') || undefined,
    page: params.get('page') ? Number(params.get('page')) : 1,
  }
}

function paramsFromFilters(filters: ListingFilters, page: number): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  filters.area?.forEach((a) => params.append('area', a))
  filters.property_type?.forEach((t) => params.append('property_type', t))
  if (filters.min_price) params.set('min_price', String(filters.min_price))
  if (filters.max_price) params.set('max_price', String(filters.max_price))
  if (filters.min_bedrooms) params.set('min_bedrooms', String(filters.min_bedrooms))
  if (filters.currency) params.set('currency', filters.currency)
  if (filters.sort) params.set('sort', filters.sort)
  if (page > 1) params.set('page', String(page))
  return params
}

function SearchField({ defaultValue, onDebouncedChange }: { defaultValue: string; onDebouncedChange: (v: string) => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  return (
    <div>
      <label className="block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Search</label>
      <input placeholder="Keywords…"
        defaultValue={defaultValue}
        onChange={(e) => {
          const value = e.target.value
          if (timerRef.current) clearTimeout(timerRef.current)
          timerRef.current = setTimeout(() => onDebouncedChange(value), 300)
        }}
        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
    </div>
  )
}

function FilterFields({ filters, setFilter, toggleArr }: {
  filters: ListingFilters
  setFilter: (k: keyof ListingFilters, v: unknown) => void
  toggleArr: (k: 'area' | 'property_type', val: string) => void
}) {
  return (
    <>
      <SearchField defaultValue={filters.q ?? ''} onDebouncedChange={(v) => setFilter('q', v)} />

      <div className="mt-4">
        <label className="block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Currency</label>
        <div className="mt-2 flex gap-2">
          {(['SLE', 'USD'] as const).map((c) => (
            <button key={c} type="button"
              onClick={() => setFilter('currency', filters.currency === c ? undefined : c)}
              className={`flex-1 rounded-lg border py-1.5 text-sm font-medium transition ${
                filters.currency === c
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}>
              {c}
            </button>
          ))}
        </div>
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
            defaultValue={filters.min_price ?? ''}
            onChange={(e) => setFilter('min_price', e.target.value ? +e.target.value : undefined)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Max price</label>
          <input type="number" placeholder="Any"
            defaultValue={filters.max_price ?? ''}
            onChange={(e) => setFilter('max_price', e.target.value ? +e.target.value : undefined)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Min bedrooms</label>
        <input type="number" min={0} placeholder="Any"
          defaultValue={filters.min_bedrooms ?? ''}
          onChange={(e) => setFilter('min_bedrooms', e.target.value ? +e.target.value : undefined)}
          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
      </div>

      <div className="mt-4">
        <label className="block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Sort</label>
        <select defaultValue={filters.sort ?? ''} onChange={(e) => setFilter('sort', e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
          <option value="">Newest</option>
          <option value="price_annual">Price: Low → High</option>
          <option value="-price_annual">Price: High → Low</option>
          <option value="bedrooms">Bedrooms</option>
        </select>
      </div>
    </>
  )
}

export default function ListingsPage() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  const filters = filtersFromParams(searchParams)
  const page = filters.page ?? 1

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
    const next = { ...filters, [k]: v || undefined }
    setSearchParams(paramsFromFilters(next, 1))
  }

  const toggleArr = (k: 'area' | 'property_type', val: string) => {
    const cur = (filters[k] as string[] | undefined) ?? []
    const next = cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val]
    setFilter(k, next.length ? next : undefined)
  }

  const setPage = (p: number) => setSearchParams(paramsFromFilters(filters, p))

  const handleSave = async (id: number) => {
    if (!user) return
    if (savedIds.has(id)) await listingsApi.unsave(id)
    else await listingsApi.save(id)
    qc.invalidateQueries({ queryKey: ['saved'] })
  }

  const activeFilterCount = [
    filters.q, filters.currency, filters.min_price, filters.max_price, filters.min_bedrooms,
    ...(filters.area ?? []), ...(filters.property_type ?? []),
  ].filter(Boolean).length

  return (
    <div className="flex gap-6">
      {/* Filters sidebar — static on large screens */}
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Filters</h2>
          <FilterFields filters={filters} setFilter={setFilter} toggleArr={toggleArr} />
        </div>
      </aside>

      {/* Results */}
      <div className="flex-1">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {listingRes?.count ?? 0} listings found
          </h1>
          {/* Mobile filter trigger — the only way to reach filters below lg: */}
          <button type="button" onClick={() => setMobileFiltersOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 lg:hidden dark:border-gray-600 dark:text-gray-300">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 8h12M10 12h4" />
            </svg>
            Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
          </button>
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
            <button disabled={!listingRes.previous} onClick={() => setPage(page - 1)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300">← Prev</button>
            <button disabled={!listingRes.next} onClick={() => setPage(page + 1)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300">Next →</button>
          </div>
        )}
      </div>

      {/* Mobile filter slide-over */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileFiltersOpen(false)} />
          <div className="relative ml-auto flex h-full w-80 max-w-[85vw] flex-col overflow-y-auto bg-white p-5 dark:bg-gray-800">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Filters</h2>
              <button onClick={() => setMobileFiltersOpen(false)} aria-label="Close filters"
                className="flex h-9 w-9 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700">✕</button>
            </div>
            <FilterFields filters={filters} setFilter={setFilter} toggleArr={toggleArr} />
            <button onClick={() => setMobileFiltersOpen(false)}
              className="mt-6 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
              Show {listingRes?.count ?? 0} listings
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
