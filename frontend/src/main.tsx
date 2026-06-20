import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App'

registerSW({ immediate: true })

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

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
