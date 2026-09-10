import React, { useEffect, useRef, useState } from 'react'
import * as store from './lib/store'
import { PERC, paraUTM25S } from './lib/geo'

/* Radar da professora: quem está por perto, como bolinhas com foto.
   - aceso (anel verde pulsando): mandou batimento nos últimos 90 s — está com o Meu GPS ou a Chamada aberta
   - apagado (anel cinza): marcou presença hoje, mas não está transmitindo agora
   - quem não fez nenhum dos dois não aparece
   Centro: a posição do celular da professora; se negada, o Bloco F. Norte para cima. */

const VIVO_S = 90
const BLOCO_F = { lat: -8.0587608, lon: -34.9512426 }
const ALCANCES = [25, 50, 100]          // anéis de referência, em metros
const RAIO_MAX_M = 120                  // além disso a bolinha fica na borda

const initials = n => { const p = String(n || '').trim().split(/\s+/); return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?' }

export default function Radar({ userId, turmas, online, showToast }) {
  const [tid, setTid] = useState(turmas[0]?.id || '')
  const [vivos, setVivos] = useState([])          // presenca_viva da turma
  const [presentes, setPresentes] = useState({})  // aluno_id -> true (hoje)
  const [centro, setCentro] = useState(null)       // {lat, lon, acc, origem}
  const [agora, setAgora] = useState(Date.now())
  const watchRef = useRef(null)
  const t = turmas.find(x => x.id === tid)

  // centro: o celular dela
  useEffect(() => {
    if (!navigator.geolocation) { setCentro({ ...BLOCO_F, acc: null, origem: 'Bloco F' }); return }
    watchRef.current = navigator.geolocation.watchPosition(
      p => setCentro({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, origem: 'você' }),
      () => setCentro(c => c || { ...BLOCO_F, acc: null, origem: 'Bloco F' }),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 })
    return () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current) }
  }, [])

  // dados: batimentos + presenças de hoje, a cada 5 s
  useEffect(() => {
    if (!tid || !online) return
    let vivo = true
    const puxa = async () => {
      try {
        const [v, ch] = await Promise.all([store.vivos(tid), store.ensureChamada(userId, tid, hojeISO())])
        if (!vivo) return
        setVivos(v)
        const p = await store.getPresentes(ch.id); if (!vivo) return
        const m = {}; p.forEach(id => m[id] = true); setPresentes(m)
        setAgora(Date.now())
      } catch (e) {}
    }
    puxa()
    const it = setInterval(puxa, 5000)
    return () => { vivo = false; clearInterval(it) }
  }, [tid, online, userId])

  if (!t) return <div className="panel"><p className="empty">Sem turma.</p></div>

  const c0 = centro ? paraUTM25S(centro.lat, centro.lon) : null
  const vivoMap = {}; vivos.forEach(v => vivoMap[v.aluno_id] = v)

  // monta a lista de bolinhas
  const bolinhas = t.alunos.map(a => {
    const v = vivoMap[a.id]
    const aceso = v && (agora - new Date(v.visto_em).getTime()) / 1000 < VIVO_S
    const presente = !!presentes[a.id]
    if (!aceso && !presente) return null
    let dN = null, dE = null, dist = null
    if (v && v.lat != null && c0) {
      const u = paraUTM25S(v.lat, v.lon); dN = u.n - c0.n; dE = u.e - c0.e; dist = Math.hypot(dN, dE)
    }
    return { a, v, aceso, presente, dN, dE, dist }
  }).filter(Boolean)

  const nAceso = bolinhas.filter(b => b.aceso).length
  const nPres = Object.keys(presentes).length

  // geometria do radar (SVG 0..400)
  const S = 400, cx = S / 2, cy = S / 2, R = S / 2 - 26
  const escala = m => Math.min(R, (m / RAIO_MAX_M) * R)
  const posXY = b => {
    if (b.dist == null) return null
    const d = escala(b.dist), ang = Math.atan2(b.dE, b.dN)   // 0 = norte (para cima)
    return { x: cx + d * Math.sin(ang), y: cy - d * Math.cos(ang) }
  }
  // sem posição (só presença, sem batimento): distribui em volta da borda, apagadas
  const semPos = bolinhas.filter(b => posXY(b) == null)

  return (
    <div className="panel">
      <h2>Radar — quem está por perto</h2>
      <p className="hint">Aceso: está com o Meu GPS ou a Chamada aberta agora. Apagado: marcou presença hoje, mas não está transmitindo.</p>
      <label className="fld">Turma</label>
      <select value={tid} onChange={e => setTid(e.target.value)}>{turmas.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>

      <div className="count-strip" style={{ marginTop: 12 }}>
        <div className="c ok"><div className="n">{nAceso}</div><div className="l">ao vivo</div></div>
        <div className="c"><div className="n">{nPres}</div><div className="l">presentes hoje</div></div>
        <div className="c"><div className="n">{t.alunos.length - Math.max(nPres, bolinhas.length)}</div><div className="l">sem sinal</div></div>
      </div>

      <div className="radar-wrap">
        <svg className="radar" viewBox={`0 0 ${S} ${S}`}>
          <defs>
            <radialGradient id="rg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(46,117,182,.25)" /><stop offset="100%" stopColor="rgba(46,117,182,0)" />
            </radialGradient>
          </defs>
          <circle cx={cx} cy={cy} r={R} fill="url(#rg)" stroke="var(--line)" />
          {ALCANCES.map(m => <g key={m}>
            <circle cx={cx} cy={cy} r={escala(m)} fill="none" stroke="var(--line)" strokeDasharray="3 4" />
            <text x={cx + 4} y={cy - escala(m) - 3} className="radar-lab">{m} m</text>
          </g>)}
          <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} stroke="var(--line)" strokeDasharray="2 6" />
          <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} stroke="var(--line)" strokeDasharray="2 6" />
          <text x={cx} y={16} className="radar-lab" textAnchor="middle">N</text>

          {/* centro: a professora */}
          <circle cx={cx} cy={cy} r={7} className="radar-eu" />
          <text x={cx} y={cy + 22} className="radar-lab" textAnchor="middle">{centro?.origem || '…'}</text>

          {/* bolinhas sem posição: na borda, apagadas */}
          {semPos.map((b, i) => {
            const ang = (i / Math.max(1, semPos.length)) * Math.PI * 2 - Math.PI / 2
            return <Bolinha key={b.a.id} b={b} x={cx + (R + 12) * Math.cos(ang)} y={cy + (R + 12) * Math.sin(ang)} />
          })}
          {/* bolinhas com posição */}
          {bolinhas.map(b => { const p = posXY(b); return p ? <Bolinha key={b.a.id} b={b} x={p.x} y={p.y} /> : null })}
        </svg>
      </div>
      <p className="note">Centro: {centro?.origem === 'você' ? `o seu celular (±${Math.round(centro.acc || 0)} m)` : 'o Bloco F (localização negada ou indisponível)'}. Norte para cima. Quem estiver a mais de {RAIO_MAX_M} m fica na borda.</p>
      {!online && <p className="note" style={{ color: 'var(--miss)' }}>Offline — o radar precisa de internet.</p>}
    </div>
  )
}

function Bolinha({ b, x, y }) {
  const r = 20
  return (
    <g className={'bol ' + (b.aceso ? 'aceso' : 'apagado')} transform={`translate(${x},${y})`}>
      {b.aceso && <circle r={r + 7} className="bol-pulso" />}
      <circle r={r + 3} className="bol-anel" />
      <clipPath id={'clip-' + b.a.id}><circle r={r} /></clipPath>
      {b.a.foto
        ? <image href={b.a.foto} x={-r} y={-r} width={2 * r} height={2 * r} clipPath={`url(#clip-${b.a.id})`} preserveAspectRatio="xMidYMid slice" />
        : <><circle r={r} className="bol-fundo" /><text y={5} textAnchor="middle" className="bol-ini">{initials(b.a.nome)}</text></>}
      <text y={r + 14} textAnchor="middle" className="bol-nome">{String(b.a.nome).split(' ')[0]}{b.dist != null ? ` · ${Math.round(b.dist)} m` : ''}</text>
    </g>
  )
}

const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
