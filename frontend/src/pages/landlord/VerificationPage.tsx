import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { verificationApi } from '@/api'
import { getErrorMessage } from '@/lib/utils'
import { formatDate } from '@/lib/intl'
import type { DocumentType } from '@/types'

const DOC_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'national_id', label: 'National ID' },
  { value: 'passport', label: 'Passport' },
  { value: 'drivers_license', label: "Driver's License" },
]

export default function VerificationPage() {
  const qc = useQueryClient()
  const [docType, setDocType] = useState<DocumentType>('national_id')
  const [frontFile, setFrontFile] = useState<File | null>(null)
  const [backFile, setBackFile] = useState<File | null>(null)
  const [selfieFile, setSelfieFile] = useState<File | null>(null)
  const [notes, setNotes] = useState('')
  const [success, setSuccess] = useState(false)

  const { data: verification, isLoading } = useQuery({
    queryKey: ['my-verification'],
    queryFn: () => verificationApi.myStatus().then((r) => r.data).catch(() => null),
  })

  const submitMut = useMutation({
    mutationFn: () =>
      verificationApi.submit(
        { document_type: docType, notes },
        { front: frontFile!, back: backFile, selfie: selfieFile! },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-verification'] })
      setSuccess(true)
    },
  })

  if (isLoading) return <div className="h-48 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />

  if (verification?.status === 'approved') {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-green-200 bg-green-50 p-8 text-center dark:border-green-800 dark:bg-green-900/20">
        <div className="text-4xl">✓</div>
        <h1 className="mt-3 text-xl font-bold text-gray-900 dark:text-gray-100">You're verified!</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          Approved on {formatDate(verification.reviewed_at ?? '')}. Your listings display a verified badge.
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

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Get verified</h1>
      <p className="mt-1 text-gray-500 dark:text-gray-400">
        Upload a government-issued ID to get a verified badge on your profile and listings.
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

      {submitMut.isError && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {getErrorMessage(submitMut.error, 'Failed to submit verification documents')}
        </div>
      )}

      <div className="mt-6 space-y-4 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <div>
          <label className="label">Document type</label>
          <select value={docType} onChange={(e) => setDocType(e.target.value as DocumentType)}
            className="input">
            {DOC_TYPES.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">ID front (image or PDF)</label>
          <input type="file" accept="image/*,.pdf"
            onChange={(e) => setFrontFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-emerald-700 hover:file:bg-emerald-100 dark:text-gray-400 dark:file:bg-emerald-900/30 dark:file:text-emerald-400 dark:hover:file:bg-emerald-900/50" />
        </div>

        <div>
          <label className="label">ID back (optional, image or PDF)</label>
          <input type="file" accept="image/*,.pdf"
            onChange={(e) => setBackFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-emerald-700 hover:file:bg-emerald-100 dark:text-gray-400 dark:file:bg-emerald-900/30 dark:file:text-emerald-400 dark:hover:file:bg-emerald-900/50" />
        </div>

        <div>
          <label className="label">Selfie holding your ID</label>
          <input type="file" accept="image/*"
            onChange={(e) => setSelfieFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-emerald-700 hover:file:bg-emerald-100 dark:text-gray-400 dark:file:bg-emerald-900/30 dark:file:text-emerald-400 dark:hover:file:bg-emerald-900/50" />
        </div>

        <div>
          <label className="label">Additional notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            rows={3} placeholder="Any additional information for the reviewer…"
            className="input resize-none" />
        </div>

        <button onClick={() => submitMut.mutate()} disabled={!frontFile || !selfieFile || submitMut.isPending}
          className="w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          {submitMut.isPending ? 'Submitting…' : 'Submit for verification'}
        </button>
      </div>
    </div>
  )
}
