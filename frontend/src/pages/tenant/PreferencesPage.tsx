import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { recommendationsApi } from '@/api'
import { AREA_LABELS, PROPERTY_LABELS } from '@/lib/utils'
import type { LocationArea, PropertyType } from '@/types'

const AREAS = Object.entries(AREA_LABELS) as [LocationArea, string][]
const TYPES = Object.entries(PROPERTY_LABELS) as [PropertyType, string][]

interface PrefForm {
  preferred_areas: LocationArea[]
  property_types: PropertyType[]
  min_bedrooms: number
  min_price: number
  max_price: number
}

const DEFAULT_PREF_FORM: PrefForm = {
  preferred_areas: [],
  property_types: [],
  min_bedrooms: 0,
  min_price: 0,
  max_price: 0,
}

export default function PreferencesPage() {
  const qc = useQueryClient()
  const [formDraft, setFormDraft] = useState<PrefForm | null>(null)
  const [saved, setSaved] = useState(false)

  const { data: prefs } = useQuery({
    queryKey: ['preferences'],
    queryFn: () => recommendationsApi.getPreferences().then((r) => r.data),
  })

  const form = formDraft ?? (prefs
    ? {
      preferred_areas: prefs.preferred_areas ?? [],
      property_types: prefs.property_types ?? [],
      min_bedrooms: prefs.min_bedrooms ?? 0,
      min_price: prefs.min_price ?? 0,
      max_price: prefs.max_price ?? 0,
    }
    : DEFAULT_PREF_FORM)

  const updateForm = (update: (current: PrefForm) => PrefForm) => {
    setFormDraft((current) => update(current ?? form))
  }

  const saveMut = useMutation({
    mutationFn: () => recommendationsApi.savePreferences(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['preferences'] })
      qc.invalidateQueries({ queryKey: ['recommendations'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  const toggleList = <T extends string>(k: 'preferred_areas' | 'property_types', val: T) => {
    updateForm((f) => {
      const cur = f[k] as T[]
      const next = cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val]
      return { ...f, [k]: next }
    })
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Search preferences</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">We use these to personalise your recommendations</p>
      </div>

      {saved && (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          Preferences saved!
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5 dark:border-gray-700 dark:bg-gray-800">
        <div>
          <label className="label">Preferred areas</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {AREAS.map(([v, l]) => (
              <button key={v} type="button"
                onClick={() => toggleList('preferred_areas', v)}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  form.preferred_areas.includes(v)
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'text-gray-600 hover:border-emerald-300 dark:text-gray-400 dark:hover:border-emerald-700'
                }`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Property types</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {TYPES.map(([v, l]) => (
              <button key={v} type="button"
                onClick={() => toggleList('property_types', v)}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  form.property_types.includes(v)
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'text-gray-600 hover:border-emerald-300 dark:text-gray-400 dark:hover:border-emerald-700'
                }`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">Min bedrooms</label>
            <input type="number" min={0} value={form.min_bedrooms}
              onChange={(e) => updateForm((f) => ({ ...f, min_bedrooms: +e.target.value }))}
              className="input" />
          </div>
          <div>
            <label className="label">Min price</label>
            <input type="number" min={0} value={form.min_price}
              onChange={(e) => updateForm((f) => ({ ...f, min_price: +e.target.value }))}
              className="input" />
          </div>
          <div>
            <label className="label">Max price</label>
            <input type="number" min={0} value={form.max_price}
              onChange={(e) => updateForm((f) => ({ ...f, max_price: +e.target.value }))}
              className="input" />
          </div>
        </div>

        <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
          className="w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          {saveMut.isPending ? 'Saving…' : 'Save preferences'}
        </button>
      </div>
    </div>
  )
}
