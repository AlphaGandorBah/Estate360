import { useState, type ChangeEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { verificationApi } from '@/api'
import WebcamCapture from '@/components/verification/WebcamCapture'
import { formatDate } from '@/lib/intl'
import { getErrorMessage } from '@/lib/utils'
import { DOCUMENT_ACCEPT, prepareVerificationFile } from '@/lib/verificationFiles'
import type { DocumentType } from '@/types'

const DOC_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'national_id', label: 'National ID' },
  { value: 'passport', label: 'Passport Book' },
  { value: 'drivers_license', label: "Driver's License" },
]


export default function VerificationPage() {
  const queryClient = useQueryClient()
  const [docType, setDocType] = useState<DocumentType>('national_id')
  const [frontFile, setFrontFile] = useState<File | null>(null)
  const [backFile, setBackFile] = useState<File | null>(null)
  const [selfieFile, setSelfieFile] = useState<File | null>(null)
  const [frontError, setFrontError] = useState('')
  const [backError, setBackError] = useState('')
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [success, setSuccess] = useState(false)

  const { data: verification, isLoading } = useQuery({
    queryKey: ['my-verification'],
    queryFn: () => verificationApi.myStatus().then((response) => response.data).catch(() => null),
  })

  const submitMutation = useMutation({
    mutationFn: () => {
      if (!frontFile || !selfieFile) {
        return Promise.reject(new Error('Required verification files are missing'))
      }
      setUploadProgress(0)
      return verificationApi.submit(
        { document_type: docType },
        { front: frontFile, back: backFile, selfie: selfieFile },
        setUploadProgress,
      )
    },
    onSuccess: (response) => {
      queryClient.setQueryData(['my-verification'], response.data)
      queryClient.invalidateQueries({ queryKey: ['my-verification'] })
      setUploadProgress(100)
      setSuccess(true)
    },
    onError: () => setUploadProgress(null),
  })

  const selectDocument = (
    event: ChangeEvent<HTMLInputElement>,
    setFile: (file: File | null) => void,
    setError: (message: string) => void,
  ) => {
    const source = event.target.files?.[0]
    if (!source) {
      setFile(null)
      setError('')
      return
    }
    const prepared = prepareVerificationFile(source, 'document')
    setFile(prepared.file)
    setError(prepared.error)
    if (!prepared.file) event.target.value = ''
  }

  if (isLoading) return <div className="h-48 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />

  if (verification?.status === 'approved') {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-green-200 bg-green-50 p-8 text-center dark:border-green-800 dark:bg-green-900/20">
        <div className="text-4xl">✓</div>
        <h1 className="mt-3 text-xl font-bold text-gray-900 dark:text-gray-100">You're verified!</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          Approved on {formatDate(verification.reviewed_at ?? '')}. Your profile displays a verified badge.
        </p>
      </div>
    )
  }

  if (verification?.status === 'pending') {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-yellow-200 bg-yellow-50 p-8 text-center dark:border-yellow-800 dark:bg-yellow-900/20">
        <div className="text-4xl">⏳</div>
        <h1 className="mt-3 text-xl font-bold text-gray-900 dark:text-gray-100">Verification pending</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          Submitted on {formatDate(verification.submitted_at)}. Usually takes 1–2 business days.
        </p>
      </div>
    )
  }

  // An invalid optional back image is ignored rather than blocking an otherwise
  // complete submission; only prepared files are added to the multipart body.
  const canSubmit = Boolean(frontFile && selfieFile && !frontError)

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Verify your identity</h1>
      <p className="mt-1 text-gray-500 dark:text-gray-400">
        Upload a government-issued ID and take a selfie to get verified. You must complete verification before using Estate360.
      </p>

      {verification?.status === 'rejected' && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <div className="font-medium text-red-700 dark:text-red-400">Previous submission rejected</div>
          <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            {verification.notes || 'Please resubmit with valid documents.'}
          </div>
        </div>
      )}

      {success && (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
          Documents submitted! You'll be notified once reviewed.
        </div>
      )}

      {submitMutation.isError && (
        <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {getErrorMessage(submitMutation.error, 'Failed to submit verification documents')}
        </div>
      )}

      <form
        className="mt-6 space-y-5 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"
        onSubmit={(event) => {
          event.preventDefault()
          if (canSubmit) submitMutation.mutate()
        }}
      >
        <div>
          <label htmlFor="document-type" className="label">Document type</label>
          <select
            id="document-type"
            value={docType}
            onChange={(event) => setDocType(event.target.value as DocumentType)}
            className="input"
          >
            {DOC_TYPES.map((document) => (
              <option key={document.value} value={document.value}>{document.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="document-front" className="label">ID front</label>
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
            JPG, PNG, or PDF, up to 8 MB. Your files upload together when you submit the form.
          </p>
          <input
            id="document-front"
            type="file"
            accept={DOCUMENT_ACCEPT}
            onChange={(event) => selectDocument(event, setFrontFile, setFrontError)}
            className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-emerald-700 hover:file:bg-emerald-100 dark:text-gray-400 dark:file:bg-emerald-900/30 dark:file:text-emerald-400 dark:hover:file:bg-emerald-900/50"
          />
          {frontFile && <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">Ready: {frontFile.name}</p>}
          {frontError && <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{frontError}</p>}
        </div>

        <div>
          <label htmlFor="document-back" className="label">ID back (optional)</label>
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">JPG, PNG, or PDF, up to 8 MB.</p>
          <input
            id="document-back"
            type="file"
            accept={DOCUMENT_ACCEPT}
            onChange={(event) => selectDocument(event, setBackFile, setBackError)}
            className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-emerald-700 hover:file:bg-emerald-100 dark:text-gray-400 dark:file:bg-emerald-900/30 dark:file:text-emerald-400 dark:hover:file:bg-emerald-900/50"
          />
          {backFile && <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">Ready: {backFile.name}</p>}
          {backError && <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{backError}</p>}
        </div>

        <WebcamCapture onCapture={setSelfieFile} />

        {submitMutation.isPending && (
          <div className="space-y-1" aria-live="polite">
            <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-full rounded-full bg-emerald-600 transition-[width]"
                style={{ width: uploadProgress === null ? '15%' : `${Math.max(uploadProgress, 4)}%` }}
              />
            </div>
            <p className="text-center text-xs text-gray-500 dark:text-gray-400">
              {uploadProgress === null ? 'Uploading securely…' : `Uploading securely… ${uploadProgress}%`}
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit || submitMutation.isPending}
          className="w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitMutation.isPending ? 'Submitting…' : 'Submit for verification'}
        </button>
        {!canSubmit && !submitMutation.isPending && (
          <p className="text-center text-xs text-gray-500 dark:text-gray-400">
            Add the front of your ID and a selfie to enable submission.
          </p>
        )}
      </form>
    </div>
  )
}
