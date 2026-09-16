import React, { useEffect, useState } from 'react'
import { tocarConquista, somEscolhido, definirSom, SONS } from './lib/som'
import { INSIGNIAS, CATEGORIAS, TOTAL, POR_CHAVE, arte } from './lib/insignias'

/* Coleção do aluno: o que ele já sabe fazer.
   Bloqueadas aparecem em cinza com a regra à vista — a coleção mostra o caminho.
   Não somam pontos no ranking: insígnia é reconhecimento, não placar. */

const fmt = iso => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''

export function Vitrine({ minhas, onAbrir }) {
  const ultimas = minhas.slice(-5).reverse()
  return (
    <button className="vitrine" onClick={onAbrir}>
      <span className="vt-top"><b>Minhas insígnias</b><span className="vt-n">{minhas.length} de {TOTAL} ›</span></span>
      <span className="vt-fila">
        {ultimas.map(i => <img key={i.chave} src={arte(i.chave)} alt={POR_CHAVE[i.chave]?.nome || ''} />)}
        {ultimas.length === 0 && <span className="note" style={{ margin: 0 }}>Nenhuma ainda. Toque para ver as {TOTAL} e o que falta para cada uma.</span>}
      </span>
    </button>
  )
}

export function CartaoInsignia({ chave, dado, onFechar }) {
  const ins = POR_CHAVE[chave]
  useEffect(() => { if (ins) tocarConquista() }, [chave])
  if (!ins) return null
  return (
    <div className="velado" onClick={onFechar}>
      <div className="cartao-ins" onClick={e => e.stopPropagation()}>
        <img src={arte(chave, { tam: 256 })} alt="" />
        <div className="ci-top">Nova insígnia</div>
        <div className="ci-nome">{ins.nome}</div>
        {dado && <div className="ci-dado">{dado}</div>}
        <button className="btn" onClick={onFechar}>Ver coleção</button>
      </div>
    </div>
  )
}

export default function InsigniasAluno({ insignias }) {
  const lista = insignias.dados?.insignias || []
  const porChave = Object.fromEntries(lista.map(i => [i.chave, i]))
  const [aberta, setAberta] = useState(null)
  const [som, setSom] = useState(somEscolhido)

  return (
    <>
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>{lista.length} de {TOTAL}</h2>
        <p className="hint">Insígnia é reconhecimento do que você já sabe fazer. Não vale ponto no ranking das missões.</p>
        <label className="fld">🔔 Som ao ganhar uma insígnia</label>
        <div className="btnrow" style={{ marginTop: 0 }}>
          {SONS.map(([k, n]) => <button key={k} className={'btn ghost mini' + (som === k ? ' on' : '')} onClick={() => { definirSom(k); setSom(k); tocarConquista(k) }}>{n}</button>)}
          <button className={'btn ghost mini' + (som === '0' ? ' on' : '')} onClick={() => { definirSom('0'); setSom('0') }}>Sem som</button>
        </div>
      </div>
      {CATEGORIAS.map(([cat, nome, cor]) => {
        const doGrupo = INSIGNIAS.filter(i => i.cat === cat)
        return (
          <div className="panel" key={cat}>
            <h2 style={{ marginTop: 0, color: cor }}>{nome}</h2>
            <div className="ins-grade">
              {doGrupo.map(i => {
                const minha = porChave[i.k]
                return (
                  <button key={i.k} className={'ins-it' + (minha ? '' : ' trav')} onClick={() => setAberta(aberta === i.k ? null : i.k)}>
                    <img src={arte(i.k, { bloqueada: !minha })} alt="" />
                    <span>{i.nome}</span>
                    {minha && <span className="ins-data">{fmt(minha.em)}</span>}
                  </button>
                )
              })}
            </div>
            {doGrupo.some(i => i.k === aberta) && (() => {
              const i = POR_CHAVE[aberta], minha = porChave[aberta]
              return <div className="ins-detalhe">
                <b>{minha ? '✓ ' : '🔒 '}{i.nome}</b>
                <p>{minha ? (minha.dado || 'Conquistada.') : i.regra}</p>
                {minha && <p className="note">Conquistada em {fmt(minha.em)}{minha.origem === 'professora' ? ' · dada pela professora' : ''}</p>}
              </div>
            })()}
          </div>
        )
      })}
    </>
  )
}
