import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { authApi } from '@/api'
import { useIdempotencyKey } from '@/lib/idempotency'
import { resetPasswordSchema, applyServerErrors, type ResetPasswordForm } from '@/lib/validation'

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const email = params.get('email') ?? ''
  const { key, reset } = useIdempotencyKey()
  const navigate = useNavigate()
  const {
    register, handleSubmit, setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordForm>({ resolver: zodResolver(resetPasswordSchema) })

  const onSubmit = async (form: ResetPasswordForm) => {
    try {
      await authApi.passwordResetConfirm({ email, ...form }, key)
      reset()
      navigate('/login?reset=1')
    } catch (err) {
      applyServerErrors(err, setError, 'Reset failed')
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Set new password</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Enter the code sent to <strong>{email}</strong></p>

        {errors.root?.message && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">{errors.root.message}</div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Reset code</label>
            <input maxLength={6} {...register('code')}
              placeholder="000000"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-center text-xl tracking-widest text-gray-900 outline-none focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            {errors.code && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.code.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">New password</label>
            <input type="password" {...register('new_password')}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            {errors.new_password && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.new_password.message}</p>}
          </div>
          <button type="submit" disabled={isSubmitting}
            className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {isSubmitting ? 'Resetting…' : 'Reset password'}
          </button>
        </form>
      </div>
    </div>
  )
}
