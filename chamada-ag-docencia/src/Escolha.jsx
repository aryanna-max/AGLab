import React from 'react'

/* Tela inicial: dois cards. A escolha fica guardada no aparelho, entao o
   aluno cai direto na coleta e a professora direto no login nas proximas
   vezes. Um link discreto permite trocar. */

export const PERFIL_KEY = 'agc2_perfil'
export function lerPerfil() { try { return localStorage.getItem(PERFIL_KEY) || '' } catch (e) { return '' } }
export function gravarPerfil(p) { try { if (p) localStorage.setItem(PERFIL_KEY, p); else localStorage.removeItem(PERFIL_KEY) } catch (e) {} }

/* No computador o app abre sempre na professora (regra dela: ninguém cai na tela do aluno por engano).
   Para testar a tela do aluno ali, "Sou aluno" liga um modo de teste que vale só para esta aba. */
const K_ALUNO_NO_PC = 'agc2_aluno_no_pc'
export const alunoNoComputador = () => { try { return sessionStorage.getItem(K_ALUNO_NO_PC) === '1' } catch (e) { return false } }
export function irParaAluno(ehComputador) {
  if (ehComputador) { try { sessionStorage.setItem(K_ALUNO_NO_PC, '1') } catch (e) {} }
  else gravarPerfil('aluno')
  location.href = '/'
}
export function irParaProfessora() {
  try { sessionStorage.removeItem(K_ALUNO_NO_PC) } catch (e) {}
  gravarPerfil('professor')
  location.href = '/'
}

export default function Escolha({ onEscolher }) {
  return (
    <div className="wrap">
      <div className="marca turma">
        <img className="marca-turma" src="/orbe-turma.png" width="1120" height="606"
             alt="A turma do Orbe: Orbe, Vértice, Navi, Lumi e Téo" />
        <h1 className="marca-nome">Orbe</h1>
        <p className="marca-sub">Topografia · IFPE</p>
      </div>

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
