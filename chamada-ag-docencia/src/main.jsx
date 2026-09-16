import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Aluno from './Aluno.jsx'
import Escolha, { lerPerfil, gravarPerfil, alunoNoComputador, irParaAluno } from './Escolha.jsx'
import './styles.css'
import { EH_COMPUTADOR } from './lib/aparelho'
import { mesclarMarcos } from './lib/topo'
import { supabase } from './supabaseClient'

/* Quem entra por link com ?aula= (o QR projetado) ou por /aluno vai direto
   para a coleta. Fora isso, vale o perfil guardado no aparelho; sem perfil,
   aparecem os dois cards. Assim o mesmo PWA instalado abre como app do
   aluno ou da professora, conforme o aparelho. */
const porLink = location.pathname.replace(/\/+$/, '').endsWith('/aluno') ||
  new URLSearchParams(location.search).has('aula')

/* No computador não existe "aluno": a tela dele é para o celular (regra dela). Um perfil
   'aluno' guardado por engano, ou o link /aluno aberto no PC, cai na professora. O link
   com ?aula= (QR projetado) continua indo ao aluno — quem lê QR está no celular. */
const temAula = new URLSearchParams(location.search).has('aula')
function Raiz() {
  const [perfil, setPerfil] = React.useState(() => {
    if (EH_COMPUTADOR && !temAula) return alunoNoComputador() ? 'aluno' : 'professor'
    return porLink ? 'aluno' : lerPerfil()
  })
  if (perfil === 'aluno') return <Aluno />
  if (perfil === 'professor') return <App />
  return <Escolha onEscolher={p => { if (p === 'aluno' && EH_COMPUTADOR) { irParaAluno(true); return } gravarPerfil(p); setPerfil(p) }} />
}

/* Marcos cadastrados pela professora entram na lista antes da primeira tela (2,5 s no máximo; offline segue sem eles). */
const K_MARCOS = 'agc2_marcos_cache'
try { mesclarMarcos(JSON.parse(localStorage.getItem(K_MARCOS) || '[]')) } catch (e) {}
const carregarMarcos = Promise.race([
  supabase.rpc('marcos_publicos').then(({ data }) => { if (Array.isArray(data)) { mesclarMarcos(data); try { localStorage.setItem(K_MARCOS, JSON.stringify(data)) } catch (e) {} } }).catch(() => {}),
  new Promise(r => setTimeout(r, 2500))
])
carregarMarcos.finally(() => createRoot(document.getElementById('root')).render(<Raiz />))

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
