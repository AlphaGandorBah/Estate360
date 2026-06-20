import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '@/api'
import { getErrorMessage } from '@/lib/utils'
import { useIdempotencyKey } from '@/lib/idempotency'

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const email = params.get('email') ?? ''
  const { key, reset } = useIdempotencyKey()
  const [form, setForm] = useState({ code: '', new_password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await authApi.passwordResetConfirm({ email, ...form }, key)
      reset()
      navigate('/login?reset=1')
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Reset failed'))
    } finally { setLoading(false) }
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Set new password</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Enter the code sent to <strong>{email}</strong></p>

        {error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">{error}</div>}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Reset code</label>
            <input maxLength={6} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="000000"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-center text-xl tracking-widest text-gray-900 outline-none focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">New password</label>
            <input type="password" required value={form.new_password}
              onChange={(e) => setForm((f) => ({ ...f, new_password: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {loading ? 'Resetting…' : 'Reset password'}
          </button>
        </form>
      </div>
    </div>
  )
}
