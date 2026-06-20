import { useNavigate } from 'react-router-dom'
import { authApi } from '@/api'
import { useAuthStore } from '@/lib/auth'
import { useIdempotencyKey } from '@/lib/idempotency'

export default function AccountSecurityPage() {
  const navigate = useNavigate()
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const { key } = useIdempotencyKey()

  const handleLogout = async () => {
    try { await authApi.logout(key) } catch { /* ignore */ }
    clearAuth()
    navigate('/login')
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Security</h1>

      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Sessions</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Log out of Estate360 on this device.
        </p>
        <button onClick={handleLogout}
          className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
          Log out
        </button>
      </div>
    </div>
  )
}
