import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listingsApi, panoramasApi, reportsApi, messagingApi, savedApi } from '@/api'
import { useAuthStore } from '@/lib/auth'
import { AREA_LABELS, PROPERTY_LABELS, getErrorMessage } from '@/lib/utils'
import { formatPrice, formatDate } from '@/lib/intl'
import { LISTING_REPORT_REASONS } from '@/lib/reportReasons'
import { pushToast } from '@/lib/toast'
import VirtualTourModal from '@/components/listings/VirtualTourModal'
import LocationMap from '@/components/listings/LocationMap'
import Avatar from '@/components/common/Avatar'
import ReportModal from '@/components/common/ReportModal'
import type { ReportReason } from '@/types'

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const listingId = Number(id)
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [showReport, setShowReport] = useState(false)
  const [contactMsg, setContactMsg] = useState('')
  const [showContact, setShowContact] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)
  const [tourIndex, setTourIndex] = useState(0)

  const { data: listing, isLoading } = useQuery({
    queryKey: ['listing', listingId],
    queryFn: () => listingsApi.get(listingId).then((r) => r.data),
  })

  const { data: panoramaRes } = useQuery({
    queryKey: ['panoramas', listingId],
    queryFn: () => panoramasApi.list(listingId).then((r) => r.data),
    enabled: !!listing,
  })

  const { data: savedData } = useQuery({
    queryKey: ['saved', 1],
    queryFn: () => savedApi.list(1).then((r) => r.data),
    enabled: user?.role === 'tenant',
  })
  const isSaved = savedData?.results.some((s) => s.listing.id === listingId) ?? false
  const providerLabel = listing?.owner_role === 'agent' ? 'Agent' : 'Landlord'
  const providerLabelLower = providerLabel.toLowerCase()

  const saveMut = useMutation({
    mutationFn: () => (isSaved ? listingsApi.unsave(listingId) : listingsApi.save(listingId)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved'] }),
  })

  const reportMut = useMutation({
    mutationFn: (vars: { reason: ReportReason; description: string }) => reportsApi.create({
      listing: listingId,
      reason: vars.reason,
      description: vars.description,
    }),
    onSuccess: () => {
      setShowReport(false)
      pushToast('Report submitted. Our team will review it.', 'success')
    },
    onError: (err) => pushToast(getErrorMessage(err, 'Failed to submit report'), 'error'),
  })

  const contactMut = useMutation({
    mutationFn: async () => {
      const r = await messagingApi.startConversation({
        provider_id: listing!.owner_id,
        listing_id: listingId,
        initial_message: contactMsg,
      })
      return r.data.id
    },
    onSuccess: (convId) => navigate(`/conversations/${convId}`),
  })

  const panoramas = (panoramaRes?.results ?? []).filter((p) => p.status === 'ready' && p.preview_url)

  if (isLoading) return (
    <div className="space-y-4">
      <div className="h-72 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />
      <div className="h-8 w-1/3 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
    </div>
  )

  if (!listing) return <div className="py-16 text-center text-gray-500 dark:text-gray-400">Listing not found</div>

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      {/* Main */}
      <div className="lg:col-span-2 space-y-6">
        {/* Virtual tour cover + launcher */}
        {panoramas.length > 0 ? (
          <button type="button" onClick={() => { setTourIndex(0); setTourOpen(true) }}
            className="group relative block h-72 w-full overflow-hidden rounded-2xl bg-black md:h-96 lg:h-[32rem]">
            <img src={panoramas[0].thumbnail_url ?? ''} alt="" className="h-full w-full object-cover opacity-80 transition group-hover:opacity-60" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/20">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-emerald-700 shadow-lg transition group-hover:scale-105">
                <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
              <span className="rounded-full bg-black/60 px-4 py-1.5 text-sm font-semibold text-white">
                Take the Virtual Tour
              </span>
            </div>
          </button>
        ) : (
          <div className="flex h-72 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
            No images
          </div>
        )}

        {/* Badges + title */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              {PROPERTY_LABELS[listing.property_type]}
            </span>
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              {AREA_LABELS[listing.location_area]}
            </span>
            {listing.owner_verified && (
              <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                Verified {providerLabel}
              </span>
            )}
          </div>
          <h1 className="mt-3 text-2xl font-bold text-gray-900 dark:text-gray-100">{listing.title}</h1>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Bedrooms', value: listing.bedrooms },
            { label: 'Bathrooms', value: listing.bathrooms },
          ].map((d) => (
            <div key={d.label} className="rounded-xl border border-gray-200 bg-white p-4 text-center dark:border-gray-700 dark:bg-gray-800">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{d.value ?? '—'}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{d.label}</div>
            </div>
          ))}
        </div>

        {/* Description */}
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Description</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-gray-600 dark:text-gray-300">{listing.description}</p>
        </div>

        {/* Location */}
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Location</h2>
          <div className="mt-2">
            <LocationMap lat={listing.lat} lng={listing.lng} area={listing.location_area} />
          </div>
        </div>

        {/* Report */}
        {user && (
          <div>
            <button onClick={() => setShowReport(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-gray-700 dark:text-gray-400 dark:hover:border-red-900/40 dark:hover:bg-red-900/20 dark:hover:text-red-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Report this listing
            </button>
            {showReport && (
              <ReportModal
                title="Report this listing"
                reasons={LISTING_REPORT_REASONS}
                isSubmitting={reportMut.isPending}
                onClose={() => setShowReport(false)}
                onSubmit={(reason, description) => reportMut.mutate({ reason, description })}
              />
            )}
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatPrice(listing.price_annual, listing.currency)}
            <span className="text-base font-normal text-gray-500 dark:text-gray-400">/yr</span>
          </div>

          {user?.role === 'tenant' && (
            <>
              <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
                className={`mt-4 w-full rounded-lg border py-2.5 text-sm font-semibold transition ${
                  isSaved
                    ? 'border-gray-300 bg-emerald-50 text-emerald-700 dark:border-gray-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}>
                {isSaved ? 'Saved' : 'Save listing'}
              </button>
              <button onClick={() => setShowContact(true)}
                className="mt-2 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
                Contact {providerLabelLower}
              </button>
            </>
          )}

          {(user?.role === 'landlord' || user?.role === 'agent') && user.id === listing.owner_id && (
            <Link to={`/listings/${listingId}/edit`}
              className="mt-4 block w-full rounded-lg border border-gray-300 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
              Edit listing
            </Link>
          )}
        </div>

        {/* Owner card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Listed by</h2>
          <Link to={`/profile/${listing.owner_id}`}
            className="mt-3 flex items-center gap-3 hover:opacity-80">
            <Avatar name={listing.owner_name} />
            <div>
              <div className="font-medium text-gray-900 dark:text-gray-100">{listing.owner_name}</div>
              {listing.owner_verified && (
                <div className="text-xs text-yellow-600 dark:text-yellow-400">Verified {providerLabel}</div>
              )}
              {!listing.owner_verified && (
                <div className="text-xs text-gray-500 dark:text-gray-400">{providerLabel}</div>
              )}
            </div>
          </Link>
        </div>

        <div className="text-xs text-gray-400 dark:text-gray-500">
          Listed {formatDate(listing.created_at)} · Updated {formatDate(listing.updated_at)}
        </div>
      </div>

      {/* Contact modal */}
      {showContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 dark:bg-gray-800">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Contact {providerLabelLower}</h2>
            <textarea value={contactMsg} onChange={(e) => setContactMsg(e.target.value)}
              placeholder="Hi, I'm interested in this property…" rows={4}
              className="mt-4 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            <div className="mt-4 flex gap-3">
              <button onClick={() => setShowContact(false)}
                className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-300">Cancel</button>
              <button onClick={() => contactMut.mutate()} disabled={!contactMsg || contactMut.isPending}
                className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm text-white disabled:opacity-50">
                {contactMut.isPending ? 'Sending…' : 'Send message'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tourOpen && panoramas.length > 0 && (
        <VirtualTourModal
          panoramas={panoramas}
          index={tourIndex}
          onIndexChange={setTourIndex}
          onClose={() => setTourOpen(false)}
        />
      )}
    </div>
  )
}
