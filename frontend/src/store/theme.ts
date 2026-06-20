import { create } from 'zustand'

interface ThemeStore {
  isDark: boolean
  toggle: () => void
}

const STORAGE_KEY = 'estate360-theme'

const getInitial = (): boolean => {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) return stored === 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

const applyClass = (isDark: boolean) => {
  document.documentElement.classList.toggle('dark', isDark)
  localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light')
}

const initial = getInitial()
applyClass(initial)

export const useThemeStore = create<ThemeStore>((set, get) => ({
  isDark: initial,
  toggle: () => {
    const next = !get().isDark
    applyClass(next)
    set({ isDark: next })
  },
}))
