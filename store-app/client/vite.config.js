import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import dns from 'dns'
import { fileURLToPath } from 'node:url'

// Prefer IPv4 for localhost to avoid DNS resolution delays
dns.setDefaultResultOrder('ipv4first')

// Source maps are uploaded to Sentry ONLY when an auth token is present, and
// this is deliberately all-or-nothing.
//
// Emitting source maps without uploading them would publish the entire
// unminified frontend source to anyone who opens devtools on the production
// site, strictly worse than having no maps at all. So when the token is
// absent we generate none; when it is present we generate them, upload them,
// and have the plugin delete them from dist before deploy
// (sourcemaps.filesToDeleteAfterUpload). Either way nothing ships publicly.
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN
const uploadSourceMaps = Boolean(SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'QuadERP',
        short_name: 'QuadERP',
        description: 'Offline-capable Store Management App',
        theme_color: '#0D0A28',
        background_color: '#0D0A28',
        display: 'standalone',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    }),
    // Must come last so it sees the final emitted bundle.
    ...(uploadSourceMaps
      ? [sentryVitePlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: SENTRY_AUTH_TOKEN,
          release: { name: process.env.VITE_COMMIT_SHA || undefined },
          sourcemaps: {
            // Remove the maps from dist after they reach Sentry, so the deployed
            // site never serves them.
            filesToDeleteAfterUpload: ['./dist/**/*.map'],
          },
          telemetry: false,
        })]
      : []),
  ],
  build: {
    // Only when they will actually be uploaded and then deleted, see above.
    sourcemap: uploadSourceMaps,
  },
  resolve: {
    alias: {
      /* Nothing in this app opens a realtime channel, but createClient()
         constructs a RealtimeClient regardless, so realtime-js and its
         phoenix dependency were ~52KB of the entry chunk running a websocket
         client that never connects. Everyone paid for it, including people
         on /signup who are not even signed in.

         The stub implements the small surface supabase-js actually touches.
         scripts/check-realtime-stub.mjs reads the installed supabase-js
         bundle and fails the build if an upgrade starts calling something the
         stub lacks, `npm run check:realtime`, wired into `npm run build`.

         To use realtime: delete this alias and src/lib/realtime-stub.js. */
      '@supabase/realtime-js': fileURLToPath(
        new URL('./src/lib/realtime-stub.js', import.meta.url)
      ),
    },
  },
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
