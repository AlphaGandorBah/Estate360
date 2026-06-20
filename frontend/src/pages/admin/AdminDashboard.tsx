import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { adminApi } from '@/api'

export default function AdminDashboard() {
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminApi.stats().then((r) => r.data),
    staleTime: 60000,
  })

  const CARDS = [
    { label: 'Total users', value: stats?.total_users, href: '/admin/users', color: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
    { label: 'Active listings', value: stats?.active_listings, href: '/admin/listings', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' },
    { label: 'Pending listings', value: stats?.pending_listings, href: '/admin/listings?status=pending', color: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' },
    { label: 'Pending verifications', value: stats?.pending_verifications, href: '/admin/verifications', color: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400' },
    { label: 'Open reports', value: stats?.open_reports, href: '/admin/reports', color: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
    { label: 'Total conversations', value: stats?.total_conversations, href: '#', color: 'bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  ]

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Admin dashboard</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {CARDS.map((c) => (
          <Link key={c.label} to={c.href}
            className={`rounded-xl border border-transparent p-5 hover:shadow-sm transition ${c.color}`}>
            <div className="text-3xl font-bold">{c.value ?? '—'}</div>
            <div className="mt-1 text-sm font-medium">{c.label}</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Link to="/admin/listings?status=pending"
          className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Review listings</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Approve or reject pending listing submissions
          </p>
        </Link>
        <Link to="/admin/verifications"
          className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Verifications</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Review landlord ID and document verifications
          </p>
        </Link>
        <Link to="/admin/reports"
          className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Fraud reports</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Investigate and resolve fraud reports
          </p>
        </Link>
      </div>
    </div>
  )
}
