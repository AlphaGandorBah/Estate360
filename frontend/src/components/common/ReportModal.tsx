import { useState } from 'react'
import { REPORT_REASON_LABELS } from '@/lib/reportReasons'
import type { ReportReason } from '@/types'

interface ReportModalProps {
  title: string
  reasons: ReportReason[]
  isSubmitting: boolean
  onClose: () => void
  onSubmit: (reason: ReportReason, description: string) => void
}

export default function ReportModal({ title, reasons, isSubmitting, onClose, onSubmit }: ReportModalProps) {
  const [reason, setReason] = useState<ReportReason | ''>('')
  const [description, setDescription] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </span>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        </div>

        <div className="mt-4">
          <label className="label">Reason</label>
          <select value={reason} onChange={(e) => setReason(e.target.value as ReportReason)} className="input">
            <option value="">Select a reason</option>
            {reasons.map((r) => (
              <option key={r} value={r}>{REPORT_REASON_LABELS[r]}</option>
            ))}
          </select>
        </div>

        <div className="mt-3">
          <label className="label">Details</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="What happened? (minimum 10 characters)" rows={3} className="input resize-none" />
        </div>

        <div className="mt-5 flex gap-3">
          <button onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-300">
            Cancel
          </button>
          <button onClick={() => onSubmit(reason as ReportReason, description)}
            disabled={!reason || description.trim().length < 10 || isSubmitting}
            className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {isSubmitting ? 'Submitting…' : 'Submit report'}
          </button>
        </div>
      </div>
    </div>
  )
}
