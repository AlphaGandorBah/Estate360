import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { authApi } from '@/api'
import { useIdempotencyKey } from '@/lib/idempotency'
import NotificationBell from '@/components/notifications/NotificationBell'
import ThemeToggle from '@/components/layout/ThemeToggle'

const linkCls = 'text-sm font-medium text-gray-600 hover:text-emerald-600 dark:text-gray-300 dark:hover:text-emerald-400'
const mobileLinkCls = 'block rounded-lg px-3 py-2.5 text-base font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800'

export default function Navbar() {
  const { user, clearAuth } = useAuthStore()
  const navigate = useNavigate()
  const { key } = useIdempotencyKey()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = async () => {
    try { await authApi.logout(key) } catch { /* ignore */ }
    clearAuth()
    setMenuOpen(false)
    navigate('/login')
  }

  const closeMenu = () => setMenuOpen(false)

  return (
    <header className="sticky top-0 z-40 w-full border-b border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link to="/" className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">Estate360</Link>

        <nav className="hidden items-center gap-6 md:flex">
          <Link to="/listings" className={linkCls}>Browse</Link>
          {user?.role === 'tenant' && (
            <>
              <Link to="/dashboard" className={linkCls}>Dashboard</Link>
              <Link to="/saved" className={linkCls}>Saved</Link>
            </>
          )}
          {user?.role === 'landlord' && (
            <>
              <Link to="/my-listings" className={linkCls}>My Listings</Link>
              <Link to="/listings/create" className={linkCls}>+ Add Listing</Link>
            </>
          )}
          {user?.role === 'admin' && (
            <Link to="/dashboard" className={linkCls}>Admin</Link>
          )}
          {user && (
            <>
              <Link to="/conversations" className={linkCls}>Messages</Link>
              <Link to="/account" className={linkCls}>Account</Link>
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
                className="hidden rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 md:block"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className={`hidden md:block ${linkCls}`}>Login</Link>
              <Link
                to="/register"
                className="hidden rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 md:block"
              >
                Sign Up
              </Link>
            </>
          )}

          {/* Mobile menu toggle — primary nav has no other path to these links below md: */}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="flex h-11 w-11 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 md:hidden dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="border-t border-gray-200 bg-white px-4 py-3 md:hidden dark:border-gray-800 dark:bg-gray-900">
          <Link to="/listings" onClick={closeMenu} className={mobileLinkCls}>Browse</Link>
          {user?.role === 'tenant' && (
            <>
              <Link to="/dashboard" onClick={closeMenu} className={mobileLinkCls}>Dashboard</Link>
              <Link to="/saved" onClick={closeMenu} className={mobileLinkCls}>Saved</Link>
            </>
          )}
          {user?.role === 'landlord' && (
            <>
              <Link to="/my-listings" onClick={closeMenu} className={mobileLinkCls}>My Listings</Link>
              <Link to="/listings/create" onClick={closeMenu} className={mobileLinkCls}>+ Add Listing</Link>
            </>
          )}
          {user?.role === 'admin' && (
            <Link to="/dashboard" onClick={closeMenu} className={mobileLinkCls}>Admin</Link>
          )}
          {user && (
            <>
              <Link to="/conversations" onClick={closeMenu} className={mobileLinkCls}>Messages</Link>
              <Link to="/account" onClick={closeMenu} className={mobileLinkCls}>Account</Link>
              <div className="my-2 border-t border-gray-200 dark:border-gray-800" />
              <div className="px-3 py-1 text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
              <button onClick={handleLogout} className={`${mobileLinkCls} w-full text-left text-red-600 dark:text-red-400`}>
                Logout
              </button>
            </>
          )}
          {!user && (
            <>
              <Link to="/login" onClick={closeMenu} className={mobileLinkCls}>Login</Link>
              <Link to="/register" onClick={closeMenu} className={mobileLinkCls}>Sign Up</Link>
            </>
          )}
        </nav>
      )}
    </header>
  )
}
