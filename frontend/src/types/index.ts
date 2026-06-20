// ─── Enums ────────────────────────────────────────────────────────────────────

export type Role = 'tenant' | 'landlord' | 'admin'

export type PropertyType = 'apartment' | 'house' | 'studio' | 'room' | 'commercial'

export type LocationArea =
  | 'aberdeen' | 'lumley' | 'goderich' | 'hill_station' | 'wilberforce'
  | 'murray_town' | 'brookfields' | 'kissy' | 'wellington' | 'calaba_town' | 'other'

export type Currency = 'SLE' | 'USD'

export type ListingStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'rented' | 'expired' | 'archived'

export type DocumentType = 'national_id' | 'drivers_license' | 'passport'

export type VerificationStatus = 'pending' | 'approved' | 'rejected'

export type PanoramaStatus = 'pending' | 'processing' | 'ready' | 'failed'

export type PanoramaProjection = 'equirectangular' | 'cylindrical'

export type ReportReason = 'fake_listing' | 'misleading' | 'scam' | 'wrong_price' | 'not_available' | 'other'

export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed'

export type NotificationKind =
  | 'listing_decision' | 'verification_result' | 'new_message' | 'report_update' | 'panorama_ready'

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  full_name: string
  phone: string
  role: Role
  is_verified: boolean
  date_joined: string
}

export interface PublicUser {
  id: string
  full_name: string
  is_verified: boolean
  listings_count: number
  joined_year: number
}

export interface AuthState {
  access: string | null
  user: Pick<User, 'id' | 'email' | 'role' | 'is_verified'> | null
}

// ─── Listings ─────────────────────────────────────────────────────────────────

export interface PanoramaInline {
  id: number
  room_label: string
  status: PanoramaStatus
  ordering: number
  thumbnail_url: string | null
}

export interface Listing {
  id: number
  owner_id: string
  owner_name: string
  owner_verified: boolean
  title: string
  description: string
  property_type: PropertyType
  bedrooms: number
  bathrooms: number
  price_annual: number
  currency: Currency
  location_area: LocationArea
  lat: number | null
  lng: number | null
  status: ListingStatus
  rejection_notes?: string
  panoramas: PanoramaInline[]
  created_at: string
  updated_at: string
}

export interface ListingWritePayload {
  title: string
  description: string
  property_type: PropertyType
  bedrooms?: number
  bathrooms?: number
  price_annual: number
  currency?: Currency
  location_area: LocationArea
  lat?: number
  lng?: number
}

export interface ListingFilters {
  q?: string
  area?: LocationArea[]
  min_price?: number
  max_price?: number
  min_bedrooms?: number
  max_bedrooms?: number
  property_type?: PropertyType[]
  currency?: Currency
  sort?: string
  page?: number
}

// ─── Panoramas ────────────────────────────────────────────────────────────────

export interface Panorama {
  id: number
  listing_id: number
  room_label: string
  projection: PanoramaProjection
  status: PanoramaStatus
  failure_reason: string
  ordering: number
  tile_url: string | null
  preview_url: string | null
  thumbnail_url: string | null
  created_at: string
}

// ─── Saved listings ───────────────────────────────────────────────────────────

export interface SavedListing {
  id: number
  listing: Listing
  created_at: string
}

// ─── Verification ─────────────────────────────────────────────────────────────

export interface Verification {
  id: number
  document_type: DocumentType
  document_front_url: string
  document_back_url: string | null
  selfie_url: string
  status: VerificationStatus
  notes: string
  submitted_at: string
  reviewed_at: string | null
}

// ─── Messaging ────────────────────────────────────────────────────────────────

export interface Conversation {
  id: number
  tenant_id: string
  tenant_name: string
  landlord_id: string
  landlord_name: string
  listing_id: number | null
  last_message_at: string | null
  unread_count: number
  created_at: string
}

export interface Message {
  id: number
  sender_id: string
  sender_name: string
  body: string
  client_key: string | null
  read_at: string | null
  created_at: string
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface Notification {
  id: number
  type: NotificationKind
  payload: Record<string, unknown>
  is_read: boolean
  is_sent: boolean
  created_at: string
}

// ─── Preferences ──────────────────────────────────────────────────────────────

export interface SearchPreference {
  preferred_areas: LocationArea[]
  min_price: number | null
  max_price: number | null
  min_bedrooms: number | null
  property_types: PropertyType[]
  updated_at: string
}

// ─── Fraud reports ────────────────────────────────────────────────────────────

export interface FraudReport {
  id: number
  reporter_id: string
  listing_id: number | null
  reported_user_id: string | null
  reason: ReportReason
  description: string
  status: ReportStatus
  resolution_notes: string
  created_at: string
  resolved_at: string | null
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}
