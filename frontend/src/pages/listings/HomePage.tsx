import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listingsApi, recommendationsApi, savedApi } from '@/api'
import ListingCard from '@/components/listings/ListingCard'
import { useAuthStore } from '@/lib/auth'
import { AREA_LABELS } from '@/lib/utils'
import type { LocationArea } from '@/types'
import freetownHero from '@/assets/hero-freetown-v2.png'

const HERO_AREAS = Object.entries(AREA_LABELS) as [LocationArea, string][]

const HIGHLIGHTS = [
  { title: 'Verified homes', description: 'Trusted listings from verified landlords and agents' },
  { title: 'Instant messaging', description: 'Chat directly with owners and agents' },
  { title: 'Smart recommendations', description: 'Find places that match your preferences' },
]

const POPULAR_AREAS = [
  { name: 'Murray Town', hint: 'Busy central location' },
  { name: 'Wilberforce', hint: 'Quiet and family-friendly' },
  { name: 'Goderich', hint: 'Great for modern apartments' },
]

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
  const latestListings = latestData?.results?.slice(0, 6) ?? []
  const recommendedListings = recData?.results?.slice(0, 3) ?? []

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (searchQ) params.set('q', searchQ)
    if (searchArea) params.set('area', searchArea)
    navigate(`/listings?${params.toString()}`)
  }

  return (
    <div className="space-y-8 lg:space-y-10">
      <section className="relative isolate min-h-[500px] overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900 px-6 py-10 text-white shadow-2xl shadow-slate-950/20 sm:px-8 lg:px-10 lg:py-14">
        <img
          src={freetownHero}
          alt="Freetown between its coastal harbour and the forested Lion Mountains"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-slate-950/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/75 via-slate-950/35 to-slate-950/5" />
        <div className="relative z-10 grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="max-w-2xl">
            <div className="inline-flex items-center rounded-full border border-white/20 bg-black/20 px-3 py-1 text-sm font-medium backdrop-blur-md">
              Trusted home discovery for Freetown
            </div>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight sm:text-5xl">
              Discover a place that feels like home.
            </h1>
            <p className="mt-4 max-w-xl text-base text-slate-100/90 sm:text-lg">
              Explore verified rentals, compare neighbourhoods, and connect with landlords and agents in a smoother, more modern experience.
            </p>

            <form onSubmit={handleSearch} className="mt-8 flex flex-col gap-3 rounded-2xl border border-white/20 bg-white/95 p-3 shadow-xl sm:flex-row">
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search by title, location…"
                className="flex-1 rounded-xl border border-transparent px-4 py-3 text-gray-900 outline-none ring-0 placeholder:text-gray-400"
              />
              <select
                value={searchArea}
                onChange={(e) => setSearchArea(e.target.value)}
                className="rounded-xl border border-gray-200 px-3 py-3 text-gray-900 outline-none sm:w-44"
              >
                <option value="">All areas</option>
                {HERO_AREAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <button type="submit" className="rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700">
                Search
              </button>
            </form>
          </div>

          <div className="rounded-3xl border border-white/15 bg-slate-950/35 p-4 shadow-xl backdrop-blur-md">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {HIGHLIGHTS.map((item) => (
                <div key={item.title} className="rounded-2xl border border-white/10 bg-white/90 p-4 text-gray-800 shadow-sm backdrop-blur">
                  <h2 className="font-semibold">{item.title}</h2>
                  <p className="mt-1 text-sm text-gray-600">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {POPULAR_AREAS.map((area) => (
          <div key={area.name} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <p className="text-sm font-semibold text-emerald-600">Popular area</p>
            <h3 className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{area.name}</h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{area.hint}</p>
          </div>
        ))}
      </section>

      {user?.role === 'tenant' && recommendedListings.length > 0 && (
        <section>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Tailored picks</p>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Recommended for you</h2>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recommendedListings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} saved={savedIds.has(listing.id)} />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Fresh arrivals</p>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Latest listings</h2>
          </div>
          <button onClick={() => navigate('/listings')} className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400">
            View all →
          </button>
        </div>
        {latestListings.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {latestListings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} saved={savedIds.has(listing.id)} />
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-white/70 p-8 text-center text-gray-600 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-300">
            No listings are available right now, but new homes are added often.
          </div>
        )}
      </section>

      {!user && (
        <section className="rounded-[2rem] border border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50 px-8 py-10 text-center shadow-sm dark:border-emerald-900/40 dark:from-emerald-900/20 dark:to-teal-900/20">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Ready to list your property?</h2>
          <p className="mx-auto mt-2 max-w-2xl text-gray-600 dark:text-gray-300">
            Showcase your space to a wider audience and connect with the right tenants faster.
          </p>
          <button onClick={() => navigate('/register')} className="mt-5 rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700">
            Get started free
          </button>
        </section>
      )}
    </div>
  )
}
