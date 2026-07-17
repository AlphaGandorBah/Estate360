import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { validatePanoramaImage } from '@/lib/panoramaImage'
import { buildPanoramaFromVideo } from '@/lib/videoPanorama'

interface Props {
  onCapture: (file: File) => void
}

type Stage = 'idle' | 'loading' | 'ready' | 'processing' | 'error'

const MIN_DURATION_SECONDS = 6
const MAX_DURATION_SECONDS = 45
const MAX_VIDEO_SIZE_BYTES = 250 * 1024 * 1024

export default function RecordedPanoramaCapture({ onCapture }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [stage, setStage] = useState<Stage>('idle')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const video = videoRef.current
    return () => {
      abortRef.current?.abort()
      video?.pause()
      video?.removeAttribute('src')
      video?.load()
      if (videoUrl) URL.revokeObjectURL(videoUrl)
    }
  }, [videoUrl])

  const reset = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setVideoUrl(null)
    setDuration(0)
    setProgress(0)
    setErrorMessage('')
    setStage('idle')
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleVideoSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return

    if (file.type && !file.type.startsWith('video/')) {
      setErrorMessage('Choose a video recorded with your phone camera.')
      setStage('error')
      input.value = ''
      return
    }
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      setErrorMessage('The recording is too large. Record one rotation lasting less than 45 seconds.')
      setStage('error')
      input.value = ''
      return
    }

    setErrorMessage('')
    setProgress(0)
    setStage('loading')
    setVideoUrl(URL.createObjectURL(file))
    input.value = ''
  }

  const handleMetadata = () => {
    const video = videoRef.current
    if (!video || !Number.isFinite(video.duration)) {
      setErrorMessage('Could not read the recorded video.')
      setStage('error')
      return
    }

    if (video.duration < MIN_DURATION_SECONDS || video.duration > MAX_DURATION_SECONDS) {
      setErrorMessage(
        `Record one slow rotation lasting ${MIN_DURATION_SECONDS}–${MAX_DURATION_SECONDS} seconds. This video is ${Math.round(video.duration)} seconds.`,
      )
      setStage('error')
      return
    }

    setDuration(video.duration)
    setStage('ready')
  }

  const processVideo = async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    setErrorMessage('')
    setProgress(0)
    setStage('processing')

    try {
      const blob = await buildPanoramaFromVideo({
        video,
        canvas,
        signal: controller.signal,
        onProgress: setProgress,
      })
      if (controller.signal.aborted) return
      const panoramaFile = new File([blob], 'recorded-360-panorama.jpg', { type: 'image/jpeg' })
      const validationError = await validatePanoramaImage(panoramaFile)
      if (validationError) throw new Error(validationError)
      onCapture(panoramaFile)
    } catch (error) {
      if (controller.signal.aborted) return
      setErrorMessage(error instanceof Error ? error.message : 'Could not build the panorama.')
      setStage('error')
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/50 dark:bg-emerald-900/10">
      <div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Record a guided horizontal 360° sweep</h3>
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
          No Panorama camera mode is needed. Hold the phone upright, face your starting point,
          record while turning once at a steady speed without tilting, and stop when you face the starting point again.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        capture="environment"
        onChange={handleVideoSelection}
        hidden
      />
      <canvas ref={canvasRef} className="hidden" />

      {videoUrl && (
        <video
          key={videoUrl}
          ref={videoRef}
          src={videoUrl}
          muted
          playsInline
          preload="metadata"
          controls={stage === 'ready'}
          onLoadedMetadata={handleMetadata}
          onError={() => {
            setErrorMessage('This video format cannot be read by the browser.')
            setStage('error')
          }}
          className={`max-h-56 w-full rounded-lg bg-black ${stage === 'processing' ? 'opacity-40' : ''}`}
        />
      )}

      {stage === 'loading' && (
        <p className="text-xs text-gray-500 dark:text-gray-400">Preparing the recorded sweep…</p>
      )}

      {stage === 'processing' && (
        <div className="space-y-1.5">
          <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div className="h-full bg-emerald-600" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Building panorama… {Math.round(progress * 100)}%. This can take a little while.
          </p>
        </div>
      )}

      {errorMessage && (
        <p className="rounded-lg bg-red-50 p-2 text-xs text-red-600 dark:bg-red-900/30 dark:text-red-400">
          {errorMessage}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        {(stage === 'idle' || stage === 'error') && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            {videoUrl ? 'Record again' : 'Open video camera'}
          </button>
        )}
        {stage === 'ready' && (
          <>
            <button
              type="button"
              onClick={processVideo}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Build 360° panorama ({Math.round(duration)}s)
            </button>
            <button
              type="button"
              onClick={reset}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-300"
            >
              Discard
            </button>
          </>
        )}
        {stage === 'processing' && (
          <button
            type="button"
            onClick={reset}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-300"
          >
            Cancel processing
          </button>
        )}
      </div>

      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        The recorded video stays on this device; only the generated panorama image is uploaded.
      </p>
    </div>
  )
}
