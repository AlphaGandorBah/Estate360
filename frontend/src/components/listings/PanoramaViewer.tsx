import { useEffect, useRef, useState } from 'react'
import { isSaveDataEnabled } from '@/lib/pwa'
import type { Panorama } from '@/types'

interface PannellumViewer {
  destroy: () => void
  on: (event: string, fn: (arg?: unknown) => void) => void
  toggleFullscreen: () => void
}

interface PannellumGlobal {
  viewer: (container: HTMLElement, config: Record<string, unknown>) => PannellumViewer
}

declare global {
  interface Window {
    pannellum?: PannellumGlobal
  }
}

interface Props { panorama: Panorama | undefined }

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export default function PanoramaViewer({ panorama }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<PannellumViewer | null>(null)
  const autoLoad = !isSaveDataEnabled()
  const [state, setState] = useState<LoadState>(autoLoad ? 'loading' : 'idle')
  const [showHint, setShowHint] = useState(true)

  useEffect(() => {
    let cancelled = false
    setState(autoLoad ? 'loading' : 'idle')
    setShowHint(true)

    // Pannellum can fail on a malformed image deep inside an async image
    // decode callback, outside the try/catch below and without firing its
    // own 'error' event — that escapes as an uncaught window error instead.
    // Catch it here, scoped to this viewer's lifecycle only, so a bad image
    // shows our fallback instead of leaving a broken WebGL canvas on screen.
    const onWindowError = (e: ErrorEvent) => {
      if (e.filename?.includes('pannellum')) {
        e.preventDefault()
        if (!cancelled) setState('error')
      }
    }
    window.addEventListener('error', onWindowError)

    async function mount() {
      if (!panorama || panorama.status !== 'ready' || !panorama.preview_url || !containerRef.current) return

      // pannellum's build is a plain global-attaching script (no ESM/CJS
      // exports) — importing it for its side effect populates window.pannellum.
      await import('pannellum')
      await import('pannellum/build/pannellum.css')
      if (cancelled || !window.pannellum || !containerRef.current) return

      viewerRef.current?.destroy()
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      try {
        const viewer = window.pannellum.viewer(containerRef.current, {
          type: panorama.projection || 'equirectangular',
          panorama: panorama.preview_url,
          autoLoad,
          autoRotate: prefersReducedMotion ? 0 : -2,
          compass: true,
          showControls: true,
          hfov: 100,
          orientationOnByDefault: true,
        })
        viewerRef.current = viewer
        viewer.on('load', () => { if (!cancelled) setState('ready') })
        viewer.on('error', () => { if (!cancelled) setState('error') })
        const dismissHint = () => { if (!cancelled) setShowHint(false) }
        viewer.on('mousedown', dismissHint)
        viewer.on('touchstart', dismissHint)
      } catch {
        // Pannellum throws synchronously for some bad inputs (e.g. a
        // corrupt/non-image file) rather than emitting its 'error' event.
        if (!cancelled) setState('error')
      }
    }

    mount()

    return () => {
      cancelled = true
      window.removeEventListener('error', onWindowError)
      viewerRef.current?.destroy()
      viewerRef.current = null
    }
  }, [panorama])

  if (!panorama || panorama.status !== 'ready' || !panorama.preview_url) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 md:h-96 lg:h-[32rem] dark:bg-gray-800 dark:text-gray-500">
        No images
      </div>
    )
  }

  return (
    <div className="relative h-72 w-full overflow-hidden rounded-2xl bg-black md:h-96 lg:h-[32rem]">
      <div ref={containerRef} className="h-full w-full" />

      {state === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gray-900 text-center text-sm text-gray-300">
          <span>Couldn't load this 360° photo.</span>
          <span className="text-xs text-gray-500">It may still be processing — try refreshing.</span>
        </div>
      )}

      {state === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/80 border-t-transparent" />
        </div>
      )}

      {state === 'ready' && panorama.room_label && (
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
          {panorama.room_label}
        </span>
      )}

      {state === 'ready' && showHint && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <span className="rounded-full bg-black/60 px-3 py-1 text-xs text-white">
            Drag to look around
          </span>
        </div>
      )}

      {state === 'ready' && (
        <button
          type="button"
          onClick={() => viewerRef.current?.toggleFullscreen()}
          aria-label="Toggle fullscreen"
          className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
          </svg>
        </button>
      )}
    </div>
  )
}
