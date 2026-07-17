import { Link } from 'react-router-dom'
import { AREA_LABELS, PROPERTY_LABELS } from '@/lib/utils'
import { formatPrice } from '@/lib/intl'
import type { Listing } from '@/types'

interface Props { listing: Listing; onSave?: (id: number) => void; saved?: boolean }

export default function ListingCard({ listing, onSave, saved }: Props) {
  const thumb = listing.panoramas[0]?.thumbnail_url
  const providerLabel = listing.owner_role === 'agent' ? 'Agent' : 'Landlord'

  return (
    <div className="group overflow-hidden rounded-[1.35rem] border border-gray-200 bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg dark:border-gray-700 dark:bg-gray-800">
      <Link to={`/listings/${listing.id}`}>
        <div className="relative h-52 bg-gray-200 dark:bg-gray-700">
          {thumb
            ? <img src={thumb} alt={listing.title} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
            : <div className="flex h-full items-center justify-center text-gray-400 dark:text-gray-500">No image</div>
          }
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-gray-700 backdrop-blur dark:bg-gray-900/80 dark:text-gray-200">
            {PROPERTY_LABELS[listing.property_type]}
          </span>
          {listing.owner_verified && (
            <span className="absolute right-3 top-3 rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white">
              ✓ Verified {providerLabel}
            </span>
          )}
        </div>
      </Link>

      <div className="p-4">
        <Link to={`/listings/${listing.id}`}>
          <h3 className="truncate font-semibold text-gray-900 transition group-hover:text-emerald-600 dark:text-gray-100 dark:group-hover:text-emerald-400">{listing.title}</h3>
        </Link>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{AREA_LABELS[listing.location_area]}</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div>
            <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {formatPrice(listing.price_annual, listing.currency)}
            </span>
            <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">/yr</span>
          </div>
          <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span>{listing.bedrooms} bed</span>
            <span>{listing.bathrooms} bath</span>
          </div>
        </div>

        {onSave && (
          <button
            onClick={() => onSave(listing.id)}
            className={`mt-4 w-full rounded-xl border py-2 text-sm font-medium transition ${
              saved
                ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50'
            }`}
          >
            {saved ? '♥ Saved' : '♡ Save'}
          </button>
        )}
      </div>
    </div>
  )
}
