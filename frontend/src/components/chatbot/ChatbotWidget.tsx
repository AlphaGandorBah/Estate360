import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { chatbotApi } from '@/api'
import type { ChatbotHistoryTurn, ChatbotListingResult } from '@/api/chatbot'
import { formatPrice } from '@/lib/intl'
import { AREA_LABELS } from '@/lib/utils'

interface Msg { role: 'user' | 'bot'; text: string; followups?: string[]; results?: ChatbotListingResult[] }

const STORAGE_KEY = 'estate360_chat_session'
const SEND_DEBOUNCE_MS = 300

const WELCOME: Msg = {
  role: 'bot',
  text: "Hi! I'm the Estate360 assistant. How can I help?",
  followups: ['How to save a listing?', 'How does verification work?', 'What areas are available?'],
}

function loadSession(): Msg[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return [WELCOME]
    const parsed = JSON.parse(raw) as Msg[]
    return parsed.length ? parsed : [WELCOME]
  } catch {
    return [WELCOME]
  }
}

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>(loadSession)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [isThrottled, setIsThrottled] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const sendDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  useEffect(() => {
    // Conversation persists for the tab session so navigating between pages
    // (the widget is mounted fresh on every route) doesn't lose context —
    // it stays a stateless retriever server-side, but at least the visible
    // thread survives.
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(msgs))
  }, [msgs])

  useEffect(() => () => {
    if (sendDebounceTimerRef.current) clearTimeout(sendDebounceTimerRef.current)
    if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current)
  }, [])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    if (sendDebounceTimerRef.current) return
    sendDebounceTimerRef.current = setTimeout(() => {
      sendDebounceTimerRef.current = null
    }, SEND_DEBOUNCE_MS)
    if (isThrottled) return

    // Built from state as of this send, before the new message is appended —
    // without this, every message is answered in isolation and "what about
    // cheaper ones?" or "thanks" have nothing to land on.
    const history: ChatbotHistoryTurn[] = msgs
      .slice(-8)
      .map((m) => ({ role: m.role === 'user' ? 'user' as const : 'assistant' as const, content: m.text }))

    setMsgs((m) => [...m, { role: 'user', text: trimmed }])
    setInput('')
    setLoading(true)
    try {
      const { data } = await chatbotApi.query(trimmed, history)
      setMsgs((m) => [...m, { role: 'bot', text: data.reply, followups: data.followups, results: data.results }])
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number; headers?: Record<string, string> } })?.response?.status
      if (status === 429) {
        const retryAfter = Number((err as { response?: { headers?: Record<string, string> } })?.response?.headers?.['retry-after']) || 30
        setIsThrottled(true)
        if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current)
        throttleTimerRef.current = setTimeout(() => {
          setIsThrottled(false)
          throttleTimerRef.current = null
        }, retryAfter * 1000)
        setMsgs((m) => [...m, { role: 'bot', text: `I'm getting a lot of questions right now — try again in about ${retryAfter}s.` }])
      } else {
        setMsgs((m) => [...m, { role: 'bot', text: 'Sorry, something went wrong. Please try again.' }])
      }
    } finally {
      setLoading(false)
    }
  }

  const clearChat = () => {
    setMsgs([WELCOME])
    sessionStorage.removeItem(STORAGE_KEY)
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className={`flex flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl transition-all dark:border-gray-700 dark:bg-gray-800 ${
          expanded
            ? 'fixed inset-3 z-50 sm:static sm:h-[600px] sm:w-96'
            : 'h-[480px] w-80'
        }`}>
          <div className="flex items-center justify-between rounded-t-2xl bg-emerald-600 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-300" />
              <span className="font-semibold text-white">Estate360 Assistant</span>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={clearChat} title="Start a new conversation" className="text-xs text-white/80 hover:text-white">Clear</button>
              <button onClick={() => setExpanded((e) => !e)} title="Expand" className="text-white/80 hover:text-white sm:inline hidden">
                {expanded ? '⤡' : '⤢'}
              </button>
              <button onClick={() => setOpen(false)} aria-label="Close chat" className="text-white/80 hover:text-white">✕</button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {msgs.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                }`}>
                  {m.text}
                </div>
                {m.results?.length ? (
                  <div className="mt-2 flex w-full max-w-[85%] flex-col gap-1.5">
                    {m.results.map((r) => (
                      <Link key={r.id} to={`/listings/${r.id}`}
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs hover:border-emerald-400 hover:bg-emerald-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{r.title}</div>
                        <div className="mt-0.5 text-gray-500 dark:text-gray-400">
                          {formatPrice(r.price_annual, r.currency)}/yr · {r.bedrooms} bed · {AREA_LABELS[r.location_area] ?? r.location_area}
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : null}
                {m.followups?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {m.followups.map((f) => (
                      <button key={f} onClick={() => send(f)} disabled={loading}
                        className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50">
                        {f}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {loading && (
              <div className="flex items-start">
                <div className="flex items-center gap-1 rounded-2xl bg-gray-100 px-3 py-2 text-sm text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(input) }}
            className="flex gap-2 border-t border-gray-200 p-3 dark:border-gray-700">
            <input
              value={input} onChange={(e) => setInput(e.target.value)}
              placeholder={isThrottled ? 'Please wait…' : 'Ask something…'}
              disabled={isThrottled}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-emerald-400 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            <button type="submit" disabled={loading || isThrottled}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              Send
            </button>
          </form>
        </div>
      )}

      <button onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close chat' : 'Open chat'}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 shadow-lg hover:bg-emerald-700">
        <svg className="h-7 w-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {/* Robot head: antenna, head outline, eyes, mouth */}
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v3" />
          <circle cx="12" cy="2.5" r="0.75" fill="currentColor" stroke="none" />
          <rect x="4" y="6" width="16" height="14" rx="3" strokeWidth={2} />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 11v3M22 11v3" />
          <circle cx="9" cy="13" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="15" cy="13" r="1.4" fill="currentColor" stroke="none" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17h6" />
        </svg>
      </button>
    </div>
  )
}
