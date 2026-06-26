import { Suspense, lazy, useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import ProtectedRoute from '@/components/layout/ProtectedRoute'
import ToastHost from '@/components/layout/ToastHost'
import { usersApi } from '@/api'
import { useAuthStore, refreshAccessToken } from '@/lib/auth'
import { pushToast } from '@/lib/toast'
import { toAppError } from '@/lib/utils'

// Every route below is its own lazy chunk so the initial bundle only pays
// for the app shell — required for the low-end-Android/3G target (bundle
// budget in the brief's §16). Pannellum and Leaflet, pulled in transitively
// by the listing/panorama pages, ride along with those chunks instead of
// the main bundle.
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'))
const VerifyEmailPage = lazy(() => import('@/pages/auth/VerifyEmailPage'))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'))

const HomePage = lazy(() => import('@/pages/listings/HomePage'))
const ListingsPage = lazy(() => import('@/pages/listings/ListingsPage'))
const ListingDetailPage = lazy(() => import('@/pages/listings/ListingDetailPage'))
const CreateListingPage = lazy(() => import('@/pages/listings/CreateListingPage'))
const EditListingPage = lazy(() => import('@/pages/listings/EditListingPage'))

const DashboardPage = lazy(() => import('@/pages/DashboardPage'))

const SavedListingsPage = lazy(() => import('@/pages/tenant/SavedListingsPage'))
const PreferencesPage = lazy(() => import('@/pages/tenant/PreferencesPage'))
const ConversationsPage = lazy(() => import('@/pages/tenant/ConversationsPage'))
const ConversationDetailPage = lazy(() => import('@/pages/tenant/ConversationDetailPage'))
const NotificationsPage = lazy(() => import('@/pages/tenant/NotificationsPage'))

const MyListingsPage = lazy(() => import('@/pages/landlord/MyListingsPage'))
const VerificationPage = lazy(() => import('@/pages/landlord/VerificationPage'))

const AdminUsersPage = lazy(() => import('@/pages/admin/AdminUsersPage'))
const AdminListingsPage = lazy(() => import('@/pages/admin/AdminListingsPage'))
const AdminVerificationsPage = lazy(() => import('@/pages/admin/AdminVerificationsPage'))
const AdminReportsPage = lazy(() => import('@/pages/admin/AdminReportsPage'))
const AdminActionLogPage = lazy(() => import('@/pages/admin/AdminActionLogPage'))

const AccountPage = lazy(() => import('@/pages/account/AccountPage'))
const AccountSecurityPage = lazy(() => import('@/pages/account/AccountSecurityPage'))

const PublicProfilePage = lazy(() => import('@/pages/PublicProfilePage'))

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
    </div>
  )
}

/**
 * The access token only ever lives in memory (by design — see the brief's
 * token lifecycle section), so a fresh page load always starts with none.
 * Without this, every reload/new-tab looks logged-out even though the
 * httpOnly refresh cookie is still valid — and low-end Android browsers
 * reload backgrounded tabs constantly, so this would bite real users
 * continuously. Silently try a refresh once before rendering routes; a
 * failure just means the visitor really is logged out, which is normal and
 * not an error worth surfacing.
 */
function useAuthBootstrap() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    refreshAccessToken()
      .then(async (access) => {
        // Set the token before the /users/me call, not after — the request
        // interceptor reads it from the store, so calling usersApi.me()
        // first sends it with no Authorization header at all.
        useAuthStore.getState().setAccess(access)
        const { data: user } = await usersApi.me()
        if (!cancelled) useAuthStore.getState().setAuth(access, user)
      })
      .catch((err) => {
        // Most refresh failures here are just a genuinely expired session —
        // normal, not worth surfacing. A ban is the one case where silently
        // landing them logged-out would be confusing, since nothing else on
        // screen explains why.
        if (!cancelled && err?.response?.data?.code === 'account_banned') {
          const appError = toAppError(err, 'Your account has been suspended.')
          pushToast(appError.detail, 'error', appError.requestId)
        }
      })
      .finally(() => { if (!cancelled) setReady(true) })
    return () => { cancelled = true }
  }, [])

  return ready
}

export default function App() {
  const authReady = useAuthBootstrap()

  if (!authReady) return <RouteFallback />

  return (
    <>
      <ToastHost />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Auth pages without layout */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Main app */}
          <Route element={<Layout />}>
            {/* Public */}
            <Route index element={<HomePage />} />
            <Route path="/listings" element={<ListingsPage />} />
            <Route path="/listings/:id" element={<ListingDetailPage />} />
            <Route path="/profile/:id" element={<PublicProfilePage />} />

            {/* Requires auth */}
            <Route element={<ProtectedRoute />}>
              {/* Dashboard: role-aware single route */}
              <Route path="/dashboard" element={<DashboardPage />} />

              {/* Shared (tenant + landlord) */}
              <Route path="/conversations" element={<ConversationsPage />} />
              <Route path="/conversations/:id" element={<ConversationDetailPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/account/security" element={<AccountSecurityPage />} />

              {/* Tenant */}
              <Route element={<ProtectedRoute roles={['tenant']} />}>
                <Route path="/saved" element={<SavedListingsPage />} />
                <Route path="/preferences" element={<PreferencesPage />} />
              </Route>

              {/* Landlord */}
              <Route element={<ProtectedRoute roles={['landlord']} />}>
                <Route path="/my-listings" element={<MyListingsPage />} />
                <Route path="/verification" element={<VerificationPage />} />
                <Route path="/listings/create" element={<CreateListingPage />} />
                <Route path="/listings/:id/edit" element={<EditListingPage />} />
              </Route>

              {/* Admin */}
              <Route element={<ProtectedRoute roles={['admin']} />}>
                <Route path="/admin/users" element={<AdminUsersPage />} />
                <Route path="/admin/listings" element={<AdminListingsPage />} />
                <Route path="/admin/verifications" element={<AdminVerificationsPage />} />
                <Route path="/admin/reports" element={<AdminReportsPage />} />
                <Route path="/admin/action-log" element={<AdminActionLogPage />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  )
}
