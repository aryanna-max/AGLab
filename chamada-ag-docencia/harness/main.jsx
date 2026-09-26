import React from 'react'
import { createRoot } from 'react-dom/client'
import '../src/styles.css'
import { MainParaTeste as Main } from '../src/App.jsx'
import Aluno from '../src/Aluno.jsx'
import Instalar from '../src/Instalar.jsx'
import { supabase } from './supabase-mock.js'
import { mesclarMarcos } from '../src/lib/topo'

// como o main.jsx de verdade: os marcos cadastrados entram na lista (o P1, no mock)
supabase.rpc('marcos_publicos').then(({ data }) => { if (Array.isArray(data)) mesclarMarcos(data) })

// Mostra o erro no topo da página, com as linhas do stack que apontam para o nosso código.
window.addEventListener('error', e => {
  const stack = (e.error && e.error.stack) ? e.error.stack.split('\n').filter(l => /App\.jsx|Orbe\.jsx|Analise\.jsx|Radar\.jsx|topo\.js|store/.test(l)).slice(0, 5).join('\n') : ''
  document.body.insertAdjacentHTML('afterbegin', '<pre style="color:red;background:#fff;padding:8px;white-space:pre-wrap">ERRO: ' + e.message + '\n' + stack + '</pre>')
})

if (location.search.includes('aluno')) { try { localStorage.setItem('agc2_ident', JSON.stringify({ alunoId: 'x', matricula: '20231F61RC0280', nome: 'Alice', turma: 'F61RC', turmaId: 't', temFoto: true })) } catch (e) {} }
createRoot(document.getElementById('root')).render(location.search.includes('instalar') ? <Instalar /> : location.search.includes('aluno') ? <Aluno /> : <Main session={{ user: { id: 'prof' } }} />)
