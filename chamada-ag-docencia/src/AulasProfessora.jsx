import React, { useCallback, useEffect, useRef, useState } from 'react'
import * as store from './lib/store'
import { FRENTES } from './lib/cardapioMissoes'

/* Aulas — lado da professora.
   Cardápio: a biblioteca dela, sem turma — a HQ de planimetria é escrita uma vez.
   Lançadas: o que esta turma tem, agrupado por assunto, e quem leu.
   Mesma divisão das missões, de propósito: é a mesma cabeça operando as duas. */

/* Mesma lista das missões, do mesmo lugar: a frente é o assunto na linguagem
   do curso, e não pode divergir entre as duas telas. */
const NOME_FRENTE = Object.fromEntries(FRENTES)
/* o que aparece na tela; no banco o tipo continua 'cartao' */
const TIPO = { cartao: 'notas', ficha: 'ficha', hq: 'HQ', pdf: 'PDF' }
const fmtDH = iso => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const fmtD = d => d ? String(d).slice(0, 10).split('-').reverse().slice(0, 2).join('/') : ''

/* quantas peças de cada tipo a aula tem — é o que diz, de relance, se ela está montada */
function resumoPecas(pecas) {
  const n = {}
  for (const p of pecas || []) n[p.tipo] = (n[p.tipo] || 0) + 1
  return ['hq', 'cartao', 'ficha', 'pdf'].filter(t => n[t]).map(t => `${n[t]} ${TIPO[t]}`).join(' · ')
}

/* Agrupa por frente, que é o assunto na linguagem do curso — e na ordem do
   curso, não na alfabética — a ordem é a de FRENTES.
   Serve às duas abas, para o cardápio e a turma lerem igual. */
const ORDEM_FRENTE = FRENTES.map(([k]) => k)   // planimetria → altimetria → planialtimetria → geral
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
   Só nota e ficha contam: abrir a HQ é um toque só, não é leitura concluída. */
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
  const [editando, setEditando] = useState(null)   // null | 'nova' | id da aula
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

  if (editando) return <EditorAula userId={userId} aulaId={editando === 'nova' ? null : editando}
    showToast={showToast} onFechar={salvou => { setEditando(null); if (salvou) recarregar() }} />

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Cardápio de aulas</h2>
      <p className="hint">Por assunto, na ordem do curso. Escrita uma vez, serve todas as turmas — quem nomeia a aula é o título, não um número.</p>
      <div className="btnrow"><button className="btn" onClick={() => setEditando('nova')}>+ Nova aula</button></div>
      {lista.length === 0 && <p className="empty">
        {verArquivadas ? 'Nenhuma aula arquivada.' : 'Nenhuma aula ainda. Comece por "+ Nova aula": título, assunto e as notas.'}
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
          <div className="btnrow">
            {!ja && <button className="btn" onClick={() => lancar(a)} disabled={busy === a.id}>
              {busy === a.id ? 'Lançando…' : 'Lançar nesta turma'}
            </button>}
            <button className="btn ghost mini" onClick={() => setEditando(a.id)}>Editar</button>
          </div>
        </div>
      })}
      </div>)}
      <p className="note" style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setVerArquivadas(v => !v)}>
        {verArquivadas ? 'Ver as ativas' : 'Ver arquivadas'}
      </p>
    </div>
  )
}

/* ================= EDITOR DE AULA ================= */
/* A aula deixa de entrar por SQL. O editor é a mesma gramática do editor de
   missões — título, assunto, uma lista que ela monta e reordena — porque é a
   mesma pessoa operando as duas telas na mesma noite.
   O que ele NÃO é: um editor de texto. Uma nota é três a seis linhas; a caixa
   tem a altura de uma nota de propósito, e o contador avisa quando o texto
   passou do que cabe numa tela de celular. Material que não cabe numa nota é
   aprofundamento, e aprofundamento é PDF. */

const TIPO_NOME = { cartao: 'Nota', ficha: 'Ficha de campo', hq: 'Quadro de HQ', pdf: 'PDF' }
const TIPO_EMOJI = { cartao: '📝', ficha: '📋', hq: '💬', pdf: '📄' }
const LIMITE_NOTA = 420   // acima disso a nota já pede rolagem no celular
const porNome = (x, y) => String(x.name).localeCompare(String(y.name), 'pt-BR', { numeric: true })

