import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { escolhaDeEquipe, entrarEmEquipe, salvarCaderneta } from './lib/alunoApi'
import { caderVazia, calcularCaderneta, lerHz, lerNumero, nomeChave, fmtM, marcosOficiais } from './lib/caderneta'
import Avatar from './Avatar.jsx'

/* Missão com caderneta de estação total (Transporte de Coordenadas) e equipes que os
   próprios alunos formam entre os presentes. O cálculo é à mão: o app não mostra
   coordenada calculada ao aluno — ele só recebe as coordenadas OFICIAIS dos marcos que
   ocupou ou usou como ré, que são o dado de partida da conta. */


/* ================= ESCOLHA DE EQUIPE ================= */
export function EscolherEquipe({ m, ident, online, recarregar, jaNaEquipe }) {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState(null)
  const [equipe, setEquipe] = useState('')
  const [colegas, setColegas] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [aberto, setAberto] = useState(!jaNaEquipe)
  const carregar = useCallback(() => {
    if (!online) return
    escolhaDeEquipe(ident, m.lancamento_id).then(d => { setDados(d); setErro(null) }).catch(e => setErro(e.message))
  }, [ident, m.lancamento_id, online])
  useEffect(() => { if (aberto) carregar() }, [carregar, aberto])
  // a lista muda enquanto os colegas escolhem: confere a cada 15 s com a tela aberta
  useEffect(() => { if (!aberto || !online) return; const it = setInterval(carregar, 15000); return () => clearInterval(it) }, [aberto, online, carregar])

  if (jaNaEquipe && !aberto) return <div className="btnrow" style={{ marginTop: 6 }}><button className="btn ghost mini" onClick={() => setAberto(true)}>+ Trazer colega para a equipe</button></div>

  async function entrar() {
    setBusy(true); setMsg(null)
    try {
      const r = await entrarEmEquipe(ident, m.lancamento_id, dados?.minha ? null : equipe, colegas)
      const fora = r.ja_tinham_equipe || []
      setMsg({ tipo: fora.length ? 'dup' : 'ok', t: `${r.equipe}: ${(r.entraram || []).join(', ') || 'ninguém novo'} ${r.entraram?.length > 1 ? 'entraram' : 'entrou'}.` + (fora.length ? ` Ficaram de fora (já estavam em outra equipe): ${fora.join(', ')}.` : '') })
      setColegas([]); carregar(); recarregar()
      if (jaNaEquipe) setAberto(false)
    } catch (e) { setMsg({ tipo: 'err', t: e.message }); carregar() } finally { setBusy(false) }
  }

  const corpo = (() => {
    if (!online) return <p className="note">Sem rede: a escolha de equipe precisa de conexão.</p>
    if (erro) return <p className="note" style={{ color: 'var(--miss)' }}>{erro}</p>
    if (!dados) return <p className="note">Carregando equipes…</p>
    const livres = (dados.presentes || []).filter(p => !p.eu && !p.equipe)
    const destino = dados.minha || equipe
    const cheia = eq => eq.enviou
    return <>
      {!dados.minha && <>
        <label className="fld">1. Escolha a equipe</label>
        <div className="eq-grade">
          {(dados.equipes || []).map(eq => <button key={eq.nome} type="button" className={'eq-box eq-escolha' + (equipe === eq.nome ? ' on' : '')} disabled={cheia(eq)} onClick={() => setEquipe(eq.nome)}>
            <b>{eq.nome}</b>{eq.enviou && <span className="tag">já enviou</span>}
            {eq.membros.length ? <span className="eq-nomes">{eq.membros.map(x => x.nome).join(', ')}</span> : <span className="note" style={{ margin: 0 }}>vazia</span>}
          </button>)}
        </div>
      </>}
      <label className="fld">{dados.minha ? `Colegas para a ${dados.minha}` : '2. Marque os colegas que estão com você'} <span style={{ fontWeight: 400 }}>· presentes {dados.hoje ? 'hoje' : `na última chamada (${String(dados.dia || '').split('-').reverse().slice(0, 2).join('/')})`}</span></label>
      {(dados.presentes || []).length === 0 ? <p className="note">A lista aparece depois da chamada.</p> :
        <ul className="eq-membros escolha">
          {dados.presentes.map(p => { const travado = p.eu || !!p.equipe; const marcado = colegas.includes(p.id)
            return <li key={p.id} className={(travado ? 'travado' : '') + (marcado ? ' marcado' : '')}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, cursor: travado ? 'default' : 'pointer' }}>
                <input type="checkbox" style={{ width: 'auto' }} disabled={travado} checked={marcado} onChange={e => setColegas(c => e.target.checked ? [...c, p.id] : c.filter(x => x !== p.id))} />
                <Avatar nome={p.nome} avatar={p.avatar} tam="mini" />
                <span style={{ flex: 1, minWidth: 0 }}>{p.nome}{p.eu ? ' (você)' : ''}</span>
              </label>
              {p.equipe && <span className="fn">🔒 {p.equipe}</span>}
            </li> })}
        </ul>}
      <div className="btnrow">
        <button className="btn" disabled={busy || (!dados.minha && !equipe) || (dados.minha && !colegas.length)} onClick={entrar}>
          {busy ? 'Entrando…' : dados.minha ? `Trazer ${colegas.length || ''} colega(s)` : destino ? `Entrar na ${destino}${colegas.length ? ` com ${colegas.length} colega(s)` : ''}` : 'Escolha a equipe'}</button>
        {jaNaEquipe && <button className="btn ghost" onClick={() => setAberto(false)}>Fechar</button>}
      </div>
      {!dados.minha && !equipe && <p className="note">Toque numa equipe para escolher.</p>}
      <p className="note">🔒 = já está numa equipe. {livres.length} presente(s) ainda sem equipe. Errou? Trocar de equipe é com a professora.</p>
    </>
  })()

  return <div className="panel">
    <h2 style={{ marginTop: 0 }}>{jaNaEquipe ? 'Trazer colega' : 'Missão em equipe: forme a sua'}</h2>
    {!jaNaEquipe && <p className="hint">São {dados?.n || m.equipes_livres} equipes. Um celular pode montar a equipe inteira: escolha a equipe e marque quem está com você.</p>}
    {corpo}
    {msg && <div className={'flash ' + msg.tipo} style={{ textAlign: 'left' }}>{msg.t}</div>}
  </div>
}

