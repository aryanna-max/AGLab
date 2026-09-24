import React, { useCallback, useEffect, useState } from 'react'
import * as store from './lib/store'

/* Aulas — lado da professora.
   Cardápio: a biblioteca dela, sem turma — a HQ de planimetria é escrita uma vez.
   Lançadas: o que esta turma tem, agrupado por assunto, e quem leu.
   Mesma divisão das missões, de propósito: é a mesma cabeça operando as duas. */

const NOME_FRENTE = { planimetria: 'Planimetria', altimetria: 'Altimetria', planialtimetria: 'Planialtimetria', geral: 'Geral' }
const TIPO = { cartao: 'cartões', ficha: 'ficha', hq: 'HQ', pdf: 'PDF' }
const fmtDH = iso => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const fmtD = d => d ? String(d).slice(0, 10).split('-').reverse().slice(0, 2).join('/') : ''

/* quantas peças de cada tipo a aula tem — é o que diz, de relance, se ela está montada */
function resumoPecas(pecas) {
  const n = {}
  for (const p of pecas || []) n[p.tipo] = (n[p.tipo] || 0) + 1
  return ['hq', 'cartao', 'ficha', 'pdf'].filter(t => n[t]).map(t => `${n[t]} ${TIPO[t]}`).join(' · ')
}

/* Agrupa por frente, que é o assunto na linguagem do curso — e na ordem do
   curso, não na alfabética: planimetria, altimetria, planialtimetria, geral.
   Serve às duas abas, para o cardápio e a turma lerem igual. */
const ORDEM_FRENTE = ['planimetria', 'altimetria', 'planialtimetria', 'geral']
function porAssunto(itens, frenteDe) {
  const grupos = []
  for (const it of itens) {
    const chave = frenteDe(it) || 'geral'
    const g = grupos.find(x => x.chave === chave)
    if (g) g.itens.push(it); else grupos.push({ chave, itens: [it] })
  }
  const pos = c => { const i = ORDEM_FRENTE.indexOf(c); return i < 0 ? ORDEM_FRENTE.length : i }
  return grupos.sort((a, b) => pos(a.chave) - pos(b.chave) || a.chave.localeCompare(b.chave))
}

export default function AulasProfessora({ userId, tid, turmas, online, showToast }) {
  const [aba, setAba] = useState('lancadas')
  const [aulas, setAulas] = useState([])
  const [lancamentos, setLancamentos] = useState([])
  const turma = turmas.find(t => t.id === tid)

  const carregar = useCallback(() => {
    if (!online) return
    store.listarAulas().then(setAulas).catch(e => showToast('Erro: ' + e.message))
    if (tid) store.lancamentosDeAulasDaTurma(tid).then(setLancamentos).catch(e => showToast('Erro: ' + e.message))
  }, [online, tid, showToast])
  useEffect(() => { carregar() }, [carregar])

  return (
    <>
      <nav className="tabs" style={{ marginBottom: 10 }}>
        <button className={aba === 'lancadas' ? 'active' : ''} onClick={() => setAba('lancadas')}>
          Nesta turma · {turma?.nome?.split(' (')[0] || 'turma'} ({lancamentos.length})
        </button>
        <button className={aba === 'cardapio' ? 'active' : ''} onClick={() => setAba('cardapio')}>
          Cardápio ({aulas.filter(a => !a.arquivada).length})
        </button>
      </nav>
      {!online && <p className="note" style={{ color: 'var(--miss)' }}>Offline — as aulas precisam de internet.</p>}

      {aba === 'cardapio'
        ? <Cardapio userId={userId} aulas={aulas} lancamentos={lancamentos} tid={tid} recarregar={carregar} showToast={showToast} onLancou={() => setAba('lancadas')} />
        : <Lancadas lancamentos={lancamentos} recarregar={carregar} showToast={showToast} irCardapio={() => setAba('cardapio')} />}
    </>
  )
}

/* ================= NESTA TURMA ================= */
function Lancadas({ lancamentos, recarregar, showToast, irCardapio }) {
  const [abertoId, setAbertoId] = useState(null)

  if (!lancamentos.length) return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Nenhuma aula lançada nesta turma</h2>
      <p className="hint">A aula fica no cardápio até você lançar. Lançada e publicada, a turma vê — e continua vendo o semestre inteiro.</p>
      <button className="btn" onClick={irCardapio}>Ir ao cardápio</button>
    </div>
  )

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Aulas desta turma</h2>
      <p className="hint">Por assunto, na ordem em que o aluno vê. Publicada, fica disponível — o QR da chamada é só um atalho para a aula do dia.</p>
      {porAssunto(lancamentos, l => l.aulas?.frente).map(g => <div key={g.chave} className="acervo-grupo">
        <h3 className="acervo-assunto">{NOME_FRENTE[g.chave] || g.chave}</h3>
        {g.itens.map(l => <Lancamento key={l.id} l={l} aberto={abertoId === l.id}
          onAbrir={() => setAbertoId(abertoId === l.id ? null : l.id)} recarregar={recarregar} showToast={showToast} />)}
      </div>)}
    </div>
  )
}

