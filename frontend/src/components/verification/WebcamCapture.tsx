import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { prepareVerificationFile, SELFIE_ACCEPT } from '@/lib/verificationFiles'

function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera access was blocked. Allow camera permission in your browser, or use the device camera option below.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No suitable camera was found. You can choose an existing selfie below.'
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'The camera is busy or unavailable. Close other camera apps and try again.'
  }
  return 'Could not open the camera. Try again or use the device camera option below.'
}

export default function WebcamCapture({ onCapture }: { onCapture: (file: File | null) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [starting, setStarting] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState('')

  const isSecure = typeof window !== 'undefined' && window.isSecureContext
  const hasCameraApi = typeof navigator !== 'undefined'
    && typeof navigator.mediaDevices?.getUserMedia === 'function'
  const canUseLiveCamera = isSecure && hasCameraApi

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    const video = videoRef.current
    if (video) {
      video.pause()
      video.srcObject = null
    }
  }, [])

  const stopCamera = useCallback(() => {
    releaseStream()
    setStreaming(false)
    setStarting(false)
    setCameraReady(false)
  }, [releaseStream])

  const clearPreview = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = null
    setPreviewUrl(null)
    onCapture(null)
  }, [onCapture])

  const setCapturedFile = useCallback((file: File) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const url = URL.createObjectURL(file)
    previewUrlRef.current = url
    setPreviewUrl(url)
    onCapture(file)
  }, [onCapture])

  useEffect(() => () => {
    releaseStream()
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [releaseStream])

  const startCamera = useCallback(async () => {
    setCameraError('')
    if (!canUseLiveCamera) {
      setCameraError(
        !isSecure
          ? 'Live camera preview requires HTTPS or localhost. Use the device camera option below on this connection.'
          : 'This browser does not support live camera preview. Use the device camera option below.',
      )
      return
    }

    stopCamera()
    setStarting(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'user' },
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
      })
      streamRef.current = stream

      const video = videoRef.current
      if (!video) throw new Error('Camera preview is unavailable')
      video.srcObject = stream
      await video.play()
      clearPreview()
      setStreaming(true)
      setCameraReady(video.videoWidth > 0 && video.videoHeight > 0)
    } catch (error) {
      releaseStream()
      setStreaming(false)
      setCameraReady(false)
      setCameraError(cameraErrorMessage(error))
    } finally {
      setStarting(false)
    }
  }, [canUseLiveCamera, clearPreview, isSecure, releaseStream, stopCamera])

  const capture = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError('The camera is still starting. Wait for the preview, then try again.')
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) {
      setCameraError('Your browser could not capture the photo. Use the device camera option below.')
      return
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraError('The photo could not be saved. Please try again.')
        return
      }
      const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' })
      setCapturedFile(file)
      stopCamera()
    }, 'image/jpeg', 0.9)
  }, [setCapturedFile, stopCamera])

  const selectSelfie = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const source = event.target.files?.[0]
    event.target.value = ''
    if (!source) return

    const prepared = prepareVerificationFile(source, 'selfie')
    if (!prepared.file) {
      setCameraError(prepared.error)
      return
    }

    stopCamera()
    setCameraError('')
    setCapturedFile(prepared.file)
  }, [setCapturedFile, stopCamera])

  const openDevicePicker = () => fileInputRef.current?.click()

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Selfie</label>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Take a clear photo of your face. JPG or PNG, up to 8 MB.
        </p>
      </div>

      {!isSecure && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          Live preview is blocked because this page is using HTTP. You can still use your phone camera or choose a photo below.
        </div>
      )}

      {cameraError && (
        <div role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-600 dark:bg-red-900/30 dark:text-red-400">
          {cameraError}
        </div>
      )}

      <div className={streaming ? 'space-y-2' : 'hidden'}>
        <video
          ref={videoRef}
          className="w-full max-w-xs -scale-x-100 rounded-xl border border-gray-300 bg-gray-950 dark:border-gray-600"
          playsInline
          muted
          onLoadedMetadata={() => setCameraReady(true)}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={capture}
            disabled={!cameraReady}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cameraReady ? 'Take photo' : 'Starting camera…'}
          </button>
          <button
            type="button"
            onClick={stopCamera}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>

      {previewUrl && (
        <img
          src={previewUrl}
          alt="Selfie preview"
          className="w-full max-w-xs rounded-xl border border-emerald-400 dark:border-emerald-600"
        />
      )}

      {!streaming && (
        <div className="flex flex-wrap gap-2">
          {canUseLiveCamera && (
            <button
              type="button"
              onClick={startCamera}
              disabled={starting}
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              {starting ? 'Opening camera…' : previewUrl ? 'Retake with camera' : 'Open camera'}
            </button>
          )}
          <button
            type="button"
            onClick={openDevicePicker}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {previewUrl ? 'Choose another photo' : 'Use device camera or choose photo'}
          </button>
          {previewUrl && (
            <button
              type="button"
              onClick={clearPreview}
              className="px-2 py-2 text-sm text-red-600 hover:underline dark:text-red-400"
            >
              Remove
            </button>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={SELFIE_ACCEPT}
        capture="user"
        onChange={selectSelfie}
        className="sr-only"
        aria-label="Take or choose a selfie"
      />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
