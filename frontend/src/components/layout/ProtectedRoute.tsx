import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/lib/auth'
import type { Role } from '@/types'

interface Props { roles?: Role[] }

export default function ProtectedRoute({ roles }: Props) {
  const { access, user } = useAuthStore()
  if (!access || !user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />
  return <Outlet />
}
