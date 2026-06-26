import { useAuthStore } from '@/lib/auth'

export default function RestrictionBanner() {
  const user = useAuthStore((s) => s.user)
  if (!user?.is_restricted) return null

  return (
    <div className="bg-yellow-50 px-4 py-2 text-center text-sm text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
      Your account is restricted: you can't create listings or send messages right now. Contact support if you think this is a mistake.
    </div>
  )
}
