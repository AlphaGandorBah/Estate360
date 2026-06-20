import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listingsApi } from '@/api'
import { AREA_LABELS, PROPERTY_LABELS, getErrorMessage } from '@/lib/utils'
import type { ListingWritePayload, LocationArea, PropertyType } from '@/types'

const AREAS = Object.entries(AREA_LABELS) as [LocationArea, string][]
const TYPES = Object.entries(PROPERTY_LABELS) as [PropertyType, string][]

const INITIAL: ListingWritePayload = {
  title: '', description: '',
  property_type: 'apartment', location_area: 'aberdeen',
  bedrooms: 1, bathrooms: 1,
  price_annual: 0, currency: 'SLE',
}

export default function CreateListingPage() {
  const [form, setForm] = useState<ListingWritePayload>(INITIAL)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const set = <K extends keyof ListingWritePayload>(k: K, v: ListingWritePayload[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const r = await listingsApi.create(form)
      navigate(`/listings/${r.data.id}/edit`)
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to create listing'))
    } finally { setLoading(false) }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Create listing</h1>

      {error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">{error}</div>}

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div>
          <label className="label">Title</label>
          <input required value={form.title} onChange={(e) => set('title', e.target.value)}
            className="input" placeholder="2-bedroom apartment in Wilberforce" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Property type</label>
            <select value={form.property_type}
              onChange={(e) => set('property_type', e.target.value as PropertyType)}
              className="input">
              {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Area</label>
            <select value={form.location_area}
              onChange={(e) => set('location_area', e.target.value as LocationArea)}
              className="input">
              {AREAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Description</label>
          <textarea required value={form.description} rows={5}
            onChange={(e) => set('description', e.target.value)}
            className="input resize-none" />
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
          {loading ? 'Creating…' : 'Create listing'}
        </button>
      </form>
    </div>
  )
}
