import { http, HttpResponse } from 'msw'
import { mockListings } from '../fixtures'
import type { SearchPreference } from '@/types'

let preferences: SearchPreference = {
  preferred_areas: [],
  min_price: null,
  max_price: null,
  min_bedrooms: null,
  property_types: [],
  updated_at: '2025-06-01T00:00:00Z',
}

export const recommendationsHandlers = [
  http.get('/api/v1/recommendations/', () =>
    HttpResponse.json({ count: mockListings.length, next: null, previous: null, results: mockListings })),

  http.get('/api/v1/preferences/me', () => HttpResponse.json(preferences)),

  http.put('/api/v1/preferences/set', async ({ request }) => {
    const body = await request.json() as Partial<SearchPreference>
    preferences = { ...preferences, ...body, updated_at: new Date().toISOString() }
    return HttpResponse.json(preferences)
  }),
]
