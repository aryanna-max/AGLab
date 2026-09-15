import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as store from './lib/store'
import { PERC, paraUTM25S, deUTM25S, metros } from './lib/geo'
import { MARCOS, marcoPorNome, calcularPoligonal, ordenarPorAngulo, grausDMS, rumo } from './lib/topo'

/* Análise — a mesa de trabalho da professora, pensada para o computador.
   Tudo o que os alunos da turma mandaram: leituras (chamada e ambientes),
   pins (ocupações) e poligonais, filtrados por período, aula e aluno,
   desenhados em planta UTM com os marcos do campus, e exportáveis em CSV. */

const COR = { sala: '#2E75B6', corredor: '#17A2B8', patio: '#2E8B57', outro: '#8A9099', ocupacao: '#7B4F00' }
const NOME = { sala: 'Dentro da sala', corredor: 'Corredor', patio: 'Pátio', outro: 'Outro', ocupacao: 'Ocupação (pin)' }
const PERIODOS = [['hoje', 'Hoje'], ['7', '7 dias'], ['30', '30 dias'], ['tudo', 'Tudo']]
const ACC_MAX = [[10, '≤ 10 m'], [25, '≤ 25 m'], [50, '≤ 50 m'], [100, '≤ 100 m'], ['', 'todas']]
const CORES_POR = [['ambiente', 'ambiente'], ['aluno', 'aluno'], ['acuracia', 'acurácia'], ['aula', 'aula']]
const FAIXAS = [[0, 5, '0–5'], [5, 10, '5–10'], [10, 20, '10–20'], [20, 50, '20–50'], [50, Infinity, '> 50']]
const hsl = (i, n) => `hsl(${Math.round((i / Math.max(1, n)) * 330)} 65% 45%)`
const corAcc = a => { if (a == null) return '#8A9099'; const t = Math.max(0, Math.min(1, a / 50)); return `hsl(${Math.round(130 - 130 * t)} 70% 42%)` }
const W = 760, H = 540, PAD = 44
/* Fundos de mapa (tiles Web Mercator, sem chave). Cada tile é colocado pelos cantos
   convertidos para UTM: a rotação da grade (≈0,3° aqui) e a variação de escala
   dentro de um tile são desprezíveis na escala do campus — é um fundo, não uma base. */
