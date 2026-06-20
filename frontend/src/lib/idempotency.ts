import { useRef } from 'react'

/**
 * Returns a key that stays stable for the lifetime of a logical operation
 * (a form submission, "Send", "Approve", etc.) so manual retries, TanStack
 * Query retries, and silent-refresh replays all reuse the same key. Call
 * `reset()` only after a terminal success, to start a fresh key for the
 * next operation.
 */
export function useIdempotencyKey() {
  const keyRef = useRef(crypto.randomUUID())

  const reset = () => {
    keyRef.current = crypto.randomUUID()
  }

  return { key: keyRef.current, reset }
}
