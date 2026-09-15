import React, { useCallback, useEffect, useMemo, useState } from 'react'
import * as store from './lib/store'
import { FRENTES, CARDAPIO_SUGERIDO } from './lib/cardapioMissoes'

/* Missões — lado da professora.
   Cardápio: biblioteca dela, sem turma. Lançar: escolhe a missão, qualquer turma, prazo
   (fim da aula de hoje ou data/hora). Entregas: por lançamento da turma escolhida no topo,
   com nível, devolutiva e decisão. Ranking do semestre da turma. */

const NOME_FRENTE = Object.fromEntries(FRENTES)
const NIVEIS = [['', '—'], ['bronze', '🥉 Bronze'], ['prata', '🥈 Prata'], ['ouro', '🥇 Ouro']]
const PONTOS = { bronze: 1, prata: 2, ouro: 3 }
const fmtDH = iso => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const vazio = () => ({ titulo: '', frente: 'planimetria', descricao: '', etapas: [''], entrega: '', niveis: { bronze: '', prata: '', ouro: '' } })

export default function MissoesProfessora({ userId, tid, turmas, online, showToast }) {
  const [aba, setAba] = useState('entregas')   // entregas | cardapio
  const [missoes, setMissoes] = useState([])
  const carregar = useCallback(() => { if (online) store.listarMissoes().then(setMissoes).catch(e => showToast('Erro: ' + e.message)) }, [online, showToast])
  useEffect(() => { carregar() }, [carregar])
  const turma = turmas.find(t => t.id === tid)

  return (
    <>
      <nav className="tabs" style={{ marginBottom: 10 }}>
        <button className={aba === 'entregas' ? 'active' : ''} onClick={() => setAba('entregas')}>Lançadas · {turma?.nome?.split(' (')[0] || 'turma'}</button>
        <button className={aba === 'cardapio' ? 'active' : ''} onClick={() => setAba('cardapio')}>Cardápio ({missoes.filter(m => !m.arquivada).length})</button>
      </nav>
      {!online && <p className="note" style={{ color: 'var(--miss)' }}>Offline — as missões precisam de internet.</p>}
      {aba === 'cardapio'
        ? <Cardapio userId={userId} missoes={missoes} turmas={turmas} tid={tid} recarregar={carregar} showToast={showToast} onLancou={() => setAba('entregas')} />
        : <Lancadas userId={userId} tid={tid} turma={turma} online={online} showToast={showToast} irCardapio={() => setAba('cardapio')} />}
    </>
  )
}

/* ================= CARDÁPIO ================= */
function Cardapio({ userId, missoes, turmas, tid, recarregar, showToast, onLancou }) {
  const [editando, setEditando] = useState(null)
  const [lancando, setLancando] = useState(null)
  const [filtro, setFiltro] = useState('')
  const [verArquivadas, setVerArquivadas] = useState(false)
  const [busy, setBusy] = useState(false)

  async function importar() {
    setBusy(true)
    try { await store.importarCardapio(userId, CARDAPIO_SUGERIDO); showToast(`${CARDAPIO_SUGERIDO.length} missões importadas`); recarregar() }
    catch (e) { showToast('Erro: ' + e.message) } finally { setBusy(false) }
  }

  if (editando) return <EditorMissao userId={userId} inicial={editando} onFechar={salvou => { setEditando(null); if (salvou) recarregar() }} showToast={showToast} />
  if (lancando) return <Lancar userId={userId} missao={lancando} turmas={turmas} tid={tid} showToast={showToast} onFechar={ok => { setLancando(null); if (ok) onLancou() }} />

  const lista = missoes.filter(m => (verArquivadas || !m.arquivada) && (!filtro || m.frente === filtro))
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Cardápio de missões</h2>
      <p className="hint">A sua biblioteca. As missões não pertencem a nenhuma turma: escolha uma e lance para a turma que quiser, no dia da aula.</p>
      <div className="btnrow">
        <button className="btn" onClick={() => setEditando(vazio())}>+ Nova missão</button>
        {missoes.length === 0 && <button className="btn ghost" onClick={importar} disabled={busy}>{busy ? 'Importando…' : `Importar cardápio sugerido (${CARDAPIO_SUGERIDO.length})`}</button>}
      </div>
      <div className="btnrow" style={{ alignItems: 'center' }}>
        <button className={'btn ghost mini' + (!filtro ? ' on' : '')} onClick={() => setFiltro('')}>todas</button>
        {FRENTES.map(([k, l]) => <button key={k} className={'btn ghost mini' + (filtro === k ? ' on' : '')} onClick={() => setFiltro(k)}>{l}</button>)}
        <label className="chk-inline"><input type="checkbox" checked={verArquivadas} onChange={e => setVerArquivadas(e.target.checked)} /> arquivadas</label>
      </div>
      {lista.length === 0 ? <p className="empty">Nenhuma missão aqui ainda.</p> :
        <ul className="people">
          {lista.map(m => <li key={m.id} style={{ alignItems: 'flex-start' }}>
            <span className="left"><span className="who"><span><span className="tag" style={{ marginRight: 6 }}>{NOME_FRENTE[m.frente] || m.frente}</span>{m.titulo}{m.arquivada ? ' · arquivada' : ''}</span>
              <span className="m">{(m.etapas || []).length} etapa(s){m.entrega ? ' · ' + m.entrega.slice(0, 90) + (m.entrega.length > 90 ? '…' : '') : ''}</span></span></span>
            <span className="btnrow" style={{ margin: 0, flexWrap: 'nowrap' }}>
              {!m.arquivada && <button className="btn mini" onClick={() => setLancando(m)}>Lançar</button>}
              <button className="btn ghost mini" onClick={() => setEditando(m)}>Editar</button>
              <button className="btn ghost mini" onClick={() => setEditando({ ...m, id: undefined, titulo: m.titulo + ' (cópia)' })}>Duplicar</button>
            </span>
          </li>)}
        </ul>}
    </div>
  )
}

