import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '@/store/auth'
import { refreshAccessToken } from '@/api/axios'

interface WsOptions {
  onMessage: (data: Record<string, unknown>) => void
  onOpen?: () => void
  onClose?: () => void
}

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000]

export function useWebSocket(path: string, options: WsOptions, enabled = true) {
  const ws = useRef<WebSocket | null>(null)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshedOnceRef = useRef(false)
  const { onMessage, onOpen, onClose } = options
  const access = useAuthStore((s) => s.access)

  const scheduleReconnect = useCallback((connectFn: () => void) => {
    const delay = RECONNECT_DELAYS_MS[Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS_MS.length - 1)]
    const jitter = delay * 0.2 * Math.random()
    reconnectAttemptRef.current += 1
    reconnectTimerRef.current = setTimeout(connectFn, delay + jitter)
  }, [])

  const connect = useCallback(() => {
    if (!enabled || !access) return
    // Auth per the backend's Channels consumers: token is sent via the
    // Sec-WebSocket-Protocol subprotocol, not a query string.
    const url = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}${path}`
    const socket = new WebSocket(url, ['bearer', access])
    ws.current = socket

    socket.onopen = () => {
      reconnectAttemptRef.current = 0
      refreshedOnceRef.current = false
      onOpen?.()
    }
    socket.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data) as Record<string, unknown>) } catch { /* ignore */ }
    }
    socket.onclose = async (e) => {
      onClose?.()
      if (e.code === 4401 && !refreshedOnceRef.current) {
        refreshedOnceRef.current = true
        try {
          const newAccess = await refreshAccessToken()
          useAuthStore.getState().setAccess(newAccess)
          connect()
          return
        } catch {
          useAuthStore.getState().clearAuth()
          return
        }
      }
      scheduleReconnect(connect)
    }
    socket.onerror = () => socket.close()
  }, [path, access, enabled, onMessage, onOpen, onClose, scheduleReconnect])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      ws.current?.close()
      ws.current = null
    }
  }, [connect])

  const send = useCallback((data: Record<string, unknown>) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data))
    }
  }, [])

  return { send }
}
