import React from 'react'

/* Tela inicial: dois cards. A escolha fica guardada no aparelho, entao o
   aluno cai direto na coleta e a professora direto no login nas proximas
   vezes. Um link discreto permite trocar. */

export const PERFIL_KEY = 'agc2_perfil'
export function lerPerfil() { try { return localStorage.getItem(PERFIL_KEY) || '' } catch (e) { return '' } }
export function gravarPerfil(p) { try { if (p) localStorage.setItem(PERFIL_KEY, p); else localStorage.removeItem(PERFIL_KEY) } catch (e) {} }

export default function Escolha({ onEscolher }) {
  return (
    <div className="wrap">
      <header className="app">
        <h1>Topografia · IFPE</h1><span className="sub">AG Docência</span>
      </header>

      <div className="escolha">
        <button className="card-perfil" onClick={() => onEscolher('aluno')}>
          <span className="cp-emoji">🛰️</span>
          <span className="cp-tit">Sou aluno</span>
          <span className="cp-sub">Entro com o código da aula e a minha matrícula. Sem senha.</span>
        </button>

        <button className="card-perfil" onClick={() => onEscolher('professor')}>
          <span className="cp-emoji">📋</span>
          <span className="cp-tit">Sou professor(a)</span>
          <span className="cp-sub">Chamada, fotos, coleta da turma e posição GNSS.</span>
        </button>
      </div>

      <p className="note" style={{ textAlign: 'center' }}>Dá para trocar depois, no rodapé de cada tela.</p>
    </div>
  )
}
