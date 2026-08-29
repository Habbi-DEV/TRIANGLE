import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const plugins = [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: [
        'icons/favicon-16.png',
        'icons/favicon-32.png',
        'icons/apple-touch-icon.png',
      ],
      manifest: {
        name: 'TRIANGLE',
        short_name: 'TRIANGLE',
        description: 'TRIANGLE — commande en ligne, e-menu et suivi de commande',
        start_url: '/?source=pwa',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#f97316',
        lang: 'fr',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell (JS/CSS/HTML/fonts/images built by Vite) — precached
        // automatically by the plugin so the app opens instantly offline.
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg,webp,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          // Menu data (categories/products/promotions) — full offline support:
          // show the last cached version immediately, refresh in the
          // background whenever a connection is available.
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/api/categories') || url.pathname.startsWith('/api/products'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'triangle-menu-data',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          // Restaurant settings (name/logo/currency) — same treatment, it's
          // what drives the header branding on first paint.
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/settings'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'triangle-settings',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          // Live order status — always try the network first (status must
          // be fresh), only fall back to the last known state if offline.
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/orders'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'triangle-orders',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          // Product photos and any remote image host (e.g. Supabase storage)
          // — cache-first, they rarely change once uploaded.
          {
            urlPattern: ({ request, url }) =>
              request.destination === 'image' || url.pathname.startsWith('/images/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'triangle-images',
              expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: {
        // Lets `npm run dev` register a service worker too, so offline
        // behavior can be tested without a full build.
        enabled: true,
        type: 'module',
      },
    }),
  ];
  try {
    // @ts-ignore
    const m = await import('./.vite-source-tags.js');
    plugins.push(m.sourceTags());
  } catch {}

  const env = loadEnv(mode, process.cwd(), ['VITE_', 'NEXT_PUBLIC_']);
  const processEnvDefines: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    processEnvDefines[`process.env.${key}`] = JSON.stringify(value);
  }

  return {
    plugins,
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    define: processEnvDefines,
  };
})
