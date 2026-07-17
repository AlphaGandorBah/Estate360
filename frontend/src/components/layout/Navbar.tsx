import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/lib/auth'
import { authApi } from '@/api'
import { useIdempotencyKey } from '@/lib/idempotency'
import NotificationBell from '@/components/notifications/NotificationBell'
import ThemeToggle from '@/components/layout/ThemeToggle'
import NavButton from '@/components/layout/NavButton'
import Avatar from '@/components/common/Avatar'

type NavItemId = 'browse' | 'dashboard' | 'saved' | 'my-listings' | 'add-listing' | 'messages' | 'account'

interface NavItem {
  id: NavItemId
  label: string
  to: string
}

const desktopTabCls = (active: boolean) => [
  'relative flex h-10 items-center whitespace-nowrap rounded-lg px-3.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1624]',
  active
    ? 'bg-emerald-500/12 text-emerald-300 after:absolute after:inset-x-3 after:-bottom-[11px] after:h-0.5 after:rounded-full after:bg-emerald-400'
    : 'text-slate-300 hover:bg-white/[0.06] hover:text-white',
].join(' ')

const mobileLinkCls = (active: boolean) => [
  'flex min-h-11 items-center rounded-lg border-l-4 px-3 py-2.5 text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
  active
    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
    : 'border-transparent text-slate-200 hover:bg-slate-800 hover:text-white',
].join(' ')

function isNavItemActive(id: NavItemId, pathname: string, mobileHasHome = false): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname

  switch (id) {
    case 'browse':
      return (!mobileHasHome && path === '/')
        || path === '/listings'
        || (path !== '/listings/create' && /^\/listings\/[^/]+$/.test(path))
    case 'dashboard':
      return path === '/dashboard' || path.startsWith('/admin/')
    case 'saved':
      return path === '/saved'
    case 'my-listings':
      return path === '/my-listings' || /^\/listings\/[^/]+\/edit$/.test(path)
    case 'add-listing':
      return path === '/listings/create'
    case 'messages':
      return path === '/conversations' || path.startsWith('/conversations/')
    case 'account':
      return path === '/verification'
        || path === '/preferences'
        || path === '/account'
        || path.startsWith('/account/')
  }

  return false
}