const FUNDOS = {
  nenhum: null,
  osm: { url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`, credito: '© OpenStreetMap', zmax: 19 },
  sat: { url: (z, x, y) => `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`, credito: 'Esri World Imagery', zmax: 19 },
}
const CAMADAS = [['leituras', 'leituras'], ['pins', 'pins'], ['polis', 'poligonais'], ['marcos', 'marcos'], ['grade', 'grade UTM']]

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
  const [alunosSel, setAlunosSel] = useState([])   // vazio = todos; 2+ = modo comparação
  const [selPoli, setSelPoli] = useState(null)     // poligonal clicada (planta ou tabela)
  const temAluno = id => !alunosSel.length || alunosSel.includes(id)
  const addAluno = id => { if (id && !alunosSel.includes(id)) setAlunosSel(a => [...a, id]) }
  const [rotulos, setRotulos] = useState(() => new Set(Object.keys(COR)))
  const [soChamada, setSoChamada] = useState(false)
  const [maxAcc, setMaxAcc] = useState('')           // filtro: leituras piores que isso saem de tudo
  const [corPor, setCorPor] = useState('ambiente')
  const [raios, setRaios] = useState(false)          // círculo de acurácia em escala
  const [trilha, setTrilha] = useState(false)        // liga as leituras de cada aluno na ordem do tempo
  const [ocultas, setOcultas] = useState(() => new Set())   // leituras tiradas à mão (só nesta tela)
  const [sel, setSel] = useState(null)               // leitura clicada
  const [fundo, setFundo] = useState('nenhum')
  const [zoomK, setZoomK] = useState(1)                 // 1 = enquadramento automático
  const [pan, setPan] = useState({ dN: 0, dE: 0 })      // deslocamento do centro, em metros
  const arrasto = useRef(null)
  const svgRef = useRef(null)
  const [semCruzadas, setSemCruzadas] = useState(true)   // poligonais em laço fora da planta e das tabelas (regra dela, 15/09)
  const [camadas, setCamadas] = useState({ leituras: true, pins: true, polis: true, marcos: true, grade: true })
  const toggleCamada = k => setCamadas(c => ({ ...c, [k]: !c[k] }))
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
  useEffect(() => { setSessaoId(''); setAlunosSel([]); setSelPoli(null); setMostrar(200); setZoomK(1); setPan({ dN: 0, dE: 0 }) }, [tid])

  const leituras = useMemo(() => dados.leituras.filter(l =>
    (!sessaoId || l.sessao_id === sessaoId) && temAluno(l.aluno_id) &&
    rotulos.has(l.rotulo || 'outro') && (!soChamada || ehChamada(l)) && !ocultas.has(l.id) &&
    (maxAcc === '' || (l.acuracia_m != null && l.acuracia_m <= maxAcc))), [dados.leituras, sessaoId, alunosSel, rotulos, soChamada, ocultas, maxAcc])
  const alunosIdx = useMemo(() => { const m = {}; let i = 0; (t ? t.alunos : []).forEach(a => { m[a.id] = i++ }); return m }, [t])
  const sessIdx = useMemo(() => { const m = {}; dados.sessoes.forEach((s, i) => { m[s.id] = i }); return m }, [dados.sessoes])
  const corDe = l => corPor === 'aluno' ? hsl(alunosIdx[l.aluno_id] ?? 0, (t ? t.alunos.length : 1))
    : corPor === 'acuracia' ? corAcc(l.acuracia_m)
    : corPor === 'aula' ? hsl(sessIdx[l.sessao_id] ?? 0, Math.max(2, dados.sessoes.length))
    : (COR[l.rotulo] || COR.outro)
  const histo = useMemo(() => Object.keys(COR).map(k => ({ k, faixas: FAIXAS.map(([a, b]) => leituras.filter(l => (l.rotulo || 'outro') === k && l.acuracia_m != null && l.acuracia_m >= a && l.acuracia_m < b).length) })), [leituras])
  const trilhas = useMemo(() => {
    if (!trilha) return []
    const g = {}; leituras.forEach(l => { (g[l.aluno_id] = g[l.aluno_id] || []).push(l) })
    return Object.entries(g).map(([id, ls]) => ({ id, ls: ls.slice().sort((a, b) => new Date(a.capturado_em || a.criado_em) - new Date(b.capturado_em || b.criado_em)) })).filter(x => x.ls.length > 1)
  }, [leituras, trilha])
  const pins = useMemo(() => dados.pins.filter(p => temAluno(p.aluno_id) && (!sessaoId || p.sessao_id === sessaoId)), [dados.pins, alunosSel, sessaoId])
  const polisTodas = useMemo(() => dados.polis.filter(q => temAluno(q.aluno_id)), [dados.polis, alunosSel])
  const pinPorId = useMemo(() => { const m = {}; dados.pins.forEach(p => m[p.id] = p); return m }, [dados.pins])
  const sessPorId = useMemo(() => { const m = {}; dados.sessoes.forEach(s => m[s.id] = s); return m }, [dados.sessoes])
  // Recalcula cada poligonal pelos pins salvos: mostra se a ordem do aluno cruzou os lados
  // ("laço", área inválida) e qual seria a área com a ordem corrigida em volta do centro.
  const poliCalc = useMemo(() => { const m = {}; dados.polis.forEach(q => {
    const pts = (q.pin_ids || []).map(id => pinPorId[id]).filter(Boolean).map(p => ({ nome: p.nome, n: p.utm_n, e: p.utm_e }))
    if (pts.length < 3) return
    const r = calcularPoligonal(pts), rc = r.cruzada ? calcularPoligonal(ordenarPorAngulo(pts)) : null
    m[q.id] = { r, rc }
  }); return m }, [dados.polis, pinPorId])
  const polis = useMemo(() => polisTodas.filter(q => !semCruzadas || !(poliCalc[q.id]?.r?.cruzada)), [polisTodas, semCruzadas, poliCalc])
  const nCruzadas = polisTodas.filter(q => poliCalc[q.id]?.r?.cruzada).length

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
    const base = pontos
    const xs = base.map(p => p.e).concat(pins.map(p => p.utm_e)), ys = base.map(p => p.n).concat(pins.map(p => p.utm_n))
    if (!xs.length) { xs.push(PERC.utmE - 95); ys.push(PERC.utmN) }
    const cE = mediana(xs), cN = mediana(ys)
    const ds = xs.map((x, i) => Math.hypot(x - cE, ys[i] - cN))
    const half0 = Math.max(30, (percentil(ds, 0.95) || 30) * 1.15)
    const half = half0 / zoomK, cEz = cE + pan.dE, cNz = cN + pan.dN
    const esc = Math.min(W - 2 * PAD, H - 2 * PAD) / (2 * half)
    const passo = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500].find(p => p * esc >= 60) || 5000
    return { cE: cEz, cN: cNz, half, esc, passo, X: e => PAD + (W - 2 * PAD) / 2 + (e - cEz) * esc, Y: n => PAD + (H - 2 * PAD) / 2 - (n - cNz) * esc,
      deXY: (x, y) => ({ e: cEz + (x - PAD - (W - 2 * PAD) / 2) / esc, n: cNz - (y - PAD - (H - 2 * PAD) / 2) / esc }) }
  }, [pontos, pins, zoomK, pan])

  // zoom com a roda (em volta do cursor), arraste com o mouse ou o dedo, botões + − ⟲
  const pontoSvg = ev => { const r = svgRef.current.getBoundingClientRect(); const t = ev.touches ? ev.touches[0] : ev; return { x: (t.clientX - r.left) * W / r.width, y: (t.clientY - r.top) * H / r.height } }
  const aplicarZoom = (fator, xy) => {
    const kNovo = Math.max(0.25, Math.min(64, zoomK * fator))
    if (xy) { // mantém o ponto sob o cursor no lugar
      const antes = vista.deXY(xy.x, xy.y)
      const escNovo = vista.esc * (kNovo / zoomK)
      const cE = antes.e - (xy.x - PAD - (W - 2 * PAD) / 2) / escNovo, cN = antes.n + (xy.y - PAD - (H - 2 * PAD) / 2) / escNovo
      setPan({ dE: pan.dE + (cE - vista.cE), dN: pan.dN + (cN - vista.cN) })
    }
    setZoomK(kNovo)
  }
  const onWheel = ev => { ev.preventDefault(); aplicarZoom(ev.deltaY < 0 ? 1.25 : 1 / 1.25, pontoSvg(ev)) }
  const onDown = ev => { if (ev.button != null && ev.button !== 0) return; arrasto.current = { ...pontoSvg(ev), pan0: pan, moveu: false } }
  const onMove = ev => {
    const a = arrasto.current; if (!a) return
    const p = pontoSvg(ev); const dx = p.x - a.x, dy = p.y - a.y
    if (Math.abs(dx) + Math.abs(dy) > 3) a.moveu = true
    if (a.moveu) setPan({ dE: a.pan0.dE - dx / vista.esc, dN: a.pan0.dN + dy / vista.esc })
  }
  const onUp = () => { arrasto.current = null }
  useEffect(() => { const el = svgRef.current; if (!el) return; el.addEventListener('wheel', onWheel, { passive: false }); return () => el.removeEventListener('wheel', onWheel) })

  const grade = useMemo(() => {
    const { cE, cN, esc, passo } = vista
    const hw = (W - 2 * PAD) / 2 / esc, hh = (H - 2 * PAD) / 2 / esc
    const vs = [], hs = []
    for (let e = Math.ceil((cE - hw) / passo) * passo; e <= cE + hw; e += passo) vs.push(e)
    for (let n = Math.ceil((cN - hh) / passo) * passo; n <= cN + hh; n += passo) hs.push(n)
    return { vs, hs }
  }, [vista])

  const tiles = useMemo(() => {
    const F = FUNDOS[fundo]; if (!F) return []
    const { cE, cN, esc } = vista
    const hw = (W - 2 * PAD) / 2 / esc, hh = (H - 2 * PAD) / 2 / esc
    const sw = deUTM25S(cN - hh, cE - hw), ne = deUTM25S(cN + hh, cE + hw)
    const larguraM = 2 * hw, phi = ((sw.lat + ne.lat) / 2) * Math.PI / 180
    // zoom: o tile fica com ~1/3 da largura da vista
    let z = Math.floor(Math.log2(40075016.686 * Math.cos(phi) / (larguraM / 3)))
    z = Math.max(14, Math.min(F.zmax, z))
    const n = 2 ** z
    const tx = lon => Math.floor((lon + 180) / 360 * n)
    const ty = lat => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n) }
    const x0 = tx(sw.lon), x1 = tx(ne.lon), y0 = ty(ne.lat), y1 = ty(sw.lat)
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 48) return []
    const lonDe = x => x / n * 360 - 180
    const latDe = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI
    const out = []
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const nw = paraUTM25S(latDe(y), lonDe(x)), se = paraUTM25S(latDe(y + 1), lonDe(x + 1))
      out.push({ k: `${z}/${x}/${y}`, href: F.url(z, x, y), x: vista.X(nw.e), y: vista.Y(nw.n), w: vista.X(se.e) - vista.X(nw.e), h: vista.Y(se.n) - vista.Y(nw.n) })
    }
    return out
  }, [fundo, vista])

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
    const cab = ['aluno', 'poligonal', 'vertices', 'perimetro_m', 'area_m2', 'laco', 'area_corrigida_m2', 'erro_medio_vertice_m', 'criado_em', 'ordem', 'pin', 'utm_n', 'utm_e']
    const linhas = []
    polis.forEach(q => { const r0 = q.resultado || {}, c = r0.comparacao, pc = poliCalc[q.id], r = pc ? pc.r : r0
      ;(q.pin_ids || []).forEach((id, i) => { const p = pinPorId[id]; linhas.push([q.alunos?.nome, q.nome, r.vertices, r.perimetro, r.area, r.cruzada ? 1 : 0, pc && pc.rc ? pc.rc.area : (r.cruzada ? null : r.area), c ? c.erroMedioVertice : null, q.criado_em, i + 1, p?.nome, p?.utm_n, p?.utm_e].map(csvCel).join(';')) }) })
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
          <select value="" onChange={e => addAluno(e.target.value)}>
            <option value="">{alunosSel.length ? '+ comparar com outro aluno…' : `Todos os alunos (${alunosCom.length} com dados) — escolher…`}</option>
            {t.alunos.filter(a => !alunosSel.includes(a.id)).map(a => <option key={a.id} value={a.id}>{a.nome}{alunosCom.includes(a) ? '' : ' · sem dados'}</option>)}
          </select>
          <label className="chk-inline"><input type="checkbox" checked={soChamada} onChange={e => setSoChamada(e.target.checked)} /> só leituras de chamada</label>
          <span className="chk-inline">acurácia até
            <select value={maxAcc} onChange={e => setMaxAcc(e.target.value === '' ? '' : Number(e.target.value))} style={{ width: 'auto', minWidth: 0, margin: 0 }}>
              {ACC_MAX.map(([v, l]) => <option key={String(v)} value={v}>{l}</option>)}
            </select></span>
          <span className="chk-inline">cor por
            <select value={corPor} onChange={e => setCorPor(e.target.value)} style={{ width: 'auto', minWidth: 0, margin: 0 }}>
              {CORES_POR.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></span>
          <label className="chk-inline"><input type="checkbox" checked={raios} onChange={e => setRaios(e.target.checked)} /> raio de acurácia</label>
          <label className="chk-inline"><input type="checkbox" checked={trilha} onChange={e => setTrilha(e.target.checked)} /> trilha por aluno</label>
          <label className="chk-inline"><input type="checkbox" checked={semCruzadas} onChange={e => setSemCruzadas(e.target.checked)} /> ocultar poligonais em laço{nCruzadas ? ` (${nCruzadas})` : ''}</label>
          {ocultas.size > 0 && <button className="btn ghost mini" onClick={() => setOcultas(new Set())}>Mostrar {ocultas.size} oculta(s)</button>}
        </div>
        {alunosSel.length > 0 && <div className="ana-legenda" style={{ marginTop: 8 }}>
          {alunosSel.map(id => { const a = t.alunos.find(x => x.id === id); return <span key={id} className="chip on" style={{ '--c': hsl(alunosIdx[id] ?? 0, t.alunos.length), cursor: 'default' }}><i />{a ? a.nome : '?'} <b style={{ cursor: 'pointer', marginLeft: 4 }} onClick={() => setAlunosSel(s => s.filter(x => x !== id))} title="tirar da comparação">×</b></span> })}
          <button className="btn ghost mini" onClick={() => setAlunosSel([])}>Todos os alunos</button>
          {alunosSel.length >= 2 && corPor !== 'aluno' && <button className="btn ghost mini" onClick={() => setCorPor('aluno')}>colorir por aluno</button>}
        </div>}
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

      {alunosSel.length >= 2 && <div className="panel">
        <h2>Comparação — {alunosSel.length} alunos</h2>
        <div className="scrollx"><table className="matrix"><thead><tr><th className="nm">Aluno</th><th>leituras</th><th>chamadas</th><th>acurácia mediana</th><th>melhor</th><th>pior</th><th>sala</th><th>corredor</th><th>pátio</th><th>pins</th><th>espalh. médio</th><th>poligonais</th><th>aparelho</th></tr></thead>
          <tbody>{alunosSel.map(id => {
            const a = t.alunos.find(x => x.id === id); const ls = leituras.filter(l => l.aluno_id === id); const accs = ls.map(l => l.acuracia_m).filter(v => v != null)
            const ps = pins.filter(p => p.aluno_id === id); const esp = ps.map(p => Math.hypot(p.desvio_n_m || 0, p.desvio_e_m || 0))
            const porAmb = k => { const m = mediana(ls.filter(l => (l.rotulo || 'outro') === k).map(l => l.acuracia_m)); return m != null ? '± ' + metros(m, 1) : '—' }
            const plat = [...new Set(ls.map(l => l.extra?.plataforma).filter(Boolean))].join('/') || '—'
            return <tr key={id}><td className="nm"><i className="dot" style={{ background: hsl(alunosIdx[id] ?? 0, t.alunos.length) }} />{a?.nome}</td>
              <td>{ls.length}</td><td>{ls.filter(ehChamada).length}</td><td>{accs.length ? '± ' + metros(mediana(accs), 1) + ' m' : '—'}</td>
              <td className="P">{accs.length ? '± ' + metros(Math.min(...accs), 1) : '—'}</td><td className="F">{accs.length ? '± ' + metros(Math.max(...accs), 0) : '—'}</td>
              <td>{porAmb('sala')}</td><td>{porAmb('corredor')}</td><td>{porAmb('patio')}</td>
              <td>{ps.length}</td><td>{esp.length ? '± ' + metros(esp.reduce((s, v) => s + v, 0) / esp.length, 1) + ' m' : '—'}</td><td>{polis.filter(q => q.aluno_id === id).length}</td><td>{plat}</td></tr> })}</tbody></table></div>
        <p className="note">Mesmo ambiente, mesma aula, celulares diferentes: a diferença entre linhas é o aparelho e o jeito de segurar. "Espalh. médio" é a precisão média das ocupações (pins) de cada um.</p>
      </div>}

      <div className="ana-grid">
        <div className="panel ana-map">
          <h2>Planta UTM 25 S</h2>
          <div className="ana-map-wrap">
          <div className="ana-zoom">
            <button className="btn ghost mini" onClick={() => aplicarZoom(1.5)} title="aproximar">+</button>
            <button className="btn ghost mini" onClick={() => aplicarZoom(1 / 1.5)} title="afastar">−</button>
            <button className="btn ghost mini" onClick={() => { setZoomK(1); setPan({ dN: 0, dE: 0 }) }} title="reenquadrar">⟲</button>
            <span className="ana-zoom-k">{zoomK === 1 ? 'auto' : (zoomK >= 1 ? zoomK.toFixed(1) : zoomK.toFixed(2)) + '×'}</span>
          </div>
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className={'ana-svg' + (arrasto.current ? ' arrastando' : '')}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}>
            <defs><clipPath id="ana-clip"><rect x={PAD} y={PAD} width={W - 2 * PAD} height={H - 2 * PAD} /></clipPath></defs>
            <rect x={PAD} y={PAD} width={W - 2 * PAD} height={H - 2 * PAD} className="ana-papel" />
            {tiles.length > 0 && <g clipPath="url(#ana-clip)" opacity={0.85}>{tiles.map(tl => <image key={tl.k} href={tl.href} x={tl.x} y={tl.y} width={tl.w} height={tl.h} preserveAspectRatio="none" />)}</g>}
            {camadas.grade && grade.vs.map(e => <g key={'v' + e}><line x1={vista.X(e)} y1={PAD} x2={vista.X(e)} y2={H - PAD} className="ana-linha" /><text x={vista.X(e)} y={H - PAD + 14} className="ana-lab" textAnchor="middle">{Math.round(e)}</text></g>)}
            {camadas.grade && grade.hs.map(n => <g key={'h' + n}><line x1={PAD} y1={vista.Y(n)} x2={W - PAD} y2={vista.Y(n)} className="ana-linha" /><text x={PAD - 4} y={vista.Y(n) + 3} className="ana-lab" textAnchor="end">{Math.round(n)}</text></g>)}
            <text x={W / 2} y={H - 6} className="ana-lab" textAnchor="middle">E (m) · UTM 25 S · SIRGAS2000</text>
            <text transform={`translate(12 ${H / 2}) rotate(-90)`} className="ana-lab" textAnchor="middle">N (m)</text>

            {camadas.polis && polis.map(q => { const pts = (q.pin_ids || []).map(id => pinPorId[id]).filter(Boolean); if (pts.length < 2) return null
              return <polygon key={q.id} clipPath="url(#ana-clip)" points={pts.map(p => `${vista.X(p.utm_e)},${vista.Y(p.utm_n)}`).join(' ')} className={'ana-poli' + (selPoli && selPoli.id === q.id ? ' sel' : '')} style={{ cursor: 'pointer' }} onClick={() => setSelPoli(q)}><title>{`${q.alunos?.nome} · ${q.nome} — clique para detalhes`}</title></polygon> })}
            {selPoli && camadas.polis && (selPoli.pin_ids || []).map((id, i) => { const p = pinPorId[id]; if (!p) return null; const x = vista.X(p.utm_e), y = vista.Y(p.utm_n); if (!dentro(x, y)) return null
              return <g key={'sv' + id} transform={`translate(${x},${y})`}><circle r={9} className="ana-poli-v" /><text y={4} textAnchor="middle" className="ana-poli-vn">{i + 1}</text></g> })}

            {camadas.leituras && raios && pontos.map(({ l, n, e }) => { const x = vista.X(e), y = vista.Y(n); if (!dentro(x, y) || l.acuracia_m == null) return null
              return <circle key={'r' + l.id} clipPath="url(#ana-clip)" cx={x} cy={y} r={Math.max(1, l.acuracia_m * vista.esc)} fill={corDe(l)} fillOpacity={0.06} stroke={corDe(l)} strokeOpacity={0.35} /> })}
            {camadas.leituras && trilhas.map(tr => <polyline key={'t' + tr.id} clipPath="url(#ana-clip)" points={tr.ls.map(l => { const u = (l.utm_n == null || l.utm_e == null) ? paraUTM25S(l.lat, l.lon) : { n: l.utm_n, e: l.utm_e }; return `${vista.X(u.e)},${vista.Y(u.n)}` }).join(' ')} fill="none" stroke={hsl(alunosIdx[tr.id] ?? 0, (t ? t.alunos.length : 1))} strokeWidth={1.2} strokeOpacity={0.6} />)}
            {camadas.leituras && pontos.map(({ l, n, e }) => { const x = vista.X(e), y = vista.Y(n); if (!dentro(x, y)) return null
              return <circle key={l.id} cx={x} cy={y} r={sel && sel.id === l.id ? 7 : ehChamada(l) ? 4 : 3} fill={corDe(l)} className={'ana-pt' + (ehChamada(l) ? ' chamada' : '') + (sel && sel.id === l.id ? ' sel' : '')} style={{ cursor: 'pointer' }} onClick={() => { if (!(arrasto.current && arrasto.current.moveu)) setSel(l) }}>
                <title>{`${l.alunos?.nome || ''} · ${NOME[l.rotulo] || l.rotulo}${ehChamada(l) ? ' · CHAMADA' : ''} · ±${metros(l.acuracia_m, 1)} m · ${fmtHora(l.capturado_em || l.criado_em)}`}</title></circle> })}

            {camadas.pins && pins.map(p => { const x = vista.X(p.utm_e), y = vista.Y(p.utm_n); if (!dentro(x, y)) return null
              return <g key={p.id} transform={`translate(${x},${y})`} className="ana-pin" onClick={() => p.tem_foto && abrirFoto(p)} style={{ cursor: p.tem_foto ? 'pointer' : 'default' }}>
                <path d="M0,-7 L7,0 L0,7 L-7,0 Z" /><text y={-10} textAnchor="middle" className="ana-pin-lab">{p.nome}{p.tem_foto ? ' 📷' : ''}</text>
                <title>{`${p.alunos?.nome} · ${p.nome} · ${p.n_leituras} leituras · espalh. ±${metros(Math.hypot(p.desvio_n_m || 0, p.desvio_e_m || 0), 1)} m`}</title></g> })}

            {camadas.marcos && marcosVis.map(m => { const x = vista.X(m.e), y = vista.Y(m.n)
              return <g key={m.nome} transform={`translate(${x},${y})`} className={'ana-marco ' + m.tipo}><line x1={-8} x2={8} y1={0} y2={0} /><line y1={-8} y2={8} x1={0} x2={0} /><circle r={4} fill="none" />{m.tipo === 'provisorio' && <circle r={Math.max(6, (m.sigma || 0) * vista.esc)} fill="none" strokeDasharray="3 3" />}<text x={10} y={-6} className="ana-marco-lab">{m.nome}{m.tipo === 'provisorio' ? ' (provisório)' : ''}</text>
                {m.antigo && dentro(vista.X(m.antigo.e), vista.Y(m.antigo.n)) && <g transform={`translate(${vista.X(m.antigo.e) - x},${vista.Y(m.antigo.n) - y})`} opacity={0.55}><line x1={-6} x2={6} y1={-6} y2={6} /><line x1={-6} x2={6} y1={6} y2={-6} /><text x={9} y={12} className="ana-marco-lab">antigo</text></g>}</g> })}

            <g transform={`translate(${W - PAD - 10 - vista.passo * vista.esc} ${PAD + 16})`} className="ana-escala"><line x1={0} x2={vista.passo * vista.esc} y1={0} y2={0} /><text x={vista.passo * vista.esc / 2} y={-4} textAnchor="middle">{vista.passo} m</text></g>
            <text x={PAD + 6} y={PAD + 16} className="ana-lab">N ↑</text>
            {FUNDOS[fundo] && <text x={W - PAD - 4} y={H - PAD - 6} className="ana-lab" textAnchor="end" style={{ fontWeight: 600 }}>{FUNDOS[fundo].credito} · fundo aproximado</text>}
          </svg>
          </div>
          <p className="note" style={{ marginTop: 6 }}>Roda do mouse aproxima em volta do cursor · arraste para mover · ⟲ volta ao enquadramento automático. Grade e escala se ajustam ao zoom.</p>
          <div className="ana-camadas">
            <span className="chk-inline">fundo
              <select value={fundo} onChange={e => setFundo(e.target.value)} style={{ width: 'auto', minWidth: 0, margin: 0 }}>
                <option value="nenhum">nenhum</option><option value="osm">OpenStreetMap</option><option value="sat">satélite (Esri)</option>
              </select></span>
            {CAMADAS.map(([k, l]) => <label key={k} className="chk-inline"><input type="checkbox" checked={!!camadas[k]} onChange={() => toggleCamada(k)} /> {l}</label>)}
          </div>
          <div className="ana-legenda">
            {Object.keys(COR).map(k => <button key={k} className={'chip' + (rotulos.has(k) ? ' on' : '')} onClick={() => toggleRot(k)} style={{ '--c': COR[k] }}><i />{NOME[k]} <b>{kpi.porRot[k]?.n || 0}</b>{kpi.porRot[k]?.med != null ? <span> ±{metros(kpi.porRot[k].med, 1)} m</span> : null}</button>)}
            <span className="chip fixo"><i style={{ background: '#fff', border: '2px solid #b8860b' }} />anel dourado = leitura de chamada</span>
            <span className="chip fixo"><i style={{ background: '#1f1f1f', transform: 'rotate(45deg)', borderRadius: 1 }} />pin (losango) · 📷 tem foto</span>
            <span className="chip fixo"><i style={{ background: 'transparent', border: '1.5px solid #c0392b', borderRadius: '50%' }} />marco oficial (vermelho) · PERC (roxo)</span>
          </div>
          {foraDaVista > 0 && <p className="note">{foraDaVista} leitura(s) fora do enquadramento — desmarque "enquadrar só ±50 m" para ver tudo (a planta fica menor).</p>}
        </div>

        <div className="ana-lado">
          {selPoli && (() => { const pc = poliCalc[selPoli.id]; const r = pc ? pc.r : (selPoli.resultado || {}); const c = (selPoli.resultado || {}).comparacao
            const pts = (selPoli.pin_ids || []).map(id => pinPorId[id]).filter(Boolean)
            return <div className="panel" style={{ borderColor: '#7B4F00' }}>
              <h2 style={{ marginTop: 0 }}>Poligonal — {selPoli.nome.replace(/^Poligonal /, '')}</h2>
              <p className="hint" style={{ marginBottom: 6 }}><b>{selPoli.alunos?.nome}</b> · {fmtHora(selPoli.criado_em)} · aula {sessPorId[selPoli.sessao_id]?.codigo || '—'}{r.cruzada ? ' · ' : ''}{r.cruzada ? <span className="badge" style={{ background: 'var(--miss)', color: '#fff' }}>laço — área inválida</span> : null}</p>
              <div className="count-strip">
                <div className="c"><div className="n">{r.perimetro != null ? metros(r.perimetro, 1) : '—'}</div><div className="l">perímetro (m)</div></div>
                <div className={'c' + (r.cruzada ? ' miss' : '')}><div className="n">{r.cruzada ? '✗' : r.area != null ? metros(r.area, 0) : '—'}</div><div className="l">área (m²)</div></div>
                <div className="c"><div className="n">{r.sentido === 'horário' ? '↻' : r.sentido ? '↺' : '—'}</div><div className="l">{r.sentido || 'sentido'}</div></div>
              </div>
              {pc && pc.rc && <p className="note">Com a ordem corrigida: {metros(pc.rc.perimetro, 1)} m · {metros(pc.rc.area, 0)} m².</p>}
              <label className="fld">Vértices (na ordem do aluno)</label>
              <div className="scrollx"><table className="matrix"><thead><tr><th>#</th><th className="nm">pin</th><th>N</th><th>E</th><th>±hz</th><th>âng. interno</th></tr></thead>
                <tbody>{pts.map((p, i) => <tr key={p.id}><td>{i + 1}</td><td className="nm">{p.nome}{p.tem_foto ? ' 📷' : ''}</td><td>{metros(p.utm_n, 2)}</td><td>{metros(p.utm_e, 2)}</td><td>{p.acuracia_media_m != null ? metros(p.acuracia_media_m, 1) : '—'}</td><td>{r.angulos && r.angulos[i] ? grausDMS(r.angulos[i].interno) : '—'}</td></tr>)}</tbody></table></div>
              {r.angulos && <p className="note">Soma dos internos {grausDMS(r.somaAngulos)} · teórico {r.somaTeorica}° · erro {r.erroAngular != null ? (r.erroAngular >= 0 ? '+' : '') + r.erroAngular.toFixed(4) + '°' : '—'} (por GPS cada vértice é independente: o "erro" aqui é só arredondamento).</p>}
              <label className="fld">Lados</label>
              <div className="scrollx"><table className="matrix"><thead><tr><th className="nm">lado</th><th>distância</th><th>azimute</th><th>rumo</th></tr></thead>
                <tbody>{(r.lados || []).map((l, i) => <tr key={i}><td className="nm">{l.de} → {l.para}</td><td>{metros(l.dist, 2)} m</td><td>{grausDMS(l.azimute)}</td><td>{rumo(l.azimute)}</td></tr>)}</tbody></table></div>
              {c && <>
                <label className="fld">Comparação com os marcos oficiais</label>
                <div className="scrollx"><table className="matrix"><thead><tr><th className="nm">vértice</th><th>erro</th><th>ΔN</th><th>ΔE</th></tr></thead>
                  <tbody>{c.errosVertice.map(v => <tr key={v.vertice}><td className="nm">{v.vertice}</td><td className={v.erro < 10 ? 'P' : 'F'}>{metros(v.erro, 2)} m</td><td>{(v.dN >= 0 ? '+' : '') + metros(v.dN, 2)}</td><td>{(v.dE >= 0 ? '+' : '') + metros(v.dE, 2)}</td></tr>)}</tbody></table></div>
                <p className="note">Perímetro real {metros(c.perimetro.real, 1)} m ({c.perimetro.erroPct >= 0 ? '+' : ''}{c.perimetro.erroPct.toFixed(1)}%) · área real {metros(c.area.real, 0)} m² ({c.area.erroPct >= 0 ? '+' : ''}{c.area.erroPct.toFixed(1)}%).</p>
              </>}
              <div className="btnrow">
                <button className="btn ghost mini" onClick={() => addAluno(selPoli.aluno_id)}>{alunosSel.length ? 'Comparar este aluno' : 'Só este aluno'}</button>
                <button className="btn ghost mini" onClick={() => setSelPoli(null)}>Fechar</button>
              </div>
            </div> })()}
          {sel && <div className="panel" style={{ borderColor: 'var(--brand)' }}>
            <h2 style={{ marginTop: 0 }}>Leitura selecionada</h2>
            <p className="hint" style={{ marginBottom: 6 }}><b>{sel.alunos?.nome}</b> · {NOME[sel.rotulo] || sel.rotulo}{sel.extra?.local_descricao ? ' · ' + sel.extra.local_descricao : ''}{ehChamada(sel) ? ' · CHAMADA' : ''}</p>
            <ul className="lista-simples">
              <li>capturada {fmtHora(sel.capturado_em || sel.criado_em)}{sel.criado_em && sel.capturado_em && (new Date(sel.criado_em) - new Date(sel.capturado_em) > 120000) ? ' · subiu da fila ' + fmtHora(sel.criado_em) : ''}</li>
              <li>N {sel.utm_n != null ? metros(sel.utm_n, 1) : '—'} · E {sel.utm_e != null ? metros(sel.utm_e, 1) : '—'}</li>
              <li>acurácia ± {metros(sel.acuracia_m, 1)} m · vertical {sel.alt_acuracia_m != null ? '± ' + metros(sel.alt_acuracia_m, 1) + ' m' : '—'} · alt. {sel.altitude_m != null ? metros(sel.altitude_m, 1) + ' m' : '—'}</li>
              <li>até a PERC {sel.dist_perc_m != null ? metros(sel.dist_perc_m, 0) + ' m' : '—'} · TTFF {sel.ttff_ms != null ? (sel.ttff_ms / 1000).toFixed(1).replace('.', ',') + ' s' : '—'}</li>
              <li>{sel.extra?.plataforma || 'aparelho ?'} · rede na captura: {sel.online_na_captura == null ? '?' : sel.online_na_captura ? 'sim' : 'não'} · aula {sessPorId[sel.sessao_id]?.codigo || '—'}</li>
            </ul>
            <div className="btnrow">
              <button className="btn ghost mini" onClick={() => { setOcultas(o => { const n = new Set(o); n.add(sel.id); return n }); setSel(null) }}>Ocultar esta leitura</button>
              <button className="btn ghost mini" onClick={() => addAluno(sel.aluno_id)}>{alunosSel.length ? 'Comparar este aluno' : 'Só este aluno'}</button>
              <button className="btn ghost mini" onClick={() => setSel(null)}>Fechar</button>
            </div>
            <p className="note">Ocultar vale só nesta tela — nada é apagado do banco. Para um aparelho ruim recorrente, use "acurácia até".</p>
          </div>}
          <div className="panel">
            <h2>Acurácia por faixa</h2>
            <svg viewBox="0 0 320 130" className="ana-histo">
              {(() => { const maxN = Math.max(1, ...FAIXAS.map((_, j) => histo.reduce((sm, h) => sm + h.faixas[j], 0))); return FAIXAS.map(([a, b, lab], j) => {
                const x = 30 + j * 56, tot = histo.reduce((sm, h) => sm + h.faixas[j], 0); let y = 100
                return <g key={lab}>{histo.map(h => { const hgt = (h.faixas[j] / maxN) * 80; y -= hgt; return h.faixas[j] ? <rect key={h.k} x={x} y={y} width={40} height={hgt} fill={COR[h.k]}><title>{`${NOME[h.k]} · ${lab} m: ${h.faixas[j]}`}</title></rect> : null })}
                  <text x={x + 20} y={114} textAnchor="middle" className="ana-lab">{lab} m</text>
                  <text x={x + 20} y={Math.min(96, y - 3)} textAnchor="middle" className="ana-lab" style={{ fontWeight: 700 }}>{tot || ''}</text></g> }) })()}
              <line x1={26} x2={314} y1={100} y2={100} className="ana-linha" />
            </svg>
            <p className="note">Quantas leituras caem em cada faixa de acurácia, empilhadas por ambiente. A cauda à direita é o que atrapalha a planta: filtre em "acurácia até" ou clique na leitura e oculte.</p>
          </div>
          <div className="panel">
            <h2>Por ambiente</h2>
            <div className="scrollx"><table className="matrix"><thead><tr><th className="nm">Ambiente</th><th>leituras</th><th>acurácia mediana</th></tr></thead>
              <tbody>{Object.keys(COR).map(k => <tr key={k}><td className="nm"><i className="dot" style={{ background: COR[k] }} />{NOME[k]}</td><td>{kpi.porRot[k]?.n || 0}</td>
                <td className={kpi.porRot[k]?.med != null ? (k === 'patio' ? 'P' : kpi.porRot[k].med > 20 ? 'F' : '') : ''}>{kpi.porRot[k]?.med != null ? '± ' + metros(kpi.porRot[k].med, 1) + ' m' : '—'}</td></tr>)}</tbody></table></div>
            <p className="note">Dentro da sala a acurácia piora: multicaminho e atenuação do sinal. É o experimento da disciplina em números.</p>
          </div>
          <div className="panel">
            <h2>Marcos na planta</h2>
            {marcosVis.length ? <ul className="lista-simples">{marcosVis.map(m => <li key={m.nome}><b>{m.nome}</b> · N {metros(m.n, 2)} · E {metros(m.e, 2)} · σ {m.sigma} m{m.nota ? <><br /><span style={{ color: 'var(--miss)' }}>{m.nota}</span></> : null}</li>)}</ul> : <p className="note">Nenhum marco dentro do enquadramento.</p>}
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
        <p className="hint">Área e perímetro <b>recalculados pelos pins salvos</b>. <b>Laço</b> = o aluno tocou os pins fora da ordem do contorno e os lados se cruzam: a área que ele viu não vale. "Corrigida" reordena os vértices em volta do centro.</p>
        {polis.length ? <div className="scrollx tbl-wrap"><table className="matrix"><thead><tr><th className="nm">Aluno</th><th>poligonal</th><th>vért.</th><th>perímetro</th><th>área</th><th>área corrigida</th><th>erro médio/vért.</th><th>vértices (pins)</th><th>quando</th></tr></thead>
          <tbody>{polis.map(q => { const r0 = q.resultado || {}, c = r0.comparacao, pc = poliCalc[q.id], r = pc ? pc.r : r0
            return <tr key={q.id} className={(r.cruzada ? 'reocup' : '') + (selPoli && selPoli.id === q.id ? ' sel-row' : '')} style={{ cursor: 'pointer' }} onClick={() => setSelPoli(q)}><td className="nm">{q.alunos?.nome}</td><td>{q.nome}{r.cruzada ? <span className="badge" style={{ marginLeft: 6, background: 'var(--miss)', color: '#fff' }}>laço</span> : null}</td><td>{r.vertices}</td>
              <td>{r.perimetro != null ? metros(r.perimetro, 1) + ' m' : '—'}</td>
              <td className={r.cruzada ? 'F' : ''}>{r.area != null ? metros(r.area, 0) + ' m²' : '—'}</td>
              <td>{pc && pc.rc ? metros(pc.rc.area, 0) + ' m²' : r.cruzada ? '—' : '='}</td>
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
