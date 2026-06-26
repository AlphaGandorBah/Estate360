import { create } from 'zustand'
import { v4 as uuid } from 'uuid'

export type ToastVariant = 'error' | 'info' | 'success'

export interface Toast {
  id: string
  message: string
  variant: ToastVariant
  requestId?: string
}

interface ToastStore {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = uuid()
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 6000)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export function pushToast(message: string, variant: ToastVariant = 'error', requestId?: string) {
  if (requestId) console.error(`[${requestId}] ${message}`)
  useToastStore.getState().push({ message, variant, requestId })
}
