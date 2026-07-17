import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface Props {
  to: string
  variant?: 'primary' | 'secondary'
  children: ReactNode
  className?: string
}

const variants: Record<NonNullable<Props['variant']>, string> = {
  primary: 'rounded-full bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700',
  secondary: 'rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700',
}

export default function NavButton({ to, variant = 'primary', children, className = '' }: Props) {
  return (
    <Link to={to} className={`${variants[variant]} ${className}`}>
      {children}
    </Link>
  )
}
