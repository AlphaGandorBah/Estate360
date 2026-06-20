import axios from 'axios'
import { create } from 'zustand'
import type { AuthState } from '@/types'

interface AuthStore extends AuthState {
  setAuth: (access: string, user: AuthState['user']) => void
  setAccess: (access: string) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  access: null,
  user: null,
  setAuth: (access, user) => set({ access, user }),
  setAccess: (access) => set({ access }),
  clearAuth: () => set({ access: null, user: null }),
}))

let refreshing: Promise<string> | null = null

/**
 * Single-flight token refresh: concurrent callers (failed REST requests, a
 * dropped WebSocket) share one in-flight refresh instead of each firing their
 * own. Returns the new access token, or throws if the refresh itself fails
 * (caller is responsible for clearing the session in that case). Uses plain
 * axios, not the apiClient instance, so it never recurses through apiClient's
 * own 401 interceptor.
 */
export function refreshAccessToken(): Promise<string> {
  if (!refreshing) {
    refreshing = axios
      .post('/api/v1/auth/refresh', {}, {
        withCredentials: true,
        headers: { 'X-Requested-With': 'estate360-web' },
      })
      .then((r) => r.data.access as string)
      .finally(() => { refreshing = null })
  }
  return refreshing
}
