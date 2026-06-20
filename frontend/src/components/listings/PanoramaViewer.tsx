import { useEffect, useRef } from 'react'
import { isSaveDataEnabled } from '@/lib/pwa'
import type { Panorama } from '@/types'

interface PannellumViewer {
  destroy: () => void
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

export default function PanoramaViewer({ panorama }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<PannellumViewer | null>(null)

  useEffect(() => {
    let cancelled = false

    async function mount() {
      if (!panorama || panorama.status !== 'ready' || !panorama.preview_url || !containerRef.current) return

      // pannellum's build is a plain global-attaching script (no ESM/CJS
      // exports) — importing it for its side effect populates window.pannellum.
      await import('pannellum')
      await import('pannellum/build/pannellum.css')
      if (cancelled || !window.pannellum || !containerRef.current) return

      viewerRef.current?.destroy()
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      viewerRef.current = window.pannellum.viewer(containerRef.current, {
        type: panorama.projection || 'equirectangular',
        panorama: panorama.preview_url,
        autoLoad: !isSaveDataEnabled(),
        autoRotate: prefersReducedMotion ? 0 : -2,
        compass: true,
        showControls: true,
        hfov: 100,
      })
    }

    mount()

    return () => {
      cancelled = true
      viewerRef.current?.destroy()
      viewerRef.current = null
    }
  }, [panorama])

  if (!panorama || panorama.status !== 'ready' || !panorama.preview_url) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
        No images
      </div>
    )
  }

  return <div ref={containerRef} className="h-72 w-full overflow-hidden rounded-2xl" />
}
