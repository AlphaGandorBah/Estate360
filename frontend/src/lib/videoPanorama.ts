export const RECORDED_PANORAMA_WIDTH = 4096
export const RECORDED_PANORAMA_HEIGHT = 1024

const STRIP_COUNT = 72
const SEEK_TIMEOUT_MS = 10_000

interface BuildVideoPanoramaOptions {
  video: HTMLVideoElement
  canvas: HTMLCanvasElement
  signal: AbortSignal
  onProgress: (progress: number) => void
}

function abortError(): DOMException {
  return new DOMException('Panorama generation was cancelled.', 'AbortError')
}

function seekToFrame(video: HTMLVideoElement, time: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError())

  const latestTime = Math.max(0, video.duration - 0.05)
  const targetTime = Math.min(Math.max(time, 0), latestTime)

  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    && Math.abs(video.currentTime - targetTime) < 0.005) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    let settled = false

    const cleanup = () => {
      window.clearTimeout(timeoutId)
      video.removeEventListener('seeked', handleSeeked)
      video.removeEventListener('error', handleError)
      signal.removeEventListener('abort', handleAbort)
    }

    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }

    const handleSeeked = () => finish(resolve)
    const handleError = () => finish(() => reject(new Error('The recorded video could not be decoded.')))
    const handleAbort = () => finish(() => reject(abortError()))
    const timeoutId = window.setTimeout(
      () => finish(() => reject(new Error('Timed out while reading the recorded video.'))),
      SEEK_TIMEOUT_MS,
    )

    video.addEventListener('seeked', handleSeeked)
    video.addEventListener('error', handleError)
    signal.addEventListener('abort', handleAbort)

    try {
      video.currentTime = targetTime
    } catch {
      finish(() => reject(new Error('The recorded video format is not supported.')))
    }
  })
}

function canvasToJpeg(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (signal.aborted) { reject(abortError()); return }
      if (!blob) { reject(new Error('The browser could not create the panorama image.')); return }
      resolve(blob)
    }, 'image/jpeg', 0.88)
  })
}

/**
 * Builds a cylindrical panorama by sampling the centre strip from evenly
 * spaced frames while the user rotates once during the recorded video.
 */
export async function buildPanoramaFromVideo({
  video,
  canvas,
  signal,
  onProgress,
}: BuildVideoPanoramaOptions): Promise<Blob> {
  if (!Number.isFinite(video.duration) || video.duration <= 0) {
    throw new Error('The recorded video has an invalid duration.')
  }
  if (!video.videoWidth || !video.videoHeight) {
    throw new Error('The recorded video has no readable frames.')
  }

  video.pause()
  canvas.width = RECORDED_PANORAMA_WIDTH
  canvas.height = RECORDED_PANORAMA_HEIGHT

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas processing is unavailable in this browser.')

  context.fillStyle = '#000'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'

  for (let index = 0; index < STRIP_COUNT; index += 1) {
    if (signal.aborted) throw abortError()

    const frameTime = ((index + 0.5) / STRIP_COUNT) * video.duration
    await seekToFrame(video, frameTime, signal)

    const destinationStart = Math.round((index / STRIP_COUNT) * canvas.width)
    const destinationEnd = Math.round(((index + 1) / STRIP_COUNT) * canvas.width)
    const destinationWidth = destinationEnd - destinationStart

    // Preserve the strip's aspect ratio instead of squeezing a full camera
    // frame into each narrow panorama segment.
    const sourceWidth = Math.max(
      2,
      Math.min(video.videoWidth, video.videoHeight * (destinationWidth / canvas.height)),
    )
    const sourceX = (video.videoWidth - sourceWidth) / 2

    context.drawImage(
      video,
      sourceX,
      0,
      sourceWidth,
      video.videoHeight,
      destinationStart,
      0,
      destinationWidth,
      canvas.height,
    )
    onProgress((index + 1) / STRIP_COUNT)
  }

  return canvasToJpeg(canvas, signal)
}
