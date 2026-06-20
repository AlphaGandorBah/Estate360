import { z } from 'zod'
import type { FieldValues, UseFormSetError } from 'react-hook-form'
import { toAppError } from './utils'

export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})
export type LoginForm = z.infer<typeof loginSchema>

export const registerSchema = z.object({
  full_name: z.string().min(1, 'Full name is required'),
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  phone: z.string().optional(),
  role: z.enum(['tenant', 'landlord']),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})
export type RegisterForm = z.infer<typeof registerSchema>

export const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
})
export type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z.object({
  code: z.string().length(6, 'Enter the 6-digit code'),
  new_password: z.string().min(8, 'Password must be at least 8 characters'),
})
export type ResetPasswordForm = z.infer<typeof resetPasswordSchema>

export const verifyEmailSchema = z.object({
  code: z.string().length(6, 'Enter the 6-digit code'),
})
export type VerifyEmailForm = z.infer<typeof verifyEmailSchema>

export const listingSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  property_type: z.enum(['apartment', 'house', 'studio', 'room', 'commercial']),
  location_area: z.enum([
    'aberdeen', 'lumley', 'goderich', 'hill_station', 'wilberforce',
    'murray_town', 'brookfields', 'kissy', 'wellington', 'calaba_town', 'other',
  ]),
  bedrooms: z.number().min(0).optional(),
  bathrooms: z.number().min(0).optional(),
  price_annual: z.number().min(1, 'Annual rent is required'),
  currency: z.enum(['SLE', 'USD']).optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
})
export type ListingForm = z.infer<typeof listingSchema>

export const preferencesSchema = z.object({
  preferred_areas: z.array(z.string()),
  property_types: z.array(z.string()),
  min_price: z.number().nullable().optional(),
  max_price: z.number().nullable().optional(),
  min_bedrooms: z.number().nullable().optional(),
})
export type PreferencesForm = z.infer<typeof preferencesSchema>

/**
 * Feeds the backend's { field: messages[] } error envelope straight into
 * RHF's setError, per the brief's error-handling contract — server
 * validation lands on the right input instead of a single global banner.
 * Returns the non-field detail message so the caller can still show a toast
 * for errors that aren't tied to any one input.
 */
export function applyServerErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  fallback = 'Something went wrong',
): string {
  const appError = toAppError(err, fallback)
  if (appError.fieldErrors) {
    for (const [field, messages] of Object.entries(appError.fieldErrors)) {
      setError(field as never, { type: 'server', message: messages.join(' ') })
    }
  }
  // Non-field failures (and field ones too, as a fallback banner) surface
  // through RHF's root error so every form has one place to render them.
  setError('root' as never, { type: 'server', message: appError.detail })
  return appError.detail
}
