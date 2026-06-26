import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { usersApi } from '@/api'
import api from '@/lib/apiClient'
import ListingCard from '@/components/listings/ListingCard'
import Avatar from '@/components/common/Avatar'
import type { Listing, PaginatedResponse } from '@/types'

export default function PublicProfilePage() {
  const { id } = useParams<{ id: string }>()

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', id],
    queryFn: () => usersApi.getProfile(id!).then((r) => r.data),
    enabled: !!id,
  })

  const { data: listings } = useQuery({
    queryKey: ['listings', 'owner', id],
    queryFn: () => api.get<PaginatedResponse<Listing>>(`/listings/?owner_id=${id}`).then((r) => r.data),
    enabled: !!profile && (profile.listings_count ?? 0) > 0,
  })

  if (isLoading) return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="h-32 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />
      <div className="h-48 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />
    </div>
  )

  if (!profile) return (
    <div className="py-16 text-center text-gray-500 dark:text-gray-400">User not found</div>
  )

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-5">
          <Avatar name={profile.full_name} imageUrl={profile.avatar_url} size="xl" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{profile.full_name}</h1>
              {profile.is_verified && (
                <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                  Verified
                </span>
              )}
            </div>
            <div className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              Member since {profile.joined_year}
            </div>
            <div className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
              {profile.listings_count} listing{profile.listings_count !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      {(profile.listings_count ?? 0) > 0 && (
        <section>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">
            Listings by {profile.full_name}
          </h2>
          {!listings?.results.length ? (
            <div className="mt-3 rounded-xl border border-gray-200 bg-white py-10 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              No listings available
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {listings.results.map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
