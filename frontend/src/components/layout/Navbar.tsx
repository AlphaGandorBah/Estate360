import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { authApi } from '@/api'
import { useIdempotencyKey } from '@/lib/idempotency'
import NotificationBell from '@/components/notifications/NotificationBell'
import ThemeToggle from '@/components/layout/ThemeToggle'

export default function Navbar() {
  const { user, clearAuth } = useAuthStore()
  const navigate = useNavigate()
  const { key } = useIdempotencyKey()

  const handleLogout = async () => {
    try { await authApi.logout(key) } catch { /* ignore */ }
    clearAuth()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link to="/" className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">Estate360</Link>

        <nav className="hidden items-center gap-6 md:flex">
          <Link to="/listings" className="text-sm font-medium text-gray-600 hover:text-emerald-600 dark:text-gray-300 dark:hover:text-emerald-400">Browse</Link>
          {user?.role === 'tenant' && (
            <>
              <Link to="/dashboard" className="text-sm font-medium text-gray-600 hover:text-emerald-600 dark:text-gray-300 dark:hover:text-emerald-400">Dashboard</Link>
              <Link to="/saved" className="text-sm font-medium text-gray-600 hover:text-emerald-600 dark:text-gray-300 dark:hover:text-emerald-400">Saved</Link>
            </>
          )}
          {user?.role === 'landlord' && (
            <>
              <Link to="/dashboard" className="text-sm font-medium text-gray-600 hover:text-emerald-600 dark:text-gray-300 dark:hover:text-emerald-400">My Listings</Link>
              <Link to="/listings/new" className="text-sm font-medium text-gray-600 hover:text-emerald-600 dark:text-gray-300 dark:hover:text-emerald-400">+ Add Listing</Link>
            </>
          )}
          {user?.role === 'admin' && (
            <Link to="/dashboard" className="text-sm font-medium text-gray-600 hover:text-emerald-600 dark:text-gray-300 dark:hover:text-emerald-400">Admin</Link>
          )}
          {user && (
            <>
              <Link to="/conversations" className="text-sm font-medium text-gray-600 hover:text-emerald-600 dark:text-gray-300 dark:hover:text-emerald-400">Messages</Link>
              <Link to="/account" className="text-sm font-medium text-gray-600 hover:text-emerald-600 dark:text-gray-300 dark:hover:text-emerald-400">Account</Link>
            </>
          )}
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          {user ? (
            <>
              <NotificationBell />
              <span className="hidden text-sm text-gray-700 md:block dark:text-gray-300">{user.email}</span>
              <button
                onClick={handleLogout}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm font-medium text-gray-600 hover:text-emerald-600 dark:text-gray-300 dark:hover:text-emerald-400">Login</Link>
              <Link
                to="/register"
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