/* ================= CADERNETA: estado, rascunho no celular e sincronia com a equipe ================= */
export function useCaderneta(m, ident, online) {
  const k = 'orbe_cad_' + m.lancamento_id
  const srv = m.minha?.caderneta || null, srvEm = m.minha?.caderneta_em || null, srvPor = m.minha?.caderneta_por || null
  const inicial = () => {
    let local = null; try { local = JSON.parse(localStorage.getItem(k) || 'null') } catch (e) {}
    // edição não salva neste celular, feita sobre a versão que ainda é a do servidor: continua dela
    if (local?.sujo && (local.base || null) === srvEm) return { cad: local.cad, base: srvEm, sujo: true }
    return { cad: srv || caderVazia(), base: srvEm, sujo: false, descartada: !!local?.sujo }
  }
  const [st, setSt] = useState(inicial)
  const [conflito, setConflito] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState(st.descartada ? { tipo: 'dup', t: 'Um colega salvou a caderneta enquanto este celular estava fora. Abri a versão da equipe.' } : null)
  const stRef = useRef(st); stRef.current = st
  const gravarLocal = s => { try { localStorage.setItem(k, JSON.stringify({ cad: s.cad, base: s.base, sujo: s.sujo })) } catch (e) {} }

  // chegou versão nova da equipe (recarga a cada 30 s): se não há edição pendente aqui, adota
  useEffect(() => {
    if (!srvEm || srvEm === stRef.current.base) return
    if (!stRef.current.sujo) { const s = { cad: srv || caderVazia(), base: srvEm, sujo: false }; setSt(s); gravarLocal(s) }
  }, [srvEm])   // eslint-disable-line react-hooks/exhaustive-deps

  const setCad = useCallback(f => setSt(s => { const n = { ...s, cad: typeof f === 'function' ? f(s.cad) : f, sujo: true }; gravarLocal(n); return n }), [k])

  const salvar = useCallback(async (baseForcada) => {
    const s = stRef.current
    if (!online) { setMsg({ tipo: 'err', t: 'Sem rede: a caderneta ficou guardada neste celular. Ela sobe quando a conexão voltar.' }); return false }
    setSalvando(true)
    try {
      const r = await salvarCaderneta(ident, m.lancamento_id, s.cad, baseForcada !== undefined ? baseForcada : s.base)
      if (r.conflito) { setConflito(r); return false }
      const n = { cad: stRef.current.cad, base: r.em, sujo: stRef.current.cad !== s.cad }   // se editou durante o envio, continua sujo
      setSt(n); gravarLocal(n); setConflito(null); setMsg(null)
      return true
    } catch (e) { setMsg({ tipo: 'err', t: e.message }); return false } finally { setSalvando(false) }
  }, [ident, m.lancamento_id, online])

  // salva sozinho 4 s depois da última anotação (em campo ninguém lembra de tocar em Salvar)
  useEffect(() => {
    if (!st.sujo || !online || conflito) return
    const t = setTimeout(() => salvar(), 4000); return () => clearTimeout(t)
  }, [st.cad, st.sujo, online, conflito, salvar])

  const usarDaEquipe = () => { const n = { cad: conflito.caderneta || caderVazia(), base: conflito.em, sujo: false }; setSt(n); gravarLocal(n); setConflito(null) }
  const manterMinha = () => salvar(conflito.em)

  return { cad: st.cad, setCad, sujo: st.sujo, base: st.base, salvar, salvando, conflito, usarDaEquipe, manterMinha, msg, porUltimo: srvPor }
}

