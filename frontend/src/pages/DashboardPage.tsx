import { useAuthStore } from '@/lib/auth'
import TenantDashboard from '@/pages/tenant/TenantDashboard'
import ProviderDashboard from '@/pages/landlord/LandlordDashboard'
import AdminDashboard from '@/pages/admin/AdminDashboard'

export default function DashboardPage() {
  const role = useAuthStore((s) => s.user?.role)
  if (role === 'landlord' || role === 'agent') return <ProviderDashboard />
  if (role === 'admin') return <AdminDashboard />
  return <TenantDashboard />
}
