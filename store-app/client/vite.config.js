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
      /* 'prompt', NOT 'autoUpdate'.

         autoUpdate reloads every open tab the moment a deployment lands, with
         no warning. On three deploys in one evening that is three reloads,
         which is how it was reported. On an ERP it is worse than annoying:
         the reload arrives mid-session and throws away whatever was on
         screen, so a half-finished sale or a part-filled product form is
         simply gone.

         components/ReloadPrompt.jsx already exists to do this properly, a
         small "New version available" card with a Reload button, and it is
         rendered in App.jsx. Under autoUpdate it could never appear, because
         the register client never sets `needRefresh` in that mode. It was
         dead UI sitting next to the behaviour it was written to prevent.

         `skipWaiting` is deliberately NOT set in the workbox block below, and
         must not be. Prompting depends on the new worker sitting in `waiting`
         until the reader accepts; skipWaiting activates it immediately and
         takes the choice away again, which is autoUpdate by another name.
         The virtual register module posts SKIP_WAITING itself when the button
         is pressed.

         index.html used to carry a hand-written listener:

           navigator.serviceWorker.addEventListener('controllerchange',
             () => window.location.reload())

         controllerchange fires the first time any worker takes control, and
         `clientsClaim` below makes a freshly installed worker do exactly
         that. So every first-time visitor got a full page reload once
         precaching finished, 14 to 20 seconds in, with no update to apply.
         Do not add that listener back. */
      registerType: 'prompt',
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
        /* clientsClaim on its own is safe: it makes an ACTIVATED worker take
           control of open pages, which is what lets the app work offline on a
           first visit. It does not reload anything by itself.

           skipWaiting is the one that must stay off, see the note on
           registerType above. */
        clientsClaim: true,
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
