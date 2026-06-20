import { http, HttpResponse } from 'msw'
import { mockListings, mockSaved } from '../fixtures'
import type { Listing } from '@/types'

let listings = [...mockListings]
let saved = [...mockSaved]
let nextId = 100

export const listingsHandlers = [
  http.get('/api/v1/listings/', ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    const areas = url.searchParams.getAll('area')
    const types = url.searchParams.getAll('property_type')
    const minPrice = url.searchParams.get('min_price')
    const maxPrice = url.searchParams.get('max_price')

    let results = listings.filter((l) => l.status === 'approved')
    if (q) results = results.filter((l) => l.title.toLowerCase().includes(q))
    if (areas.length) results = results.filter((l) => areas.includes(l.location_area))
    if (types.length) results = results.filter((l) => types.includes(l.property_type))
    if (minPrice) results = results.filter((l) => l.price_annual >= Number(minPrice))
    if (maxPrice) results = results.filter((l) => l.price_annual <= Number(maxPrice))

    return HttpResponse.json({ count: results.length, next: null, previous: null, results })
  }),

  http.get('/api/v1/listings/:id', ({ params }) => {
    const listing = listings.find((l) => l.id === Number(params.id))
    if (!listing) return HttpResponse.json({ code: 'not_found', detail: 'Listing not found.' }, { status: 404 })
    return HttpResponse.json(listing)
  }),

  http.post('/api/v1/listings/', async ({ request }) => {
    const body = await request.json() as Partial<Listing>
    const listing: Listing = {
      id: nextId++,
      owner_id: 'u2', owner_name: 'Mohamed Bah', owner_verified: true,
      title: body.title ?? '', description: body.description ?? '',
      property_type: body.property_type ?? 'apartment', bedrooms: body.bedrooms ?? 0, bathrooms: body.bathrooms ?? 0,
      price_annual: body.price_annual ?? 0, currency: body.currency ?? 'SLE',
      location_area: body.location_area ?? 'aberdeen', lat: body.lat ?? null, lng: body.lng ?? null,
      status: 'draft', panoramas: [],
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    listings = [...listings, listing]
    return HttpResponse.json(listing, { status: 201 })
  }),

  http.patch('/api/v1/listings/:id', async ({ request, params }) => {
    const body = await request.json() as Partial<Listing>
    const idx = listings.findIndex((l) => l.id === Number(params.id))
    if (idx === -1) return HttpResponse.json({ code: 'not_found', detail: 'Listing not found.' }, { status: 404 })
    listings[idx] = { ...listings[idx], ...body, updated_at: new Date().toISOString() }
    return HttpResponse.json(listings[idx])
  }),

  http.delete('/api/v1/listings/:id', ({ params }) => {
    listings = listings.filter((l) => l.id !== Number(params.id))
    return HttpResponse.json({}, { status: 204 })
  }),

  http.post('/api/v1/listings/:id/submit', ({ params }) => {
    const idx = listings.findIndex((l) => l.id === Number(params.id))
    if (idx === -1) return HttpResponse.json({ code: 'not_found', detail: 'Listing not found.' }, { status: 404 })
    listings[idx] = { ...listings[idx], status: 'pending' }
    return HttpResponse.json(listings[idx])
  }),

  http.post('/api/v1/listings/:id/save', ({ params }) => {
    const listing = listings.find((l) => l.id === Number(params.id))
    if (!listing) return HttpResponse.json({ code: 'not_found', detail: 'Listing not found.' }, { status: 404 })
    const entry = { id: listing.id, listing, created_at: new Date().toISOString() }
    saved = [...saved.filter((s) => s.listing.id !== listing.id), entry]
    return HttpResponse.json(entry, { status: 201 })
  }),

  http.delete('/api/v1/listings/:id/save', ({ params }) => {
    saved = saved.filter((s) => s.listing.id !== Number(params.id))
    return HttpResponse.json({}, { status: 204 })
  }),

  http.get('/api/v1/saved/', () => HttpResponse.json({ count: saved.length, next: null, previous: null, results: saved })),
]
