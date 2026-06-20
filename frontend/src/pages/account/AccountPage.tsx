import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { usersApi } from '@/api'
import { useAuthStore } from '@/lib/auth'
import { getErrorMessage } from '@/lib/utils'
import { formatDate } from '@/lib/intl'

export default function AccountPage() {
  const navigate = useNavigate()
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  const { data: user, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => usersApi.me().then((r) => r.data),
  })

  useEffect(() => {
    if (!user) return
    setFullName(user.full_name)
    setPhone(user.phone)
  }, [user])

  const updateMut = useMutation({
    mutationFn: () => usersApi.updateMe({ full_name: fullName, phone }),
    onSuccess: () => { setSuccess(true); setError('') },
    onError: (err) => setError(getErrorMessage(err, 'Failed to update profile')),
  })

  const deleteMut = useMutation({
    mutationFn: () => usersApi.deleteMe(),
    onSuccess: () => { clearAuth(); navigate('/') },
    onError: (err) => setError(getErrorMessage(err, 'Failed to delete account')),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSuccess(false)
    updateMut.mutate()
  }

  if (isLoading || !user) return <div className="h-64 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Account</h1>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">{error}</div>}
      {success && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-400">Profile updated.</div>}

      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {user.email} · {user.role} · Joined {formatDate(user.date_joined)}
          {user.is_verified && <span className="ml-2 text-emerald-600 dark:text-emerald-400">Verified</span>}
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="label">Full name</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" />
          </div>
          <button type="submit" disabled={updateMut.isPending}
            className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {updateMut.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-red-200 bg-white p-6 dark:border-red-900/50 dark:bg-gray-800">
        <h2 className="font-semibold text-red-700 dark:text-red-400">Delete account</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          This permanently deactivates your account. Draft listings are removed; approved/pending listings are archived.
        </p>
        <button onClick={() => setShowDelete(true)}
          className="mt-3 rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30">
          Delete my account
        </button>
      </div>

      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 dark:bg-gray-800">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Delete account?</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              This cannot be undone. Are you sure you want to permanently delete your account?
            </p>
            <div className="mt-4 flex gap-3">
              <button onClick={() => setShowDelete(false)}
                className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-300">
                Cancel
              </button>
              <button onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm text-white disabled:opacity-50">
                {deleteMut.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
