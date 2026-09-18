import React, { useCallback, useEffect, useMemo, useState } from 'react'
import * as store from './lib/store'

/* Aulas (18/09/2026, pedido dela): o calendário da turma. Cada aula é um registro (chamadas):
   criar, mudar de dia, apagar e escrever o conteúdo — antes (planejar), durante ou depois.
   A exportação só conta aulas até hoje, e cada falta vale os tempos da aula (5 no sábado, 6 na sexta).
   Abrir o app num dia que não é de aula não cria mais aula sozinho. */

export const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const deISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export const hojeISO = () => iso(new Date())
const fmtLongo = s => { const d = deISO(s); return `${DIAS[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` }
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const sigla = t => (t?.nome || '').split(' (')[0].split(' — ').pop()
const CORES = ['#2749B0', '#B01B1B', '#12804A', '#B8860B', '#6B4FA0']

export default function Aulas({ userId, tid, setTid, turmas, online, showToast, refresh, abrirChamada }) {
  const t = turmas.find(x => x.id === tid)
  // calendário geral (todas as turmas: sábado tem manhã e tarde) ou só a turma escolhida
  const [geral, setGeralRaw] = useState(() => { try { return localStorage.getItem('orbe_cal_geral') !== '0' } catch (e) { return true } })
  const setGeral = v => { setGeralRaw(v); try { localStorage.setItem('orbe_cal_geral', v ? '1' : '0') } catch (e) {} }
  const reais = useMemo(() => turmas.filter(x => !x.teste && !/TESTE/i.test(x.nome)).sort((a, b) => (a.dia_semana ?? 9) - (b.dia_semana ?? 9) || (a.horario || '').localeCompare(b.horario || '')), [turmas])
  const cor = id => CORES[Math.max(0, reais.findIndex(x => x.id === id)) % CORES.length]
  const [todas, setTodas] = useState({})   // turma_id → aulas
  const [aulas, setAulas] = useState([])
  const [mes, setMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [sel, setSel] = useState(hojeISO())
  const [texto, setTexto] = useState('')
  const [novaData, setNovaData] = useState('')
  const [busy, setBusy] = useState(false)

  const carregar = useCallback(() => {
    if (!online || !tid) return
    store.aulasDaTurma(tid).then(setAulas).catch(e => showToast('Erro: ' + e.message))
    Promise.all(reais.map(x => store.aulasDaTurma(x.id).then(a => [x.id, a]))).then(ps => setTodas(Object.fromEntries(ps))).catch(() => {})
  }, [tid, online, showToast, reais])
  useEffect(() => { carregar() }, [carregar])

  const porData = useMemo(() => Object.fromEntries(aulas.map(a => [a.data, a])), [aulas])
  const aula = porData[sel]
  useEffect(() => { setTexto(aula?.conteudo || ''); setNovaData('') }, [aula?.id, aula?.conteudo, sel])

  const dia = t?.dia_semana
  const hoje = hojeISO()
  const dadas = aulas.filter(a => a.data <= hoje)
  const tempos = t?.tempos_por_aula || 1

  // grade do mês: semanas de domingo a sábado
  const celulas = useMemo(() => {
    const ini = new Date(mes.getFullYear(), mes.getMonth(), 1), fim = new Date(mes.getFullYear(), mes.getMonth() + 1, 0)
    const c = []; for (let i = 0; i < ini.getDay(); i++) c.push(null)
    for (let d = 1; d <= fim.getDate(); d++) c.push(new Date(mes.getFullYear(), mes.getMonth(), d))
    return c
  }, [mes])

  async function criar() {
    setBusy(true)
    try { await store.criarAula(userId, tid, sel, texto); showToast('Aula registrada em ' + fmtLongo(sel)); carregar() }
    catch (e) { showToast('Erro: ' + e.message) } finally { setBusy(false) }
  }
  async function salvarConteudo() {
    if (!aula || texto === (aula.conteudo || '')) return
    try { await store.salvarConteudo(aula.id, texto); showToast('Conteúdo salvo'); carregar() }
    catch (e) { showToast('Não consegui salvar o conteúdo') }
  }
  async function mudarData() {
    if (!aula || !novaData) return
    if (porData[novaData]) { showToast('Já existe aula em ' + fmtLongo(novaData)); return }
    if (!confirm(`Mudar a aula de ${fmtLongo(aula.data)} para ${fmtLongo(novaData)}? As ${aula.presentes} presença(s) e o conteúdo vão junto.`)) return
    try { await store.mudarDataAula(aula.id, novaData); showToast('Aula movida para ' + fmtLongo(novaData)); setSel(novaData); carregar() }
    catch (e) { showToast('Erro: ' + e.message) }
  }
  async function apagar(a = aula) {
    if (!a) return
    const aviso = a.presentes > 0
      ? `Apagar a aula de ${fmtLongo(a.data)}?\n\nEla tem ${a.presentes} presença(s) registrada(s), que serão apagadas junto. Não dá para desfazer.`
      : `Apagar a aula de ${fmtLongo(a.data)}? (sem presenças)`
    if (!confirm(aviso)) return
    try { await store.apagarAula(a.id); showToast('Aula apagada'); carregar() }
    catch (e) { showToast('Erro: ' + e.message) }
  }
  async function mudarTurma(campos) {
    try { await store.atualizarTurma(tid, campos); showToast('Turma atualizada'); refresh && refresh() }
    catch (e) { showToast('Erro: ' + e.message) }
  }

  if (!t) return null
  const estranhas = aulas.filter(a => (dia != null && deISO(a.data).getDay() !== dia) && a.presentes === 0)

  return (
    <>
      {!geral && <div className="panel">
        <h2 style={{ marginTop: 0 }}>Aulas · {t.nome.split(' (')[0]}</h2>
        <div className="row">
          <div><label className="fld">Dia da aula</label>
            <select value={dia ?? ''} onChange={e => mudarTurma({ dia_semana: e.target.value === '' ? null : Number(e.target.value) })}>
              <option value="">—</option>{DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></div>
          <div><label className="fld">Faltas por aula (h-a)</label>
            <input type="number" min={1} max={12} value={tempos} onChange={e => mudarTurma({ tempos_por_aula: Math.max(1, Number(e.target.value) || 1) })} /></div>
        </div>
        <p className="note">{dadas.length} aula(s) dada(s) até hoje = {dadas.length * tempos} h-a{t.ch_ha ? ` de ${t.ch_ha} h-a da disciplina` : ''} · {aulas.length - dadas.length} planejada(s).
          O app só abre aula sozinho no dia da turma ({dia != null ? DIAS[dia] : 'defina acima'}). Em outro dia, registre aqui.</p>
        {estranhas.length > 0 && <div className="flash dup" style={{ textAlign: 'left' }}>
          {estranhas.length} aula(s) fora do dia da turma e sem nenhuma presença (provavelmente abertas por engano): {estranhas.map(a => fmtLongo(a.data)).join(' · ')}. Elas contam falta na exportação.
          <div className="btnrow"><button className="btn mini" onClick={async () => {
            if (!confirm(`Apagar as ${estranhas.length} aula(s) sem presença fora do dia da turma?`)) return
            try { for (const a of estranhas) await store.apagarAula(a.id); showToast(estranhas.length + ' aula(s) apagada(s)'); carregar() } catch (e) { showToast('Erro: ' + e.message) }
          }}>Apagar essas {estranhas.length}</button></div></div>}
      </div>}

      <div className="panel">
        <div className="btnrow" style={{ marginTop: 0 }}>
          <button className={'btn mini' + (geral ? '' : ' ghost')} onClick={() => setGeral(true)}>Todas as turmas</button>
          <button className={'btn mini' + (geral ? ' ghost' : '')} onClick={() => setGeral(false)}>Só {sigla(t)}</button>
        </div>
        <div className="cal-cab">
          <button className="btn ghost mini" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}>‹</button>
          <b>{MESES[mes.getMonth()]} {mes.getFullYear()}</b>
          <button className="btn ghost mini" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}>›</button>
        </div>
        <div className="cal">
          {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <div key={i} className={'cal-dow' + ((geral ? reais.some(x => x.dia_semana === i) : i === dia) ? ' dia-turma' : '')}>{d}</div>)}
          {celulas.map((d, i) => { if (!d) return <div key={i} />
            const k = iso(d)
            if (geral) {
              const doDia = reais.filter(x => x.dia_semana === d.getDay() || (todas[x.id] || []).some(a => a.data === k))
              return <button key={i} onClick={() => setSel(k)} className={'cal-d geral' + (doDia.length ? ' dia-turma' : '') + (k === sel ? ' sel' : '') + (k === hoje ? ' hoje' : '')}>
                <span>{d.getDate()}</span>
                {doDia.map(x => { const a = (todas[x.id] || []).find(y => y.data === k)
                  return <i key={x.id} className={'cal-chip' + (a ? (k > hoje ? ' plan' : ' dada') : ' vazia')} style={{ '--c': cor(x.id) }}>{sigla(x).slice(0, 3)}</i> })}
              </button>
            }
            const a = porData[k]
            return <button key={i} onClick={() => setSel(k)}
              className={'cal-d' + (d.getDay() === dia ? ' dia-turma' : '') + (a ? (k > hoje ? ' planejada' : ' tem-aula') : '') + (k === sel ? ' sel' : '') + (k === hoje ? ' hoje' : '')}>
              <span>{d.getDate()}</span>{a && <small>{k > hoje ? '◦' : a.presentes}</small>}</button> })}
        </div>
        <p className="note">{geral ? <>Cada etiqueta é uma turma no dia dela: <b>cheia</b> = aula dada · <b>contorno</b> = planejada · <b>apagada</b> = sem aula registrada. {reais.map(x => <span key={x.id} style={{ color: cor(x.id), fontWeight: 700, marginRight: 8 }}>{sigla(x)} {x.dia_semana != null ? DIAS[x.dia_semana].slice(0, 3) : ''} {x.horario || ''}</span>)}</>
          : 'Dia da turma em destaque. Verde = aula dada (número = presentes). Contorno = aula planejada.'}</p>
      </div>

      {geral && <div className="panel">
        <h2 style={{ marginTop: 0 }}>{fmtLongo(sel)}{sel === hoje ? ' · hoje' : ''}</h2>
        <ul className="people">{reais.filter(x => x.dia_semana === deISO(sel).getDay() || (todas[x.id] || []).some(a => a.data === sel)).map(x => {
          const a = (todas[x.id] || []).find(y => y.data === sel)
          return <li key={x.id} style={{ cursor: 'pointer' }} onClick={() => { setTid(x.id); setGeral(false) }}>
            <span className="who"><span><b style={{ color: cor(x.id) }}>{sigla(x)}</b> · {x.horario || ''}</span>
              <span className="m">{a ? (sel > hoje ? 'planejada' : `${a.presentes} de ${x.alunos.length} presentes`) + (a.conteudo ? ' · ' + a.conteudo.slice(0, 80) : ' · sem conteúdo') : 'sem aula registrada'}</span></span>
            <span className="tag">abrir ›</span></li> })}
          {reais.every(x => x.dia_semana !== deISO(sel).getDay() && !(todas[x.id] || []).some(a => a.data === sel)) && <li className="empty">Nenhuma turma neste dia.</li>}
        </ul>
        <p className="note">Toque numa turma para registrar, escrever o conteúdo, mudar de dia ou apagar.</p>
      </div>}

      {!geral && <div className="panel">
        <h2 style={{ marginTop: 0 }}>{fmtLongo(sel)}{sel === hoje ? ' · hoje' : ''}</h2>
        {!aula ? <>
          <p className="hint">Não há aula registrada neste dia{dia != null && deISO(sel).getDay() !== dia ? ` (não é ${DIAS[dia]})` : ''}.</p>
          <label className="fld">Conteúdo (opcional: dá para planejar antes)</label>
          <textarea rows={3} value={texto} onChange={e => setTexto(e.target.value)} placeholder="O que vai ser / foi dado nesta aula" />
          <div className="btnrow"><button className="btn" onClick={criar} disabled={busy || !online}>+ Registrar aula neste dia</button></div>
        </> : <>
          <p className="hint">{sel > hoje ? 'Aula planejada.' : `${aula.presentes} de ${t.alunos.length} presentes · ${t.alunos.length - aula.presentes} falta(s) × ${tempos} h-a.`}</p>
          <label className="fld">Conteúdo da aula {texto !== (aula.conteudo || '') && <span className="badge off" style={{ marginLeft: 6 }}>não salvo</span>}</label>
          <textarea rows={4} value={texto} onChange={e => setTexto(e.target.value)} onBlur={salvarConteudo} placeholder="Antes, durante ou depois da aula. Salva ao sair do campo." />
          <div className="btnrow">
            <button className="btn" onClick={() => abrirChamada(sel)}>Abrir a chamada deste dia ▸</button>
            <button className="btn ghost" onClick={() => apagar()}>Apagar aula</button>
          </div>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div><label className="fld">Mudar para o dia</label><input type="date" value={novaData} onChange={e => setNovaData(e.target.value)} /></div>
            <div style={{ flex: 0 }}><button className="btn ghost" onClick={mudarData} disabled={!novaData}>Mudar</button></div>
          </div>
        </>}
      </div>}

      {!geral && <div className="panel">
        <h2 style={{ marginTop: 0 }}>Todas as aulas · {sigla(t)}</h2>
        {aulas.length === 0 ? <p className="empty">Nenhuma aula registrada.</p> :
          <ul className="people">{aulas.map(a => { const fora = dia != null && deISO(a.data).getDay() !== dia
            return <li key={a.id} style={{ cursor: 'pointer', display: 'block' }} onClick={() => { setSel(a.data); const d = deISO(a.data); setMes(new Date(d.getFullYear(), d.getMonth(), 1)) }}>
              <div className="ent-cab"><span className="who"><span><b>{fmtLongo(a.data)}</b>{a.data > hoje ? ' · planejada' : ` · ${a.presentes} presentes`}{fora && <span className="badge off" style={{ marginLeft: 6 }}>fora do dia</span>}</span>
                <span className="m">{a.conteudo ? a.conteudo.slice(0, 120) + (a.conteudo.length > 120 ? '…' : '') : 'sem conteúdo'}</span></span></div>
            </li> })}</ul>}
      </div>}
    </>
  )
}
