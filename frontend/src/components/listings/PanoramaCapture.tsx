import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { validatePanoramaImage } from '@/lib/panoramaImage'
import RecordedPanoramaCapture from '@/components/listings/RecordedPanoramaCapture'

interface Props {
  onCapture: (file: File) => void
  onCancel: () => void
}

type Phase = 'starting' | 'live' | 'preview' | 'unsupported' | 'error'

const OUTPUT_WIDTH = 6000
const OUTPUT_HEIGHT = 1500
const DURATION_MS = 12000

export default function PanoramaCapture({ onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nativeCameraInputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const captureStartRef = useRef(0)
  const previousFractionRef = useRef(0)

  const liveCameraSupported = window.isSecureContext && !!navigator.mediaDevices?.getUserMedia
  const [phase, setPhase] = useState<Phase>(liveCameraSupported ? 'starting' : 'unsupported')
  const [videoReady, setVideoReady] = useState(false)
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [capturedFile, setCapturedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  useEffect(() => {
    if (!liveCameraSupported) return

    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          video.onloadedmetadata = () => {
            setVideoReady(true)
            video.play().catch(() => { /* ignore autoplay rejection, user can retap */ })
          }
        }
      })
      .catch((err: DOMException) => {
        if (cancelled) return
        const message =
          err.name === 'NotAllowedError' ? 'Camera permission denied.' :
          err.name === 'NotFoundError' ? 'No camera found on this device.' :
          'Could not access the camera.'
        setErrorMessage(message)
        setPhase('error')
      })

    return () => {
      cancelled = true
      stopStream()
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [attempt, liveCameraSupported])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const storeCapturedFile = (file: File) => {
    setCapturedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const finish = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) { setErrorMessage('Failed to process the capture.'); setPhase('error'); return }
      storeCapturedFile(new File([blob], 'panorama.jpg', { type: 'image/jpeg' }))
      setPhase('preview')
    }, 'image/jpeg', 0.85)
  }

  const tick = (timestamp: number) => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (video && canvas && ctx && video.videoWidth && video.videoHeight) {
      const elapsed = timestamp - captureStartRef.current
      const fraction = Math.min(elapsed / DURATION_MS, 1)
      const xStart = Math.floor(previousFractionRef.current * OUTPUT_WIDTH)
      const xEnd = Math.ceil(fraction * OUTPUT_WIDTH)
      if (xEnd > xStart) {
        const destinationWidth = xEnd - xStart
        const srcW = Math.max(
          2,
          Math.min(video.videoWidth, video.videoHeight * (destinationWidth / OUTPUT_HEIGHT)),
        )
        const srcX = (video.videoWidth - srcW) / 2
        ctx.drawImage(video, srcX, 0, srcW, video.videoHeight, xStart, 0, destinationWidth, OUTPUT_HEIGHT)
      }
      previousFractionRef.current = fraction
      setProgress(fraction)
      if (fraction >= 1) { finish(); return }
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  const startCapture = () => {
    captureStartRef.current = performance.now()
    previousFractionRef.current = 0
    setProgress(0)
    setPhase('live')
    rafRef.current = requestAnimationFrame(tick)
  }

  const retake = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    setCapturedFile(null)
    setPreviewUrl(null)
    setPhase(liveCameraSupported ? 'starting' : 'unsupported')
    if (liveCameraSupported) setAttempt((a) => a + 1)
  }

  const handleUseThis = () => {
    if (!capturedFile) return
    stopStream()
    onCapture(capturedFile)
  }

  const handleNativeCameraCapture = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const selected = input.files?.[0]
    if (!selected) return

    const validationError = await validatePanoramaImage(selected)
    if (validationError) {
      setErrorMessage(validationError)
      input.value = ''
      return
    }

    setErrorMessage('')
    storeCapturedFile(selected)
    setPhase('preview')
  }

  const handleRecordedCapture = (file: File) => {
    setErrorMessage('')
    storeCapturedFile(file)
    setPhase('preview')
  }

  const retryLiveCamera = () => {
    setVideoReady(false)
    setErrorMessage('')
    setPhase('starting')
    setAttempt((a) => a + 1)
  }

  const handleCancel = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    stopStream()
    onCancel()
  }

  const nativeCameraInput = (
    <div className="space-y-2">
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/jpeg,image/png"
        onChange={handleNativeCameraCapture}
        hidden
      />
      <button
        type="button"
        onClick={() => nativeCameraInputRef.current?.click()}
        className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 sm:w-auto"
      >
        Choose saved panorama
      </button>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        First open your Camera app, use Panorama mode while rotating slowly, and save the result.
        Then return here and choose that saved panorama.
      </p>
    </div>
  )

  const recordedVideoCapture = <RecordedPanoramaCapture onCapture={handleRecordedCapture} />

  if (phase === 'unsupported') {
    return (
      <div className="space-y-3 rounded-lg bg-gray-50 p-4 text-sm text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
        <p>
          Live preview is unavailable on this HTTP connection. Record a guided sweep instead;
          it works even when the phone has no Panorama camera mode.
        </p>
        {errorMessage && (
          <p className="rounded-lg bg-red-50 p-2 text-red-600 dark:bg-red-900/30 dark:text-red-400">
            {errorMessage}
          </p>
        )}
        {recordedVideoCapture}
        <div className="space-y-2 border-t border-gray-200 pt-3 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-300">Already have a panorama?</p>
          {nativeCameraInput}
        </div>
        <button type="button" onClick={onCancel}
          className="text-sm font-medium text-gray-500 hover:underline dark:text-gray-400">
          Upload existing photo instead
        </button>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
        <p>{errorMessage}</p>
        <div className="mt-3">{recordedVideoCapture}</div>
        <div className="mt-3">{nativeCameraInput}</div>
        <div className="mt-3 flex gap-3">
          <button type="button" onClick={retryLiveCamera}
            className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400">
            Try live camera again
          </button>
          <button type="button" onClick={onCancel}
            className="text-sm font-medium text-gray-500 hover:underline dark:text-gray-400">
            Use upload instead
          </button>
        </div>
      </div>
    )
  }

  const showPreview = phase === 'preview' && previewUrl

  return (
    <div className="space-y-3">
      <canvas ref={canvasRef} width={OUTPUT_WIDTH} height={OUTPUT_HEIGHT} className="hidden" />

      {/* Always mounted so srcObject stays bound across phase changes (e.g. Retake) — only visibility toggles. */}
      <div className={`relative overflow-hidden rounded-lg bg-black ${showPreview ? 'hidden' : ''}`}>
        <video ref={videoRef} muted playsInline className="h-56 w-full object-cover" />
        {phase === 'live' && (
          <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/30">
            <div className="h-full bg-emerald-500 transition-[width]" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
        {!videoReady && phase === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
            Starting camera…
          </div>
        )}
      </div>

      {showPreview ? (
        <>
          <img src={previewUrl} alt="Captured panorama" className="w-full rounded-lg" />
          <div className="flex gap-3">
            <button type="button" onClick={handleUseThis}
              className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
              Use this
            </button>
            <button type="button" onClick={retake}
              className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-300">
              Retake
            </button>
          </div>
        </>
      ) : (
        <>
          {phase === 'starting' && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Hold your phone at chest height. Tap Start, then slowly rotate 360°.
            </p>
          )}

          <div className="flex gap-3">
            {phase === 'starting' && (
              <>
                <button type="button" onClick={startCapture} disabled={!videoReady}
                  className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                  Start capture
                </button>
                <button type="button" onClick={handleCancel}
                  className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-300">
                  Cancel
                </button>
              </>
            )}
            {phase === 'live' && (
              <>
                <button type="button" onClick={finish}
                  className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                  Finish
                </button>
                <button type="button" onClick={handleCancel}
                  className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-300">
                  Cancel
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
