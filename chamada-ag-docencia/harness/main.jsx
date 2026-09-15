import React from 'react'
import { createRoot } from 'react-dom/client'
import '../src/styles.css'
import { MainParaTeste as Main } from '../src/App.jsx'
window.addEventListener('error', e => { document.body.insertAdjacentHTML('afterbegin', '<pre style="color:red;background:#fff;padding:8px">ERRO: ' + e.message + '</pre>') })
createRoot(document.getElementById('root')).render(<Main session={{ user: { id: 'prof' } }} />)
