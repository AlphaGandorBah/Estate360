import api from '@/lib/apiClient'
import type { Listing, SearchPreference, PaginatedResponse } from '@/types'

export const recommendationsApi = {
  list: () => api.get<PaginatedResponse<Listing>>('/recommendations/'),
  preferences: () => api.get<SearchPreference>('/preferences/me'),
  getPreferences: () => api.get<SearchPreference>('/preferences/me'),
  setPreferences: (d: Partial<SearchPreference>) => api.put<SearchPreference>('/preferences/set', d),
  savePreferences: (d: Partial<SearchPreference>) => api.put<SearchPreference>('/preferences/set', d),
}
