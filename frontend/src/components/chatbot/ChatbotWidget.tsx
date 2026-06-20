import { useState, useRef, useEffect } from 'react'
import { chatbotApi } from '@/api'

interface Msg { role: 'user' | 'bot'; text: string; followups?: string[] }

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'bot', text: 'Hi! I\'m the Estate360 assistant. How can I help?', followups: ['How to save a listing?', 'How does verification work?', 'What areas are available?'] },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const send = async (text: string) => {
    if (!text.trim() || loading) return
    setMsgs((m) => [...m, { role: 'user', text }])
    setInput('')
    setLoading(true)
    try {
      const { data } = await chatbotApi.query(text)
      setMsgs((m) => [...m, { role: 'bot', text: data.reply, followups: data.followups }])
    } catch {
      setMsgs((m) => [...m, { role: 'bot', text: 'Sorry, something went wrong. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="flex h-[480px] w-80 flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between rounded-t-2xl bg-emerald-600 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-300" />
              <span className="font-semibold text-white">Estate360 Assistant</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white">✕</button>
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
                {m.followups?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {m.followups.map((f) => (
                      <button key={f} onClick={() => send(f)}
                        className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50">
                        {f}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {loading && (
              <div className="flex items-start">
                <div className="rounded-2xl bg-gray-100 px-3 py-2 text-sm text-gray-500 dark:bg-gray-700 dark:text-gray-400">Typing…</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(input) }}
            className="flex gap-2 border-t border-gray-200 p-3 dark:border-gray-700">
            <input
              value={input} onChange={(e) => setInput(e.target.value)}
              placeholder="Ask something…"
              className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            <button type="submit" disabled={loading}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              Send
            </button>
          </form>
        </div>
      )}

      <button onClick={() => setOpen((o) => !o)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 shadow-lg hover:bg-emerald-700">
        <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </button>
    </div>
  )
}
