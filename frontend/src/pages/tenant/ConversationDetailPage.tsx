import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { v4 as uuid } from 'uuid'
import { messagingApi, reportsApi } from '@/api'
import { useAuthStore } from '@/lib/auth'
import { formatRelative } from '@/lib/intl'
import { pushToast } from '@/lib/toast'
import { getErrorMessage } from '@/lib/utils'
import { useWebSocket } from '@/lib/ws'
import { USER_REPORT_REASONS } from '@/lib/reportReasons'
import Avatar from '@/components/common/Avatar'
import ReportModal from '@/components/common/ReportModal'
import type { Message, ReportReason } from '@/types'

export default function ConversationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const convId = Number(id)
  const user = useAuthStore((s) => s.user)
  const access = useAuthStore((s) => s.access)
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const [localMsgs, setLocalMsgs] = useState<Message[]>([])
  const [showReport, setShowReport] = useState(false)

  const { data: conv } = useQuery({
    queryKey: ['conversation', convId],
    queryFn: () => messagingApi.get(convId).then((r) => r.data),
  })

  const { data: msgRes } = useQuery({
    queryKey: ['messages', convId],
    queryFn: () => messagingApi.messages(convId).then((r) => r.data),
    refetchInterval: false,
  })

  useEffect(() => {
    if (msgRes?.results) setLocalMsgs([...msgRes.results].reverse())
  }, [msgRes])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [localMsgs])

  const onMessage = useCallback((data: Record<string, unknown>) => {
    if (data.type === 'message.new') {
      const msg: Message = {
        id: data.id as number,
        sender_id: data.sender_id as string,
        sender_name: '',
        body: data.body as string,
        client_key: (data.client_key as string | null) ?? null,
        read_at: null,
        created_at: data.created_at as string,
      }
      setLocalMsgs((prev) => {
        // Reconcile with the optimistic message we already rendered on send,
        // matched by client_key, instead of appending a duplicate.
        const idx = msg.client_key ? prev.findIndex((m) => m.client_key === msg.client_key) : -1
        if (idx !== -1) {
          const next = [...prev]
          next[idx] = msg
          return next
        }
        return [...prev, msg]
      })
      qc.invalidateQueries({ queryKey: ['conversations'] })
    } else if (data.type === 'error') {
      pushToast((data.detail as string) ?? 'Something went wrong.', 'error')
    }
  }, [qc])

  useWebSocket(`/ws/conversations/${convId}/`, { onMessage }, !!access)

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    const body = text
    const clientKey = uuid()
    setText('')

    // Show the message immediately rather than waiting on the WS echo —
    // reconciled against the real row (same client_key) once it arrives.
    setLocalMsgs((prev) => [...prev, {
      id: -Date.now(),
      sender_id: user?.id ?? '',
      sender_name: '',
      body,
      client_key: clientKey,
      read_at: null,
      created_at: new Date().toISOString(),
    }])

    try {
      await messagingApi.sendMessage(convId, { body, client_key: clientKey })
    } catch {
      // apiClient's interceptor already toasts the server's error message
      // (e.g. a restriction 403) — drop the optimistic bubble and give the
      // user their draft back.
      setLocalMsgs((prev) => prev.filter((m) => m.client_key !== clientKey))
      setText(body)
    }
  }

  const otherName = (conv
    ? (conv.is_support
        ? (user?.role === 'admin' ? conv.initiator_name : 'Admin Support')
        : (user?.id === conv.initiator_id ? conv.landlord_name : conv.initiator_name))
    : '…') ?? '…'

  const otherUserId = conv && !conv.is_support
    ? (user?.id === conv.initiator_id ? conv.landlord_id : conv.initiator_id)
    : null

  const reportMut = useMutation({
    mutationFn: (vars: { reason: ReportReason; description: string }) => reportsApi.reportUser({
      reported_user_id: otherUserId as string,
      reason: vars.reason,
      description: vars.description,
    }),
    onSuccess: () => {
      setShowReport(false)
      pushToast('Report submitted. Our team will review it.', 'success')
    },
    onError: (err) => pushToast(getErrorMessage(err, 'Failed to submit report'), 'error'),
  })

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <Avatar name={otherName} size="sm" />
          <div>
            <div className="font-medium text-gray-900 dark:text-gray-100">{otherName}</div>
            {conv?.listing_id && (
              <Link to={`/listings/${conv.listing_id}`}
                className="text-xs text-emerald-600 hover:underline dark:text-emerald-400">
                Listing #{conv.listing_id}
              </Link>
            )}
          </div>
        </div>
        {otherUserId && (
          <button onClick={() => setShowReport(true)} title={`Report ${otherName}`}
            className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-500 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        )}
      </div>

      {showReport && otherUserId && (
        <ReportModal
          title={`Report ${otherName}`}
          reasons={USER_REPORT_REASONS}
          isSubmitting={reportMut.isPending}
          onClose={() => setShowReport(false)}
          onSubmit={(reason, description) => reportMut.mutate({ reason, description })}
        />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {localMsgs.map((m) => {
          const isMe = m.sender_id === user?.id
          return (
            <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xs rounded-2xl px-4 py-2 text-sm ${
                isMe ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
              }`}>
                <p>{m.body}</p>
                <p className={`mt-1 text-xs ${isMe ? 'text-emerald-100' : 'text-gray-400 dark:text-gray-500'}`}>
                  {formatRelative(m.created_at)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex items-center gap-3 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
        <input value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 outline-none focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
        <button type="submit" disabled={!text.trim()}
          className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">
          Send
        </button>
      </form>
    </div>
  )
}