function EditorMissao({ userId, inicial, onFechar, showToast }) {
  const [m, setM] = useState(() => ({ ...vazio(), ...inicial, etapas: (inicial.etapas && inicial.etapas.length ? inicial.etapas : ['']), niveis: { bronze: '', prata: '', ouro: '', ...(inicial.niveis || {}) } }))
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setM(x => ({ ...x, [k]: v }))
  async function salvar(extra = {}) {
    if (!m.titulo.trim()) { showToast('Dê um título à missão'); return }
    setBusy(true)
    try { await store.salvarMissao(userId, { ...m, ...extra }); showToast('Missão salva'); onFechar(true) }
    catch (e) { showToast('Erro: ' + e.message) } finally { setBusy(false) }
  }
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>{m.id ? 'Editar missão' : 'Nova missão'}</h2>
      <div className="row">
        <div style={{ flex: 3, minWidth: 220 }}><label className="fld">Título</label><input value={m.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Caça ao azimute" /></div>
        <div style={{ flex: 1, minWidth: 160 }}><label className="fld">Frente</label>
          <select value={m.frente} onChange={e => set('frente', e.target.value)}>{FRENTES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      </div>
      <label className="fld">O que é a missão</label>
      <textarea rows={3} value={m.descricao || ''} onChange={e => set('descricao', e.target.value)} placeholder="Contexto e objetivo, em linguagem direta." />
      <label className="fld">Etapas (o aluno marca cada uma, e fica gravado)</label>
      {m.etapas.map((e, i) => <div key={i} className="row" style={{ marginBottom: 6 }}>
        <div style={{ flex: 1 }}><input value={e} onChange={ev => set('etapas', m.etapas.map((x, j) => j === i ? ev.target.value : x))} placeholder={`Etapa ${i + 1}`} /></div>
        <div style={{ flex: 0 }}><button className="btn ghost mini" onClick={() => set('etapas', m.etapas.filter((_, j) => j !== i))} disabled={m.etapas.length === 1}>✕</button></div>
      </div>)}
      <div className="btnrow" style={{ marginTop: 0 }}><button className="btn ghost mini" onClick={() => set('etapas', [...m.etapas, ''])}>+ etapa</button></div>
      <label className="fld">O que o aluno entrega</label>
      <textarea rows={2} value={m.entrega || ''} onChange={e => set('entrega', e.target.value)} placeholder="Ex.: erro de fechamento e comparação com a tolerância." />
      <label className="fld">Níveis</label>
      {['bronze', 'prata', 'ouro'].map(k => <div key={k} className="row" style={{ marginBottom: 6, alignItems: 'center' }}>
        <div style={{ flex: 0, minWidth: 90 }}><b>{k === 'ouro' ? '🥇 Ouro' : k === 'prata' ? '🥈 Prata' : '🥉 Bronze'}</b></div>
        <div style={{ flex: 1 }}><input value={m.niveis[k] || ''} onChange={e => set('niveis', { ...m.niveis, [k]: e.target.value })} placeholder={k === 'bronze' ? 'Cumpriu no prazo, etapas completas' : k === 'prata' ? 'Dentro da tolerância' : 'Tolerância apertada ou conferência extra'} /></div>
      </div>)}
      <div className="btnrow">
        <button className="btn" onClick={() => salvar()} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
        <button className="btn ghost" onClick={() => onFechar(false)}>Cancelar</button>
        {m.id && <button className="btn ghost" onClick={() => salvar({ arquivada: !m.arquivada })} disabled={busy}>{m.arquivada ? 'Desarquivar' : 'Arquivar'}</button>}
        {m.id && <button className="btn danger mini" disabled={busy} onClick={async () => { if (!confirm('Apagar a missão e todos os lançamentos e entregas dela?')) return; await store.apagarMissao(m.id); showToast('Missão apagada'); onFechar(true) }}>Apagar</button>}
      </div>
    </div>
  )
}

function Lancar({ userId, missao, turmas, tid, showToast, onFechar }) {
  const [turmaId, setTurmaId] = useState(tid)
  const [tipo, setTipo] = useState('aula')
  const [janela, setJanela] = useState(undefined)
  const [data, setData] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10) })
  const [hora, setHora] = useState('23:59')
  const [ranking, setRanking] = useState(true)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setJanela(undefined); store.janelaDeHoje(turmaId).then(setJanela).catch(() => setJanela(null)) }, [turmaId])

  const prazo = tipo === 'aula' ? (janela ? janela.janela_fim : null) : new Date(`${data}T${hora}:00`).toISOString()
  async function lancar() {
    if (!prazo) { showToast('Defina o prazo'); return }
    setBusy(true)
    try {
      await store.lancarMissao(userId, { missao_id: missao.id, turma_id: turmaId, prazo_tipo: tipo, prazo_em: prazo, mostrar_ranking: ranking })
      showToast('Missão lançada'); onFechar(true)
    } catch (e) { showToast('Erro: ' + e.message) } finally { setBusy(false) }
  }
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Lançar: {missao.titulo}</h2>
      <label className="fld">Para qual turma</label>
      <select value={turmaId} onChange={e => setTurmaId(e.target.value)}>{turmas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</select>
      <label className="fld">Prazo</label>
      <div className="btnrow" style={{ marginTop: 0 }}>
        <button className={'btn ghost mini' + (tipo === 'aula' ? ' on' : '')} onClick={() => setTipo('aula')}>Até o fim da aula de hoje</button>
        <button className={'btn ghost mini' + (tipo === 'data' ? ' on' : '')} onClick={() => setTipo('data')}>Data e hora</button>
      </div>
      {tipo === 'aula' && <p className="note">{janela === undefined ? 'Conferindo a aula de hoje…' : janela ? <>Aula de hoje até <b>{fmtDH(janela.janela_fim)}</b> (código {janela.codigo}).</> : <span style={{ color: 'var(--miss)' }}>Esta turma não tem aula aberta hoje. Abra a aula na aba Chamada ou escolha data e hora.</span>}</p>}
      {tipo === 'data' && <div className="row">
        <div><label className="fld">Data</label><input type="date" value={data} onChange={e => setData(e.target.value)} /></div>
        <div><label className="fld">Hora</label><input type="time" value={hora} onChange={e => setHora(e.target.value)} /></div>
      </div>}
      <label className="chk-inline" style={{ marginTop: 10 }}><input type="checkbox" checked={ranking} onChange={e => setRanking(e.target.checked)} /> mostrar ranking desta missão para a turma</label>
      <div className="btnrow">
        <button className="btn" onClick={lancar} disabled={busy || !prazo}>{busy ? 'Lançando…' : 'Lançar para a turma'}</button>
        <button className="btn ghost" onClick={() => onFechar(false)}>Cancelar</button>
      </div>
      <p className="note">Entrega depois do prazo não é bloqueada: fica marcada como fora do prazo, e você decide.</p>
    </div>
  )
}

