import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '@/api'
import { useIdempotencyKey } from '@/lib/idempotency'

export default function ForgotPasswordPage() {
  const { key, reset } = useIdempotencyKey()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await authApi.passwordReset({ email }, key)
      reset()
      setSent(true)
      setTimeout(() => navigate(`/reset-password?email=${encodeURIComponent(email)}`), 2000)
    } finally { setLoading(false) }
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Reset password</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">We'll send a reset code to your email</p>

        {sent && <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Code sent! Redirecting…</div>}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
          </div>
          <button type="submit" disabled={loading || sent}
            className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {loading ? 'Sending…' : 'Send reset code'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
          <Link to="/login" className="text-emerald-600 hover:underline dark:text-emerald-400">Back to login</Link>
        </p>
      </div>
    </div>
  )
}
