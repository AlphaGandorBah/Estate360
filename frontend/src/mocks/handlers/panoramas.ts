import { http, HttpResponse } from 'msw'
import { mockPanoramas } from '../fixtures'
import type { Panorama } from '@/types'

let panoramas = [...mockPanoramas]
let nextId = 100

// Simulates the backend's async pending -> processing -> ready pipeline so
// the frontend's poll/WS-short-circuit logic (§7.5) has something real to
// exercise against in mock mode.
function scheduleProcessing(id: number) {
  setTimeout(() => {
    panoramas = panoramas.map((p) => (p.id === id ? { ...p, status: 'processing' } : p))
  }, 1500)
  setTimeout(() => {
    panoramas = panoramas.map((p) => (p.id === id ? {
      ...p,
      status: 'ready',
      preview_url: 'https://pannellum.org/images/alma.jpg',
      thumbnail_url: 'https://pannellum.org/images/alma.jpg',
    } : p))
  }, 4000)
}

export const panoramasHandlers = [
  http.get('/api/v1/listings/:listingId/panoramas', ({ params }) => {
    const results = panoramas.filter((p) => p.listing_id === Number(params.listingId))
    return HttpResponse.json({ count: results.length, next: null, previous: null, results })
  }),

  http.post('/api/v1/listings/:listingId/panoramas', async ({ params }) => {
    const panorama: Panorama = {
      id: nextId++,
      listing_id: Number(params.listingId),
      room_label: 'New room',
      projection: 'equirectangular',
      width: null, height: null,
      status: 'pending',
      failure_reason: '',
      ordering: panoramas.length,
      tile_url: null, preview_url: null, thumbnail_url: null,
      created_at: new Date().toISOString(),
    }
    panoramas = [...panoramas, panorama]
    scheduleProcessing(panorama.id)
    return HttpResponse.json(panorama, { status: 202 })
  }),

  http.get('/api/v1/panoramas/:id', ({ params }) => {
    const panorama = panoramas.find((p) => p.id === Number(params.id))
    if (!panorama) return HttpResponse.json({ code: 'not_found', detail: 'Panorama not found.' }, { status: 404 })
    return HttpResponse.json(panorama)
  }),

  http.delete('/api/v1/panoramas/:id', ({ params }) => {
    panoramas = panoramas.filter((p) => p.id !== Number(params.id))
    return HttpResponse.json({}, { status: 204 })
  }),
]
