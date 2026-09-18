/* Avisos da professora com o app fechado (Web Push).
   Importado pelo service worker gerado pelo Workbox (vite.config.js → workbox.importScripts). */

self.addEventListener('push', event => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch (e) { d = { texto: event.data ? event.data.text() : '' } }
  const titulo = d.titulo || 'Orbe'
  /* Som do aviso.

     Com o app FECHADO quem toca é o sistema, e a web não escolhe qual: a
     propriedade `sound` da Notification nunca foi implementada em navegador
     nenhum. Dá para assinar a vibração, e ela vai no padrão da conquista.

     Com o app ABERTO é diferente: aqui a página consegue tocar o Radar. Mas
     se a notificação também tocasse, sairiam dois sons ao mesmo tempo — e o
     do sistema, mais alto, cobriria o Radar. Então quando há janela visível
     a notificação vai SILENCIOSA e quem toca é o app. `userVisibleOnly`
     continua satisfeito: a notificação aparece, só não faz barulho. */
  event.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true }).catch(() => [])
    const visivel = janelas.some(j => j.visibilityState === 'visible')
    // só a janela que está na tela toca: em segundo plano quem avisa é o sistema,
    // e o Radar por cima seria um segundo som para a mesma coisa
    janelas.filter(j => j.visibilityState === 'visible')
           .forEach(j => { try { j.postMessage({ tipo: 'orbe-aviso' }) } catch (e) {} })
    return self.registration.showNotification(titulo, {
      body: d.texto || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: d.tag || undefined,
      data: { url: d.url || '/' },
      silent: visivel,                       // o app aberto toca o Radar; o sistema fica quieto
      vibrate: visivel ? undefined : [25, 40, 70],
      lang: 'pt-BR',
    })
  })())
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