function EditorAula({ userId, aulaId, onFechar, showToast }) {
  const [a, setA] = useState(aulaId ? null : { titulo: '', frente: 'planimetria', resumo: '', pecas: [] })
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)
  const [subindo, setSubindo] = useState('')
  /* arquivo de peça que ela tirou da lista: sai do Storage só quando salvar,
     para "removi sem querer, vou cancelar" não perder o arquivo */
  const [aApagar, setAApagar] = useState([])
  const refHq = useRef(null)
  const refPdf = useRef(null)
  const refTroca = useRef(null)
  const trocando = useRef(null)   // índice da peça cujo arquivo ela vai trocar; não aparece na tela, então ref

  useEffect(() => {
    if (!aulaId) return
    let vivo = true
    store.aulaCompleta(aulaId).then(d => { if (vivo) setA(d) }).catch(e => { if (vivo) setErro(e.message) })
    return () => { vivo = false }
  }, [aulaId])

  if (erro) return <div className="panel">
    <h2 style={{ marginTop: 0 }}>Aula</h2>
    <p className="note" style={{ color: 'var(--miss)' }}>{erro}</p>
    <button className="btn ghost" onClick={() => onFechar(false)}>Voltar</button>
  </div>
  if (!a) return <div className="panel"><p className="note">Abrindo…</p></div>

  const set = (k, v) => setA(x => ({ ...x, [k]: v }))
  const setPeca = (i, campos) => setA(x => ({ ...x, pecas: x.pecas.map((p, j) => j === i ? { ...p, ...campos } : p) }))
  const mover = (i, d) => setA(x => {
    const l = x.pecas.slice(), j = i + d
    if (j < 0 || j >= l.length) return x
    ;[l[i], l[j]] = [l[j], l[i]]
    return { ...x, pecas: l }
  })
  function remover(i) {
    const p = a.pecas[i]
    // cartão se digita de novo em um minuto; arquivo no Storage, não: pergunta
    const arquivo = p.tipo === 'hq' || p.tipo === 'pdf'
    if (arquivo && !confirm(`Tirar este ${TIPO_NOME[p.tipo].toLowerCase()} da aula?`)) return
    if (p.storage_path) setAApagar(v => [...v, p.storage_path])
    setA(x => ({ ...x, pecas: x.pecas.filter((_, j) => j !== i) }))
  }

  const temFicha = a.pecas.some(p => p.tipo === 'ficha')
  const nNotas = a.pecas.filter(p => p.tipo === 'cartao').length

  /* O arquivo precisa de uma pasta, e a pasta é a aula: se ela ainda não foi
     salva, salva agora. É por isso que o título é pedido antes do upload. */
  async function garantirId() {
    if (a.id) return a.id
    if (!a.titulo.trim()) { showToast('Dê um título à aula antes de subir arquivo'); return null }
    const aula = await store.salvarAula(userId, a)
    // guarda os ids que voltaram: as peças já estão no banco, e salvar outra
    // vez tem de atualizá-las, não inserir cópias
    setA(x => ({ ...x, id: aula.id, pecas: x.pecas.map((p, i) => aula.pecas[i] ? { ...p, id: aula.pecas[i].id } : p) }))
    return aula.id
  }

  /* Oito quadros são oito uploads. Cada um entra na lista assim que chega, e
     não no fim: se o quinto falhar — e no celular dela falha, é 3G de campus —
     os quatro que subiram continuam na tela, em vez de virarem arquivo órfão no
     Storage e trabalho perdido. */
  async function subir(tipo, files, trocarEm) {
    const lista = Array.from(files || []).sort(porNome)
    if (!lista.length) return
    setBusy(true)
    let feitos = 0
    try {
      const id = await garantirId()
      if (!id) return
      for (let k = 0; k < lista.length; k++) {
        setSubindo(lista.length > 1 ? `subindo ${k + 1} de ${lista.length}…` : 'subindo…')
        const arquivo = await store.subirMaterial(userId, id, lista[k])
        feitos++
        if (typeof trocarEm === 'number') {
          // troca só o arquivo: título e tipo da peça são dela, e ficam
          const antigo = a.pecas[trocarEm]?.storage_path
          if (antigo) setAApagar(v => [...v, antigo])
          setPeca(trocarEm, arquivo)
        } else {
          setA(x => ({ ...x, pecas: [...x.pecas, { tipo, titulo: '', ...arquivo }] }))
        }
      }
      showToast(feitos > 1 ? `${feitos} ${tipo === 'hq' ? 'quadros' : 'arquivos'} no lugar` : 'Arquivo no lugar')
    } catch (e) {
      showToast(feitos ? `Subiu ${feitos} de ${lista.length}. Erro no resto: ${e.message}` : 'Erro: ' + e.message)
    } finally { setBusy(false); setSubindo('') }
  }

  /* o accept muda com o tipo: quadro é imagem, aprofundamento é PDF */
  function trocar(i, tipo) {
    if (!refTroca.current) return
    trocando.current = i
    refTroca.current.accept = tipo === 'pdf' ? 'application/pdf' : 'image/*'
    refTroca.current.click()
  }

  async function salvar(extra = {}) {
    if (!a.titulo.trim()) { showToast('Dê um título à aula'); return }
    setBusy(true)
    try {
      await store.salvarAula(userId, { ...a, ...extra })
      for (const path of aApagar) await store.apagarMaterial(path)
      showToast('Aula salva')
      onFechar(true)
    } catch (e) { showToast('Erro: ' + e.message) } finally { setBusy(false) }
  }

  async function apagar() {
    if (!confirm('Apagar a aula, as peças e o registro de quem leu, em todas as turmas?')) return
    setBusy(true)
    try {
      for (const p of a.pecas) if (p.storage_path) await store.apagarMaterial(p.storage_path)
      await store.apagarAulaDoCardapio(a.id)
      showToast('Aula apagada')
      onFechar(true)
    } catch (e) { showToast('Erro: ' + e.message) } finally { setBusy(false) }
  }

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>{a.id ? 'Editar aula' : 'Nova aula'}</h2>
      <div className="row">
        <div style={{ flex: 3, minWidth: 220 }}><label className="fld">Título</label>
          <input value={a.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Topografia planimétrica" /></div>
        <div style={{ flex: 1, minWidth: 160 }}><label className="fld">Assunto</label>
          <select value={a.frente} onChange={e => set('frente', e.target.value)}>
            {FRENTES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select></div>
      </div>
      <label className="fld">Uma linha, para o aluno saber o que é antes de abrir</label>
      <input value={a.resumo || ''} onChange={e => set('resumo', e.target.value)} placeholder="De onde vem o azimute e para que ele serve." />

      <h3 style={{ marginBottom: 4 }}>As peças</h3>
      <p className="hint" style={{ marginTop: 0 }}>
        Na ordem em que o aluno recebe: a HQ primeiro, as notas depois. A ficha, se houver, fica à parte.
        {nNotas > 9 && <> Esta aula já tem {nNotas} notas — acima de nove costuma ser <b>duas</b> aulas.</>}
      </p>

      {a.pecas.length === 0 && <p className="empty">Nenhuma peça ainda.</p>}
      {a.pecas.map((p, i) => <div key={p.id || 'nova' + i} className="peca-ed">
        <div className="pe-top">
          <span className="tag">{TIPO_EMOJI[p.tipo]} {TIPO_NOME[p.tipo]}</span>
          <span className="btnrow" style={{ margin: 0, flexWrap: 'nowrap' }}>
            <button className="btn ghost mini" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir">↑</button>
            <button className="btn ghost mini" onClick={() => mover(i, 1)} disabled={i === a.pecas.length - 1} aria-label="Descer">↓</button>
            <button className="btn ghost mini" onClick={() => remover(i)} aria-label="Remover">✕</button>
          </span>
        </div>

        {(p.tipo === 'cartao' || p.tipo === 'ficha') ? <>
          <input value={p.titulo || ''} onChange={e => setPeca(i, { titulo: e.target.value })}
            placeholder={p.tipo === 'ficha' ? 'Antes de sair a campo' : 'Título da nota (opcional)'} />
          <textarea rows={5} value={p.texto_md || ''} onChange={e => setPeca(i, { texto_md: e.target.value })}
            placeholder={p.tipo === 'ficha'
              ? '1. Confira o nível da bolha\n2. Meça a altura do instrumento\nTolerância: 2 cm por lance'
              : 'Uma ideia só. **Negrito** com dois asteriscos; lista com traço ou com 1.'} />
          <span className={'note' + ((p.texto_md || '').length > LIMITE_NOTA ? ' muito' : '')}>
            {(p.texto_md || '').length} caracteres
            {(p.texto_md || '').length > LIMITE_NOTA && ' · passou do que cabe numa tela; vale quebrar em dois'}
          </span>
        </> : <>
          {p.tipo === 'hq' && p.url && <img className="pe-mini" src={p.url} alt="" />}
          {p.tipo === 'pdf' && <input value={p.titulo || ''} onChange={e => setPeca(i, { titulo: e.target.value })}
            placeholder="Aprofundamento (título da porta)" />}
          {/* arquivo que subiu não fica em campo editável: a URL é longa e um
              toque errado apaga o quadro sem ela perceber. Troca é por botão. */}
          {p.storage_path
            ? <span className="btnrow" style={{ margin: 0 }}>
                <button className="btn ghost mini" disabled={busy} onClick={() => trocar(i, p.tipo)}>Trocar arquivo</button>
              </span>
            : <input value={p.url || ''} onChange={e => setPeca(i, { url: e.target.value })}
                placeholder="https://… (link de fora, se o arquivo já estiver na web)" />}
          <span className="note">{p.storage_path ? 'no Storage, junto do app' : p.url ? 'link de fora' : 'sem arquivo'}
            {p.largura ? ` · ${p.largura}×${p.altura} px` : ''}
            {p.tipo === 'hq' && p.largura && p.largura < 900 ? ' · estreito para celular; exporte com ~1080 px' : ''}</span>
        </>}
      </div>)}

      <div className="btnrow">
        <button className="btn ghost mini" disabled={busy} onClick={() => setA(x => ({ ...x, pecas: [...x.pecas, { tipo: 'cartao', titulo: '', texto_md: '' }] }))}>+ nota</button>
        {!temFicha && <button className="btn ghost mini" disabled={busy} onClick={() => setA(x => ({ ...x, pecas: [...x.pecas, { tipo: 'ficha', titulo: '', texto_md: '' }] }))}>+ ficha de campo</button>}
        <button className="btn ghost mini" disabled={busy} onClick={() => refHq.current && refHq.current.click()}>+ quadros de HQ</button>
        <button className="btn ghost mini" disabled={busy} onClick={() => refPdf.current && refPdf.current.click()}>+ PDF</button>
        {subindo && <span className="note" style={{ alignSelf: 'center' }}>{subindo}</span>}
      </div>
      {!temFicha && <p className="note">Aula conceitual não tem ficha — forçar uma faz ela virar resumo das notas.</p>}

      <div className="btnrow">
        <button className="btn" onClick={() => salvar()} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
        <button className="btn ghost" onClick={() => onFechar(false)} disabled={busy}>Cancelar</button>
        {a.id && <button className="btn ghost" onClick={() => salvar({ arquivada: !a.arquivada })} disabled={busy}>{a.arquivada ? 'Desarquivar' : 'Arquivar'}</button>}
        {a.id && <button className="btn danger mini" onClick={apagar} disabled={busy}>Apagar</button>}
      </div>

      {/* escondidos, acionados pelos botões acima — mesmo jeito da foto do aluno.
          multiple nos quadros: ela escolhe os oito de uma vez, e a ordem sai do nome */}
      <input ref={refHq} type="file" accept="image/*" multiple hidden
        onChange={ev => { const f = ev.target.files; ev.target.value = ''; subir('hq', f) }} />
      <input ref={refPdf} type="file" accept="application/pdf" multiple hidden
        onChange={ev => { const f = ev.target.files; ev.target.value = ''; subir('pdf', f) }} />
      <input ref={refTroca} type="file" hidden
        onChange={ev => {
          const f = ev.target.files, i = trocando.current
          ev.target.value = ''; trocando.current = null
          if (f && f[0] && i !== null && a.pecas[i]) subir(a.pecas[i].tipo, f, i)
        }} />
    </div>
  )
}
