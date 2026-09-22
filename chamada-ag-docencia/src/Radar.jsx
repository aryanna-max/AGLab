import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as store from './lib/store'
import { paraUTM25S } from './lib/geo'
import { iniciais as initials } from './Avatar.jsx'

/* Radar da professora: quem está por perto, como bolinhas com foto.
   - aceso (anel verde pulsando): mandou batimento nos últimos 90 s — está com o Orbe ou a Chamada aberta
   - apagado (anel cinza): marcou presença hoje, mas não está transmitindo agora
   - quem não fez nenhum dos dois não aparece
   Centro: a posição do celular da professora; se negada, o Bloco F. Norte para cima.
   Quando há auxiliar com a caderneta do dia e ela está transmitindo, o centro passa
   a ser ELA: com a professora longe, um radar centrado na casa dela não diz nada —
   o que importa é como a turma se distribui em volta de quem está em campo.
   Decisão dela (18/09/2026): o centro pode ser um PONTO FIXO — a melhor leitura já
   registrada pelo celular da auxiliar (a da Edilene em 11/09 teve ±3,5 m). Fixo é o
   padrão quando existe; "ao vivo" volta ao comportamento acima. No fixo, a auxiliar
   aparece como bolinha, igual aos alunos.
   Raio: barra de 10 a 250 m, ou "auto" (enquadra quem está transmitindo). Bolinhas
   sobrepostas são afastadas um pouco para nenhuma cobrir a outra. */

const VIVO_S = 90
const BLOCO_F = { lat: -8.0587608, lon: -34.9512426 }
const RAIO_MIN = 10, RAIO_MAX = 250
const PASSOS_AUTO = [15, 25, 40, 60, 100, 150, 250]

const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const fmtM = m => m >= 10 ? Math.round(m) + ' m' : m.toFixed(1).replace('.', ',') + ' m'

