import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const AREA_LABELS: Record<string, string> = {
  aberdeen: 'Aberdeen', lumley: 'Lumley', goderich: 'Goderich',
  hill_station: 'Hill Station', wilberforce: 'Wilberforce',
  murray_town: 'Murray Town', brookfields: 'Brookfields',
  kissy: 'Kissy', wellington: 'Wellington', calaba_town: 'Calaba Town',
  other: 'Other',
}

export const PROPERTY_LABELS: Record<string, string> = {
  apartment: 'Apartment', house: 'House', studio: 'Studio',
  room: 'Room', commercial: 'Commercial',
}

interface ApiErrorBody {
  code?: string
  detail?: string
  errors?: Record<string, string[] | string>
}

export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  const data = (err as { response?: { data?: ApiErrorBody } })?.response?.data
  if (!data) return fallback
  if (data.errors) {
    return Object.entries(data.errors)
      .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`)
      .join(' · ')
  }
  return data.detail ?? fallback
}

export interface AppError {
  code: string
  detail: string
  fieldErrors?: Record<string, string[]>
  requestId?: string
  status?: number
}

export function toAppError(err: unknown, fallback = 'Something went wrong'): AppError {
  const response = (err as { response?: { data?: ApiErrorBody; status?: number; headers?: Record<string, string> } })?.response
  const data = response?.data
  const fieldErrors = data?.errors
    ? Object.fromEntries(
        Object.entries(data.errors).map(([field, msgs]) => [field, Array.isArray(msgs) ? msgs : [msgs]]),
      )
    : undefined

  return {
    code: data?.code ?? 'unknown_error',
    detail: data?.detail ?? fallback,
    fieldErrors,
    requestId: response?.headers?.['x-request-id'],
    status: response?.status,
  }
}
