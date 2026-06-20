import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { registerSW } from 'virtual:pwa-register'
import { queryClient } from '@/lib/queryClient'
import './index.css'
import App from './App'

registerSW({ immediate: true })

function renderApp() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </BrowserRouter>
    </StrictMode>,
  )
}

// VITE_USE_MOCKS=true flips MSW on — the same handlers used here back the
// future integration test suite (src/mocks/server.ts). Swapping back to the
// real API is a config change, not a code change.
if (import.meta.env.VITE_USE_MOCKS === 'true') {
  import('./mocks/browser').then(({ worker }) =>
    worker.start({ onUnhandledRequest: 'bypass' }).then(renderApp),
  )
} else {
  renderApp()
}
