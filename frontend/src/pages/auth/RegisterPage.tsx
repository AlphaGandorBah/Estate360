import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '@/api'
import { getErrorMessage } from '@/lib/utils'
import { useIdempotencyKey } from '@/lib/idempotency'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { key, reset } = useIdempotencyKey()
  const [form, setForm] = useState({ email: '', full_name: '', phone: '', role: 'tenant', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await authApi.register(form, key)
      reset()
      navigate(`/verify-email?email=${encodeURIComponent(form.email)}`)
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Registration failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center py-8">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Create account</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Join Estate360 today</p>

        {error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">{error}</div>}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">I am a</label>
            <div className="mt-1 flex gap-3">
              {(['tenant', 'landlord'] as const).map((r) => (
                <button type="button" key={r}
                  onClick={() => set('role', r)}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium capitalize transition ${
                    form.role === r
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : 'text-gray-600 hover:border-gray-400 dark:text-gray-400 dark:hover:border-gray-500'
                  }`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {[
            { label: 'Full Name', key: 'full_name', type: 'text' },
            { label: 'Email', key: 'email', type: 'email' },
            { label: 'Phone (optional)', key: 'phone', type: 'tel' },
            { label: 'Password', key: 'password', type: 'password' },
          ].map(({ label, key, type }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
              <input type={type} required={key !== 'phone'}
                value={form[key as keyof typeof form]}
                onChange={(e) => set(key, e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
          ))}

          <button type="submit" disabled={loading}
            className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
