import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { authApi } from '@/api'
import { useIdempotencyKey } from '@/lib/idempotency'
import {
  resetPasswordOtpSchema, resetPasswordSchema,
  applyServerErrors,
  type ResetPasswordOtpForm, type ResetPasswordForm,
} from '@/lib/validation'

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  )
}

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const email = params.get('email') ?? ''
  const navigate = useNavigate()
  const { key, reset } = useIdempotencyKey()

  const [step, setStep] = useState<'otp' | 'password'>('otp')
  const [resetToken, setResetToken] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const otpForm = useForm<ResetPasswordOtpForm>({ resolver: zodResolver(resetPasswordOtpSchema) })
  const pwForm = useForm<ResetPasswordForm>({ resolver: zodResolver(resetPasswordSchema) })

  const onVerifyOtp = async (form: ResetPasswordOtpForm) => {
    try {
      const res = await authApi.passwordResetVerifyOtp({ email, code: form.code })
      setResetToken(res.data.reset_token)
      setStep('password')
    } catch (err) {
      applyServerErrors(err, otpForm.setError, 'Invalid or expired code')
    }
  }

  const onSetPassword = async (form: ResetPasswordForm) => {
    try {
      await authApi.passwordResetConfirm(
        { email, reset_token: resetToken, new_password: form.new_password, confirm_password: form.confirm_password },
        key,
      )
      reset()
      navigate('/login?reset=1')
    } catch (err) {
      applyServerErrors(err, pwForm.setError, 'Reset failed')
    }
  }

  const inputClass = 'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100'

  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-800">

        {step === 'otp' && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Enter reset code</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              We sent a 6-digit code to <strong>{email}</strong>
            </p>

            {otpForm.formState.errors.root?.message && (
              <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
                {otpForm.formState.errors.root.message}
              </div>
            )}

            <form onSubmit={otpForm.handleSubmit(onVerifyOtp)} className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Reset code</label>
                <input
                  maxLength={6}
                  {...otpForm.register('code')}
                  placeholder="000000"
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-center text-xl tracking-widest text-gray-900 outline-none focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
                {otpForm.formState.errors.code && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{otpForm.formState.errors.code.message}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={otpForm.formState.isSubmitting}
                className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {otpForm.formState.isSubmitting ? 'Verifying…' : 'Verify code'}
              </button>
            </form>
          </>
        )}

        {step === 'password' && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Set new password</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Code verified. Choose a new password for <strong>{email}</strong>.
            </p>

            {pwForm.formState.errors.root?.message && (
              <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
                {pwForm.formState.errors.root.message}
              </div>
            )}

            <form onSubmit={pwForm.handleSubmit(onSetPassword)} className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">New password</label>
                <div className="relative mt-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    {...pwForm.register('new_password')}
                    className={`${inputClass} pr-10 mt-0`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    tabIndex={-1}
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
                {pwForm.formState.errors.new_password && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{pwForm.formState.errors.new_password.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Confirm password</label>
                <div className="relative mt-1">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    {...pwForm.register('confirm_password')}
                    className={`${inputClass} pr-10 mt-0`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    tabIndex={-1}
                  >
                    <EyeIcon open={showConfirm} />
                  </button>
                </div>
                {pwForm.formState.errors.confirm_password && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{pwForm.formState.errors.confirm_password.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={pwForm.formState.isSubmitting}
                className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {pwForm.formState.isSubmitting ? 'Saving…' : 'Set new password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
