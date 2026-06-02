import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  base: './',
  // Disabled HTTPS for local development to avoid self-signed certificate issues
  server: { host: true, https: false },
  plugins: [
    basicSsl(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', '*.svg'],
      manifest: {
        name: 'MR Tracker',
        short_name: 'MR Tracker',
        description: 'Medical Representative field visit tracker — offline-first PWA',
        theme_color: '#16a34a',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: './',
        start_url: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-apple-180.png', sizes: '180x180', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname.includes('script.google.com'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'apps-script-cache',
              networkTimeoutSeconds: 30,
              expiration: { maxEntries: 10, maxAgeSeconds: 60 }
            }
          }
        ],
        navigateFallback: null,
        cleanupOutdatedCaches: true
      },
      devOptions: { enabled: false }
    })
  ]
});
