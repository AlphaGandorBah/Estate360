import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { panoramasApi } from '@/api'
import { getErrorMessage } from '@/lib/utils'
import { isSaveDataEnabled } from '@/lib/pwa'
import { useWebSocket } from '@/hooks/useWebSocket'
import PanoramaCapture from '@/components/listings/PanoramaCapture'
import type { Panorama, PanoramaStatus } from '@/types'

interface Props { listingId: number }

const STATUS_STYLES: Record<PanoramaStatus, string> = {
  pending: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  processing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  ready: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

const BACKOFF_MS = [2000, 4000, 8000, 15000]
const MAX_POLL_MS = 5 * 60 * 1000

export default function PanoramaManager({ listingId }: Props) {
  const qc = useQueryClient()
  const pollCountRef = useRef(0)
  const pollStartRef = useRef(Date.now())
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [mode, setMode] = useState<'capture' | 'upload'>('capture')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [roomLabel, setRoomLabel] = useState('')
  const [ordering, setOrdering] = useState<string>('')
  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    if (!file) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const { data: panoramaRes } = useQuery({
    queryKey: ['panoramas', listingId],
    queryFn: () => panoramasApi.list(listingId).then((r) => r.data),
    refetchInterval: (query) => {
      const data = query.state.data
      const pending = data?.results.some((p) => p.status === 'pending' || p.status === 'processing')
      if (!pending) return false
      if (Date.now() - pollStartRef.current > MAX_POLL_MS) return false
      const delay = BACKOFF_MS[Math.min(pollCountRef.current, BACKOFF_MS.length - 1)]
      pollCountRef.current += 1
      // Save-Data: double polling intervals to cut data usage on metered connections.
      return isSaveDataEnabled() ? delay * 2 : delay
    },
  })

  // Push (fast path): short-circuit the poll the instant the backend finishes
  // processing. The poll above stays as the correctness fallback regardless.
  const onNotification = useCallback((msg: Record<string, unknown>) => {
    const payload = msg.payload as { listing_id?: number } | undefined
    if (msg.type === 'notification.new' && msg.kind === 'panorama_ready' && payload?.listing_id === listingId) {
      qc.invalidateQueries({ queryKey: ['panoramas', listingId] })
    }
  }, [qc, listingId])

  useWebSocket('/ws/notifications/', { onMessage: onNotification }, true)

  const panoramas = panoramaRes?.results ?? []

  const uploadMut = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('image', file!)
      fd.append('room_label', roomLabel)
      if (ordering !== '') fd.append('ordering', ordering)
      return panoramasApi.upload(listingId, fd)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['panoramas', listingId] })
      pollCountRef.current = 0
      pollStartRef.current = Date.now()
      setFile(null)
      setRoomLabel('')
      setOrdering('')
      setUploadError('')
      setMode('capture')
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    onError: (err) => setUploadError(getErrorMessage(err, 'Failed to upload panorama')),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => panoramasApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['panoramas', listingId] }),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setUploadError('')
    if (!file) { setUploadError('Choose an image to upload.'); return }
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setUploadError('Only JPEG and PNG images are accepted.')
      return
    }
    if (!roomLabel.trim()) { setUploadError('Room label is required.'); return }
    uploadMut.mutate()
  }

  const retry = (p: Panorama) => {
    setRoomLabel(p.room_label)
    setMode('upload')
    fileInputRef.current?.focus()
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="font-semibold text-gray-900 dark:text-gray-100">Panoramas</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Upload 360° photos for each room. At least one must finish processing (status: ready) before you can submit this listing.
      </p>

      {!panoramas.length && (
        <div className="mt-4 rounded-lg bg-gray-50 py-6 text-center text-sm text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
          No panoramas yet
        </div>
      )}

      <div className="mt-4 space-y-2">
        {panoramas.map((p) => (
          <div key={p.id} className="flex items-center gap-4 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-700">
              {p.thumbnail_url
                ? <img src={p.thumbnail_url} alt={p.room_label} className="h-full w-full object-cover" />
                : <span className="text-xs text-gray-400 dark:text-gray-500">No image</span>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 dark:text-gray-100">{p.room_label || `Room ${p.id}`}</div>
              {p.status === 'failed' && (
                <div className="mt-0.5 text-xs text-red-600 dark:text-red-400">{p.failure_reason || 'Processing failed'}</div>
              )}
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[p.status]}`}>
              {p.status}
            </span>
            {p.status === 'failed' && (
              <button onClick={() => retry(p)}
                className="shrink-0 text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400">
                Retry
              </button>
            )}
            <button onClick={() => { if (confirm('Delete this panorama?')) deleteMut.mutate(p.id) }}
              disabled={deleteMut.isPending}
              className="shrink-0 text-xs font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400">
              Delete
            </button>
          </div>
        ))}
      </div>

      {uploadError && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">{uploadError}</div>
      )}

      <div className="mt-4 flex gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
        <button type="button" onClick={() => setMode('capture')}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
            mode === 'capture'
              ? 'bg-emerald-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
          }`}>
          Capture with camera
        </button>
        <button type="button" onClick={() => setMode('upload')}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
            mode === 'upload'
              ? 'bg-emerald-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
          }`}>
          Upload existing photo
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div>
          <label className="label">Room label</label>
          <input value={roomLabel} onChange={(e) => setRoomLabel(e.target.value)}
            placeholder="e.g. Living room" className="input" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">360° photo (JPEG or PNG)</label>
            {mode === 'upload' ? (
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-emerald-700 hover:file:bg-emerald-100 dark:text-gray-400 dark:file:bg-emerald-900/30 dark:file:text-emerald-400 dark:hover:file:bg-emerald-900/50" />
            ) : file && previewUrl ? (
              <div className="flex items-center gap-3">
                <img src={previewUrl} alt="Captured panorama" className="h-16 w-28 rounded-lg object-cover" />
                <button type="button" onClick={() => setFile(null)}
                  className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400">
                  Retake
                </button>
              </div>
            ) : (
              <PanoramaCapture onCapture={(f) => setFile(f)} onCancel={() => setMode('upload')} />
            )}
          </div>
          <div>
            <label className="label">Display order (optional)</label>
            <input type="number" min={0} value={ordering}
              onChange={(e) => setOrdering(e.target.value)} className="input" />
          </div>
        </div>
        <button type="submit" disabled={uploadMut.isPending}
          className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          {uploadMut.isPending ? 'Uploading…' : '+ Add panorama'}
        </button>
      </form>
    </div>
  )
}
