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
