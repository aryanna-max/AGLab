import React, { useCallback, useEffect, useMemo, useState } from 'react'
import * as store from './lib/store'
import { estadoAvisos, ativarAvisosProfessora, TEXTO_ESTADO } from './lib/avisos'

/* Avisos no celular dos alunos, com o app fechado, escritos pela professora quando ela quiser.
   Para: a turma escolhida no topo, uma equipe de missão, alunos marcados, ou só o celular dela (teste).
   Agora ou agendado. Mostra quem tem os avisos ativados e quem não tem, para ela falar pessoalmente. */

const ABRIR_FIXO = [['home', 'Tela inicial'], ['presenca', 'Presença'], ['campo', 'Campo'], ['missoes', 'Missões']]
const STATUS = { agendado: 'agendado', enviando: 'enviando…', enviado: 'enviado', cancelado: 'cancelado', erro: 'não chegou' }
const fmtDH = iso => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const primeiroNome = n => (n || '').trim().split(' ').slice(0, 2).join(' ')

export default function AvisosProfessora({ userId, tid, turmas, online, showToast, rascunho }) {
  const turma = turmas.find(t => t.id === tid)
  const alunos = useMemo(() => (turma?.alunos || []).slice().sort((a, b) => a.nome.localeCompare(b.nome)), [turma])
  const [inscricoes, setInscricoes] = useState([])
  const [historico, setHistorico] = useState([])
  const [lancs, setLancs] = useState([])
  const [equipes, setEquipes] = useState([])

  const [alvo, setAlvo] = useState('turma')          // turma | equipe | alunos | professora
  const [lancEquipe, setLancEquipe] = useState('')
  const [equipeId, setEquipeId] = useState('')
  const [marcados, setMarcados] = useState({})
  const [titulo, setTitulo] = useState(rascunho?.titulo || '')
  const [texto, setTexto] = useState(rascunho?.texto || '')
  const [abrir, setAbrir] = useState(rascunho?.abrir || 'home')
  const [quando, setQuando] = useState('agora')
  const [data, setData] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10))
  const [hora, setHora] = useState('12:40')
  const [busy, setBusy] = useState(false)
  const [meuEstado, setMeuEstado] = useState(null)

  const carregar = useCallback(() => {
    if (!online || !tid) return
    Promise.all([store.inscricoesAtivas(), store.avisosDaTurma(tid), store.lancamentosDaTurma(tid)])
      .then(([i, h, l]) => { setInscricoes(i); setHistorico(h); setLancs(l) })
      .catch(e => showToast('Erro: ' + e.message))
  }, [online, tid, showToast])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { const it = setInterval(carregar, 15000); return () => clearInterval(it) }, [carregar])
  useEffect(() => { estadoAvisos().then(setMeuEstado) }, [])
  useEffect(() => { setAlvo('turma'); setMarcados({}); setLancEquipe(''); setEquipeId('') }, [tid])
  useEffect(() => {
    setEquipes([]); setEquipeId('')
    if (lancEquipe) store.equipesDoLancamento(lancEquipe).then(setEquipes).catch(() => {})
  }, [lancEquipe])

  const comAviso = useMemo(() => new Set(inscricoes.filter(i => i.aluno_id).map(i => i.aluno_id)), [inscricoes])
  const meusAparelhos = inscricoes.filter(i => !i.aluno_id).length
  const lancsEquipe = lancs.filter(l => l.em_equipe)
  const lancsAbertos = lancs.filter(l => !l.encerrado && new Date(l.prazo_em) > new Date())
  const equipe = equipes.find(e => e.id === equipeId)

  const destinatarios = alvo === 'turma' ? alunos
    : alvo === 'alunos' ? alunos.filter(a => marcados[a.id])
    : alvo === 'equipe' ? alunos.filter(a => equipe?.membros.some(m => m.aluno_id === a.id))
    : []
  const alcancados = destinatarios.filter(a => comAviso.has(a.id))
  const semAviso = destinatarios.filter(a => !comAviso.has(a.id))
  const quandoISO = quando === 'agora' ? null : new Date(`${data}T${hora}:00`).toISOString()

  const rotuloAlvo = alvo === 'turma' ? (turma?.nome?.split(' (')[0] || 'turma')
    : alvo === 'equipe' ? `${equipe?.nome || 'equipe'} · ${lancsEquipe.find(l => l.id === lancEquipe)?.missoes?.titulo || ''}`
    : alvo === 'alunos' ? `${destinatarios.length} aluno(s)` : 'meu celular (teste)'

  const problema = !titulo.trim() ? 'Escreva o título.'
    : alvo === 'equipe' && !equipe ? 'Escolha a equipe.'
    : alvo === 'alunos' && !destinatarios.length ? 'Marque pelo menos um aluno.'
    : alvo === 'professora' && !meusAparelhos ? 'Ative os avisos no seu celular primeiro (abaixo).'
    : quando === 'agendar' && !(new Date(quandoISO) > new Date()) ? 'O horário agendado já passou.'
    : null

  async function enviar() {
    if (problema) { showToast(problema); return }
    if (alvo !== 'professora' && !confirm(`${quando === 'agora' ? 'Enviar agora' : 'Agendar para ' + fmtDH(quandoISO)} para ${rotuloAlvo}?\n\n${alcancados.length} de ${destinatarios.length} aluno(s) recebem no celular.`)) return
    setBusy(true)
    try {
      await store.criarAviso(userId, {
        turma_id: tid, titulo, texto, abrir, rotulo_alvo: rotuloAlvo,
        alvo_tipo: alvo, alvo_ids: alvo === 'alunos' ? destinatarios.map(a => a.id) : alvo === 'equipe' ? [equipeId] : [],
        agendado_para: quandoISO || undefined,
      })
      if (quando === 'agora') {
        const r = await store.dispararAvisos()
        const a = r?.avisos?.[0]
        showToast(a ? `Aviso enviado a ${a.aceitos} aparelho(s)${a.falhas ? ` · ${a.falhas} falha(s)` : ''}` : 'Aviso enviado')
      } else showToast('Aviso agendado para ' + fmtDH(quandoISO))
      setTitulo(''); setTexto(''); setAbrir('home'); carregar()
    } catch (e) { showToast('Erro: ' + e.message) } finally { setBusy(false) }
  }

  async function ativarMeu() {
    try { await ativarAvisosProfessora(); setMeuEstado('ativo'); showToast('Avisos ativados neste aparelho'); carregar() }
    catch (e) { showToast(e.message); estadoAvisos().then(setMeuEstado) }
  }

  if (!turma) return null
  return (
    <>
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Avisar no celular · {turma.nome.split(' (')[0]}</h2>
        <p className="hint">Chega no celular mesmo com o app fechado. <b>{alunos.filter(a => comAviso.has(a.id)).length} de {alunos.length}</b> alunos desta turma estão com os avisos ativados.</p>

        <label className="fld">Para</label>
        <div className="btnrow" style={{ marginTop: 0 }}>
          {[['turma', `Turma toda (${alunos.length})`], ['equipe', 'Uma equipe'], ['alunos', 'Alunos escolhidos'], ['professora', 'Só meu celular (teste)']].map(([k, l]) =>
            <button key={k} className={'btn ghost mini' + (alvo === k ? ' on' : '')} onClick={() => setAlvo(k)}>{l}</button>)}
        </div>
        {alvo === 'equipe' && (lancsEquipe.length === 0
          ? <p className="note">Nenhuma missão em equipe lançada para esta turma.</p>
          : <div className="row">
              <div style={{ flex: 2, minWidth: 200 }}><label className="fld">Missão</label>
                <select value={lancEquipe} onChange={e => setLancEquipe(e.target.value)}><option value="">— escolha —</option>{lancsEquipe.map(l => <option key={l.id} value={l.id}>{l.missoes?.titulo} · {fmtDH(l.prazo_em)}</option>)}</select></div>
              <div style={{ flex: 1, minWidth: 150 }}><label className="fld">Equipe</label>
                <select value={equipeId} onChange={e => setEquipeId(e.target.value)} disabled={!equipes.length}><option value="">{lancEquipe && !equipes.length ? 'sem equipes formadas' : '— escolha —'}</option>{equipes.map(q => <option key={q.id} value={q.id}>{q.nome} ({q.membros.length})</option>)}</select></div>
            </div>)}
        {alvo === 'alunos' && <div className="av-alunos">
          <div className="btnrow" style={{ marginTop: 0 }}>
            <button className="btn ghost mini" onClick={() => setMarcados(Object.fromEntries(alunos.map(a => [a.id, true])))}>todos</button>
            <button className="btn ghost mini" onClick={() => setMarcados({})}>nenhum</button>
          </div>
          {alunos.map(a => <label key={a.id} className="chk-inline av-al"><input type="checkbox" checked={!!marcados[a.id]} onChange={e => setMarcados(m => ({ ...m, [a.id]: e.target.checked }))} /> {a.nome} {comAviso.has(a.id) ? <span title="avisos ativados">🔔</span> : <span className="muted-x" title="sem avisos ativados">🔕</span>}</label>)}
        </div>}

        <div className="row">
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="fld">Título <span className="cont">{titulo.length}/60</span></label>
            <input value={titulo} maxLength={60} onChange={e => setTitulo(e.target.value)} placeholder="Missão nova" />
            <label className="fld">Texto <span className="cont">{texto.length}/180</span></label>
            <textarea rows={3} value={texto} maxLength={180} onChange={e => setTexto(e.target.value)} placeholder="Caderneta de nivelamento até 17:40. Levem trena." />
            <label className="fld">Ao tocar no aviso, abre</label>
            <select value={abrir} onChange={e => setAbrir(e.target.value)}>
              {ABRIR_FIXO.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              {lancsAbertos.map(l => <option key={l.id} value={'missao:' + l.id}>Missão: {l.missoes?.titulo}</option>)}
            </select>
            <label className="fld">Quando</label>
            <div className="btnrow" style={{ marginTop: 0 }}>
              <button className={'btn ghost mini' + (quando === 'agora' ? ' on' : '')} onClick={() => setQuando('agora')}>Agora</button>
              <button className={'btn ghost mini' + (quando === 'agendar' ? ' on' : '')} onClick={() => setQuando('agendar')}>Agendar</button>
            </div>
            {quando === 'agendar' && <div className="row">
              <div><label className="fld">Data</label><input type="date" value={data} onChange={e => setData(e.target.value)} /></div>
              <div><label className="fld">Hora</label><input type="time" value={hora} onChange={e => setHora(e.target.value)} /></div>
            </div>}
          </div>
          <div style={{ flex: 0, minWidth: 230 }}>
            <label className="fld">Como aparece na tela bloqueada</label>
            <div className="av-lock">
              <div className="av-hora">{quando === 'agora' ? new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : hora}</div>
              <div className="av-notif">
                <img src="/icon-192.png" alt="" />
                <div><div className="av-app">ORBE · {quando === 'agora' ? 'agora' : fmtDH(quandoISO)}</div>
                  <b>{titulo || 'Título do aviso'}</b><div className="av-txt">{texto || 'Texto do aviso.'}</div></div>
              </div>
            </div>
          </div>
        </div>

        {alvo !== 'professora' && destinatarios.length > 0 && <p className="note">
          <b>{alcancados.length} de {destinatarios.length}</b> recebem no celular.
          {semAviso.length > 0 && <> Sem avisos ativados ({semAviso.length}): {semAviso.map(a => primeiroNome(a.nome)).join(', ')}. Avise pessoalmente ou peça que toquem em "Ativar avisos" no app.</>}
        </p>}
        {problema && (titulo || alvo !== 'turma') && <p className="note" style={{ color: 'var(--miss)' }}>{problema}</p>}
        <div className="btnrow">
          <button className="btn" onClick={enviar} disabled={busy || !online || !!problema}>{busy ? 'Enviando…' : quando === 'agora' ? 'Enviar aviso' : 'Agendar aviso'}</button>
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Meu celular</h2>
        {meuEstado === 'ativo' && meusAparelhos > 0
          ? <p className="note">Avisos ativados neste aparelho. Use "Só meu celular (teste)" para ver como chega.</p>
          : meuEstado === 'inativo' || (meuEstado === 'ativo' && !meusAparelhos)
          ? <><p className="note">Ative para receber os seus próprios avisos de teste. Faça isso no celular, com o Orbe instalado.</p>
              <div className="btnrow"><button className="btn ghost" onClick={ativarMeu} disabled={!online}>Ativar avisos neste aparelho</button></div></>
          : <p className="note">{TEXTO_ESTADO[meuEstado] || 'Conferindo…'}</p>}
        {meusAparelhos > 0 && <p className="note">{meusAparelhos} aparelho(s) seu(s) com avisos ativados.</p>}
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Avisos enviados e agendados</h2>
        {historico.length === 0 ? <p className="empty">Nenhum aviso ainda.</p> :
          <div className="scrollx"><table className="matrix"><thead><tr><th className="nm">Aviso</th><th>para</th><th>quando</th><th>situação</th><th>celulares</th><th>sem avisos</th><th></th></tr></thead>
            <tbody>{historico.map(h => <tr key={h.id}>
              <td className="nm"><b>{h.titulo}</b>{h.texto ? <div className="muted-x">{h.texto}</div> : null}</td>
              <td>{h.rotulo_alvo || h.alvo_tipo}</td>
              <td>{fmtDH(h.enviado_em || h.agendado_para)}</td>
              <td className={h.status === 'enviado' ? 'P' : h.status === 'erro' ? 'F' : ''} title={h.erro || ''}>{STATUS[h.status] || h.status}</td>
              <td>{h.aparelhos != null ? `${h.aceitos}/${h.aparelhos}` : '—'}</td>
              <td title={(h.sem_aviso || []).map(id => alunos.find(a => a.id === id)?.nome).filter(Boolean).join(', ')}>{h.status === 'enviado' || h.status === 'erro' ? (h.sem_aviso || []).length : '—'}</td>
              <td>{h.status === 'agendado' && <button className="btn ghost mini" onClick={async () => { try { await store.cancelarAviso(h.id); showToast('Aviso cancelado'); carregar() } catch (e) { showToast('Erro: ' + e.message) } }}>cancelar</button>}</td>
            </tr>)}</tbody></table></div>}
        <p className="note">"Celulares" conta os aparelhos que o serviço de avisos do Google ou da Apple aceitou. Celular desligado ou em economia de bateria recebe quando voltar (até 12 h).</p>
      </div>
    </>
  )
}