/* ================= LANÇADAS + ENTREGAS + RANKING ================= */
function Lancadas({ userId, tid, turma, online, showToast, irCardapio }) {
  const [lancs, setLancs] = useState([])
  const [entregas, setEntregas] = useState([])
  const [aberto, setAberto] = useState(null)
  const carregar = useCallback(() => {
    if (!online || !tid) return
    Promise.all([store.lancamentosDaTurma(tid), store.entregasDaTurma(tid)]).then(([l, e]) => { setLancs(l); setEntregas(e) }).catch(e => showToast('Erro: ' + e.message))
  }, [tid, online, showToast])
  useEffect(() => { carregar(); setAberto(null) }, [carregar])
  useEffect(() => { const it = setInterval(carregar, 20000); return () => clearInterval(it) }, [carregar])

  const ranking = useMemo(() => {
    const pts = {}
    entregas.forEach(e => { if (e.missao_lancamentos?.mostrar_ranking && e.nivel) pts[e.aluno_id] = (pts[e.aluno_id] || 0) + (PONTOS[e.nivel] || 0) })
    return (turma?.alunos || []).map(a => ({ a, pts: pts[a.id] || 0 })).filter(x => x.pts > 0).sort((x, y) => y.pts - x.pts)
  }, [entregas, turma])

  if (!turma) return null
  const lanc = lancs.find(l => l.id === aberto)
  if (lanc) return <Entregas userId={userId} lanc={lanc} turma={turma} entregas={entregas.filter(e => e.lancamento_id === lanc.id)} showToast={showToast} onVoltar={() => { setAberto(null); carregar() }} recarregar={carregar} />

  return (
    <>
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Missões lançadas · {turma.nome}</h2>
        {lancs.length === 0 ? <p className="empty">Nenhuma missão lançada para esta turma. <span style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={irCardapio}>Abrir o cardápio</span>.</p> :
          <div className="scrollx"><table className="matrix"><thead><tr><th className="nm">Missão</th><th>prazo</th><th>enviadas</th><th>fora do prazo</th><th>avaliadas</th><th>estado</th></tr></thead>
            <tbody>{lancs.map(l => { const es = entregas.filter(e => e.lancamento_id === l.id); const aberta = !l.encerrado && new Date(l.prazo_em) > new Date()
              return <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => setAberto(l.id)}>
                <td className="nm">{l.missoes?.titulo}</td><td>{fmtDH(l.prazo_em)}</td>
                <td>{es.filter(e => e.enviada_em).length}/{turma.alunos.length}</td>
                <td className={es.some(e => e.fora_do_prazo) ? 'F' : ''}>{es.filter(e => e.fora_do_prazo).length}</td>
                <td>{es.filter(e => e.nivel).length}</td>
                <td className={aberta ? 'P' : ''}>{aberta ? 'aberta' : 'encerrada'}</td>
              </tr> })}</tbody></table></div>}
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Ranking do semestre</h2>
        {ranking.length === 0 ? <p className="empty">Ninguém pontuou ainda. Ouro vale 3, prata 2, bronze 1.</p> : <>
          <div className="podio-row">{ranking.slice(0, 3).map((x, i) => <div key={x.a.id} className={'podio-it p' + i}><span className="pd-pos">{i + 1}º</span><span className="pd-nome">{x.a.nome.split(' ')[0]}</span><span className="pd-pts">{x.pts} pts</span></div>)}</div>
          <ul className="people" style={{ marginTop: 10 }}>{ranking.map((x, i) => <li key={x.a.id}><span className="left"><span className="who"><span>{i + 1}º · {x.a.nome}</span></span></span><span className="tag P">{x.pts} pts</span></li>)}</ul>
          <p className="note">Projete só o pódio. A lista completa é para você.</p>
        </>}
      </div>
    </>
  )
}

