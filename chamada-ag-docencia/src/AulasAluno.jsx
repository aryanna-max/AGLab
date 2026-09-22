import React, { useEffect, useRef, useState } from 'react'
import { carregarAula, aulaGuardada, marcarLeitura, fmtData } from './lib/alunoApi'

/* Material de aula do aluno: a HQ, os cartões do assunto e a ficha de campo.
   Um conceito por tela — o formato é cartão, não documento. A aula que ele já
   abriu fica no celular, porque material que some sem rede não está à mão. */

const FRENTE = { planimetria: 'Planimetria', altimetria: 'Altimetria', planialtimetria: 'Planialtimetria', geral: 'Geral' }

/* ---------- markdown do tamanho que os cartões usam ---------- */
/* Negrito, lista com traço e lista numerada. Nada além disso: um cartão que
   precisasse de mais markdown já não caberia numa tela, que é o limite real. */
function negrito(txt, chave) {
  const partes = String(txt).split(/(\*\*[^*]+\*\*)/g)
  return partes.map((p, i) => p.startsWith('**') && p.endsWith('**')
    ? <b key={chave + '-' + i}>{p.slice(2, -2)}</b>
    : <React.Fragment key={chave + '-' + i}>{p}</React.Fragment>)
}

function Texto({ md }) {
  const blocos = String(md || '').split(/\n{2,}/).filter(b => b.trim())
  return <>{blocos.map((b, i) => {
    const linhas = b.split('\n')
    if (linhas.every(l => /^\s*-\s+/.test(l)))
      return <ul key={i}>{linhas.map((l, j) => <li key={j}>{negrito(l.replace(/^\s*-\s+/, ''), i + '.' + j)}</li>)}</ul>
    if (linhas.every(l => /^\s*\d+\.\s+/.test(l)))
      return <ol key={i}>{linhas.map((l, j) => <li key={j}>{negrito(l.replace(/^\s*\d+\.\s+/, ''), i + '.' + j)}</li>)}</ol>
    return <p key={i}>{linhas.map((l, j) => <React.Fragment key={j}>{j > 0 && <br />}{negrito(l, i + '.' + j)}</React.Fragment>)}</p>
  })}</>
}

/* ---------- lista ---------- */
export default function AulasAluno({ ident, online, aulas, abrirId }) {
  const { dados, carregando, recarregar } = aulas
  const [abertaId, setAbertaId] = useState(abrirId || null)
  useEffect(() => { if (abrirId) setAbertaId(abrirId) }, [abrirId])

  if (abertaId) return <Aula ident={ident} online={online} lancamentoId={abertaId}
    onVoltar={() => { setAbertaId(null); recarregar() }} />

  const lista = dados?.aulas || []
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Aulas</h2>
      {!dados && <p className="note">{carregando ? 'Carregando…' : online ? 'Não consegui carregar agora.' : 'Sem rede: as aulas aparecem quando a conexão voltar.'}</p>}
      {dados && lista.length === 0 && <p className="empty">Nenhuma aula publicada ainda.</p>}
      {lista.map(a => <button key={a.lancamento_id} className="missao-card" onClick={() => setAbertaId(a.lancamento_id)}>
        <span className="mc-top">
          <span className="tag">{FRENTE[a.frente] || a.frente}</span>
          {a.tem_hq && <span className="tag">HQ</span>}
          {a.li > 0 && <span className="tag nivel">{a.li >= a.pecas ? 'lida' : 'comecei'}</span>}
        </span>
        <span className="mc-tit">{a.numero ? `Aula ${a.numero} · ` : ''}{a.titulo}</span>
        <span className="mc-sub">{a.data ? fmtData(a.data) : ''}{a.resumo ? (a.data ? ' · ' : '') + a.resumo : ''}</span>
      </button>)}
    </div>
  )
}

