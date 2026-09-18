/* Avisos da professora com o app fechado (Web Push).
   Importado pelo service worker gerado pelo Workbox (vite.config.js → workbox.importScripts). */

self.addEventListener('push', event => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch (e) { d = { texto: event.data ? event.data.text() : '' } }
  const titulo = d.titulo || 'Orbe'
  /* Som: com o app FECHADO quem toca é o sistema, e a web não escolhe qual —
     a propriedade `sound` da Notification nunca foi implementada em navegador
     nenhum. O que dá para assinar aqui é a vibração, no mesmo padrão da
     conquista. Com o app ABERTO, a página toca o Radar (postMessage abaixo). */
  event.waitUntil(Promise.all([
    self.registration.showNotification(titulo, {
      body: d.texto || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: d.tag || undefined,
      data: { url: d.url || '/' },
      vibrate: [25, 40, 70],
      lang: 'pt-BR',
    }),
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(js => js.forEach(j => j.postMessage({ tipo: 'orbe-aviso' })))
      .catch(() => {}),
  ]))
})

// Toque no aviso: se o app já está aberto, leva à tela certa; senão abre o app nela.
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin)
  const abrir = url.searchParams.get('abrir') || 'home'
  event.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const aberta = janelas.find(w => new URL(w.url).origin === self.location.origin)
    if (aberta) {
      aberta.postMessage({ tipo: 'orbe-abrir', abrir })
      return aberta.focus()
    }
    return self.clients.openWindow(url.href)
  })())
})
