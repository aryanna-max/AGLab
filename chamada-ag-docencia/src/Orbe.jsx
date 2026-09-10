import React, { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { paraUTM25S, metros } from './lib/geo'
import { MARCOS, marcoPorNome, azimute, grausDMS, pontoCardeal, resumirOcupacao, calcularPoligonal, compararComMarcos } from './lib/topo'

/* As três operações de campo, no celular:
   🎯 Ir até     — locar: sair da coordenada para o terreno (distância e azimute ao vivo)
   📍 Pins       — levantar: ocupação de 20 s, N leituras, o pin recebe a MÉDIA
   🔺 Poligonal  — calcular: lados, perímetro, área (Gauss), ângulos; erro vs marcos conhecidos
   Reocupar um pin (mesmo nome) aparece como EXTRA — não entra no desenho. */

const OCUPACAO_S = 20
const MIN_LEITURAS = 5

const ehErroDeRede = e => !e?.code && /fetch|network|conex|Failed|load/i.test(String(e?.message || e))

export default function Orbe({ pos, ident, codigo, onAviso }) {
  const [aba, setAba] = useState('ir')
  return (
    <div className="panel orbe">
      <nav className="tabs orbe-tabs">
        {[['ir', '🎯 Ir até'], ['pins', '📍 Pins'], ['poli', '🔺 Poligonal']].map(([k, l]) =>
          <button key={k} className={aba === k ? 'active' : ''} onClick={() => setAba(k)}>{l}</button>)}
      </nav>
      {aba === 'ir' && <IrAte pos={pos} />}
      {aba === 'pins' && <Pins pos={pos} ident={ident} codigo={codigo} onAviso={onAviso} />}
      {aba === 'poli' && <Poligonal ident={ident} codigo={codigo} onAviso={onAviso} />}
    </div>
  )
}

/* ================= 🎯 IR ATÉ (locar) ================= */
function IrAte({ pos }) {
  const [alvoNome, setAlvoNome] = useState(MARCOS[1].nome)
  const [modoDig, setModoDig] = useState('lista')   // lista | utm | geo
  const [n, setN] = useState(''), [e, setE] = useState(''), [lat, setLat] = useState(''), [lon, setLon] = useState('')
  const [rumoAparelho, setRumoAparelho] = useState(null)
  const [bussola, setBussola] = useState('off')     // off | on | negada

  // bússola (iOS pede permissão num toque)
  async function ligarBussola() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') { setBussola('negada'); return }
      }
      const h = ev => { const a = ev.webkitCompassHeading != null ? ev.webkitCompassHeading : (ev.alpha != null ? 360 - ev.alpha : null); if (a != null) setRumoAparelho(a) }
      window.addEventListener('deviceorientationabsolute', h, true); window.addEventListener('deviceorientation', h, true)
      setBussola('on')
    } catch (er) { setBussola('negada') }
  }

  let alvo = null
  if (modoDig === 'lista') { const m = MARCOS.find(x => x.nome === alvoNome); if (m) alvo = { nome: m.nome, n: m.n, e: m.e, sigma: m.sigma } }
  else if (modoDig === 'utm') { const N = parseFloat(String(n).replace(/\./g, '').replace(',', '.')), E = parseFloat(String(e).replace(/\./g, '').replace(',', '.')); if (isFinite(N) && isFinite(E)) alvo = { nome: 'coordenada digitada', n: N, e: E } }
  else { const la = parseFloat(String(lat).replace(',', '.')), lo = parseFloat(String(lon).replace(',', '.')); if (isFinite(la) && isFinite(lo)) { const u = paraUTM25S(la, lo); alvo = { nome: 'coordenada digitada', n: u.n, e: u.e } } }

  let dN = null, dE = null, dist = null, az = null
  if (alvo && pos) { dN = alvo.n - pos.utmN; dE = alvo.e - pos.utmE; dist = Math.hypot(dN, dE); az = azimute(dN, dE) }
  const chegou = dist != null && pos && dist <= Math.max(8, pos.acc || 0)
  const setaRot = az != null ? (rumoAparelho != null ? az - rumoAparelho : az) : 0

  return (
    <div>
      <p className="hint">Locação: você tem a coordenada, o terreno não. A tela mostra a distância e o azimute até lá, ao vivo.</p>
      <div className="row">
        <div><label className="fld">Alvo</label>
          <select value={modoDig} onChange={ev => setModoDig(ev.target.value)}>
            <option value="lista">Marco conhecido</option><option value="utm">UTM digitada (N, E)</option><option value="geo">Lat/Lon digitada</option>
          </select></div>
        {modoDig === 'lista' && <div><label className="fld">Marco</label>
          <select value={alvoNome} onChange={ev => setAlvoNome(ev.target.value)}>{MARCOS.map(m => <option key={m.nome} value={m.nome}>{m.nome}</option>)}</select></div>}
      </div>
      {modoDig === 'utm' && <div className="row">
        <div><label className="fld">N (m)</label><input inputMode="decimal" value={n} onChange={ev => setN(ev.target.value)} placeholder="9108720,996" /></div>
        <div><label className="fld">E (m)</label><input inputMode="decimal" value={e} onChange={ev => setE(ev.target.value)} placeholder="284958,028" /></div>
      </div>}
      {modoDig === 'geo' && <div className="row">
        <div><label className="fld">Latitude</label><input inputMode="decimal" value={lat} onChange={ev => setLat(ev.target.value)} placeholder="-8,0588" /></div>
        <div><label className="fld">Longitude</label><input inputMode="decimal" value={lon} onChange={ev => setLon(ev.target.value)} placeholder="-34,9504" /></div>
      </div>}

      {!pos && <div className="spin">Esperando a sua posição…</div>}
      {alvo && pos && <>
        <div className={'ir-box' + (chegou ? ' chegou' : '')}>
          <div className="ir-seta" style={{ transform: `rotate(${setaRot}deg)` }}>➤</div>
          <div className="ir-dist">{dist > 2000 ? metros(dist / 1000, 2) + ' km' : metros(dist, 0) + ' m'}</div>
          <div className="ir-sub">{chegou ? '✓ Você chegou — dentro da precisão do celular' : `azimute ${grausDMS(az)} · ${pontoCardeal(az)}`}</div>
          <div className="ir-sub">ΔN {dN >= 0 ? '+' : ''}{metros(dN, 1)} m · ΔE {dE >= 0 ? '+' : ''}{metros(dE, 1)} m</div>
        </div>
        <p className="note">
          {bussola === 'on' ? 'A seta gira com a bússola do aparelho.' : bussola === 'negada' ? 'Sem bússola: a seta aponta o azimute com o norte para cima.' :
            <>A seta usa o norte para cima. <span style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={ligarBussola}>Ligar bússola</span> para ela girar com o aparelho.</>}
          {alvo.sigma != null && <> Alvo conhecido a ±{alvo.sigma < 1 ? metros(alvo.sigma * 100, 0) + ' cm' : metros(alvo.sigma, 0) + ' m'}.</>}
        </p>
      </>}
    </div>
  )
}

