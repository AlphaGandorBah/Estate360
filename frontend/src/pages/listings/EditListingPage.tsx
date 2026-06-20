import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listingsApi, panoramasApi } from '@/api'
import { AREA_LABELS, PROPERTY_LABELS, getErrorMessage } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import PanoramaManager from '@/components/listings/PanoramaManager'
import type { ListingWritePayload, LocationArea, PropertyType } from '@/types'

const AREAS = Object.entries(AREA_LABELS) as [LocationArea, string][]
const TYPES = Object.entries(PROPERTY_LABELS) as [PropertyType, string][]

export default function EditListingPage() {
  const { id } = useParams<{ id: string }>()
  const listingId = Number(id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [form, setForm] = useState<ListingWritePayload | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { data: listing } = useQuery({
    queryKey: ['listing', listingId],
    queryFn: () => listingsApi.get(listingId).then((r) => r.data),
  })

  const { data: panoramaRes } = useQuery({
    queryKey: ['panoramas', listingId],
    queryFn: () => panoramasApi.list(listingId).then((r) => r.data),
  })
  const hasReadyPanorama = panoramaRes?.results.some((p) => p.status === 'ready') ?? false
  const isVerified = user?.is_verified ?? false
  const canSubmit = isVerified && hasReadyPanorama

  const submitMut = useMutation({
    mutationFn: () => listingsApi.submit(listingId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['listing', listingId] })
      qc.invalidateQueries({ queryKey: ['my-listings'] })
    },
  })

  useEffect(() => {
    if (!listing) return
    setForm({
      title: listing.title,
      description: listing.description,
      property_type: listing.property_type,
      location_area: listing.location_area,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      price_annual: listing.price_annual,
      currency: listing.currency,
    })
  }, [listing])

  const set = <K extends keyof ListingWritePayload>(k: K, v: ListingWritePayload[K]) =>
    setForm((f) => f ? { ...f, [k]: v } : f)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    setError('')
    setLoading(true)
    try {
      await listingsApi.update(listingId, form)
      navigate(`/listings/${listingId}`)
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Update failed'))
    } finally { setLoading(false) }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this listing? This cannot be undone.')) return
    await listingsApi.delete(listingId)
    navigate('/my-listings')
  }

  if (!form) return <div className="h-64 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Edit listing</h1>
        <button onClick={handleDelete}
          className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30">
          Delete listing
        </button>
      </div>

      {error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">{error}</div>}

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div>
          <label className="label">Title</label>
          <input required value={form.title} onChange={(e) => set('title', e.target.value)} className="input" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Property type</label>
            <select value={form.property_type}
              onChange={(e) => set('property_type', e.target.value as PropertyType)} className="input">
              {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Area</label>
            <select value={form.location_area}
              onChange={(e) => set('location_area', e.target.value as LocationArea)} className="input">
              {AREAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Description</label>
          <textarea required value={form.description} rows={5}
            onChange={(e) => set('description', e.target.value)} className="input resize-none" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Bedrooms</label>
            <input type="number" min={0} value={form.bedrooms ?? 0}
              onChange={(e) => set('bedrooms', +e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">Bathrooms</label>
            <input type="number" min={0} value={form.bathrooms ?? 0}
              onChange={(e) => set('bathrooms', +e.target.value)} className="input" />
          </div>
        </div>

        <div>
          <label className="label">Annual rent</label>
          <input type="number" min={1} required placeholder="e.g. 12000000"
            value={form.price_annual || ''}
            onChange={(e) => set('price_annual', e.target.value === '' ? 0 : +e.target.value)}
            className="input" />
        </div>

        <div>
          <label className="label">Currency</label>
          <select value={form.currency ?? 'SLE'}
            onChange={(e) => set('currency', e.target.value as 'SLE' | 'USD')}
            className="input w-40">
            <option value="SLE">SLE</option>
            <option value="USD">USD</option>
          </select>
        </div>

        <button type="submit" disabled={loading}
          className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          {loading ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      <div className="mt-6">
        <PanoramaManager listingId={listingId} />
      </div>

      {listing?.status === 'draft' && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Submit for approval</h2>

          {submitMut.isError && (
            <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
              {getErrorMessage(submitMut.error, 'Failed to submit listing')}
            </div>
          )}

          <button onClick={() => submitMut.mutate()}
            disabled={!canSubmit || submitMut.isPending}
            title={
              !isVerified && !hasReadyPanorama
                ? 'You must be a verified landlord and add at least one ready panorama before submitting.'
                : !isVerified
                ? 'You must be a verified landlord to submit listings for approval.'
                : !hasReadyPanorama
                ? 'Add at least one panorama and wait for it to finish processing (status: ready) before submitting.'
                : undefined
            }
            className="mt-3 w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
            {submitMut.isPending ? 'Submitting…' : 'Submit for approval'}
          </button>

          {!canSubmit && (
            <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {!isVerified && !hasReadyPanorama
                ? 'Get verified and add a ready panorama to submit this listing for approval.'
                : !isVerified
                ? 'Get verified to submit listings for approval.'
                : 'Add at least one panorama and wait for it to become ready to submit this listing.'}
              {!isVerified && (
                <Link to="/verification" className="ml-2 font-medium text-emerald-600 hover:underline dark:text-emerald-400">
                  Start verification
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
