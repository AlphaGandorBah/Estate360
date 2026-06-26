import { useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { listingsApi, panoramasApi } from '@/api'
import { AREA_LABELS, PROPERTY_LABELS, getErrorMessage } from '@/lib/utils'
import { listingSchema, applyServerErrors, type ListingForm } from '@/lib/validation'
import { useAuthStore } from '@/lib/auth'
import PanoramaManager from '@/components/listings/PanoramaManager'
import LocationPicker from '@/components/listings/LocationPicker'
import type { LocationArea, PropertyType } from '@/types'

const AREAS = Object.entries(AREA_LABELS) as [LocationArea, string][]
const TYPES = Object.entries(PROPERTY_LABELS) as [PropertyType, string][]

export default function EditListingPage() {
  const { id } = useParams<{ id: string }>()
  const listingId = Number(id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)

  const {
    register, handleSubmit, setError, watch, setValue, reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ListingForm>({ resolver: zodResolver(listingSchema) })
  const lat = watch('lat')
  const lng = watch('lng')

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
    reset({
      title: listing.title,
      description: listing.description,
      property_type: listing.property_type,
      location_area: listing.location_area,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      price_annual: listing.price_annual,
      currency: listing.currency,
      lat: listing.lat,
      lng: listing.lng,
    })
  }, [listing, reset])

  const onSubmit = async (form: ListingForm) => {
    try {
      await listingsApi.update(listingId, { ...form, lat: form.lat ?? undefined, lng: form.lng ?? undefined })
      navigate(`/listings/${listingId}`)
    } catch (err) {
      applyServerErrors(err, setError, 'Update failed')
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this listing? This cannot be undone.')) return
    await listingsApi.delete(listingId)
    navigate('/my-listings')
  }

  if (!listing) return <div className="h-64 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Edit listing</h1>
        <button onClick={handleDelete}
          className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30">
          Delete listing
        </button>
      </div>

      {errors.root?.message && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">{errors.root.message}</div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
        <div>
          <label className="label">Title</label>
          <input {...register('title')} className="input" />
          {errors.title && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.title.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Property type</label>
            <select {...register('property_type')} className="input">
              {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Area</label>
            <select {...register('location_area')} className="input">
              {AREAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Description</label>
          <textarea {...register('description')} rows={5} className="input resize-none" />
          {errors.description && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.description.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Bedrooms</label>
            <input type="number" min={0} {...register('bedrooms', { valueAsNumber: true })} className="input" />
          </div>
          <div>
            <label className="label">Bathrooms</label>
            <input type="number" min={0} {...register('bathrooms', { valueAsNumber: true })} className="input" />
          </div>
        </div>

        <div>
          <label className="label">Annual rent</label>
          <input type="number" min={1} {...register('price_annual', { valueAsNumber: true })} className="input" />
          {errors.price_annual && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.price_annual.message}</p>}
        </div>

        <div>
          <label className="label">Currency</label>
          <select {...register('currency')} className="input w-40">
            <option value="SLE">SLE</option>
            <option value="USD">USD</option>
          </select>
        </div>

        <div>
          <label className="label">Exact location (optional)</label>
          <LocationPicker
            lat={lat ?? null}
            lng={lng ?? null}
            onChange={(newLat, newLng) => { setValue('lat', newLat, { shouldDirty: true }); setValue('lng', newLng, { shouldDirty: true }) }}
          />
          {(errors.lat || errors.lng) && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              {errors.lat?.message || errors.lng?.message}
            </p>
          )}
        </div>

        <button type="submit" disabled={isSubmitting || !isDirty}
          className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          {isSubmitting ? 'Saving…' : 'Save changes'}
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