function Lancamento({ l, aberto, onAbrir, recarregar, showToast }) {
  const a = l.aulas || {}
  const [busy, setBusy] = useState(false)

  async function publicar(v) {
    setBusy(true)
    try { await store.atualizarLancamentoAula(l.id, { publicada: v }); showToast(v ? 'Publicada para a turma' : 'Fora do ar — as leituras ficam'); recarregar() }
    catch (e) { showToast('Erro: ' + e.message) } finally { setBusy(false) }
  }
  async function remover() {
    if (!confirm('Tirar esta aula da turma? As leituras dos alunos vão junto.')) return
    setBusy(true)
    try { await store.apagarLancamentoAula(l.id); showToast('Removida da turma'); recarregar() }
    catch (e) { showToast('Erro: ' + e.message) } finally { setBusy(false) }
  }

  return (
    <div className="aula-lanc">
      <div className="al-top">
        <span className="tag">{NOME_FRENTE[a.frente] || a.frente}</span>
        {!l.publicada && <span className="tag nova">fora do ar</span>}
        {l.data && <span className="note">{fmtD(l.data)}</span>}
      </div>
      <b className="al-tit">{a.titulo}</b>
      <span className="note">{resumoPecas(a.aula_pecas) || 'sem peças ainda'}</span>
      <div className="btnrow">
        <button className="btn ghost mini" onClick={onAbrir}>{aberto ? 'Fechar' : 'Quem leu'}</button>
        <button className="btn ghost mini" onClick={() => publicar(!l.publicada)} disabled={busy}>{l.publicada ? 'Tirar do ar' : 'Publicar'}</button>
        <button className="btn ghost mini" onClick={remover} disabled={busy}>Remover da turma</button>
      </div>
      {aberto && <QuemLeu lancamentoId={l.id} showToast={showToast} />}
    </div>
  )
}

/* ---------- quem leu ---------- */
/* Uma linha por aluno da turma, inclusive quem não abriu — é isso que ela quer ver.
   Só cartão e ficha contam: abrir a HQ é um toque só, não é leitura concluída. */
function QuemLeu({ lancamentoId, showToast }) {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    store.leitoresDaAula(lancamentoId)
      .then(d => { if (vivo) setDados(d) })
      .catch(e => { if (vivo) { setErro(e.message); showToast('Erro: ' + e.message) } })
    return () => { vivo = false }
  }, [lancamentoId])

  if (erro) return <p className="note" style={{ color: 'var(--miss)' }}>{erro}</p>
  if (!dados) return <p className="note">Carregando…</p>

  const total = dados.total_texto || 0
  const alunos = dados.alunos || []
  const leram = alunos.filter(x => x.lidas >= total && total > 0).length
  const comecaram = alunos.filter(x => x.lidas > 0 && x.lidas < total).length
  const zero = alunos.filter(x => !x.lidas).length

  return (
    <div className="quem-leu">
      <p className="hint">
        <b>{leram}</b> leram tudo · <b>{comecaram}</b> começaram · <b>{zero}</b> não abriram
        {total > 0 && <> · a aula tem {total} peça(s) de texto</>}
      </p>
      <ul className="lista-simples">
        {alunos.map(x => <li key={x.aluno_id} className={x.lidas ? '' : 'muted-x'}>
          <span>{x.nome}</span>
          <span className="note">
            {total > 0 ? `${x.lidas}/${total}` : x.lidas}
            {x.ultima_em ? ` · ${fmtDH(x.ultima_em)}` : ' · não abriu'}
          </span>
        </li>)}
      </ul>
    </div>
  )
}

/* ================= CARDÁPIO ================= */
function Cardapio({ userId, aulas, lancamentos, tid, recarregar, showToast, onLancou }) {
  const [busy, setBusy] = useState(null)
  const [verArquivadas, setVerArquivadas] = useState(false)
  const lancadas = new Set(lancamentos.map(l => l.aula_id))
  const lista = aulas.filter(a => verArquivadas ? a.arquivada : !a.arquivada)

  async function lancar(a) {
    if (!tid) { showToast('Escolha a turma no topo'); return }
    setBusy(a.id)
    try {
      await store.lancarAula(userId, { aula_id: a.id, turma_id: tid, data: new Date().toISOString().slice(0, 10) })
      showToast(`"${a.titulo}" lançada`)
      recarregar(); onLancou()
    } catch (e) { showToast('Erro: ' + e.message) } finally { setBusy(null) }
  }

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Cardápio de aulas</h2>
      <p className="hint">Por assunto, na ordem do curso. Escrita uma vez, serve todas as turmas — quem nomeia a aula é o título, não um número.</p>
      {lista.length === 0 && <p className="empty">
        {verArquivadas ? 'Nenhuma aula arquivada.' : 'Nenhuma aula ainda. A primeira entra pelo SQL (sql/seed-aula-planimetria.sql); o editor vem na próxima fase.'}
      </p>}
      {porAssunto(lista, a => a.frente).map(g => <div key={g.chave} className="acervo-grupo">
        <h3 className="acervo-assunto">{NOME_FRENTE[g.chave] || g.chave}</h3>
        {g.itens.map(a => {
        const ja = lancadas.has(a.id)
        return <div key={a.id} className="aula-lanc">
          <div className="al-top">
            <span className="tag">{NOME_FRENTE[a.frente] || a.frente}</span>
            {ja && <span className="tag nivel">já nesta turma</span>}
          </div>
          <b className="al-tit">{a.titulo}</b>
          {a.resumo && <span className="note">{a.resumo}</span>}
          <span className="note">{resumoPecas(a.aula_pecas) || 'sem peças ainda'}</span>
          {!ja && <div className="btnrow">
            <button className="btn" onClick={() => lancar(a)} disabled={busy === a.id}>
              {busy === a.id ? 'Lançando…' : 'Lançar nesta turma'}
            </button>
          </div>}
        </div>
      })}
      </div>)}
      <p className="note" style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setVerArquivadas(v => !v)}>
        {verArquivadas ? 'Ver as ativas' : 'Ver arquivadas'}
      </p>
    </div>
  )
}
