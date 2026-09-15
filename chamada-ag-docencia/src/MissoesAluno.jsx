import React, { useEffect, useState } from 'react'
import { fmtPrazo, marcarEtapa, enviarMissao, marcarVista, missaoVista } from './lib/alunoApi'

/* Missões do aluno: as que a professora lançou para a turma dele, com prazo,
   etapas (gravadas na hora), entrega, nível alcançado, devolutiva e ranking. */

const FRENTE = { planimetria: 'Planimetria', altimetria: 'Altimetria', planialtimetria: 'Planialtimetria', geral: 'Geral' }
const NIVEL = { ouro: '🥇 Ouro', prata: '🥈 Prata', bronze: '🥉 Bronze' }
const STATUS = { em_andamento: 'em andamento', enviada: 'enviada — aguardando a professora', aceita: 'aceita', refazer: 'refazer' }

export default function MissoesAluno({ ident, online, missoes }) {
  const { dados, carregando, recarregar } = missoes
  const [abertaId, setAbertaId] = useState(null)
  const [agora, setAgora] = useState(Date.now())
  useEffect(() => { const it = setInterval(() => setAgora(Date.now()), 30000); return () => clearInterval(it) }, [])

  const lista = dados?.missoes || []
  const atual = lista.find(m => m.lancamento_id === abertaId)
  if (atual) return <Detalhe m={atual} ident={ident} online={online} agora={agora} onVoltar={() => { setAbertaId(null); recarregar() }} recarregar={recarregar} />

  const abertas = lista.filter(m => m.aberta), encerradas = lista.filter(m => !m.aberta)
  const sem = dados?.semestre

  return (
    <>
      {sem && sem.podio && sem.podio.length > 0 && <div className="panel podio">
        <h2 style={{ marginTop: 0 }}>Ranking do semestre</h2>
        <div className="podio-row">{sem.podio.map((p, i) => <div key={i} className={'podio-it p' + i}><span className="pd-pos">{i + 1}º</span><span className="pd-nome">{p.nome}</span><span className="pd-pts">{p.pontos} pts</span></div>)}</div>
        <p className="note">{sem.meus_pontos > 0 ? <>Você tem <b>{sem.meus_pontos} pts</b> · {sem.minha_posicao}º de {sem.total}.</> : 'Complete uma missão para entrar no ranking.'} Ouro vale 3, prata 2, bronze 1.</p>
      </div>}

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Missões abertas</h2>
        {!dados && <p className="note">{carregando ? 'Carregando…' : online ? 'Não consegui carregar agora.' : 'Sem rede: as missões aparecem quando a conexão voltar.'}</p>}
        {dados && abertas.length === 0 && <p className="empty">Nenhuma missão aberta. A professora lança no dia da aula.</p>}
        {abertas.map(m => <CardMissao key={m.lancamento_id} m={m} agora={agora} onAbrir={() => { marcarVista(m.lancamento_id); setAbertaId(m.lancamento_id) }} />)}
      </div>

      {encerradas.length > 0 && <div className="panel">
        <h2 style={{ marginTop: 0 }}>Encerradas</h2>
        {encerradas.map(m => <CardMissao key={m.lancamento_id} m={m} agora={agora} onAbrir={() => setAbertaId(m.lancamento_id)} />)}
      </div>}
    </>
  )
}

function CardMissao({ m, agora, onAbrir }) {
  const pz = fmtPrazo(m.prazo_em, agora)
  const total = (m.etapas || []).length, feitas = Object.keys(m.minha?.etapas_feitas || {}).length
  const nova = m.aberta && !missaoVista(m.lancamento_id)
  return (
    <button className={'missao-card' + (pz.urgente ? ' urgente' : '') + (m.aberta ? '' : ' encerrada')} onClick={onAbrir}>
      <span className="mc-top"><span className="tag">{FRENTE[m.frente] || m.frente}</span>{nova && <span className="tag nova">nova</span>}{m.minha?.nivel && <span className="tag nivel">{NIVEL[m.minha.nivel]}</span>}</span>
      <span className="mc-tit">{m.titulo}</span>
      <span className="mc-sub">{pz.texto}{total ? ` · ${feitas}/${total} etapas` : ''}{m.minha?.status ? ` · ${STATUS[m.minha.status] || m.minha.status}` : ''}</span>
    </button>
  )
}

