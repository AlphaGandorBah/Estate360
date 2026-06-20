import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { authApi } from '@/api'
import { useIdempotencyKey } from '@/lib/idempotency'
import { registerSchema, applyServerErrors, type RegisterForm } from '@/lib/validation'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { key, reset } = useIdempotencyKey()
  const {
    register, handleSubmit, setError, watch, setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema), defaultValues: { role: 'tenant' } })
  const role = watch('role')

  const onSubmit = async (form: RegisterForm) => {
    try {
      await authApi.register(form, key)
      reset()
      navigate(`/verify-email?email=${encodeURIComponent(form.email)}`)
    } catch (err) {
      applyServerErrors(err, setError, 'Registration failed')
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center py-8">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Create account</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Join Estate360 today</p>

        {errors.root?.message && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">{errors.root.message}</div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">I am a</label>
            <div className="mt-1 flex gap-3">
              {(['tenant', 'landlord'] as const).map((r) => (
                <button type="button" key={r}
                  onClick={() => setValue('role', r)}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium capitalize transition ${
                    role === r
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : 'text-gray-600 hover:border-gray-400 dark:text-gray-400 dark:hover:border-gray-500'
                  }`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Full Name</label>
            <input type="text" {...register('full_name')}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            {errors.full_name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.full_name.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
            <input type="email" {...register('email')}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            {errors.email && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.email.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Phone (optional)</label>
            <input type="tel" {...register('phone')}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
            <input type="password" {...register('password')}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            {errors.password && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.password.message}</p>}
          </div>

          <button type="submit" disabled={isSubmitting}
            className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {isSubmitting ? 'Creating account…' : 'Create account'}
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
