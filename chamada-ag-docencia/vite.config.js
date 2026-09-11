import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Carimbo da build, exibido no cabeçalho. Serve para saber, olhando o
// aparelho, qual versão o service worker está de fato servindo.
// (a build roda em UTC na Vercel; -3 h para bater com o relógio de Recife)
const BUILD_ID = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(5, 16).replace('T', ' ')

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-192-maskable.png', 'icon-512-maskable.png', 'apple-touch-icon.png', 'orbe-mascote.png', 'orbe-icone-sem-fundo.png'],
      manifest: {
        name: 'Orbe',
        short_name: 'Orbe',
        description: 'Orbe — chamada por QR, posição GNSS e campo no celular · Topografia IFPE',
        theme_color: '#1f4e79',
        background_color: '#f4f5f7',
        display: 'standalone',
        lang: 'pt-BR',
        start_url: '/',
        icons: [
          // sem fundo: é assim que o ícone aparece onde o sistema não recorta
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // maskable: o Android recorta em círculo e exige o canvas preenchido
          { src: 'icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: 'index.html',
        // Sem isto, o SW novo fica "waiting" e o aparelho continua rodando a
        // versão antiga até todas as abas serem fechadas — foi o que aconteceu
        // no teste de 10/09: a correção estava no ar e o celular servia o cache.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
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
