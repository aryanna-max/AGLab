import React from 'react'
import { createRoot } from 'react-dom/client'
import '../src/styles.css'
import { MainParaTeste as Main } from '../src/App.jsx'

// Mostra o erro no topo da página, com as linhas do stack que apontam para o nosso código.
window.addEventListener('error', e => {
  const stack = (e.error && e.error.stack) ? e.error.stack.split('\n').filter(l => /App\.jsx|Orbe\.jsx|Analise\.jsx|Radar\.jsx|topo\.js|store/.test(l)).slice(0, 5).join('\n') : ''
  document.body.insertAdjacentHTML('afterbegin', '<pre style="color:red;background:#fff;padding:8px;white-space:pre-wrap">ERRO: ' + e.message + '\n' + stack + '</pre>')
})

createRoot(document.getElementById('root')).render(<Main session={{ user: { id: 'prof' } }} />)