function Entregas({ userId, lanc, turma, entregas, showToast, onVoltar, recarregar }) {
  const porAluno = useMemo(() => { const m = {}; entregas.forEach(e => { m[e.aluno_id] = e }); return m }, [entregas])
  const [rascunho, setRascunho] = useState({})
  const etapas = lanc.missoes?.etapas || []
  const aberta = !lanc.encerrado && new Date(lanc.prazo_em) > new Date()

  async function salvar(aluno, campos) {
    try { await store.avaliarEntrega(userId, lanc.id, aluno.id, campos); showToast('Salvo'); recarregar() }
    catch (e) { showToast('Erro: ' + e.message) }
  }
  const ordem = turma.alunos.slice().sort((a, b) => {
    const ea = porAluno[a.id], eb = porAluno[b.id]
    return (eb?.enviada_em ? 1 : 0) - (ea?.enviada_em ? 1 : 0) || a.nome.localeCompare(b.nome)
  })

  return (
    <div className="panel">
      <div className="btnrow" style={{ marginTop: 0 }}><button className="btn ghost mini" onClick={onVoltar}>↩ Lançadas</button></div>
      <h2 style={{ marginTop: 6 }}>{lanc.missoes?.titulo}</h2>
      <p className="hint">Prazo {fmtDH(lanc.prazo_em)} · {aberta ? 'aberta' : 'encerrada'} · {entregas.filter(e => e.enviada_em).length} de {turma.alunos.length} enviaram</p>
      <div className="btnrow">
        {aberta && <button className="btn ghost mini" onClick={async () => { await store.atualizarLancamento(lanc.id, { encerrado: true }); showToast('Missão encerrada'); onVoltar() }}>Encerrar agora</button>}
        {!aberta && <button className="btn ghost mini" onClick={async () => { const d = new Date(); d.setDate(d.getDate() + 2); await store.atualizarLancamento(lanc.id, { encerrado: false, prazo_em: d.toISOString() }); showToast('Prazo reaberto por 2 dias'); onVoltar() }}>Reabrir por 2 dias</button>}
        <button className="btn ghost mini" onClick={async () => { await store.atualizarLancamento(lanc.id, { mostrar_ranking: !lanc.mostrar_ranking }); showToast(lanc.mostrar_ranking ? 'Ranking oculto para a turma' : 'Ranking visível'); onVoltar() }}>{lanc.mostrar_ranking ? 'Ocultar ranking' : 'Mostrar ranking'}</button>
        <button className="btn danger mini" onClick={async () => { if (!confirm('Apagar este lançamento e as entregas dele?')) return; await store.apagarLancamento(lanc.id); showToast('Lançamento apagado'); onVoltar() }}>Apagar lançamento</button>
      </div>
      <ul className="people entregas">
        {ordem.map(a => { const e = porAluno[a.id]; const r = rascunho[a.id] ?? e?.devolutiva ?? ''
          const nFeitas = Object.keys(e?.etapas_feitas || {}).length
          return <li key={a.id} className="entrega-li">
            <div className="ent-cab">
              <span className="who"><span>{a.nome}</span>
                <span className="m">{e?.enviada_em ? `enviada ${fmtDH(e.enviada_em)}` : e ? 'em andamento' : 'não abriu'}{etapas.length ? ` · ${nFeitas}/${etapas.length} etapas` : ''}{e?.fora_do_prazo ? ' · ' : ''}{e?.fora_do_prazo && <b style={{ color: 'var(--miss)' }}>fora do prazo</b>}</span></span>
              <span className={'tag ' + (e?.status === 'aceita' ? 'P' : e?.status === 'refazer' ? 'F' : '')}>{e?.status || '—'}</span>
            </div>
            {e?.texto && <p className="ent-texto">{e.texto}</p>}
            <div className="row ent-acoes">
              <div style={{ flex: 0, minWidth: 130 }}><select value={e?.nivel || ''} onChange={ev => salvar(a, { nivel: ev.target.value || null })}>{NIVEIS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
              <div style={{ flex: 1, minWidth: 180 }}><input value={r} onChange={ev => setRascunho(x => ({ ...x, [a.id]: ev.target.value }))} onBlur={() => { if (r !== (e?.devolutiva || '')) salvar(a, { devolutiva: r }) }} placeholder="Devolutiva (salva ao sair do campo)" /></div>
              <div style={{ flex: 0 }} className="btnrow">
                <button className="btn mini" onClick={() => salvar(a, { status: 'aceita' })}>Aceitar</button>
                <button className="btn ghost mini" onClick={() => salvar(a, { status: 'refazer' })}>Refazer</button>
              </div>
            </div>
          </li> })}
      </ul>
    </div>
  )
}
