import type {
  User, Listing, Panorama, Conversation, Message, Notification, SavedListing,
} from '@/types'

export const mockUsers: User[] = [
  { id: 'u1', email: 'tenant@example.com', full_name: 'Aminata Koroma', phone: '+23276000001', role: 'tenant', is_verified: false, date_joined: '2025-01-01T00:00:00Z' },
  { id: 'u2', email: 'landlord@example.com', full_name: 'Mohamed Bah', phone: '+23276000002', role: 'landlord', is_verified: true, date_joined: '2025-01-01T00:00:00Z' },
  { id: 'u3', email: 'admin@example.com', full_name: 'Estate360 Admin', phone: '', role: 'admin', is_verified: true, date_joined: '2025-01-01T00:00:00Z' },
]

export const mockListings: Listing[] = [
  {
    id: 1, owner_id: 'u2', owner_name: 'Mohamed Bah', owner_verified: true,
    title: '2-bedroom apartment in Aberdeen', description: 'Bright apartment near the beach, freshly painted.',
    property_type: 'apartment', bedrooms: 2, bathrooms: 1, price_annual: 18000000, currency: 'SLE',
    location_area: 'aberdeen', lat: 8.4870, lng: -13.2840, status: 'approved',
    panoramas: [{ id: 1, room_label: 'Living room', status: 'ready', ordering: 0, thumbnail_url: null }],
    created_at: '2025-06-01T00:00:00Z', updated_at: '2025-06-01T00:00:00Z',
  },
  {
    id: 2, owner_id: 'u2', owner_name: 'Mohamed Bah', owner_verified: true,
    title: 'Studio in Lumley', description: 'Cosy studio, walking distance to the beach.',
    property_type: 'studio', bedrooms: 1, bathrooms: 1, price_annual: 9000000, currency: 'SLE',
    location_area: 'lumley', lat: null, lng: null, status: 'approved',
    panoramas: [], created_at: '2025-06-02T00:00:00Z', updated_at: '2025-06-02T00:00:00Z',
  },
]

export const mockPanoramas: Panorama[] = [
  {
    id: 1, listing_id: 1, room_label: 'Living room', projection: 'equirectangular',
    status: 'ready', failure_reason: '', ordering: 0,
    tile_url: null, preview_url: 'https://pannellum.org/images/alma.jpg', thumbnail_url: 'https://pannellum.org/images/alma.jpg',
    created_at: '2025-06-01T00:00:00Z',
  },
]

export const mockSaved: SavedListing[] = []

export const mockConversations: Conversation[] = [
  {
    id: 1, initiator_id: 'u1', initiator_name: 'Aminata Koroma', initiator_role: 'tenant',
    landlord_id: 'u2', landlord_name: 'Mohamed Bah', is_support: false,
    listing_id: 1, last_message_at: '2025-06-10T12:00:00Z', unread_count: 1, created_at: '2025-06-10T11:00:00Z',
  },
]

export const mockMessages: Message[] = [
  { id: 1, sender_id: 'u1', sender_name: 'Aminata Koroma', body: 'Hi, is this still available?', client_key: null, read_at: null, created_at: '2025-06-10T11:00:00Z' },
  { id: 2, sender_id: 'u2', sender_name: 'Mohamed Bah', body: 'Yes! Happy to show you around.', client_key: null, read_at: null, created_at: '2025-06-10T12:00:00Z' },
]

export const mockNotifications: Notification[] = [
  { id: 1, type: 'new_message', payload: { conversation_id: 1 }, is_read: false, is_sent: true, created_at: '2025-06-10T12:00:00Z' },
]
