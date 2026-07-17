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
    { label: 'Support conversations', value: stats?.support_conversations, href: '/conversations', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
    { label: 'Pending deletion requests', value: stats?.pending_deletion_requests, href: '/admin/deletion-requests', color: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400' },
  ]

  const QUICK_LINKS = [
    { to: '/admin/listings?status=pending', title: 'Review listings', description: 'Approve or reject pending listing submissions' },
    { to: '/admin/verifications', title: 'Verifications', description: 'Review user identity and document verifications' },
    { to: '/admin/reports', title: 'Fraud reports', description: 'Investigate and resolve fraud reports' },
    { to: '/admin/users', title: 'Manage users', description: 'Ban, restrict, reset passwords, or delete accounts' },
    { to: '/admin/deletion-requests', title: 'Deletion requests', description: 'Review and approve or reject account deletion requests' },
    { to: '/admin/action-log', title: 'Action log', description: 'Audit trail of admin moderation actions' },
    { to: '/conversations', title: 'Support inbox', description: 'View and reply to tenant, landlord, and agent support conversations' },
  ]

  return (
    <div className="space-y-8">
      <section className="rounded-[1.75rem] border border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-slate-50 p-6 shadow-sm dark:border-emerald-900/40 dark:from-emerald-900/20 dark:via-gray-900 dark:to-slate-900/20">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Operations center</p>
        <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">Admin dashboard</h1>
        <p className="mt-1 text-gray-600 dark:text-gray-300">Monitor platform health and respond to moderation needs faster.</p>
      </section>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {CARDS.map((c) => (
          <Link key={c.label} to={c.href}
            className={`rounded-[1.2rem] border border-transparent p-5 transition duration-200 hover:-translate-y-1 hover:shadow-md ${c.color}`}>
            <div className="text-3xl font-bold">{c.value ?? '—'}</div>
            <div className="mt-1 text-sm font-medium">{c.label}</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {QUICK_LINKS.map((l) => (
          <Link key={l.to} to={l.to}
            className="rounded-[1.2rem] border border-gray-200 bg-white p-5 transition duration-200 hover:-translate-y-1 hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{l.title}</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{l.description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
