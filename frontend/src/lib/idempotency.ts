import { useRef } from 'react'
import { v4 as uuid } from 'uuid'

/**
 * Returns a key that stays stable for the lifetime of a logical operation
 * (a form submission, "Send", "Approve", etc.) so manual retries, TanStack
 * Query retries, and silent-refresh replays all reuse the same key. Call
 * `reset()` only after a terminal success, to start a fresh key for the
 * next operation.
 *
 * Uses the `uuid` package rather than crypto.randomUUID() — the latter only
 * exists in secure contexts (HTTPS or localhost), so it throws when the app
 * is reached over plain HTTP via a LAN IP (e.g. testing from a phone).
 */
export function useIdempotencyKey() {
  const keyRef = useRef(uuid())

  const reset = () => {
    keyRef.current = uuid()
  }

  return { key: keyRef.current, reset }
}
