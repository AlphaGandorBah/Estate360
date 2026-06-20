import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listingsApi, recommendationsApi, savedApi } from '@/api'
import ListingCard from '@/components/listings/ListingCard'
import { useAuthStore } from '@/lib/auth'
import { AREA_LABELS } from '@/lib/utils'
import type { LocationArea } from '@/types'

const HERO_AREAS = Object.entries(AREA_LABELS) as [LocationArea, string][]

export default function HomePage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const [searchQ, setSearchQ] = useState('')
  const [searchArea, setSearchArea] = useState('')

  const { data: latestData } = useQuery({
    queryKey: ['listings', {}, 1],
    queryFn: () => listingsApi.list({ page: 1 }).then((r) => r.data),
    staleTime: 60000,
  })

  const { data: recData } = useQuery({
    queryKey: ['recommendations'],
    queryFn: () => recommendationsApi.list().then((r) => r.data),
    enabled: user?.role === 'tenant',
    staleTime: 120000,
  })

  const { data: savedData } = useQuery({
    queryKey: ['saved', 1],
    queryFn: () => savedApi.list(1).then((r) => r.data),
    enabled: user?.role === 'tenant',
  })
  const savedIds = new Set(savedData?.results.map((s) => s.listing.id) ?? [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (searchQ) params.set('q', searchQ)
    if (searchArea) params.set('area', searchArea)
    navigate(`/listings?${params.toString()}`)
  }

  return (
    <div className="space-y-12">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 px-8 py-16 text-white">
        <div className="relative z-10 mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl">
            Find your perfect home<br />in Freetown
          </h1>
          <p className="mt-4 text-emerald-100">Browse verified listings across Freetown's neighbourhoods</p>

          <form onSubmit={handleSearch} className="mt-8 flex flex-col gap-3 sm:flex-row">
            <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search by title, location…"
              className="flex-1 rounded-xl px-4 py-3 text-gray-900 outline-none" />
            <select value={searchArea} onChange={(e) => setSearchArea(e.target.value)}
              className="rounded-xl px-3 py-3 text-gray-900 outline-none sm:w-44">
              <option value="">All areas</option>
              {HERO_AREAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button type="submit"
              className="rounded-xl bg-white px-6 py-3 font-semibold text-emerald-700 hover:bg-emerald-50">
              Search
            </button>
          </form>
        </div>
      </div>

      {/* Recommendations (tenant only) */}
      {user?.role === 'tenant' && (recData?.results?.length ?? 0) > 0 && (
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Recommended for you</h2>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recData!.results.slice(0, 3).map((l) => (
              <ListingCard key={l.id} listing={l} saved={savedIds.has(l.id)} />
            ))}
          </div>
        </section>
      )}

      {/* Latest listings */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Latest listings</h2>
          <button onClick={() => navigate('/listings')}
            className="text-sm text-emerald-600 hover:underline dark:text-emerald-400">View all →</button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {latestData?.results.slice(0, 6).map((l) => (
            <ListingCard key={l.id} listing={l} saved={savedIds.has(l.id)} />
          ))}
        </div>
      </section>

      {/* CTA for landlords */}
      {!user && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-8 py-10 text-center dark:border-emerald-900/40 dark:bg-emerald-900/20">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Are you a landlord?</h2>
          <p className="mt-2 text-gray-600 dark:text-gray-300">List your property and reach thousands of potential tenants.</p>
          <button onClick={() => navigate('/register')}
            className="mt-4 rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700">
            Get started free
          </button>
        </div>
      )}
    </div>
  )
}
