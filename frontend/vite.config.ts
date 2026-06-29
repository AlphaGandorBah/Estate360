import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Estate360',
        short_name: 'Estate360',
        description: 'Find your next home in Freetown',
        theme_color: '#059669',
        background_color: '#ffffff',
        icons: [
          { src: '/icons.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\/listings\/?(\?.*)?$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'listings-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
        changeOrigin: true,
        configure: (proxy) => {
          // Backend autoreloads on file save, dropping open sockets mid-flight;
          // the client (lib/ws.ts) already reconnects with backoff, so just
          // log a one-liner instead of letting Node dump the raw stack trace.
          proxy.on('error', (err) => {
            console.warn(`[ws proxy] backend connection lost (${err.message}), client will retry`)
          })
        },
      },
    },
  },
})
