import { useToastStore } from '@/lib/toast'

const VARIANT_STYLES: Record<string, string> = {
  error: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400',
  info: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  success: 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-400',
}

export default function ToastHost() {
  const { toasts, dismiss } = useToastStore()

  if (!toasts.length) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={`flex items-start justify-between gap-3 rounded-lg border p-3 text-sm shadow-lg ${VARIANT_STYLES[t.variant]}`}>
          <div>
            <div>{t.message}</div>
            {t.requestId && <div className="mt-1 text-xs opacity-70">Ref: {t.requestId}</div>}
          </div>
          <button onClick={() => dismiss(t.id)} className="shrink-0 opacity-60 hover:opacity-100">✕</button>
        </div>
      ))}
    </div>
  )
}
