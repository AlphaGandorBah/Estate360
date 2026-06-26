import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { listingsApi } from '@/api'
import { AREA_LABELS, PROPERTY_LABELS } from '@/lib/utils'
import { listingSchema, applyServerErrors, type ListingForm } from '@/lib/validation'
import LocationPicker from '@/components/listings/LocationPicker'
import type { LocationArea, PropertyType } from '@/types'

const AREAS = Object.entries(AREA_LABELS) as [LocationArea, string][]
const TYPES = Object.entries(PROPERTY_LABELS) as [PropertyType, string][]

export default function CreateListingPage() {
  const navigate = useNavigate()
  const {
    register, handleSubmit, setError, watch, setValue,
    formState: { errors, isSubmitting },
  } = useForm<ListingForm>({
    resolver: zodResolver(listingSchema),
    defaultValues: { property_type: 'apartment', location_area: 'aberdeen', bedrooms: 1, bathrooms: 1, currency: 'SLE', lat: null, lng: null },
  })
  const lat = watch('lat')
  const lng = watch('lng')

  const onSubmit = async (form: ListingForm) => {
    try {
      const r = await listingsApi.create({ ...form, lat: form.lat ?? undefined, lng: form.lng ?? undefined })
      navigate(`/listings/${r.data.id}/edit`)
    } catch (err) {
      applyServerErrors(err, setError, 'Failed to create listing')
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Create listing</h1>

      {errors.root?.message && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">{errors.root.message}</div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
        <div>
          <label className="label">Title</label>
          <input {...register('title')} className="input" placeholder="2-bedroom apartment in Wilberforce" />
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
          <input type="number" min={1} placeholder="e.g. 12000000" {...register('price_annual', { valueAsNumber: true })} className="input" />
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
            onChange={(newLat, newLng) => { setValue('lat', newLat); setValue('lng', newLng) }}
          />
          {(errors.lat || errors.lng) && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              {errors.lat?.message || errors.lng?.message}
            </p>
          )}
        </div>

        <button type="submit" disabled={isSubmitting}
          className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          {isSubmitting ? 'Creating…' : 'Create listing'}
        </button>
      </form>
    </div>
  )
}
