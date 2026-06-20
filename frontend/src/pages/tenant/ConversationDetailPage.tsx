import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { messagingApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import { formatRelative } from '@/lib/utils'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { Message } from '@/types'

export default function ConversationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const convId = Number(id)
  const user = useAuthStore((s) => s.user)
  const access = useAuthStore((s) => s.access)
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const [localMsgs, setLocalMsgs] = useState<Message[]>([])

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
    if (data.type === 'chat_message') {
      setLocalMsgs((prev) => [...prev, data.message as Message])
      qc.invalidateQueries({ queryKey: ['conversations'] })
    }
  }, [qc])

  useWebSocket(`/ws/conversations/${convId}/`, { onMessage }, !!access)

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    const msg = text
    setText('')
    await messagingApi.sendMessage(convId, { body: msg })
  }

  const otherName = conv
    ? (user?.role === 'landlord' ? conv.tenant_name : conv.landlord_name)
    : '…'

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          {otherName[0] ?? '?'}
        </div>
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
