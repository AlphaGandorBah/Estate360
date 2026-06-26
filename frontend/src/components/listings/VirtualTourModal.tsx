import { useEffect } from 'react'
import PanoramaViewer from './PanoramaViewer'
import type { Panorama } from '@/types'

interface Props {
  panoramas: Panorama[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
}

export default function VirtualTourModal({ panoramas, index, onIndexChange, onClose }: Props) {
  const count = panoramas.length
  const current = panoramas[index]

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onIndexChange((index + 1) % count)
      if (e.key === 'ArrowLeft') onIndexChange((index - 1 + count) % count)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [index, count, onIndexChange, onClose])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between gap-4 p-4">
        <span className="truncate text-sm font-medium text-white">
          {current?.room_label || 'Room'}
          {count > 1 && <span className="ml-2 text-white/60">{index + 1} / {count}</span>}
        </span>
        <button type="button" onClick={onClose} aria-label="Close virtual tour"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="relative flex-1">
        <PanoramaViewer panorama={current} className="h-full w-full" />
      </div>

      {count > 1 && (
        <div className="flex items-center justify-center gap-4 p-4">
          <button type="button" onClick={() => onIndexChange((index - 1 + count) % count)}
            className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20">
            ← Prev room
          </button>
          <button type="button" onClick={() => onIndexChange((index + 1) % count)}
            className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20">
            Next room →
          </button>
        </div>
      )}
    </div>
  )
}
