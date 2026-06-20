import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '@/api'
import { getErrorMessage } from '@/lib/utils'

export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const email = params.get('email') ?? ''
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await authApi.verifyEmail({ email, code })
      navigate('/login?verified=1')
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Invalid code'))
    } finally { setLoading(false) }
  }

  const handleResend = async () => {
    setSuccess('')
    try {
      await authApi.resendOtp({ email })
      setSuccess('A new code has been sent to your email.')
    } catch { setError('Failed to resend code.') }
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Verify your email</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Enter the 6-digit code sent to <strong>{email}</strong></p>

        {error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">{error}</div>}
        {success && <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{success}</div>}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <input
            value={code} onChange={(e) => setCode(e.target.value)}
            placeholder="000000" maxLength={6}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-center text-2xl tracking-widest text-gray-900 outline-none focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
          <button type="submit" disabled={loading}
            className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {loading ? 'Verifying…' : 'Verify email'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
          Didn't receive a code?{' '}
          <button onClick={handleResend} className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">Resend</button>
        </p>
      </div>
    </div>
  )
}
