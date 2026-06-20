import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { authApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import { loginSchema, applyServerErrors, type LoginForm } from '@/lib/validation'

export default function LoginPage() {
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()
  const {
    register, handleSubmit, setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async (form: LoginForm) => {
    try {
      const { data } = await authApi.login(form)
      setAuth(data.access, data.user)
      navigate('/dashboard')
    } catch (err) {
      applyServerErrors(err, setError, 'Invalid credentials')
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Welcome back</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Sign in to your Estate360 account</p>

        {errors.root?.message && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">{errors.root.message}</div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
            <input type="email" {...register('email')}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            {errors.email && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.email.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
            <input type="password" {...register('password')}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            {errors.password && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.password.message}</p>}
          </div>

          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-xs text-emerald-600 hover:underline dark:text-emerald-400">Forgot password?</Link>
          </div>

          <button type="submit" disabled={isSubmitting}
            className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Don't have an account?{' '}
          <Link to="/register" className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">Sign up</Link>
        </p>
      </div>
    </div>
  )
}
