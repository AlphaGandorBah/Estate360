import { useState } from 'react'

interface AvatarProps {
  name?: string | null
  imageUrl?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'h-7 w-7 text-xs',
  sm: 'h-9 w-9 text-sm',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-20 w-20 text-2xl',
}

// Single place every user avatar renders through, so a missing/broken photo
// falls back to a name-initial placeholder consistently everywhere.
export default function Avatar({ name, imageUrl, size = 'md', className = '' }: AvatarProps) {
  const [failed, setFailed] = useState(false)
  const initial = name?.trim()?.[0]?.toUpperCase() || '?'

  if (imageUrl && !failed) {
    return (
      <img
        src={imageUrl}
        alt={name || 'User avatar'}
        className={`shrink-0 rounded-full object-cover ${SIZE_CLASSES[size]} ${className}`}
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 ${SIZE_CLASSES[size]} ${className}`}
    >
      {initial}
    </div>
  )
}
