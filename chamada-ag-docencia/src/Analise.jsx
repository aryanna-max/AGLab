import React, { useEffect, useMemo, useState } from 'react'
import * as store from './lib/store'
import { PERC, paraUTM25S, metros } from './lib/geo'
import { MARCOS, marcoPorNome } from './lib/topo'

/* Análise — a mesa de trabalho da professora, pensada para o computador.
   Tudo o que os alunos da turma mandaram: leituras (chamada e ambientes),
   pins (ocupações) e poligonais, filtrados por período, aula e aluno,
   desenhados em planta UTM com os marcos do campus, e exportáveis em CSV. */

const COR = { sala: '#2E75B6', corredor: '#17A2B8', patio: '#2E8B57', outro: '#8A9099', ocupacao: '#7B4F00' }
const NOME = { sala: 'Dentro da sala', corredor: 'Corredor', patio: 'Pátio', outro: 'Outro', ocupacao: 'Ocupação (pin)' }
const PERIODOS = [['hoje', 'Hoje'], ['7', '7 dias'], ['30', '30 dias'], ['tudo', 'Tudo']]
const W = 760, H = 540, PAD = 44

const fmtHora = iso => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const mediana = arr => { const a = arr.filter(v => v != null && isFinite(v)).sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2 }
const percentil = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); if (!a.length) return null; return a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))] }
const ehChamada = l => !!(l.extra && l.extra.chamada)
const csvCel = v => { if (v == null) return ''; const s = typeof v === 'object' ? JSON.stringify(v) : String(v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
const nomeArq = (pref, t) => `${pref}_${(t?.nome || 'turma').replace(/[^\w\-]+/g, '_')}.csv`
function baixarTexto(nome, texto) {
  const b = new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8;' }); const u = URL.createObjectURL(b)
  const a = document.createElement('a'); a.href = u; a.download = nome; document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(u), 3000)
}
const desdeDoPeriodo = p => { if (p === 'tudo') return null; const d = new Date(); if (p === 'hoje') { d.setHours(0, 0, 0, 0); return d.toISOString() } d.setDate(d.getDate() - Number(p)); return d.toISOString() }

export default function Analise({ tid, turmas, online, showToast }) {
  const t = turmas.find(x => x.id === tid)
  const [periodo, setPeriodo] = useState('30')
  const [dados, setDados] = useState({ leituras: [], pins: [], polis: [], sessoes: [] })
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [sessaoId, setSessaoId] = useState('')
  const [alunoId, setAlunoId] = useState('')
  const [rotulos, setRotulos] = useState(() => new Set(Object.keys(COR)))
  const [soChamada, setSoChamada] = useState(false)
  const [precisas, setPrecisas] = useState(true)
  const [mostrar, setMostrar] = useState(200)
  const [fotoAberta, setFotoAberta] = useState(null)

  useEffect(() => {
    if (!tid || !online) return
    let vivo = true; setLoading(true); setErro('')
    Promise.all([store.leiturasDaTurma(tid, desdeDoPeriodo(periodo)), store.pinsDaTurma(tid), store.poligonaisDaTurma(tid), store.sessoesDaTurma(tid)])
      .then(([l, p, q, s]) => { if (vivo) setDados({ leituras: l || [], pins: p || [], polis: q || [], sessoes: s || [] }) })
      .catch(e => vivo && setErro('Não consegui carregar: ' + (e.message || e)))
      .finally(() => vivo && setLoading(false))
    return () => { vivo = false }
  }, [tid, periodo, online])
  useEffect(() => { setSessaoId(''); setAlunoId(''); setMostrar(200) }, [tid])

  const leituras = useMemo(() => dados.leituras.filter(l =>
    (!sessaoId || l.sessao_id === sessaoId) && (!alunoId || l.aluno_id === alunoId) &&
    rotulos.has(l.rotulo || 'outro') && (!soChamada || ehChamada(l))), [dados.leituras, sessaoId, alunoId, rotulos, soChamada])
  const pins = useMemo(() => dados.pins.filter(p => (!alunoId || p.aluno_id === alunoId) && (!sessaoId || p.sessao_id === sessaoId)), [dados.pins, alunoId, sessaoId])
  const polis = useMemo(() => dados.polis.filter(q => !alunoId || q.aluno_id === alunoId), [dados.polis, alunoId])
  const pinPorId = useMemo(() => { const m = {}; dados.pins.forEach(p => m[p.id] = p); return m }, [dados.pins])
  const sessPorId = useMemo(() => { const m = {}; dados.sessoes.forEach(s => m[s.id] = s); return m }, [dados.sessoes])

  const kpi = useMemo(() => {
    const alunos = new Set(leituras.map(l => l.aluno_id)).size
    const porRot = {}
    Object.keys(COR).forEach(k => { const a = leituras.filter(l => (l.rotulo || 'outro') === k).map(l => l.acuracia_m); porRot[k] = { n: a.length, med: mediana(a) } })
    const on = leituras.filter(l => l.online_na_captura != null)
    const pctOn = on.length ? Math.round(100 * on.filter(l => l.online_na_captura).length / on.length) : null
    return { alunos, porRot, pctOn, ttff: mediana(leituras.map(l => l.ttff_ms)), chamadas: leituras.filter(ehChamada).length, acc: mediana(leituras.map(l => l.acuracia_m)) }
  }, [leituras])

  const pontos = useMemo(() => leituras.map(l => {
    let n = l.utm_n, e = l.utm_e
    if ((n == null || e == null) && l.lat != null) { const u = paraUTM25S(l.lat, l.lon); n = u.n; e = u.e }
    return n != null ? { l, n, e } : null
  }).filter(Boolean), [leituras])

  // enquadramento: mediana como centro, percentil 95 das distâncias como meio-lado (um outlier não achata a planta)
  const vista = useMemo(() => {
    const base = pontos.filter(p => !precisas || (p.l.acuracia_m != null && p.l.acuracia_m <= 50))
    const xs = base.map(p => p.e).concat(pins.map(p => p.utm_e)), ys = base.map(p => p.n).concat(pins.map(p => p.utm_n))
    if (!xs.length) { xs.push(PERC.utmE - 95); ys.push(PERC.utmN) }
    const cE = mediana(xs), cN = mediana(ys)
    const ds = xs.map((x, i) => Math.hypot(x - cE, ys[i] - cN))
    const half = Math.max(30, (percentil(ds, 0.95) || 30) * 1.15)
    const esc = Math.min(W - 2 * PAD, H - 2 * PAD) / (2 * half)
    const passo = [5, 10, 25, 50, 100, 250, 500, 1000, 2500].find(p => p * esc >= 60) || 5000
    return { cE, cN, half, esc, passo, X: e => PAD + (W - 2 * PAD) / 2 + (e - cE) * esc, Y: n => PAD + (H - 2 * PAD) / 2 - (n - cN) * esc }
  }, [pontos, pins, precisas])

  const grade = useMemo(() => {
    const { cE, cN, esc, passo } = vista
    const hw = (W - 2 * PAD) / 2 / esc, hh = (H - 2 * PAD) / 2 / esc
    const vs = [], hs = []
    for (let e = Math.ceil((cE - hw) / passo) * passo; e <= cE + hw; e += passo) vs.push(e)
    for (let n = Math.ceil((cN - hh) / passo) * passo; n <= cN + hh; n += passo) hs.push(n)
    return { vs, hs }
  }, [vista])

  const dentro = (x, y) => x >= PAD - 2 && x <= W - PAD + 2 && y >= PAD - 2 && y <= H - PAD + 2
  const marcosVis = MARCOS.filter(m => dentro(vista.X(m.e), vista.Y(m.n)))
  const foraDaVista = pontos.filter(({ n, e }) => !dentro(vista.X(e), vista.Y(n))).length

  function toggleRot(k) { setRotulos(s => { const nv = new Set(s); nv.has(k) ? nv.delete(k) : nv.add(k); return nv }) }
  async function abrirFoto(p) {
    try { const src = await store.fotoDoPin(p.id); if (src) setFotoAberta({ pin: p, src }); else showToast('Este pin não tem foto') }
    catch (e) { showToast('Não consegui carregar a foto') }
  }

  function exportarLeituras() {
    const cab = ['aluno', 'matricula', 'rotulo', 'chamada', 'presenca_marcada', 'capturado_em', 'enviado_em', 'fix_timestamp', 'lat', 'lon', 'utm_n', 'utm_e', 'acuracia_m', 'altitude_m', 'alt_acuracia_m', 'dist_perc_m', 'ttff_ms', 'online_na_captura', 'aula', 'plataforma', 'tipo_conexao', 'local_descricao', 'pin_nome']
    const linhas = leituras.map(l => [l.alunos?.nome, l.alunos?.matricula, l.rotulo, ehChamada(l) ? 1 : 0, l.presenca_marcada ? 1 : 0, l.capturado_em, l.criado_em, l.fix_timestamp, l.lat, l.lon, l.utm_n, l.utm_e, l.acuracia_m, l.altitude_m, l.alt_acuracia_m, l.dist_perc_m, l.ttff_ms, l.online_na_captura, sessPorId[l.sessao_id]?.codigo || '', l.extra?.plataforma, l.extra?.tipo_conexao, l.extra?.local_descricao, l.extra?.pin_nome].map(csvCel).join(';'))
    baixarTexto(nomeArq('leituras', t), [cab.join(';')].concat(linhas).join('\r\n'))
  }
  function exportarPins() {
    const cab = ['aluno', 'matricula', 'pin', 'lat', 'lon', 'utm_n', 'utm_e', 'altitude_m', 'n_leituras', 'acuracia_media_m', 'desvio_n_m', 'desvio_e_m', 'espalhamento_m', 'marco_ref', 'erro_vs_marco_m', 'tem_foto', 'aula', 'criado_em']
    const linhas = pins.map(p => {
      const m = p.marco_ref ? marcoPorNome(p.marco_ref) : null; const err = m ? Math.hypot(p.utm_n - m.n, p.utm_e - m.e) : null
      return [p.alunos?.nome, p.alunos?.matricula, p.nome, p.lat, p.lon, p.utm_n, p.utm_e, p.altitude_m, p.n_leituras, p.acuracia_media_m, p.desvio_n_m, p.desvio_e_m, Math.hypot(p.desvio_n_m || 0, p.desvio_e_m || 0), p.marco_ref, err, p.tem_foto ? 1 : 0, sessPorId[p.sessao_id]?.codigo || '', p.criado_em].map(csvCel).join(';')
    })
    baixarTexto(nomeArq('pins', t), [cab.join(';')].concat(linhas).join('\r\n'))
  }
  function exportarPoligonais() {
    const cab = ['aluno', 'poligonal', 'vertices', 'perimetro_m', 'area_m2', 'erro_medio_vertice_m', 'criado_em', 'ordem', 'pin', 'utm_n', 'utm_e']
    const linhas = []
    polis.forEach(q => { const r = q.resultado || {}, c = r.comparacao; (q.pin_ids || []).forEach((id, i) => { const p = pinPorId[id]; linhas.push([q.alunos?.nome, q.nome, r.vertices, r.perimetro, r.area, c ? c.erroMedioVertice : null, q.criado_em, i + 1, p?.nome, p?.utm_n, p?.utm_e].map(csvCel).join(';')) }) })
    baixarTexto(nomeArq('poligonais', t), [cab.join(';')].concat(linhas).join('\r\n'))
  }

  if (!t) return <div className="panel"><p className="empty">Sem turma.</p></div>
  const alunosCom = t.alunos.filter(a => dados.leituras.some(l => l.aluno_id === a.id) || dados.pins.some(p => p.aluno_id === a.id))

  return (
    <>
      <div className="panel">
        <h2>Análise — {t.nome}</h2>
        <p className="hint">Tudo o que a turma mandou pelo Orbe: chamadas, medições por ambiente, pins e poligonais. Filtre, veja na planta e exporte.</p>
        {!online && <p className="note" style={{ color: 'var(--miss)' }}>Offline — a análise precisa de internet.</p>}
        <div className="ana-filtros">
          <div className="btnrow" style={{ margin: 0 }}>
            {PERIODOS.map(([k, l]) => <button key={k} className={'btn ghost mini' + (periodo === k ? ' on' : '')} onClick={() => setPeriodo(k)}>{l}</button>)}
          </div>
          <select value={sessaoId} onChange={e => setSessaoId(e.target.value)}>
            <option value="">Todas as aulas</option>
            {dados.sessoes.map(s => <option key={s.id} value={s.id}>{s.codigo} · {fmtHora(s.criada_em)}{s.local ? ' · ' + s.local : ''}</option>)}
          </select>
          <select value={alunoId} onChange={e => setAlunoId(e.target.value)}>
            <option value="">Todos os alunos ({alunosCom.length} com dados)</option>
            {t.alunos.map(a => <option key={a.id} value={a.id}>{a.nome}{alunosCom.includes(a) ? '' : ' · sem dados'}</option>)}
          </select>
          <label className="chk-inline"><input type="checkbox" checked={soChamada} onChange={e => setSoChamada(e.target.checked)} /> só leituras de chamada</label>
          <label className="chk-inline"><input type="checkbox" checked={precisas} onChange={e => setPrecisas(e.target.checked)} /> enquadrar só ±50 m ou melhor</label>
        </div>
        <div className="btnrow">
          <button className="btn" onClick={exportarLeituras} disabled={!leituras.length}>CSV leituras ({leituras.length})</button>
          <button className="btn ghost" onClick={exportarPins} disabled={!pins.length}>CSV pins ({pins.length})</button>
          <button className="btn ghost" onClick={exportarPoligonais} disabled={!polis.length}>CSV poligonais ({polis.length})</button>
          {loading && <span className="note">carregando…</span>}
        </div>
        {erro && <div className="flash err" style={{ textAlign: 'left' }}>{erro}</div>}

        <div className="count-strip" style={{ marginTop: 12 }}>
          <div className="c"><div className="n">{leituras.length}</div><div className="l">leituras</div></div>
          <div className="c ok"><div className="n">{kpi.alunos}</div><div className="l">alunos</div></div>
          <div className="c"><div className="n">{kpi.chamadas}</div><div className="l">chamadas</div></div>
          <div className="c"><div className="n">{kpi.acc != null ? '±' + metros(kpi.acc, 1) : '—'}</div><div className="l">acurácia mediana (m)</div></div>
          <div className="c"><div className="n">{kpi.pctOn != null ? kpi.pctOn + '%' : '—'}</div><div className="l">com rede na captura</div></div>
          <div className="c"><div className="n">{kpi.ttff != null ? (kpi.ttff / 1000).toFixed(1).replace('.', ',') + ' s' : '—'}</div><div className="l">TTFF mediano</div></div>
        </div>
      </div>

      <div className="ana-grid">
        <div className="panel ana-map">
          <h2>Planta UTM 25 S</h2>
          <svg viewBox={`0 0 ${W} ${H}`} className="ana-svg">
            <rect x={PAD} y={PAD} width={W - 2 * PAD} height={H - 2 * PAD} className="ana-papel" />
            {grade.vs.map(e => <g key={'v' + e}><line x1={vista.X(e)} y1={PAD} x2={vista.X(e)} y2={H - PAD} className="ana-linha" /><text x={vista.X(e)} y={H - PAD + 14} className="ana-lab" textAnchor="middle">{Math.round(e)}</text></g>)}
            {grade.hs.map(n => <g key={'h' + n}><line x1={PAD} y1={vista.Y(n)} x2={W - PAD} y2={vista.Y(n)} className="ana-linha" /><text x={PAD - 4} y={vista.Y(n) + 3} className="ana-lab" textAnchor="end">{Math.round(n)}</text></g>)}
            <text x={W / 2} y={H - 6} className="ana-lab" textAnchor="middle">E (m) · UTM 25 S · SIRGAS2000</text>
            <text transform={`translate(12 ${H / 2}) rotate(-90)`} className="ana-lab" textAnchor="middle">N (m)</text>

            {polis.map(q => { const pts = (q.pin_ids || []).map(id => pinPorId[id]).filter(Boolean); if (pts.length < 2) return null
              return <polygon key={q.id} points={pts.map(p => `${vista.X(p.utm_e)},${vista.Y(p.utm_n)}`).join(' ')} className="ana-poli"><title>{`${q.alunos?.nome} · ${q.nome}`}</title></polygon> })}

            {pontos.map(({ l, n, e }) => { const x = vista.X(e), y = vista.Y(n); if (!dentro(x, y)) return null
              return <circle key={l.id} cx={x} cy={y} r={ehChamada(l) ? 4 : 3} fill={COR[l.rotulo] || COR.outro} className={'ana-pt' + (ehChamada(l) ? ' chamada' : '')}>
                <title>{`${l.alunos?.nome || ''} · ${NOME[l.rotulo] || l.rotulo}${ehChamada(l) ? ' · CHAMADA' : ''} · ±${metros(l.acuracia_m, 1)} m · ${fmtHora(l.capturado_em || l.criado_em)}`}</title></circle> })}

            {pins.map(p => { const x = vista.X(p.utm_e), y = vista.Y(p.utm_n); if (!dentro(x, y)) return null
              return <g key={p.id} transform={`translate(${x},${y})`} className="ana-pin" onClick={() => p.tem_foto && abrirFoto(p)} style={{ cursor: p.tem_foto ? 'pointer' : 'default' }}>
                <path d="M0,-7 L7,0 L0,7 L-7,0 Z" /><text y={-10} textAnchor="middle" className="ana-pin-lab">{p.nome}{p.tem_foto ? ' 📷' : ''}</text>
                <title>{`${p.alunos?.nome} · ${p.nome} · ${p.n_leituras} leituras · espalh. ±${metros(Math.hypot(p.desvio_n_m || 0, p.desvio_e_m || 0), 1)} m`}</title></g> })}

            {marcosVis.map(m => { const x = vista.X(m.e), y = vista.Y(m.n)
              return <g key={m.nome} transform={`translate(${x},${y})`} className={'ana-marco ' + m.tipo}><line x1={-8} x2={8} y1={0} y2={0} /><line y1={-8} y2={8} x1={0} x2={0} /><circle r={4} fill="none" /><text x={10} y={-6} className="ana-marco-lab">{m.nome}</text></g> })}

            <g transform={`translate(${W - PAD - 10 - vista.passo * vista.esc} ${PAD + 16})`} className="ana-escala"><line x1={0} x2={vista.passo * vista.esc} y1={0} y2={0} /><text x={vista.passo * vista.esc / 2} y={-4} textAnchor="middle">{vista.passo} m</text></g>
            <text x={PAD + 6} y={PAD + 16} className="ana-lab">N ↑</text>
          </svg>
          <div className="ana-legenda">
            {Object.keys(COR).map(k => <button key={k} className={'chip' + (rotulos.has(k) ? ' on' : '')} onClick={() => toggleRot(k)} style={{ '--c': COR[k] }}><i />{NOME[k]} <b>{kpi.porRot[k]?.n || 0}</b>{kpi.porRot[k]?.med != null ? <span> ±{metros(kpi.porRot[k].med, 1)} m</span> : null}</button>)}
            <span className="chip fixo"><i style={{ background: '#fff', border: '2px solid #b8860b' }} />anel dourado = leitura de chamada</span>
            <span className="chip fixo"><i style={{ background: '#1f1f1f', transform: 'rotate(45deg)', borderRadius: 1 }} />pin (losango) · 📷 tem foto</span>
            <span className="chip fixo"><i style={{ background: 'transparent', border: '1.5px solid #c0392b', borderRadius: '50%' }} />marco oficial (vermelho) · PERC (roxo)</span>
          </div>
          {foraDaVista > 0 && <p className="note">{foraDaVista} leitura(s) fora do enquadramento — desmarque "enquadrar só ±50 m" para ver tudo (a planta fica menor).</p>}
        </div>

        <div className="ana-lado">
          <div className="panel">
            <h2>Por ambiente</h2>
            <div className="scrollx"><table className="matrix"><thead><tr><th className="nm">Ambiente</th><th>leituras</th><th>acurácia mediana</th></tr></thead>
              <tbody>{Object.keys(COR).map(k => <tr key={k}><td className="nm"><i className="dot" style={{ background: COR[k] }} />{NOME[k]}</td><td>{kpi.porRot[k]?.n || 0}</td>
                <td className={kpi.porRot[k]?.med != null ? (k === 'patio' ? 'P' : kpi.porRot[k].med > 20 ? 'F' : '') : ''}>{kpi.porRot[k]?.med != null ? '± ' + metros(kpi.porRot[k].med, 1) + ' m' : '—'}</td></tr>)}</tbody></table></div>
            <p className="note">Dentro da sala a acurácia piora: multicaminho e atenuação do sinal. É o experimento da disciplina em números.</p>
          </div>
          <div className="panel">
            <h2>Marcos na planta</h2>
            {marcosVis.length ? <ul className="lista-simples">{marcosVis.map(m => <li key={m.nome}><b>{m.nome}</b> · N {metros(m.n, 2)} · E {metros(m.e, 2)} · σ {m.sigma} m</li>)}</ul> : <p className="note">Nenhum marco dentro do enquadramento.</p>}
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Pins ({pins.length})</h2>
        <p className="hint">Pin = média de uma ocupação. <b>espalh.</b> = precisão (desvio das leituras). <b>vs marco</b> = acurácia (distância à coordenada oficial). Clique em 📷 para ver a foto do ponto.</p>
        {pins.length ? <div className="scrollx tbl-wrap"><table className="matrix"><thead><tr><th className="nm">Aluno</th><th>pin</th><th>N</th><th>E</th><th>alt.</th><th>leit.</th><th>±hz</th><th>espalh.</th><th>vs marco</th><th>aula</th><th>quando</th><th>foto</th></tr></thead>
          <tbody>{pins.map(p => { const m = p.marco_ref ? marcoPorNome(p.marco_ref) : null; const err = m ? Math.hypot(p.utm_n - m.n, p.utm_e - m.e) : null
            return <tr key={p.id}>
              <td className="nm">{p.alunos?.nome}</td><td>{p.nome}</td><td>{metros(p.utm_n, 2)}</td><td>{metros(p.utm_e, 2)}</td><td>{p.altitude_m != null ? metros(p.altitude_m, 1) : '—'}</td><td>{p.n_leituras}</td>
              <td>{p.acuracia_media_m != null ? metros(p.acuracia_media_m, 1) : '—'}</td><td>{metros(Math.hypot(p.desvio_n_m || 0, p.desvio_e_m || 0), 1)}</td>
              <td className={err != null ? (err < 10 ? 'P' : 'F') : ''}>{err != null ? metros(err, 1) + ' m' : '—'}</td>
              <td>{sessPorId[p.sessao_id]?.codigo || '—'}</td><td>{fmtHora(p.criado_em)}</td>
              <td>{p.tem_foto ? <button className="btn ghost mini" onClick={() => abrirFoto(p)}>📷</button> : '—'}</td>
            </tr> })}</tbody></table></div> : <p className="empty">Nenhum pin no filtro.</p>}
      </div>

      <div className="panel">
        <h2>Poligonais ({polis.length})</h2>
        {polis.length ? <div className="scrollx tbl-wrap"><table className="matrix"><thead><tr><th className="nm">Aluno</th><th>poligonal</th><th>vért.</th><th>perímetro</th><th>área</th><th>erro médio/vért.</th><th>vértices (pins)</th><th>quando</th></tr></thead>
          <tbody>{polis.map(q => { const r = q.resultado || {}, c = r.comparacao
            return <tr key={q.id}><td className="nm">{q.alunos?.nome}</td><td>{q.nome}</td><td>{r.vertices}</td>
              <td>{r.perimetro != null ? metros(r.perimetro, 1) + ' m' : '—'}</td><td>{r.area != null ? metros(r.area, 0) + ' m²' : '—'}</td>
              <td className={c ? (c.erroMedioVertice < 10 ? 'P' : 'F') : ''}>{c ? metros(c.erroMedioVertice, 1) + ' m' : '—'}</td>
              <td style={{ whiteSpace: 'normal', textAlign: 'left', maxWidth: 260 }}>{(q.pin_ids || []).map(id => pinPorId[id]?.nome || '?').join(' → ')}</td>
              <td>{fmtHora(q.criado_em)}</td></tr> })}</tbody></table></div> : <p className="empty">Nenhuma poligonal no filtro.</p>}
      </div>

      <div className="panel">
        <h2>Leituras ({leituras.length})</h2>
        {leituras.length ? <>
          <div className="scrollx tbl-wrap"><table className="matrix"><thead><tr><th className="nm">Aluno</th><th>ambiente</th><th>chamada</th><th>capturada</th><th>N</th><th>E</th><th>±hz</th><th>alt.</th><th>±v</th><th>até PERC</th><th>TTFF</th><th>rede</th><th>aparelho</th><th>aula</th></tr></thead>
            <tbody>{leituras.slice(0, mostrar).map(l => <tr key={l.id}>
              <td className="nm">{l.alunos?.nome}</td>
              <td><i className="dot" style={{ background: COR[l.rotulo] || COR.outro }} />{NOME[l.rotulo] || l.rotulo}{l.extra?.local_descricao ? ' · ' + l.extra.local_descricao : ''}{l.extra?.pin_nome ? ' · ' + l.extra.pin_nome : ''}</td>
              <td className={ehChamada(l) ? (l.presenca_marcada ? 'P' : 'F') : ''}>{ehChamada(l) ? (l.presenca_marcada ? 'presença' : 'fora da janela') : '—'}</td>
              <td>{fmtHora(l.capturado_em || l.criado_em)}</td>
              <td>{l.utm_n != null ? metros(l.utm_n, 1) : '—'}</td><td>{l.utm_e != null ? metros(l.utm_e, 1) : '—'}</td>
              <td>{metros(l.acuracia_m, 1)}</td><td>{l.altitude_m != null ? metros(l.altitude_m, 1) : '—'}</td><td>{l.alt_acuracia_m != null ? metros(l.alt_acuracia_m, 1) : '—'}</td>
              <td>{l.dist_perc_m == null ? '—' : l.dist_perc_m > 2000 ? metros(l.dist_perc_m / 1000, 1) + ' km' : metros(l.dist_perc_m, 0) + ' m'}</td>
              <td>{l.ttff_ms != null ? (l.ttff_ms / 1000).toFixed(1).replace('.', ',') + ' s' : '—'}</td>
              <td>{l.online_na_captura == null ? '—' : l.online_na_captura ? 'sim' : 'não'}</td>
              <td>{l.extra?.plataforma || '—'}</td><td>{sessPorId[l.sessao_id]?.codigo || '—'}</td>
            </tr>)}</tbody></table></div>
          {leituras.length > mostrar && <div className="btnrow"><button className="btn ghost mini" onClick={() => setMostrar(m => m + 300)}>Mostrar mais ({leituras.length - mostrar} restantes)</button></div>}
        </> : <p className="empty">Nenhuma leitura no filtro.</p>}
      </div>

      {fotoAberta && <div className="foto-modal" onClick={() => setFotoAberta(null)}>
        <div className="foto-box" onClick={e => e.stopPropagation()}>
          <img src={fotoAberta.src} alt="" />
          <div className="foto-leg"><b>{fotoAberta.pin.nome}</b> · {fotoAberta.pin.alunos?.nome} · {fmtHora(fotoAberta.pin.criado_em)}<br />
            N {metros(fotoAberta.pin.utm_n, 2)} · E {metros(fotoAberta.pin.utm_e, 2)} · {fotoAberta.pin.n_leituras} leituras · espalh. ±{metros(Math.hypot(fotoAberta.pin.desvio_n_m || 0, fotoAberta.pin.desvio_e_m || 0), 1)} m</div>
          <div className="btnrow"><a className="btn ghost mini" href={fotoAberta.src} download={`pin_${fotoAberta.pin.nome}.jpg`}>Baixar foto</a><button className="btn ghost mini" onClick={() => setFotoAberta(null)}>Fechar</button></div>
        </div>
      </div>}
    </>
  )
}
