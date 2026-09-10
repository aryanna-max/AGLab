import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Chamada AG Docência',
        short_name: 'Chamada',
        description: 'Chamada por QR com foto — AG Docência',
        theme_color: '#1f4e79',
        background_color: '#f4f5f7',
        display: 'standalone',
        lang: 'pt-BR',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Fotos dos alunos: a URL assinada aponta para um arquivo que não muda,
            // então CacheFirst. É o que garante a foto na tela sem rede, em sala.
            // Precisa vir antes da regra geral: a primeira que casar é a que vale.
            urlPattern: ({ url }) => url.href.includes('/storage/v1/object/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'fotos-alunos',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: ({ url }) => url.href.includes('supabase.co'),
            handler: 'NetworkFirst',
            options: { cacheName: 'supabase-api', networkTimeoutSeconds: 5 }
          }
        ]
      }
    })
  ]
})