/* ================= CADERNETA: telas ================= */
const OPC_NOVO = '__novo__'

function SeletorPonto({ valor, onChange, opcoes, disabled, placeholder }) {
  const lista = opcoes.some(o => nomeChave(o) === nomeChave(valor)) || !valor ? opcoes : [...opcoes, valor]
  return <select value={valor || ''} disabled={disabled} onChange={e => {
    if (e.target.value !== OPC_NOVO) { onChange(e.target.value); return }
    const nome = (prompt('Nome do ponto novo (ex.: E1, E2):') || '').trim().slice(0, 20)
    if (!nome) return
    const marco = marcosOficiais().find(x => nomeChave(x.nome) === nomeChave(nome))
    onChange(marco ? marco.nome : nome)
  }}>
    <option value="">{placeholder}</option>
    {lista.map(o => <option key={o} value={o}>{o}</option>)}
    <option value={OPC_NOVO}>➕ ponto novo…</option>
  </select>
}

export function PainelCaderneta({ m, cadHook, podeEditar }) {
  const { cad, setCad, sujo, salvar, salvando, conflito, usarDaEquipe, manterMinha, msg, porUltimo } = cadHook
  const alvo = m.caderneta?.alvo || 'ponto novo'
  const marcos = useMemo(() => marcosOficiais(), [])
  const nomesMarcos = marcos.map(x => x.nome)
  const linhas = cad.linhas?.length ? cad.linhas : caderVazia().linhas
  const res = cad.resultado || caderVazia().resultado
  const calc = useMemo(() => calcularCaderneta({ linhas }, marcos), [linhas, marcos])

  // pontos novos: o alvo sempre aparece; os demais, os que a caderneta já usa e não são marcos
  const novos = [...new Set([alvo, ...linhas.flatMap(l => [l.est, l.pv])].map(s => String(s || '').trim()).filter(s => s && !nomesMarcos.some(n => nomeChave(n) === nomeChave(s))))]
  const opcoes = [...nomesMarcos, ...novos]
  const setLinha = (i, campo, v) => setCad(c => ({ ...c, linhas: linhas.map((l, j) => j === i ? { ...l, [campo]: v } : l) }))
  const novaLinha = () => setCad(c => ({ ...c, linhas: [...linhas, { est: linhas[linhas.length - 1]?.est || '', pv: '', hz: '', dh: '' }] }))
  const tirarLinha = i => setCad(c => ({ ...c, linhas: linhas.length > 1 ? linhas.filter((_, j) => j !== i) : caderVazia().linhas }))
  const setRes = (grupo, campo, v) => setCad(c => ({ ...c, resultado: { ...res, [grupo]: { ...(res[grupo] || {}), [campo]: v } } }))

  // coordenadas oficiais de partida: marcos ocupados como estação ou usados como ré
  const partida = useMemo(() => {
    const usados = new Set()
    calc.linhas.forEach(l => { usados.add(nomeChave(l.est)); if (l.papel === 're') usados.add(nomeChave(l.pv)) })
    return marcos.filter(x => usados.has(nomeChave(x.nome)))
  }, [calc, marcos])
  const vantesMarco = [...new Set(calc.linhas.filter(l => l.papel === 'vante' && nomesMarcos.some(n => nomeChave(n) === nomeChave(l.pv))).map(l => l.pv))]
  const opcoesCtrl = [...vantesMarco, ...nomesMarcos.filter(n => !vantesMarco.includes(n))]

  return <>
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>1 · Caderneta de campo</h2>
      <p className="hint">Uma linha por visada. <b>A primeira visada de cada estação é a ré.</b> Ângulo em graus, minutos e segundos (ex.: <b>0 00 00</b> na ré, <b>123 45 30</b> na vante); distância horizontal em metros.</p>
      {conflito && <div className="devolutiva" style={{ marginBottom: 10 }}>
        <b>{conflito.por || 'Um colega'} salvou a caderneta às {new Date(conflito.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</b>
        <p>A versão dele e a deste celular são diferentes. Conversem e escolham uma: a outra se perde.</p>
        <div className="btnrow"><button className="btn mini" onClick={usarDaEquipe}>Usar a de {conflito.por || 'meu colega'}</button><button className="btn ghost mini" onClick={manterMinha}>Manter a deste celular</button></div>
      </div>}
      <div className="cad-lista">
        {linhas.map((l, i) => { const info = calc.linhas.find(x => x.i === i); const hzRuim = String(l.hz || '').trim() && !Number.isFinite(lerHz(l.hz)); const dhRuim = String(l.dh || '').trim() && !Number.isFinite(lerNumero(l.dh))
          return <div key={i} className="cad-linha">
            <div className="cad-cab"><span className="cad-n">{i + 1}</span>{info?.papel === 're' && <span className="tag re">ré</span>}{info?.papel === 'vante' && <span className="tag">vante</span>}
              {podeEditar && <button className="btn ghost mini cad-x" title="Apagar esta visada" onClick={() => { if (!(l.est || l.pv || l.hz || l.dh) || confirm(`Apagar a visada ${i + 1}?`)) tirarLinha(i) }}>✕</button>}</div>
            <div className="cad-grid">
              <div><label className="fld">Estação</label><SeletorPonto valor={l.est} opcoes={opcoes} disabled={!podeEditar} placeholder="—" onChange={v => setLinha(i, 'est', v)} /></div>
              <div><label className="fld">Ponto visado</label><SeletorPonto valor={l.pv} opcoes={opcoes} disabled={!podeEditar} placeholder="—" onChange={v => setLinha(i, 'pv', v)} /></div>
              <div><label className="fld">Âng. horizontal</label><input inputMode="decimal" value={l.hz || ''} disabled={!podeEditar} placeholder="0 00 00" className={hzRuim ? 'ruim' : ''} onChange={e => setLinha(i, 'hz', e.target.value)} /></div>
              <div><label className="fld">Dist. horizontal (m)</label><input inputMode="decimal" value={l.dh || ''} disabled={!podeEditar} placeholder="0,000" className={dhRuim ? 'ruim' : ''} onChange={e => setLinha(i, 'dh', e.target.value)} /></div>
            </div>
            {hzRuim && <p className="note cad-aviso">Ângulo ilegível: use graus, minutos e segundos separados por espaço (123 45 30).</p>}
            {dhRuim && <p className="note cad-aviso">Distância ilegível: só o número, em metros (12,345).</p>}
          </div> })}
      </div>
      {podeEditar && <div className="btnrow"><button className="btn ghost" onClick={novaLinha}>+ visada</button></div>}
      {calc.problemas.length > 0 && <ul className="cad-problemas">{calc.problemas.map((p, i) => <li key={i}>{p}</li>)}</ul>}
      <p className="note">{salvando ? 'Salvando…' : sujo ? '✎ Alterações ainda não salvas (salva sozinho em alguns segundos).' : cadHook.base ? `✓ Salva para a equipe${porUltimo ? ` · último a salvar: ${porUltimo}` : ''}.` : 'Nada anotado ainda.'} Todos os celulares da equipe veem a mesma caderneta; anotem em um só por vez.</p>
      {podeEditar && sujo && <div className="btnrow" style={{ marginTop: 0 }}><button className="btn ghost mini" disabled={salvando} onClick={() => salvar()}>💾 Salvar agora</button></div>}
      {msg && <div className={'flash ' + msg.tipo} style={{ textAlign: 'left' }}>{msg.t}</div>}
    </div>

    <div className="panel">
      <h2 style={{ marginTop: 0 }}>2 · Cálculo das coordenadas</h2>
      <p className="hint">Calculem à mão, a partir das coordenadas oficiais da estação e da ré, e digitem o resultado. O app confere a conta com a caderneta de vocês depois do envio.</p>
      {partida.length > 0 && <><label className="fld">Coordenadas oficiais de partida (UTM · SIRGAS 2000 · 25 S)</label>
        <table className="aloc cad-coord"><thead><tr><th>Marco</th><th>N (m)</th><th>E (m)</th></tr></thead>
          <tbody>{partida.map(x => <tr key={x.nome}><td>{x.nome}</td><td>{fmtM(x.n)}</td><td>{fmtM(x.e)}</td></tr>)}</tbody></table></>}
      <label className="fld">{alvo}</label>
      <div className="row">
        <div><input inputMode="decimal" value={res.alvo?.n || ''} disabled={!podeEditar} placeholder="N (m)" onChange={e => setRes('alvo', 'n', e.target.value)} /></div>
        <div><input inputMode="decimal" value={res.alvo?.e || ''} disabled={!podeEditar} placeholder="E (m)" onChange={e => setRes('alvo', 'e', e.target.value)} /></div>
      </div>
      <label className="fld">Marco de controle (o marco conhecido em que vocês fecharam)</label>
      <select value={res.controle?.marco || ''} disabled={!podeEditar} onChange={e => setRes('controle', 'marco', e.target.value)}>
        <option value="">— escolha o marco —</option>
        {opcoesCtrl.map(n => <option key={n} value={n}>{n}{vantesMarco.includes(n) ? ' · visado na caderneta' : ''}</option>)}
      </select>
      <div className="row" style={{ marginTop: 6 }}>
        <div><input inputMode="decimal" value={res.controle?.n || ''} disabled={!podeEditar} placeholder="N calculado (m)" onChange={e => setRes('controle', 'n', e.target.value)} /></div>
        <div><input inputMode="decimal" value={res.controle?.e || ''} disabled={!podeEditar} placeholder="E calculado (m)" onChange={e => setRes('controle', 'e', e.target.value)} /></div>
      </div>
      <p className="note">No controle vale a coordenada que <b>vocês calcularam</b> pela caderneta, não a oficial: é a diferença entre as duas que mostra se o levantamento fechou.</p>
    </div>
  </>
}