function Detalhe({ m, ident, online, agora, onVoltar, recarregar }) {
  const [feitas, setFeitas] = useState(m.minha?.etapas_feitas || {})
  const [texto, setTexto] = useState(m.minha?.texto || '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const pz = fmtPrazo(m.prazo_em, agora)
  const etapas = m.etapas || []
  const status = m.minha?.status
  const podeEditar = status !== 'aceita'

  async function toggle(i) {
    if (!online) { setMsg({ tipo: 'err', t: 'Sem rede: a etapa precisa de conexão para ficar gravada.' }); return }
    const agoraFeita = !feitas[i]
    setFeitas(f => { const n = { ...f }; if (agoraFeita) n[i] = new Date().toISOString(); else delete n[i]; return n })
    try { const r = await marcarEtapa(ident, m.lancamento_id, i, agoraFeita); setFeitas(r.etapas_feitas || {}) }
    catch (e) { setMsg({ tipo: 'err', t: e.message }); setFeitas(f => { const n = { ...f }; if (agoraFeita) delete n[i]; else n[i] = true; return n }) }
  }
  async function enviar() {
    setBusy(true); setMsg(null)
    try {
      const r = await enviarMissao(ident, m.lancamento_id, texto)
      setMsg(r.fora_do_prazo ? { tipo: 'dup', t: 'Enviada fora do prazo. Ficou registrada e a professora decide.' } : { tipo: 'ok', t: 'Missão enviada.' })
      recarregar()
    } catch (e) { setMsg({ tipo: 'err', t: e.message }) } finally { setBusy(false) }
  }

  const nFeitas = Object.keys(feitas).length
  return (
    <>
      <div className="panel">
        <div className="btnrow" style={{ marginTop: 0 }}><button className="btn ghost mini" onClick={onVoltar}>↩ Missões</button></div>
        <span className="tag">{FRENTE[m.frente] || m.frente}</span>
        <h2 style={{ marginTop: 6 }}>{m.titulo}</h2>
        <p className={'hint prazo' + (pz.urgente ? ' urgente' : '') + (pz.vencido ? ' vencido' : '')}>⏱ {pz.texto}</p>
        {m.descricao && <p style={{ whiteSpace: 'pre-wrap' }}>{m.descricao}</p>}
      </div>

      {etapas.length > 0 && <div className="panel">
        <h2 style={{ marginTop: 0 }}>Etapas · {nFeitas}/{etapas.length}</h2>
        <ul className="etapas">
          {etapas.map((e, i) => <li key={i} className={feitas[i] ? 'feita' : ''}>
            <label><input type="checkbox" checked={!!feitas[i]} disabled={!podeEditar} onChange={() => toggle(i)} /> <span>{e}</span></label>
          </li>)}
        </ul>
        <p className="note">Cada etapa marcada fica gravada no servidor na hora.</p>
      </div>}

      {m.niveis && (m.niveis.bronze || m.niveis.prata || m.niveis.ouro) && <div className="panel">
        <h2 style={{ marginTop: 0 }}>Níveis</h2>
        <ul className="niveis-lista">
          {['bronze', 'prata', 'ouro'].filter(k => m.niveis[k]).map(k => <li key={k} className={m.minha?.nivel === k ? 'meu' : ''}><b>{NIVEL[k]}</b> · {m.niveis[k]}</li>)}
        </ul>
      </div>}

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Entrega</h2>
        {m.entrega && <p className="hint">{m.entrega}</p>}
        {status && <p className="note">Situação: <b>{STATUS[status] || status}</b>{m.minha?.enviada_em ? ` · enviada ${new Date(m.minha.enviada_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}{m.minha?.fora_do_prazo ? ' · fora do prazo' : ''}</p>}
        {m.minha?.nivel && <p className="nivel-grande">{NIVEL[m.minha.nivel]}</p>}
        {m.minha?.devolutiva && <div className="devolutiva"><b>Devolutiva da professora</b><p>{m.minha.devolutiva}</p></div>}
        {podeEditar && <>
          <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={4} placeholder="Resultados, observações, nomes dos pins e poligonais que você usou…" />
          <div className="btnrow">
            <button className="btn" onClick={enviar} disabled={busy || !online}>{busy ? 'Enviando…' : status === 'enviada' || status === 'refazer' ? 'Enviar de novo' : 'Enviar missão'}</button>
          </div>
          {pz.vencido && <p className="note">O prazo passou. Ainda dá para enviar: fica marcado como fora do prazo e a professora decide.</p>}
        </>}
        {msg && <div className={'flash ' + msg.tipo} style={{ textAlign: 'left' }}>{msg.t}</div>}
      </div>

      {m.ranking && <div className="panel">
        <h2 style={{ marginTop: 0 }}>Ranking da missão</h2>
        <p className="hint">{m.ranking.enviadas} entrega(s) · 🥇 {m.ranking.ouro.length} · 🥈 {m.ranking.prata} · 🥉 {m.ranking.bronze}</p>
        {m.ranking.ouro.length > 0 && <p className="note">No ouro: <b>{m.ranking.ouro.join(', ')}</b></p>}
      </div>}
    </>
  )
}