/* ---------- uma aula ---------- */
function Aula({ ident, online, lancamentoId, onVoltar }) {
  const [aula, setAula] = useState(() => aulaGuardada(lancamentoId))
  const [erro, setErro] = useState('')
  const [parte, setParte] = useState('capa')   // capa | hq | cartoes | ficha

  useEffect(() => {
    let vivo = true
    carregarAula(ident, lancamentoId)
      .then(d => { if (vivo) setAula(d) })
      .catch(e => { if (vivo && !aulaGuardada(lancamentoId)) setErro(e.message) })
    return () => { vivo = false }
  }, [lancamentoId])

  if (!aula) return <div className="panel">
    <h2 style={{ marginTop: 0 }}>Aula</h2>
    <p className="note">{erro || (online ? 'Abrindo…' : 'Sem rede, e esta aula ainda não está guardada no celular.')}</p>
    <button className="btn ghost" onClick={onVoltar}>Voltar</button>
  </div>

  const pecas = aula.pecas || []
  const hq = pecas.filter(p => p.tipo === 'hq')
  const cartoes = pecas.filter(p => p.tipo === 'cartao')
  const ficha = pecas.find(p => p.tipo === 'ficha')

  if (parte === 'hq') return <HQ quadros={hq} ident={ident} lancamentoId={lancamentoId} onVoltar={() => setParte('capa')} />
  if (parte === 'cartoes') return <Cartoes cartoes={cartoes} ident={ident} lancamentoId={lancamentoId} onVoltar={() => setParte('capa')} />
  if (parte === 'ficha') return <Cartoes cartoes={[ficha]} ident={ident} lancamentoId={lancamentoId} onVoltar={() => setParte('capa')} titulo="Ficha de campo" />

  const lidos = cartoes.filter(c => c.lida).length
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>{aula.numero ? `Aula ${aula.numero} · ` : ''}{aula.titulo}</h2>
      {aula.resumo && <p className="hint">{aula.resumo}</p>}

      <div className="aula-portas">
        {hq.length > 0 && <button className="card-perfil" onClick={() => setParte('hq')}>
          <span className="cp-emoji">💬</span><span className="cp-tit">HQ</span>
          <span className="cp-sub">{hq.length} quadros · comece por aqui</span>
        </button>}
        {cartoes.length > 0 && <button className="card-perfil" onClick={() => setParte('cartoes')}>
          <span className="cp-emoji">🗂️</span><span className="cp-tit">O assunto</span>
          <span className="cp-sub">{cartoes.length} cartões{lidos > 0 ? ` · você leu ${lidos}` : ''}</span>
        </button>}
        {ficha && <button className="card-perfil ficha" onClick={() => setParte('ficha')}>
          <span className="cp-emoji">📋</span><span className="cp-tit">Ficha de campo</span>
          <span className="cp-sub">{ficha.titulo || 'o passo a passo, para abrir em campo'}</span>
        </button>}
      </div>

      {!online && <p className="note">Sem rede: esta aula está guardada no celular.</p>}
      <button className="btn ghost" onClick={onVoltar}>Voltar</button>
    </div>
  )
}

/* ---------- a HQ: um quadro por vez, rolagem vertical ---------- */
function HQ({ quadros, ident, lancamentoId, onVoltar }) {
  useEffect(() => { if (quadros[0]) marcarLeitura(ident, lancamentoId, quadros[0].id) }, [lancamentoId])
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>HQ</h2>
      <div className="hq-tira">
        {quadros.map((q, i) => <img key={q.id} src={q.url} alt={`Quadro ${i + 1}`}
          width={q.largura || undefined} height={q.altura || undefined}
          loading={i < 2 ? 'eager' : 'lazy'} decoding="async"
          onLoad={() => marcarLeitura(ident, lancamentoId, q.id)} />)}
      </div>
      <button className="btn ghost" onClick={onVoltar}>Voltar</button>
    </div>
  )
}

/* ---------- os cartões: um conceito por tela ---------- */
function Cartoes({ cartoes, ident, lancamentoId, onVoltar, titulo }) {
  // abre onde o aluno parou: o primeiro que ele ainda não leu
  const inicio = Math.max(0, cartoes.findIndex(c => !c.lida))
  const [i, setI] = useState(inicio === -1 ? 0 : inicio)
  const marcados = useRef({})
  const atual = cartoes[i]

  useEffect(() => {
    if (!atual || marcados.current[atual.id]) return
    marcados.current[atual.id] = true
    marcarLeitura(ident, lancamentoId, atual.id)
  }, [atual && atual.id])

  if (!atual) return <div className="panel"><p className="empty">Nada aqui ainda.</p>
    <button className="btn ghost" onClick={onVoltar}>Voltar</button></div>

  const unico = cartoes.length === 1
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>{titulo || 'O assunto'}</h2>
      <div className="cartao-aula">
        {atual.titulo && <h3>{atual.titulo}</h3>}
        <Texto md={atual.texto_md} />
      </div>

      {!unico && <>
        <div className="cartao-pontos">
          {cartoes.map((c, j) => <span key={c.id} className={'cp-ponto' + (j === i ? ' atual' : '') + (c.lida ? ' lido' : '')} onClick={() => setI(j)} />)}
        </div>
        <div className="btnrow">
          <button className="btn ghost" onClick={() => setI(x => Math.max(0, x - 1))} disabled={i === 0}>Anterior</button>
          <span className="note" style={{ alignSelf: 'center' }}>{i + 1} de {cartoes.length}</span>
          {i < cartoes.length - 1
            ? <button className="btn" onClick={() => setI(x => x + 1)}>Próximo</button>
            : <button className="btn" onClick={onVoltar}>Terminei</button>}
        </div>
      </>}
      {unico && <button className="btn ghost" onClick={onVoltar}>Voltar</button>}
    </div>
  )
}