export default function Radar({ userId, tid, turmas, online, showToast, ehComputador }) {
  const [vivos, setVivos] = useState([])
  const [presentes, setPresentes] = useState({})
  const [centro, setCentro] = useState(null)
  const [agora, setAgora] = useState(Date.now())
  const [raioManual, setRaioManual] = useState(null)   // null = auto
  const [auxAcesso, setAuxAcesso] = useState(null)    // quem está com a caderneta hoje
  const [fixoAux, setFixoAux] = useState(null)        // melhor leitura já registrada pela auxiliar
  const [usarFixo, setUsarFixo] = useState(true)
  const watchRef = useRef(null)
  const t = turmas.find(x => x.id === tid)

  useEffect(() => {
    if (!tid || !online) { setAuxAcesso(null); return }
    store.acessoAuxiliarHoje(tid).then(setAuxAcesso).catch(() => setAuxAcesso(null))
  }, [tid, online])

  useEffect(() => {
    if (ehComputador) {
      // no computador a geolocalização é do Wi-Fi/IP: o centro passa a ser a última medição do celular dela
      const blocoF = () => setCentro({ ...BLOCO_F, acc: null, origem: 'Bloco F' })
      store.minhaUltimaLeitura().then(u => {
        if (u && u.lat != null) { const h = new Date(u.capturado_em || u.criado_em); setCentro({ lat: u.lat, lon: u.lon, acc: u.acuracia_m, origem: 'seu celular · ' + h.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }) }
        else blocoF()
      }).catch(blocoF)
      return
    }
    if (!navigator.geolocation) { setCentro({ ...BLOCO_F, acc: null, origem: 'Bloco F' }); return }
    watchRef.current = navigator.geolocation.watchPosition(
      p => setCentro({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, origem: 'você' }),
      () => setCentro(c => c || { ...BLOCO_F, acc: null, origem: 'Bloco F' }),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 })
    return () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current) }
  }, [ehComputador])

  useEffect(() => {
    if (!tid || !online) return
    let vivo = true
    const puxa = async () => {
      try {
        const [v, ch] = await Promise.all([store.vivos(tid), store.chamadaAuto(userId, turmas.find(x => x.id === tid), hojeISO())])
        if (!vivo) return
        setVivos(v)
        const p = ch ? await store.getPresentes(ch.id) : []; if (!vivo) return
        const m = {}; p.forEach(id => m[id] = true); setPresentes(m)
        setAgora(Date.now())
      } catch (e) {}
    }
    puxa()
    const it = setInterval(puxa, 5000)
    return () => { vivo = false; clearInterval(it) }
  }, [tid, online, userId])

  const vivoMap = {}; vivos.forEach(v => vivoMap[v.aluno_id] = v)

  useEffect(() => {
    const id = auxAcesso?.aluno_id
    if (!id || !online) { setFixoAux(null); return }
    store.melhorLeituraDe(id).then(setFixoAux).catch(() => setFixoAux(null))
  }, [auxAcesso?.aluno_id, online])

  /* Referência do dia: a auxiliar, enquanto o batimento dela estiver fresco.
     Parou de transmitir (fechou a tela, negou o GPS) — volta ao centro de sempre. */
  const auxId = auxAcesso?.aluno_id || null
  const auxNome = auxId ? [...(t?.auxiliares || []), ...(t?.alunos || [])].find(a => a.id === auxId)?.nome : null
  const refAux = (() => {
    if (!auxId) return null
    const v = vivoMap[auxId]
    if (!v || v.lat == null) return null
    if ((agora - new Date(v.visto_em).getTime()) / 1000 >= VIVO_S) return null
    // no centro cabe pouco: nome completo encosta no rótulo da bolinha vizinha
    return { lat: v.lat, lon: v.lon, acc: v.acuracia_m, origem: 'referencia',
             nome: auxNome || 'auxiliar', curto: String(auxNome || 'auxiliar').trim().split(/\s+/)[0] }
  })()

  const fixo = usarFixo && fixoAux ? { lat: fixoAux.lat, lon: fixoAux.lon, acc: fixoAux.acuracia_m,
    quando: new Date(fixoAux.capturado_em || fixoAux.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } : null
  const centroUsado = fixo || refAux || centro
  const c0 = centroUsado ? paraUTM25S(centroUsado.lat, centroUsado.lon) : null

  const bolinhas = (t ? t.alunos : []).filter(a => a.id !== (refAux && !fixo ? auxId : null)).map(a => {
    const v = vivoMap[a.id]
    const aceso = v && (agora - new Date(v.visto_em).getTime()) / 1000 < VIVO_S
    const presente = !!presentes[a.id]
    if (!aceso && !presente) return null
    let dN = null, dE = null, dist = null
    if (v && v.lat != null && c0) { const u = paraUTM25S(v.lat, v.lon); dN = u.n - c0.n; dE = u.e - c0.e; dist = Math.hypot(dN, dE) }
    return { a, v, aceso, presente, dN, dE, dist }
  }).filter(Boolean)

  // raio automático: o menor passo que enquadra quem está transmitindo (mínimo 15 m)
  const raioAuto = useMemo(() => {
    const ds = bolinhas.filter(b => b.dist != null && b.aceso).map(b => b.dist)
    const maior = ds.length ? Math.max(...ds) : 0
    return PASSOS_AUTO.find(p => p >= maior * 1.15) || RAIO_MAX
  }, [bolinhas.map(b => b.aceso ? Math.round(b.dist || 0) : 0).join(',')])
  const raioMax = raioManual ?? raioAuto
  const aneis = [raioMax / 4, raioMax / 2, raioMax]

  const nAceso = bolinhas.filter(b => b.aceso).length
  const nPres = Object.keys(presentes).length

  // geometria do SVG
  const S = 400, cx = S / 2, cy = S / 2, R = S / 2 - 26, rb = 20
  const escala = m => Math.min(R, (m / raioMax) * R)
  const comPos = bolinhas.filter(b => b.dist != null)
  const semPos = bolinhas.filter(b => b.dist == null)

  // posições + afastamento de sobrepostas (repulsão simples, poucas iterações)
  const pos = useMemo(() => {
    const p = comPos.map(b => { const d = escala(b.dist), ang = Math.atan2(b.dE, b.dN); return { id: b.a.id, x: cx + d * Math.sin(ang), y: cy - d * Math.cos(ang) } })
    const minD = 2 * rb + 6
    for (let it = 0; it < 40; it++) {
      let moveu = false
      for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) {
        let dx = p[j].x - p[i].x, dy = p[j].y - p[i].y, d = Math.hypot(dx, dy)
        if (d < minD) {
          if (d < 0.01) { dx = Math.cos(i * 2.4 + j); dy = Math.sin(i * 2.4 + j); d = 1 }
          const push = (minD - d) / 2, ux = dx / d, uy = dy / d
          p[i].x -= ux * push; p[i].y -= uy * push; p[j].x += ux * push; p[j].y += uy * push; moveu = true
        }
      }
      if (!moveu) break
    }
    // mantém dentro do círculo
    p.forEach(q => { const dx = q.x - cx, dy = q.y - cy, d = Math.hypot(dx, dy); if (d > R) { q.x = cx + dx / d * R; q.y = cy + dy / d * R } })
    const m = {}; p.forEach(q => m[q.id] = q); return m
  }, [comPos.map(b => `${b.a.id}:${Math.round(b.dN)}:${Math.round(b.dE)}`).join('|'), raioMax])

  if (!t) return <div className="panel"><p className="empty">Sem turma.</p></div>

  return (
    <div className="panel">
      <h2>Radar — quem está por perto</h2>
      <p className="hint">Aceso: está com o Orbe ou a Chamada aberta agora. Apagado: marcou presença hoje, mas não está transmitindo.</p>

      <div className="count-strip" style={{ marginTop: 12 }}>
        <div className="c ok"><div className="n">{nAceso}</div><div className="l">ao vivo</div></div>
        <div className="c"><div className="n">{nPres}</div><div className="l">presentes hoje</div></div>
        <div className="c"><div className="n">{t.alunos.length - Math.max(nPres, bolinhas.length)}</div><div className="l">sem sinal</div></div>
      </div>

      <div className="radar-ctl">
        <label className="fld" style={{ margin: 0 }}>Raio: <b>{fmtM(raioMax)}</b>{raioManual == null ? ' · auto' : ''}</label>
        <input type="range" min={RAIO_MIN} max={RAIO_MAX} step={1} value={raioMax}
          onChange={e => setRaioManual(Number(e.target.value))} />
        <div className="btnrow" style={{ marginTop: 4 }}>
          {[10, 25, 50, 100].map(r => <button key={r} className={'btn ghost mini' + (raioManual === r ? ' on' : '')} onClick={() => setRaioManual(r)}>{r} m</button>)}
          <button className={'btn ghost mini' + (raioManual == null ? ' on' : '')} onClick={() => setRaioManual(null)}>auto</button>
        </div>
      </div>

      <div className="radar-wrap">
        <svg className="radar" viewBox={`0 0 ${S} ${S}`}>
          <defs>
            <radialGradient id="rg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(46,117,182,.25)" /><stop offset="100%" stopColor="rgba(46,117,182,0)" />
            </radialGradient>
          </defs>
          <circle cx={cx} cy={cy} r={R} fill="url(#rg)" stroke="var(--line)" />
          {aneis.map(m => <g key={m}>
            <circle cx={cx} cy={cy} r={escala(m)} fill="none" stroke="var(--line)" strokeDasharray="3 4" />
            <text x={cx + 4} y={cy - escala(m) - 3} className="radar-lab">{fmtM(m)}</text>
          </g>)}
          <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} stroke="var(--line)" strokeDasharray="2 6" />
          <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} stroke="var(--line)" strokeDasharray="2 6" />
          <text x={cx} y={16} className="radar-lab" textAnchor="middle">N</text>

          {semPos.map((b, i) => {
            const ang = (i / Math.max(1, semPos.length)) * Math.PI * 2 - Math.PI / 2
            return <Bolinha key={b.a.id} b={b} x={cx + (R + 12) * Math.cos(ang)} y={cy + (R + 12) * Math.sin(ang)} r={rb} />
          })}
          {comPos.map(b => { const p = pos[b.a.id]; return p ? <Bolinha key={b.a.id} b={b} x={p.x} y={p.y} r={rb} /> : null })}

          {/* centro por cima de tudo: a professora */}
          <circle cx={cx} cy={cy} r={7} className="radar-eu" />
          <text x={cx + 11} y={cy + 4} className="radar-lab">{fixo ? 'ponto fixo' : refAux ? refAux.curto : (centro?.origem || '…')}</text>
        </svg>
      </div>
      {fixoAux && <div className="btnrow" style={{ marginTop: 4 }}>
        <button className={'btn ghost mini' + (usarFixo ? ' on' : '')} onClick={() => setUsarFixo(true)}>Centro fixo</button>
        <button className={'btn ghost mini' + (!usarFixo ? ' on' : '')} onClick={() => setUsarFixo(false)}>Centro ao vivo</button>
      </div>}
      {fixo && <p className="note" style={{ color: 'var(--brand2)' }}>
        Centro fixo: a melhor leitura do celular de <b>{auxNome || 'auxiliar'}</b>, em {fixo.quando} (±{String(Math.round((fixo.acc || 0) * 10) / 10).replace('.', ',')} m informados).
        {' '}Não se move durante a aula; {auxNome ? auxNome.split(/\s+/)[0] : 'a auxiliar'} aparece como bolinha.
      </p>}
      {!fixo && refAux && <p className="note" style={{ color: 'var(--brand2)' }}>
        Centro: <b>{refAux.nome}</b>, que está com a caderneta de hoje (±{Math.round(refAux.acc || 0)} m).
        Enquanto ela transmitir, o radar mostra a turma em volta de quem está em campo — não em volta de você.
      </p>}
      {!fixo && !refAux && auxAcesso && <p className="note" style={{ color: 'var(--miss)' }}>
        {auxNome || 'A auxiliar'} está com a caderneta de hoje, mas não está transmitindo posição — o centro voltou para o de sempre.
      </p>}
      {!refAux && <p className="note">Centro: {centro?.origem === 'você' ? `o seu celular (±${Math.round(centro.acc || 0)} m)` : centro?.origem?.startsWith('seu celular') ? `a última medição do seu celular (${centro.origem.slice(14)}) — no computador a localização local não vale` : 'o Bloco F (localização negada ou indisponível)'}. Norte para cima. Quem estiver além do raio fica na borda. Bolinhas muito próximas são afastadas um pouco para não se cobrirem — a distância escrita é a real.</p>}
      {!online && <p className="note" style={{ color: 'var(--miss)' }}>Offline — o radar precisa de internet.</p>}
    </div>
  )
}

function Bolinha({ b, x, y, r }) {
  return (
    <g className={'bol ' + (b.aceso ? 'aceso' : 'apagado')} transform={`translate(${x},${y})`}>
      {b.aceso && <circle r={r + 7} className="bol-pulso" />}
      <circle r={r + 3} className="bol-anel" />
      <clipPath id={'clip-' + b.a.id}><circle r={r} /></clipPath>
      {b.a.foto
        ? <image href={b.a.foto} x={-r} y={-r} width={2 * r} height={2 * r} clipPath={`url(#clip-${b.a.id})`} preserveAspectRatio="xMidYMid slice" />
        : <><circle r={r} className="bol-fundo" /><text y={5} textAnchor="middle" className="bol-ini">{initials(b.a.nome)}</text></>}
      <text y={r + 14} textAnchor="middle" className="bol-nome">{String(b.a.nome).split(' ')[0]}{b.dist != null ? ` · ${fmtM(b.dist)}` : ''}</text>
    </g>
  )
}
