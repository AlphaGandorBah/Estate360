import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import ProtectedRoute from '@/components/layout/ProtectedRoute'
import ToastHost from '@/components/layout/ToastHost'

import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import VerifyEmailPage from '@/pages/auth/VerifyEmailPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage'

import HomePage from '@/pages/listings/HomePage'
import ListingsPage from '@/pages/listings/ListingsPage'
import ListingDetailPage from '@/pages/listings/ListingDetailPage'
import CreateListingPage from '@/pages/listings/CreateListingPage'
import EditListingPage from '@/pages/listings/EditListingPage'

import DashboardPage from '@/pages/DashboardPage'

import SavedListingsPage from '@/pages/tenant/SavedListingsPage'
import PreferencesPage from '@/pages/tenant/PreferencesPage'
import ConversationsPage from '@/pages/tenant/ConversationsPage'
import ConversationDetailPage from '@/pages/tenant/ConversationDetailPage'
import NotificationsPage from '@/pages/tenant/NotificationsPage'

import MyListingsPage from '@/pages/landlord/MyListingsPage'
import VerificationPage from '@/pages/landlord/VerificationPage'

import AdminUsersPage from '@/pages/admin/AdminUsersPage'
import AdminListingsPage from '@/pages/admin/AdminListingsPage'
import AdminVerificationsPage from '@/pages/admin/AdminVerificationsPage'
import AdminReportsPage from '@/pages/admin/AdminReportsPage'

import AccountPage from '@/pages/account/AccountPage'
import AccountSecurityPage from '@/pages/account/AccountSecurityPage'

import PublicProfilePage from '@/pages/PublicProfilePage'

export default function App() {
  return (
    <>
      <ToastHost />
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
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  )
}