export default function Navbar() {
  const { user, clearAuth } = useAuthStore()
  const isProvider = user?.role === 'landlord' || user?.role === 'agent'
  const navigate = useNavigate()
  const location = useLocation()
  const { key } = useIdempotencyKey()
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement | null>(null)
  const profileButtonRef = useRef<HTMLButtonElement | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const displayName = user?.full_name || (user?.role
    ? `${user.role.charAt(0).toUpperCase()}${user.role.slice(1)}`
    : '')

  const navItems: NavItem[] = [{ id: 'browse', label: 'Browse', to: '/listings' }]
  if (user?.role === 'tenant') {
    navItems.push(
      { id: 'dashboard', label: 'Dashboard', to: '/dashboard' },
      { id: 'saved', label: 'Saved', to: '/saved' },
    )
  }
  if (isProvider) {
    navItems.push(
      { id: 'dashboard', label: 'Dashboard', to: '/dashboard' },
      { id: 'my-listings', label: 'My Listings', to: '/my-listings' },
      { id: 'add-listing', label: '+ Add Listing', to: '/listings/create' },
    )
  }
  if (user?.role === 'admin') {
    navItems.push({ id: 'dashboard', label: 'Dashboard', to: '/dashboard' })
  }
  if (user) {
    navItems.push(
      { id: 'messages', label: 'Messages', to: '/conversations' },
      { id: 'account', label: 'Account', to: '/account' },
    )
  }

  const handleLogout = async () => {
    try { await authApi.logout(key) } catch { /* ignore */ }
    clearAuth()
    setMenuOpen(false)
    navigate('/login')
  }

  const closeMenu = () => setMenuOpen(false)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [])

  useEffect(() => {
    if (!menuOpen && !profileOpen) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (profileOpen) {
        setProfileOpen(false)
        requestAnimationFrame(() => profileButtonRef.current?.focus())
      } else {
        setMenuOpen(false)
        requestAnimationFrame(() => menuButtonRef.current?.focus())
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen, profileOpen])

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-[#0c1624] shadow-[0_8px_24px_rgba(2,6,23,0.18)]">
      <div className="relative mx-auto max-w-[1600px] px-3 sm:px-6 min-[1660px]:px-0">
        <div className="flex h-16 items-center xl:h-[76px]">
          {/* Left: home brand */}
          <div className="flex flex-shrink-0 items-center">
            <Link
              to="/"
              className="inline-flex items-center text-2xl font-extrabold tracking-tight text-emerald-400 transition-colors hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:text-[28px]"
            >
              Estate360
            </Link>
          </div>

          {/* Restrained, conventional primary navigation. */}
          <nav
            aria-label="Primary navigation"
            className="pointer-events-none hidden xl:absolute xl:inset-0 xl:flex xl:items-center xl:justify-center"
          >
            <ul className="pointer-events-auto flex items-center gap-1">
              {navItems.map((item) => {
                const active = isNavItemActive(item.id, location.pathname)
                return (
                  <li key={item.id}>
                    <Link
                      to={item.to}
                      aria-current={active ? 'page' : undefined}
                      className={desktopTabCls(active)}
                    >
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* Right: actions */}
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            {user ? (
              <>
                <NotificationBell />

                <div ref={profileRef} className="relative">
                  <button
                    ref={profileButtonRef}
                    type="button"
                    aria-haspopup="true"
                    aria-expanded={profileOpen}
                    aria-label={`Open profile menu for ${displayName}`}
                    onClick={() => setProfileOpen((s) => !s)}
                    className="flex min-h-11 items-center gap-2 rounded-full px-1.5 text-slate-200 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 2xl:rounded-lg 2xl:px-2"
                  >
                    <Avatar name={user.full_name || user.email} imageUrl={user.avatar_url} size="xs" />
                    <span className="hidden max-w-28 truncate text-sm font-medium 2xl:block">
                      {displayName}
                    </span>
                    <svg className="hidden h-4 w-4 text-slate-400 2xl:block" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
                    </svg>
                  </button>

                  {profileOpen && (
                    <>
                    <button
                      type="button"
                      aria-label="Close account menu"
                      className="fixed inset-0 z-40 cursor-default bg-slate-950/20 backdrop-blur-sm"
                      onClick={() => setProfileOpen(false)}
                    />
                    <div className="absolute right-0 z-50 mt-3 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-2xl dark:border-gray-700 dark:bg-gray-800">
                      <div className="flex items-center gap-3">
                        <Avatar name={user.full_name || user.email} imageUrl={user.avatar_url} size="xs" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{displayName}</div>
                          <div className="truncate text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
                        </div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Link to="/account" onClick={() => setProfileOpen(false)} className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200">Profile</Link>
                        <button onClick={() => { setProfileOpen(false); handleLogout(); }} className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700">Logout</button>
                      </div>
                    </div>
                    </>
                  )}
                </div>

              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="hidden min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 xl:inline-flex"
                >
                  Login
                </Link>
                <NavButton to="/register" className="hidden min-h-10 items-center xl:inline-flex">
                  Sign Up
                </NavButton>
              </>
            )}

            {/* Mobile menu toggle */}
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-primary-navigation"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 xl:hidden"
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

        {/* Mobile menu */}
        {menuOpen && (
          <nav
            id="mobile-primary-navigation"
            aria-label="Mobile primary navigation"
            className="border-t border-slate-800 bg-[#0c1624] px-1 py-3 xl:hidden"
          >
            <Link
              to="/"
              onClick={closeMenu}
              aria-current={location.pathname === '/' ? 'page' : undefined}
              className={mobileLinkCls(location.pathname === '/')}
            >
              Home
            </Link>
            {navItems.map((item) => {
              const active = isNavItemActive(item.id, location.pathname, true)
              return (
                <Link
                  key={item.id}
                  to={item.to}
                  onClick={closeMenu}
                  aria-current={active ? 'page' : undefined}
                  className={mobileLinkCls(active)}
                >
                  {item.label}
                </Link>
              )
            })}
            {user && (
              <>
                <div className="my-2 border-t border-slate-800" />
                <div className="flex items-center gap-2 px-3 py-2">
                  <Avatar name={user.full_name || user.email} imageUrl={user.avatar_url} size="xs" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-200">{displayName}</div>
                    <div className="truncate text-xs text-slate-400">{user.email}</div>
                  </div>
                </div>
              </>
            )}
            {!user && (
              <>
                <Link to="/login" onClick={closeMenu} className={mobileLinkCls(false)}>Login</Link>
                <Link to="/register" onClick={closeMenu} className={mobileLinkCls(false)}>Sign Up</Link>
              </>
            )}
          </nav>
        )}
      </div>
    </header>
  )
}
