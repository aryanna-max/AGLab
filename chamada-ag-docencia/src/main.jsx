import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(<App />)

/* Atualização do app.

   O skipWaiting faz o service worker novo ativar assim que é instalado —
   mas o navegador só descobre que existe versão nova numa navegação. No
   iPhone, retomar o app pelo seletor de apps não conta como navegação, e o
   aparelho fica preso numa versão antiga indefinidamente (aconteceu em
   10/09: servidor com a v11:31 e o celular rodando a v11:10).

   Aqui o app passa a perguntar por conta própria: ao abrir, sempre que
   volta ao primeiro plano, e de minuto em minuto. Quando o SW novo assume,
   recarrega a página uma vez para o código novo entrar em memória. */
if ('serviceWorker' in navigator) {
  const jaControlado = !!navigator.serviceWorker.controller
  let recarregando = false

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!jaControlado || recarregando) return   // na 1a instalação não recarrega
    recarregando = true
    location.reload()
  })

  navigator.serviceWorker.ready.then(reg => {
    const checa = () => { reg.update().catch(() => {}) }
    checa()
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checa() })
    window.addEventListener('focus', checa)
    setInterval(checa, 60 * 1000)
  }).catch(() => {})
}