/* ================= 📍 PINS (ocupação) ================= */
function Pins({ pos, ident, codigo, onAviso }) {
  const [pins, setPins] = useState([])
  const [nome, setNome] = useState('')
  const [ocupando, setOcupando] = useState(false)
  const [prog, setProg] = useState(0)
  const [coletadas, setColetadas] = useState([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const posRef = useRef(pos); useEffect(() => { posRef.current = pos }, [pos])
  const ultRef = useRef(null), t0 = useRef(0), timer = useRef(null), colRef = useRef([])

  async function carregar() {
    if (!ident) return
    try { const { data } = await supabase.rpc('meus_pins', { p_matricula: ident.matricula || '', p_aluno_id: ident.alunoId || null }); if (data?.ok) setPins(data.pins || []) } catch (e) {}
  }
  useEffect(() => { carregar() }, [ident?.alunoId, ident?.matricula])

  function proximoNome() { const k = pins.length + 1; return 'P' + k }

  // a cada nova fixação durante a ocupação, coleta (sem repetir a mesma)
  useEffect(() => {
    if (!ocupando || !pos) return
    if (ultRef.current === pos.fixTs && pos.fixTs) return
    ultRef.current = pos.fixTs
    colRef.current = [...colRef.current, { ...pos, capturado_em: new Date().toISOString(), online: navigator.onLine }]
    setColetadas(colRef.current)
  }, [pos, ocupando])

  function comecar() {
    if (!pos) { setErro('Espere a posição aparecer.'); return }
    setErro(''); colRef.current = []; setColetadas([]); ultRef.current = null
    setOcupando(true); t0.current = performance.now(); setProg(0)
    timer.current = setInterval(() => {
      const s = (performance.now() - t0.current) / 1000
      setProg(Math.min(1, s / OCUPACAO_S))
      if (s >= OCUPACAO_S) terminar()
    }, 200)
  }
  function cancelar() { clearInterval(timer.current); setOcupando(false); setProg(0); colRef.current = []; setColetadas([]) }
  async function terminar() {
    clearInterval(timer.current); setOcupando(false)
    const ls = colRef.current
    if (ls.length < MIN_LEITURAS) { setErro(`Só ${ls.length} leitura(s) em ${OCUPACAO_S} s — o GPS está lento aqui. Tente de novo, parado, com o céu mais aberto.`); return }
    const r = resumirOcupacao(ls)
    const nm = (nome.trim() || proximoNome()).slice(0, 40)
    const marco = marcoPorNome(nm)
    setSalvando(true)
    try {
      const { data, error } = await supabase.rpc('salvar_pin', {
        p_matricula: ident.matricula || '', p_aluno_id: ident.alunoId || null, p_codigo: codigo || '',
        p_nome: nm, p_lat: r.lat, p_lon: r.lon, p_utm_n: r.utmN, p_utm_e: r.utmE, p_altitude: r.alt,
        p_n: r.n, p_acc_media: r.acc, p_desvio_n: r.desvioN, p_desvio_e: r.desvioE, p_duracao: (performance.now() - t0.current) / 1000,
        p_marco_ref: marco && marco.tipo !== 'referencia' ? marco.nome : null,
        p_leituras: ls.map(l => ({ lat: l.lat, lon: l.lon, acc: l.acc, alt: l.alt, altAcc: l.altAcc, utmN: l.utmN, utmE: l.utmE, distPerc: l.distPerc, capturado_em: l.capturado_em, online: l.online, fixTs: l.fixTs }))
      })
      if (error) throw error
      if (!data?.ok) { setErro(data?.erro || 'Não consegui salvar o pin.'); return }
      onAviso && onAviso(`Pin ${nm} salvo: média de ${r.n} leituras, espalhamento ±${metros(r.desvioHz, 1)} m`)
      setNome(''); await carregar()
    } catch (e) { setErro(ehErroDeRede(e) ? 'Sem rede — o pin precisa de conexão para ser salvo. Tente de novo com sinal.' : 'Falhou: ' + (e.message || 'erro')) }
    finally { setSalvando(false) }
  }

  // reocupações: pins com o mesmo nome de um anterior → extra, não é vértice
  const primeiroPorNome = {}; pins.forEach(p => { const k = p.nome.toLowerCase(); if (!primeiroPorNome[k]) primeiroPorNome[k] = p })
  const R = 44, C = 2 * Math.PI * R

  return (
    <div>
      <p className="hint">Levantar um ponto = <b>ocupação</b>: fique parado {OCUPACAO_S} s, o app junta as leituras e o pin recebe a <b>média</b>. Um toque só ensina a errar.</p>
      {!ocupando ? <>
        <div className="row">
          <div><label className="fld">Nome do pin</label><input value={nome} onChange={ev => setNome(ev.target.value)} placeholder={proximoNome() + ' — ou o nome de um marco, ex. M0452'} maxLength={40} /></div>
          <div><label className="fld">&nbsp;</label><button className="btn" onClick={comecar} disabled={!pos || salvando}>{salvando ? 'Salvando…' : '📍 Ocupar e marcar'}</button></div>
        </div>
        <p className="note">Se o nome for o de um marco conhecido (M0451, M0452, M0455…), o app compara com a coordenada oficial.</p>
      </> : <div className="ocup">
        <svg viewBox="0 0 100 100" className="ocup-anel">
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--line)" strokeWidth="8" />
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--ok)" strokeWidth="8" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - prog)} transform="rotate(-90 50 50)" />
          <text x="50" y="46" textAnchor="middle" className="ocup-n">{coletadas.length}</text>
          <text x="50" y="62" textAnchor="middle" className="ocup-l">leituras</text>
        </svg>
        <div className="ocup-txt"><b>Fique parado.</b> {Math.ceil(OCUPACAO_S * (1 - prog))} s</div>
        <button className="btn ghost mini" onClick={cancelar}>Cancelar</button>
      </div>}
      {erro && <div className="flash err" style={{ textAlign: 'left' }}>{erro}</div>}

      {pins.length > 0 && <div className="scrollx" style={{ marginTop: 12 }}>
        <table className="matrix"><thead><tr><th className="nm">Pin</th><th>N</th><th>E</th><th>leit.</th><th>±hz</th><th>espalh.</th><th>vs marco</th><th>quando</th></tr></thead>
          <tbody>{pins.map(p => {
            const m = p.marco_ref ? marcoPorNome(p.marco_ref) : null
            const errM = m ? Math.hypot(p.utm_n - m.n, p.utm_e - m.e) : null
            const reocup = primeiroPorNome[p.nome.toLowerCase()] && primeiroPorNome[p.nome.toLowerCase()].id !== p.id
            const ref = reocup ? primeiroPorNome[p.nome.toLowerCase()] : null
            return <tr key={p.id} className={reocup ? 'reocup' : ''}>
              <td className="nm">{p.nome}{reocup ? <span className="badge" style={{ marginLeft: 6 }}>reocupação · Δ {metros(Math.hypot(p.utm_n - ref.utm_n, p.utm_e - ref.utm_e), 1)} m</span> : ''}</td>
              <td>{metros(p.utm_n, 1)}</td><td>{metros(p.utm_e, 1)}</td><td>{p.n}</td>
              <td>{p.acc != null ? metros(p.acc, 1) : '—'}</td>
              <td>{metros(Math.hypot(p.dn || 0, p.de || 0), 1)}</td>
              <td className={errM != null ? (errM < 10 ? 'P' : 'F') : ''}>{errM != null ? metros(errM, 1) + ' m' : '—'}</td>
              <td>{new Date(p.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
            </tr> })}</tbody></table>
      </div>}
      <p className="note"><b>espalh.</b> = desvio-padrão das leituras da ocupação (precisão). <b>vs marco</b> = distância até a coordenada oficial (acurácia). Reocupar o mesmo nome aparece como extra: não entra na poligonal.</p>
    </div>
  )
}

/* ================= 🔺 POLIGONAL ================= */
function Poligonal({ ident, codigo, onAviso }) {
  const [pins, setPins] = useState([])
  const [sel, setSel] = useState([])          // ids na ordem
  const [res, setRes] = useState(null)
  const [comp, setComp] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => { (async () => {
    if (!ident) return
    try { const { data } = await supabase.rpc('meus_pins', { p_matricula: ident.matricula || '', p_aluno_id: ident.alunoId || null }); if (data?.ok) setPins(data.pins || []) } catch (e) {}
  })() }, [ident?.alunoId, ident?.matricula])

  // só o PRIMEIRO pin de cada nome entra como vértice possível (reocupação é extra)
  const vistos = new Set(); const candidatos = pins.filter(p => { const k = p.nome.toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true })
  const toggle = id => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  function fechar() {
    setErro(''); setRes(null); setComp(null)
    const pts = sel.map(id => pins.find(p => p.id === id)).filter(Boolean).map(p => ({ nome: p.nome, n: p.utm_n, e: p.utm_e }))
    if (pts.length < 3) { setErro('Selecione pelo menos 3 pins, na ordem em que a poligonal percorre.'); return }
    const r = calcularPoligonal(pts); setRes(r)
    setComp(compararComMarcos(pts))
  }
  async function salvar() {
    if (!res) return
    setSalvando(true); setErro('')
    try {
      const { data, error } = await supabase.rpc('salvar_poligonal', {
        p_matricula: ident.matricula || '', p_aluno_id: ident.alunoId || null, p_codigo: codigo || '',
        p_nome: 'Poligonal ' + sel.map(id => pins.find(p => p.id === id)?.nome).join('-'),
        p_pin_ids: sel, p_resultado: { ...res, comparacao: comp }
      })
      if (error) throw error
      if (!data?.ok) { setErro(data?.erro || 'Não consegui salvar.'); return }
      onAviso && onAviso('Poligonal salva')
    } catch (e) { setErro(ehErroDeRede(e) ? 'Sem rede — tente salvar quando tiver sinal.' : 'Falhou: ' + (e.message || 'erro')) }
    finally { setSalvando(false) }
  }

  // desenho: poligonal medida (e a verdadeira, se houver) em SVG
  const desenho = (() => {
    if (!res) return null
    const pts = sel.map(id => pins.find(p => p.id === id)).filter(Boolean)
    const reais = comp ? pts.map(p => marcoPorNome(p.nome)).filter(Boolean) : []
    const todos = [...pts.map(p => ({ n: p.utm_n, e: p.utm_e })), ...reais.map(m => ({ n: m.n, e: m.e }))]
    const minN = Math.min(...todos.map(p => p.n)), maxN = Math.max(...todos.map(p => p.n)), minE = Math.min(...todos.map(p => p.e)), maxE = Math.max(...todos.map(p => p.e))
    const span = Math.max(maxN - minN, maxE - minE, 20), S = 300, pad = 24, esc = (S - 2 * pad) / span
    const X = e => pad + (e - minE) * esc, Y = n => S - pad - (n - minN) * esc
    return { S, pts, reais, X, Y }
  })()

  return (
    <div>
      <p className="hint">Escolha os pins <b>na ordem</b> em que a poligonal percorre. O app fecha e calcula: lados, azimutes, ângulos, perímetro e área (fórmula de Gauss).</p>
      {candidatos.length < 3 ? <p className="empty">Você precisa de pelo menos 3 pins com nomes diferentes. Marque na aba 📍 Pins.</p> :
        <div className="pin-sel">{candidatos.map(p => { const i = sel.indexOf(p.id); return (
          <button key={p.id} className={'amb' + (i >= 0 ? ' on' : '')} onClick={() => toggle(p.id)}>
            <span className="amb-emoji">{i >= 0 ? (i + 1) : '·'}</span><span className="amb-txt">{p.nome}{p.marco_ref ? ' · marco' : ''}</span>
          </button>) })}</div>}
      <div className="btnrow">
        <button className="btn" onClick={fechar} disabled={sel.length < 3}>🔺 Fechar poligonal</button>
        {res && <button className="btn ghost" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>}
        {sel.length > 0 && <button className="btn ghost mini" onClick={() => { setSel([]); setRes(null); setComp(null) }}>Limpar</button>}
      </div>
      {erro && <div className="flash err" style={{ textAlign: 'left' }}>{erro}</div>}

      {res && <>
        <div className="count-strip" style={{ marginTop: 12 }}>
          <div className="c"><div className="n">{metros(res.perimetro, 1)}</div><div className="l">perímetro (m)</div></div>
          <div className="c"><div className="n">{metros(res.area, 0)}</div><div className="l">área (m²)</div></div>
          <div className="c"><div className="n">{res.vertices}</div><div className="l">vértices</div></div>
        </div>
        {desenho && <svg viewBox={`0 0 ${desenho.S} ${desenho.S}`} className="poli-svg">
          {desenho.reais.length === desenho.pts.length && <polygon className="poli-real" points={desenho.reais.map(m => `${desenho.X(m.e)},${desenho.Y(m.n)}`).join(' ')} />}
          <polygon className="poli-medida" points={desenho.pts.map(p => `${desenho.X(p.utm_e)},${desenho.Y(p.utm_n)}`).join(' ')} />
          {desenho.pts.map((p, i) => <g key={p.id}><circle cx={desenho.X(p.utm_e)} cy={desenho.Y(p.utm_n)} r="5" className="poli-v" /><text x={desenho.X(p.utm_e) + 7} y={desenho.Y(p.utm_n) - 6} className="radar-lab">{i + 1} {p.nome}</text></g>)}
          {desenho.reais.map(m => <circle key={m.nome} cx={desenho.X(m.e)} cy={desenho.Y(m.n)} r="4" className="poli-marco" />)}
          <text x="8" y="14" className="radar-lab">N ↑</text>
        </svg>}
        <div className="scrollx"><table className="matrix"><thead><tr><th className="nm">Lado</th><th>distância</th><th>azimute</th></tr></thead>
          <tbody>{res.lados.map((l, i) => <tr key={i}><td className="nm">{l.de} → {l.para}</td><td>{metros(l.dist, 1)} m</td><td>{grausDMS(l.azimute)}</td></tr>)}</tbody></table></div>
        <div className="scrollx" style={{ marginTop: 8 }}><table className="matrix"><thead><tr><th className="nm">Vértice</th><th>ângulo interno</th></tr></thead>
          <tbody>{res.angulos.map((a, i) => <tr key={i}><td className="nm">{a.vertice}</td><td>{grausDMS(a.interno)}</td></tr>)}
            <tr><td className="nm"><b>Soma</b></td><td><b>{grausDMS(res.somaAngulos)}</b> (teórica {res.somaTeorica}°)</td></tr></tbody></table></div>
        <p className="note">Poligonal por GPS não tem erro de fechamento angular de verdade — cada vértice é independente. A soma fecha por construção; o erro está em <b>cada vértice</b>.</p>

        {comp ? <div className="perc-box">
          <div className="pb-tit">Comparação com os marcos oficiais</div>
          <table className="pb-tab"><tbody>
            {comp.errosVertice.map(v => <tr key={v.vertice}><td>Erro no {v.vertice}</td><td><b>{metros(v.erro, 1)} m</b> <span className="note" style={{ marginTop: 0 }}>(ΔN {v.dN >= 0 ? '+' : ''}{metros(v.dN, 1)} · ΔE {v.dE >= 0 ? '+' : ''}{metros(v.dE, 1)})</span></td></tr>)}
            <tr><td>Perímetro medido × real</td><td><b>{metros(comp.perimetro.medido, 1)} × {metros(comp.perimetro.real, 1)} m</b> ({comp.perimetro.erroPct >= 0 ? '+' : ''}{comp.perimetro.erroPct.toFixed(1)}%)</td></tr>
            <tr><td>Área medida × real</td><td><b>{metros(comp.area.medida, 0)} × {metros(comp.area.real, 0)} m²</b> ({comp.area.erroPct >= 0 ? '+' : ''}{comp.area.erroPct.toFixed(1)}%)</td></tr>
          </tbody></table>
          <div className="pb-punch">Erro médio por vértice: <b>{metros(comp.erroMedioVertice, 1)} m</b>. Os marcos são conhecidos a ±2 cm.</div>
        </div> : <p className="note">Para comparar com a verdade, dê aos pins os nomes dos marcos (M0451, M0452, M0455…).</p>}
      </>}
    </div>
  )
}
