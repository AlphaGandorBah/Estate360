import { useEffect, useRef, useState } from 'react'
import { isSaveDataEnabled } from '@/lib/pwa'
import type { Panorama } from '@/types'

interface PannellumViewer {
  destroy: () => void
  on: (event: string, fn: (arg?: unknown) => void) => void
  toggleFullscreen: () => void
  startAutoRotate: (speed?: number) => void
  stopAutoRotate: () => void
}

interface PannellumGlobal {
  viewer: (container: HTMLElement, config: Record<string, unknown>) => PannellumViewer
}

declare global {
  interface Window {
    pannellum?: PannellumGlobal
  }
}

interface Props { panorama: Panorama | undefined; className?: string }

interface ViewerInstanceProps {
  autoLoad: boolean
  status: Panorama['status'] | undefined
  previewUrl: string | null | undefined
  width: number | null | undefined
  height: number | null | undefined
  roomLabel: string | undefined
  className?: string
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

function canUseDeviceOrientation(): boolean {
  // Motion sensors are restricted to secure contexts in modern mobile
  // browsers. Pannellum 2.5.7 accesses these globals without first checking
  // that they exist, so enabling orientation on a LAN HTTP origin can abort
  // the entire viewer before the panorama is rendered.
  return window.isSecureContext
    && 'DeviceMotionEvent' in window
    && 'DeviceOrientationEvent' in window
}

export default function PanoramaViewer({ panorama, className }: Props) {
  const autoLoad = !isSaveDataEnabled()
  const viewerKey = [
    panorama?.id ?? 'none',
    panorama?.status ?? 'none',
    panorama?.preview_url ?? 'none',
    panorama?.width ?? 'none',
    panorama?.height ?? 'none',
    autoLoad ? 'auto' : 'manual',
  ].join('|')

  return (
    <PanoramaViewerInstance
      key={viewerKey}
      autoLoad={autoLoad}
      status={panorama?.status}
      previewUrl={panorama?.preview_url}
      width={panorama?.width}
      height={panorama?.height}
      roomLabel={panorama?.room_label}
      className={className}
    />
  )
}

function PanoramaViewerInstance({
  autoLoad,
  status,
  previewUrl,
  width,
  height,
  roomLabel,
  className,
}: ViewerInstanceProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<PannellumViewer | null>(null)
  const [state, setState] = useState<LoadState>(autoLoad ? 'loading' : 'idle')
  const [showHint, setShowHint] = useState(true)
  const [isRotating, setIsRotating] = useState(
    () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    let cancelled = false
    const prefersReducedMotionAtMount = window.matchMedia('(prefers-reduced-motion: reduce)').matches

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
      if (status !== 'ready' || !previewUrl || !containerRef.current) return

      // pannellum's build is a plain global-attaching script (no ESM/CJS
      // exports) — importing it for its side effect populates window.pannellum.
      await import('pannellum')
      await import('pannellum/build/pannellum.css')
      if (cancelled || !window.pannellum || !containerRef.current) return

      viewerRef.current?.destroy()

      // Pannellum's renderer only accepts 'equirectangular' | 'cubemap' | 'multires' for
      // its `type` config — it throws synchronously on anything else (e.g. our backend's
      // 'cylindrical' classification), which this viewer never recovers from since we
      // always feed it a single image. 'equirectangular' is the only mode that fits a
      // single preview_url regardless of the source photo's shape — but by default it
      // assumes the image spans the full 180° vertical sphere, which severely warps a
      // wide sweep-panorama (e.g. ~6:1) that only covers a much narrower vertical slice.
      // Telling it the real vaov (derived from the actual aspect ratio) keeps the
      // horizon flat instead of bowing it into the barrel-distortion "frown" shape.
      const vaov = width && height ? Math.min(360 * (height / width), 180) : 180
      // A narrow vaov (a ~6:1 sweep panorama, say 57°) covers less vertical angle than a
      // 100° hfov spans on most viewport aspect ratios — so the default zoom level alone
      // would show black sphere above/below even before factoring in pitch. Capping how
      // far out the view starts (and can zoom) keeps what's visible within the photo.
      const hfov = Math.min(100, vaov * 1.5)

      try {
        const viewer = window.pannellum.viewer(containerRef.current, {
          type: 'equirectangular',
          panorama: previewUrl,
          autoLoad,
          autoRotate: prefersReducedMotionAtMount ? 0 : -2,
          compass: true,
          showControls: true,
          hfov,
          maxHfov: hfov,
          vaov,
          vOffset: 0,
          // Without these, dragging/tilting past the photo's actual vertical coverage
          // reveals empty black sphere above/below it — on a ~6:1 sweep panorama
          // (vaov well under 180°) that's most of the pitch range, making the tour feel
          // broken rather than just narrower than a full sphere.
          minPitch: -vaov / 2,
          maxPitch: vaov / 2,
          // Keep orientation opt-in. iOS requires the permission request to
          // happen from a direct user gesture, and LAN development runs over
          // HTTP where the motion APIs are unavailable altogether.
          orientationOnByDefault: false,
        })
        viewerRef.current = viewer

        if (!canUseDeviceOrientation()) {
          containerRef.current
            .querySelector<HTMLElement>('.pnlm-orientation-button')
            ?.remove()
        }

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
  }, [autoLoad, height, previewUrl, status, width])

  if (status !== 'ready' || !previewUrl) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500 ${className ?? 'h-72 rounded-2xl md:h-96 lg:h-[32rem]'}`}>
        No images
      </div>
    )
  }

  return (
    <div className={`relative w-full overflow-hidden bg-black ${className ?? 'h-72 rounded-2xl md:h-96 lg:h-[32rem]'}`}>
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

      {state === 'ready' && roomLabel && (
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
          {roomLabel}
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
          onClick={() => {
            if (isRotating) viewerRef.current?.stopAutoRotate()
            else viewerRef.current?.startAutoRotate(-2)
            setIsRotating(!isRotating)
          }}
          aria-label={isRotating ? 'Pause auto-rotate' : 'Resume auto-rotate'}
          className="absolute bottom-3 right-14 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
        >
          {isRotating ? (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
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
