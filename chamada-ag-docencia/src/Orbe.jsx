import React, { useEffect, useRef, useState } from 'react'
import { arquivoParaJpeg } from './lib/foto'
import { supabase } from './supabaseClient'
import { paraUTM25S, metros } from './lib/geo'
import { MARCOS, marcoPorNome, marcoComparavel, azimute, grausDMS, pontoCardeal, resumirOcupacao, calcularPoligonal, compararComMarcos, ordenarPorAngulo, rumo } from './lib/topo'

/* As três operações de campo, no celular:
   🎯 Ir até     — locar: sair da coordenada para o terreno (distância e azimute ao vivo)
   📍 Pins       — levantar: ocupação de 20 s, N leituras, o pin recebe a MÉDIA
   🔺 Poligonal  — calcular: lados, perímetro, área (Gauss), ângulos; erro vs marcos conhecidos
   Reocupar um pin (mesmo nome) aparece como EXTRA — não entra no desenho. */

const OCUPACAO_S = 20
const MIN_LEITURAS = 5

const ehErroDeRede = e => !e?.code && /fetch|network|conex|Failed|load/i.test(String(e?.message || e))

/* API padrão: o aluno, pelas RPCs anônimas. A professora passa store.apiProfessora(userId). */
export function apiAluno(ident, codigo) {
  const base = () => ({ p_matricula: ident?.matricula || '', p_aluno_id: ident?.alunoId || null })
  return {
    meusPins: async () => { const { data } = await supabase.rpc('meus_pins', base()); return data?.ok ? (data.pins || []) : [] },
    salvarPin: async c => { const { data, error } = await supabase.rpc('salvar_pin', { ...base(), p_codigo: codigo || '', ...c }); if (error) throw error; return data },
    minhasPoligonais: async () => { const { data } = await supabase.rpc('minhas_poligonais', base()); return data?.ok ? (data.poligonais || []) : [] },
    salvarPoligonal: async c => { const { data, error } = await supabase.rpc('salvar_poligonal', { ...base(), p_codigo: codigo || '', ...c }); if (error) throw error; return data },
  }
}

export default function Orbe({ pos, ident, codigo, onAviso, api }) {
  const [aba, setAba] = useState('ir')
  const apiRef = useRef(null)
  if (!apiRef.current || apiRef.current._k !== (api ? 'ext' : `${ident?.alunoId}|${ident?.matricula}|${codigo}`)) {
    apiRef.current = api || apiAluno(ident, codigo); apiRef.current._k = api ? 'ext' : `${ident?.alunoId}|${ident?.matricula}|${codigo}`
  }
  const A = apiRef.current
  return (
    <div className="panel orbe">
      <nav className="tabs orbe-tabs">
        {[['ir', '🎯 Ir até'], ['pins', '📍 Pins'], ['poli', '🔺 Poligonal']].map(([k, l]) =>
          <button key={k} className={aba === k ? 'active' : ''} onClick={() => setAba(k)}>{l}</button>)}
      </nav>
      {aba === 'ir' && <IrAte pos={pos} />}
      {aba === 'pins' && <Pins pos={pos} ident={ident} codigo={codigo} onAviso={onAviso} api={A} />}
      {aba === 'poli' && <Poligonal ident={ident} codigo={codigo} onAviso={onAviso} api={A} />}
    </div>
  )
}

/* Declinação magnética no campus IFPE Recife (−8,0588 / −34,9512): −21,03° (21° W), NOAA WMM-2025,
   calculada para 18/09/2026; variação anual +0,12°/ano. Rever a cada ano ou quando sair o WMM seguinte. */
const DECLINACAO_CAMPUS = -21.03
/* Convergência meridiana no fuso UTM 25 S (meridiano central −33°): γ = atan(tan Δλ · sen φ).
   No campus dá ≈ +0,27° — pequena, mas entra para a conta fechar. */
function convergenciaMeridiana(lat, lon) {
  if (lat == null || lon == null) return 0
  const r = Math.PI / 180
  return Math.atan(Math.tan((lon + 33) * r) * Math.sin(lat * r)) / r
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
      // suaviza a bússola: média móvel do seno e do cosseno (média de ângulo direto erra em 359°→1°)
      // no Android chegam dois eventos: o "absolute" (referido ao norte) e o comum, que pode ser relativo
      // à posição inicial do aparelho. Misturar os dois faz a seta pular; com o absoluto disponível, o comum é ignorado.
      /* Bússola instável (queixa dela, 18/09/2026). Três filtros:
         - suavização por TEMPO (τ ≈ 0,8 s), não por evento: celular que manda 60 eventos/s não treme mais que o que manda 10;
         - zona morta de 3°: abaixo disso a agulha nem se mexe;
         - no máximo 5 atualizações de tela por segundo. */
      const suav = { s: null, c: null, temAbs: false, t: 0, ultimo: null, tela: 0 }
      const TAU = 0.8, ZONA = 3, INTERVALO = 200
      const h = ev => {
        if (ev.type === 'deviceorientationabsolute') suav.temAbs = true
        else if (ev.webkitCompassHeading == null && (suav.temAbs || ev.absolute === false)) return
        const a = ev.webkitCompassHeading != null ? ev.webkitCompassHeading : (ev.alpha != null ? 360 - ev.alpha : null)
        if (a == null) return
        const agora = performance.now(), r = a * Math.PI / 180
        const k = suav.s == null ? 1 : 1 - Math.exp(-Math.min(0.5, (agora - suav.t) / 1000) / TAU)
        suav.t = agora
        suav.s = suav.s == null ? Math.sin(r) : suav.s + k * (Math.sin(r) - suav.s)
        suav.c = suav.c == null ? Math.cos(r) : suav.c + k * (Math.cos(r) - suav.c)
        if (agora - suav.tela < INTERVALO) return
        const rumo = ((Math.atan2(suav.s, suav.c) * 180 / Math.PI) + 360) % 360
        if (suav.ultimo != null && Math.abs(((rumo - suav.ultimo + 540) % 360) - 180) < ZONA) return
        suav.ultimo = rumo; suav.tela = agora
        setRumoAparelho(rumo)
      }
      window.addEventListener('deviceorientationabsolute', h, true); window.addEventListener('deviceorientation', h, true)
      setBussola('on')
    } catch (er) { setBussola('negada') }
  }

  useEffect(() => {
    if (typeof DeviceOrientationEvent === 'undefined') return
    if (typeof DeviceOrientationEvent.requestPermission === 'function') return   // iOS: só depois de um toque
    ligarBussola()
  }, [])

  let alvo = null
  if (modoDig === 'lista') { const m = MARCOS.find(x => x.nome === alvoNome); if (m) alvo = { nome: m.nome, n: m.n, e: m.e, sigma: m.sigma } }
  else if (modoDig === 'utm') { const N = parseFloat(String(n).replace(/\./g, '').replace(',', '.')), E = parseFloat(String(e).replace(/\./g, '').replace(',', '.')); if (isFinite(N) && isFinite(E)) alvo = { nome: 'coordenada digitada', n: N, e: E } }
  else { const la = parseFloat(String(lat).replace(',', '.')), lo = parseFloat(String(lon).replace(',', '.')); if (isFinite(la) && isFinite(lo)) { const u = paraUTM25S(la, lo); alvo = { nome: 'coordenada digitada', n: u.n, e: u.e } } }

  let dN = null, dE = null, dist = null, az = null
  if (alvo && pos) { dN = alvo.n - pos.utmN; dE = alvo.e - pos.utmE; dist = Math.hypot(dN, dE); az = azimute(dN, dE) }
  const chegou = dist != null && pos && dist <= Math.max(8, pos.acc || 0)
  /* Pedido dela (18/09/2026): a bússola do celular é instável e as setas confundiam. O mostrador
     agora fica PARADO, norte para cima, e a seta grossa é o AZIMUTE até o alvo — vem do GPS, não
     treme com o aparelho. A bússola vira só uma agulha fina ("seu celular"): gire o corpo até a
     agulha encostar na seta. Alinhado (±15°), a seta fica verde. */
  const setaRot = az != null ? az : 0
  /* A bússola do celular aponta para o NORTE MAGNÉTICO; o azimute do app é de QUADRÍCULA (UTM 25 S,
     calculado de ΔN e ΔE). Sem correção, "alinhado" levava o aluno uns 21° para o lado (achado 18/09/2026).
     Norte verdadeiro = magnético + declinação; quadrícula = verdadeiro − convergência meridiana. */
  const rumoQuadricula = rumoAparelho != null && pos
    ? (rumoAparelho + DECLINACAO_CAMPUS - convergenciaMeridiana(pos.lat, pos.lon) + 720) % 360 : null
  const desvio = az != null && rumoQuadricula != null ? ((az - rumoQuadricula + 540) % 360) - 180 : null
  /* A instrução é o destaque (pedido dela, 18/09): em faixas, com folga de 6° para trocar de
     faixa — a bússola tremendo não faz o texto piscar. 0 frente · 1 um pouco · 2 vire · 3 meia-volta */
  const faixaRef = useRef(null)
  let faixa = null
  if (desvio != null) {
    const ad = Math.abs(desvio), lim = [15, 50, 135], ant = faixaRef.current
    faixa = ad <= lim[0] ? 0 : ad <= lim[1] ? 1 : ad <= lim[2] ? 2 : 3
    if (ant != null && ant !== faixa) {
      const borda = lim[Math.min(ant, faixa)]
      if (Math.abs(ad - borda) < 6) faixa = ant   // ainda perto da borda: mantém a anterior
    }
    faixaRef.current = faixa
  }
  const alinhado = faixa === 0
  const lado = desvio > 0 ? 'direita' : 'esquerda'
  const instrucao = chegou ? { ic: '✓', tx: 'Você chegou' }
    : faixa == null ? { ic: '🧭', tx: <>Caminhe para <b>{Math.round(az)}°</b> · {pontoCardeal(az)}</> }
    : faixa === 0 ? { ic: '⬆', tx: 'Siga em frente' }
    : faixa === 1 ? { ic: desvio > 0 ? '↗' : '↖', tx: `Vire um pouco à ${lado}` }
    : faixa === 2 ? { ic: desvio > 0 ? '➡' : '⬅', tx: `Vire à ${lado}` }
    : { ic: '↩', tx: 'Dê meia-volta' }

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
        <div className={'ir-box' + (chegou ? ' chegou' : alinhado ? ' alinhado' : '')}>
          <div className={'ir-instr f' + (chegou ? 'ok' : faixa == null ? 'az' : faixa)}>
            <span className="ir-instr-ic">{instrucao.ic}</span><span>{instrucao.tx}</span>
          </div>
          {!chegou && faixa != null && <div className="ir-az">rumo do alvo: <b>{Math.round(az)}°</b> · {pontoCardeal(az)}</div>}
          <svg viewBox="0 0 160 160" className="ir-mostrador" aria-label="direção até o alvo">
            <circle cx="80" cy="80" r="74" className="ir-anel" />
            {Array.from({ length: 36 }, (_, i) => <line key={i} x1="80" y1="8" x2="80" y2={i % 9 === 0 ? 20 : 13} transform={`rotate(${i * 10} 80 80)`} className={'ir-tick' + (i % 9 === 0 ? ' forte' : '')} />)}
            <text x="80" y="34" textAnchor="middle" className="ir-n">N</text>
            <text x="132" y="84" textAnchor="middle" className="ir-card">E</text><text x="80" y="140" textAnchor="middle" className="ir-card">S</text><text x="28" y="84" textAnchor="middle" className="ir-card">O</text>
            {/* agulha fina da bússola do celular: referência secundária, pode tremer */}
            {rumoQuadricula != null && <g style={{ transform: `rotate(${rumoQuadricula}deg)`, transformOrigin: '80px 80px', transition: 'transform .4s ease-out' }}>
              <line x1="80" y1="80" x2="80" y2="16" className="ir-agulha" />
              <circle cx="80" cy="16" r="4" className="ir-agulha-pt" />
            </g>}
            {/* seta principal: o azimute até o alvo, calculado pelo GPS */}
            <g style={{ transform: `rotate(${setaRot}deg)`, transformOrigin: '80px 80px', transition: 'transform .6s ease-out' }}>
              <polygon points="80,18 100,70 80,58 60,70" className="ir-ponta" />
              <rect x="74" y="58" width="12" height="52" rx="4" className="ir-haste" />
            </g>
            <circle cx="80" cy="80" r="6" className="ir-centro" />
          </svg>
          <div className="ir-dist">{dist > 2000 ? metros(dist / 1000, 2) + ' km' : metros(dist, 0) + ' m'}</div>
          {!chegou && <div className="ir-sub">azimute {grausDMS(az)} · rumo {rumo(az)}</div>}
          {/* sem bússola também se chega: duas pernas pelos pontos cardeais (pergunta dela, 18/09) */}
          {!chegou && <div className="ir-pernas">ou ande <b>{metros(Math.abs(dN), 0)} m para o {dN >= 0 ? 'Norte' : 'Sul'}</b> e <b>{metros(Math.abs(dE), 0)} m para o {dE >= 0 ? 'Leste' : 'Oeste'}</b></div>}
          <div className="ir-sub">ΔN {dN >= 0 ? '+' : ''}{metros(dN, 1)} m · ΔE {dE >= 0 ? '+' : ''}{metros(dE, 1)} m · azimute de quadrícula (UTM)</div>
        </div>
        <p className="note">
          {bussola === 'on' ? <>A <b>seta grossa</b> é o caminho, calculado pelo GPS. A <b>agulha fina</b> é para onde o seu celular aponta — ela treme perto de metal e concreto; use só para se virar. Celular deitado na horizontal. Se a distância cai, você está no caminho. A agulha já vem corrigida da <b>declinação magnética</b> de Recife (21° W): a bússola aponta para o norte magnético, o mapa usa o norte da quadrícula.</> : bussola === 'negada' ? 'Sem bússola: o N fica para cima e a seta mostra o azimute — oriente-se pelo sol, pela sombra ou por um ponto conhecido.' :
            <>O N fica para cima e a seta mostra o azimute. <span style={{ textDecoration: 'underline', cursor: 'pointer', fontWeight: 700 }} onClick={ligarBussola}>Ligar bússola</span> para ver também a agulha do celular.</>}
          {alvo.sigma != null && <> Alvo conhecido a ±{alvo.sigma < 1 ? metros(alvo.sigma * 100, 0) + ' cm' : metros(alvo.sigma, 0) + ' m'}.</>}
        </p>
      </>}
    </div>
  )
}

/* ================= 📍 PINS (ocupação) ================= */
function Pins({ pos, ident, codigo, onAviso, api }) {
  const [pins, setPins] = useState([])
  const [nome, setNome] = useState('')
  const [ocupando, setOcupando] = useState(false)
  const [prog, setProg] = useState(0)
  const [coletadas, setColetadas] = useState([])
  const [foto, setFoto] = useState(null)          // foto do ponto (JPEG pequeno em data URL), opcional
  const [fotoBusy, setFotoBusy] = useState(false)
  const fotoRef = useRef(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const posRef = useRef(pos); useEffect(() => { posRef.current = pos }, [pos])
  const ultRef = useRef(null), t0 = useRef(0), timer = useRef(null), colRef = useRef([])

  async function carregar() {
    if (!ident) return
    try { setPins(await api.meusPins()) } catch (e) {}
  }
  useEffect(() => { carregar() }, [ident?.alunoId, ident?.matricula, api])

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
      const data = await api.salvarPin({
        p_nome: nm, p_lat: r.lat, p_lon: r.lon, p_utm_n: r.utmN, p_utm_e: r.utmE, p_altitude: r.alt,
        p_n: r.n, p_acc_media: r.acc, p_desvio_n: r.desvioN, p_desvio_e: r.desvioE, p_duracao: (performance.now() - t0.current) / 1000,
        p_marco_ref: marco && marco.tipo !== 'referencia' ? marco.nome : null,   // deslocado também fica registrado: é o nome que o aluno ocupou
        p_foto: foto || null,
        p_leituras: ls.map(l => ({ lat: l.lat, lon: l.lon, acc: l.acc, alt: l.alt, altAcc: l.altAcc, utmN: l.utmN, utmE: l.utmE, distPerc: l.distPerc, capturado_em: l.capturado_em, online: l.online, fixTs: l.fixTs }))
      })
      if (!data?.ok) { setErro(data?.erro || 'Não consegui salvar o pin.'); return }
      const med = data.medalha
      const NV = { ouro: '🥇 Ouro', prata: '🥈 Prata', bronze: '🥉 Bronze' }
      onAviso && onAviso(med ? (med.vale !== 'melhor' && med.n_pins > 1 ? `Pin ${nm} salvo. Na missão vale só o primeiro: ${metros(med.erro, 1)} m · ${med.nivel ? NV[med.nivel] : 'sem medalha'}`
          : `Pin ${nm}: ${metros(med.erro, 1)} m do marco · ${med.nivel ? NV[med.nivel] : 'sem medalha'} (missão ${med.missao})`)
        : `Pin ${nm} salvo: média de ${r.n} leituras, espalhamento ±${metros(r.desvioHz, 1)} m`)
      setNome(''); setFoto(null); await carregar()
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
        <div className="foto-ponto">
          {foto ? <img src={foto} alt="" onClick={() => fotoRef.current && fotoRef.current.click()} /> : null}
          <button className="btn ghost mini" disabled={fotoBusy} onClick={() => fotoRef.current && fotoRef.current.click()}>{fotoBusy ? 'Processando…' : foto ? '📷 Trocar foto do ponto' : '📷 Foto do ponto (opcional)'}</button>
          {foto && <button className="btn ghost mini" onClick={() => setFoto(null)}>Remover</button>}
          <input ref={fotoRef} type="file" accept="image/*" capture="environment" hidden onChange={async ev => {
            const f = ev.target.files && ev.target.files[0]; ev.target.value = ''
            if (!f) return
            setFotoBusy(true)
            try { setFoto(await arquivoParaJpeg(f, { lado: 640, qualidade: 0.72 })) } catch (e) { setErro('Não consegui ler a foto.') } finally { setFotoBusy(false) }
          }} />
        </div>
        <p className="note">A foto do ponto vai junto com o pin e entra no relatório da professora. Se o nome for o de um marco conhecido (M0451, M0452, M0455…), o app compara com a coordenada oficial.</p>
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
            const desloc = m && m.tipo === 'deslocado'
            const reocup = primeiroPorNome[p.nome.toLowerCase()] && primeiroPorNome[p.nome.toLowerCase()].id !== p.id
            const ref = reocup ? primeiroPorNome[p.nome.toLowerCase()] : null
            return <tr key={p.id} className={reocup ? 'reocup' : ''}>
              <td className="nm">{p.tem_foto ? "📷 " : ""}{p.nome}{reocup ? <span className="badge" style={{ marginLeft: 6 }}>reocupação · Δ {metros(Math.hypot(p.utm_n - ref.utm_n, p.utm_e - ref.utm_e), 1)} m</span> : ''}</td>
              <td>{metros(p.utm_n, 1)}</td><td>{metros(p.utm_e, 1)}</td><td>{p.n}</td>
              <td>{p.acc != null ? metros(p.acc, 1) : '—'}</td>
              <td>{metros(Math.hypot(p.dn || 0, p.de || 0), 1)}</td>
              <td className={errM != null && !desloc ? (errM < 10 ? 'P' : 'F') : ''} title={desloc ? 'marco reimplantado em obra: a coordenada de 2023 não é mais o lugar do marco — esse número não mede o seu celular' : ''}>{errM != null ? metros(errM, 1) + ' m' + (desloc ? ' ⚠' : '') : '—'}</td>
              <td>{new Date(p.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
            </tr> })}</tbody></table>
      </div>}
      <p className="note"><b>espalh.</b> = desvio-padrão das leituras da ocupação (precisão). <b>vs marco</b> = distância até a coordenada oficial (acurácia). ⚠ = marco reimplantado em obra (M0451): a coordenada oficial ainda é a de 2023, então a distância não avalia o aparelho. Reocupar o mesmo nome aparece como extra: não entra na poligonal.</p>
    </div>
  )
}

/* ================= 🔺 POLIGONAL ================= */
function Poligonal({ ident, codigo, onAviso, api }) {
  const [pins, setPins] = useState([])
  const [sel, setSel] = useState([])          // ids na ordem
  const [res, setRes] = useState(null)
  const [comp, setComp] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [salvas, setSalvas] = useState([])          // poligonais já salvas pelo aluno
  const [salvaAtual, setSalvaAtual] = useState(null)

  async function carregarSalvas() {
    if (!ident) return
    try { setSalvas(await api.minhasPoligonais()) } catch (e) {}
  }
  useEffect(() => { (async () => {
    if (!ident) return
    try { setPins(await api.meusPins()) } catch (e) {}
    carregarSalvas()
  })() }, [ident?.alunoId, ident?.matricula, api])

  // abrir uma poligonal salva: recompõe a seleção e recalcula pelos pins (o desenho volta)
  function abrirSalva(q) {
    const ids = (q.pin_ids || []).filter(id => pins.some(p => p.id === id))
    if (ids.length < 3) { setErro('Os pins dessa poligonal não estão mais disponíveis.'); return }
    setSel(ids); setErro(''); setSalvaAtual(q.id)
    const pts = ids.map(id => pins.find(p => p.id === id)).map(p => ({ nome: p.nome, n: p.utm_n, e: p.utm_e }))
    setRes(calcularPoligonal(pts)); setComp(compararComMarcos(pts))
  }

  // só o PRIMEIRO pin de cada nome entra como vértice possível (reocupação é extra)
  const vistos = new Set(); const candidatos = pins.filter(p => { const k = p.nome.toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true })
  // mudar a seleção depois de fechar invalida o resultado: o que se salva é sempre o que foi calculado
  const toggle = id => { setRes(null); setComp(null); setErro(''); setSalvaAtual(null); setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]) }

  function fechar() {
    setErro(''); setRes(null); setComp(null)
    const pts = sel.map(id => pins.find(p => p.id === id)).filter(Boolean).map(p => ({ nome: p.nome, n: p.utm_n, e: p.utm_e }))
    if (pts.length < 3) { setErro('Selecione pelo menos 3 pins, na ordem em que a poligonal percorre.'); return }
    const r = calcularPoligonal(pts); setRes(r)
    setComp(compararComMarcos(pts))
    if (r.cruzada) setErro('Nessa ordem os lados se CRUZAM (a figura vira um laço): a área não vale e a poligonal não pode ser salva. Use "Corrigir ordem" ou refaça a seleção na ordem em que se anda pelo contorno.')
  }
  function corrigirOrdem() {
    const pts = sel.map(id => pins.find(p => p.id === id)).filter(Boolean)
    const ordenados = ordenarPorAngulo(pts.map(p => ({ id: p.id, nome: p.nome, n: p.utm_n, e: p.utm_e })))
    const novaSel = ordenados.map(p => p.id)
    setSel(novaSel); setErro(''); setComp(null)
    const r = calcularPoligonal(ordenados); setRes(r); setComp(compararComMarcos(ordenados))
  }
  async function salvar() {
    if (!res) return
    setSalvando(true); setErro('')
    try {
      const data = await api.salvarPoligonal({
        p_nome: 'Poligonal ' + sel.map(id => pins.find(p => p.id === id)?.nome).join('-'),
        p_pin_ids: sel, p_resultado: { ...res, comparacao: comp }
      })
      if (!data?.ok) { setErro(data?.erro || 'Não consegui salvar.'); return }
      onAviso && onAviso('Poligonal salva'); setSalvaAtual(data.id || null); carregarSalvas()
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
      <p className="hint">Escolha os pins <b>na ordem</b> em que a poligonal percorre. O app fecha e calcula: lados, azimutes, rumos, ângulos, perímetro e área (fórmula de Gauss).</p>
      {salvas.length > 0 && <>
        <label className="fld">Minhas poligonais salvas — toque para rever</label>
        <div className="pin-sel">{salvas.map(q => <button key={q.id} className={'amb' + (salvaAtual === q.id ? ' on' : '')} onClick={() => abrirSalva(q)}>
          <span className="amb-emoji">🔺</span><span className="amb-txt">{q.nome.replace(/^Poligonal /, '')}<br /><small>{q.resultado?.area != null ? metros(q.resultado.area, 0) + ' m² · ' : ''}{new Date(q.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small></span>
        </button>)}</div>
      </>}
      {candidatos.length < 3 ? <p className="empty">Você precisa de pelo menos 3 pins com nomes diferentes. Marque na aba 📍 Pins.</p> :
        <div className="pin-sel">{candidatos.map(p => { const i = sel.indexOf(p.id); return (
          <button key={p.id} className={'amb' + (i >= 0 ? ' on' : '')} onClick={() => toggle(p.id)}>
            <span className="amb-emoji">{i >= 0 ? (i + 1) : '·'}</span><span className="amb-txt">{p.nome}{p.marco_ref ? ' · marco' : ''}</span>
          </button>) })}</div>}
      <div className="btnrow">
        <button className="btn" onClick={fechar} disabled={sel.length < 3}>🔺 Fechar poligonal</button>
        {res && res.cruzada && <button className="btn" onClick={corrigirOrdem}>↻ Corrigir ordem</button>}
        {res && sel.length >= 3 && <button className="btn ghost mini" onClick={() => { const inv = [sel[0], ...sel.slice(1).reverse()]; setSel(inv); const pts = inv.map(id => pins.find(p => p.id === id)).filter(Boolean).map(p => ({ nome: p.nome, n: p.utm_n, e: p.utm_e })); const r = calcularPoligonal(pts); setRes(r); setComp(compararComMarcos(pts)) }} title="Mesmos vértices, percurso ao contrário: horário vira anti-horário. Os ângulos internos não mudam; o sentido da poligonal sim.">↔ Inverter sentido</button>}
        {res && !res.cruzada && <button className="btn ghost" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>}
        {sel.length > 0 && <button className="btn ghost mini" onClick={() => { setSel([]); setRes(null); setComp(null) }}>Limpar</button>}
      </div>
      {erro && <div className="flash err" style={{ textAlign: 'left' }}>{erro}</div>}

      {res && <>
        <div className="count-strip" style={{ marginTop: 12 }}>
          <div className="c"><div className="n">{metros(res.perimetro, 1)}</div><div className="l">perímetro (m)</div></div>
          <div className={'c' + (res.cruzada ? ' miss' : '')}><div className="n">{res.cruzada ? '✗' : metros(res.area, 0)}</div><div className="l">{res.cruzada ? 'área inválida (laço)' : 'área (m²)'}</div></div>
          <div className="c"><div className="n">{res.sentido === 'horário' ? '↻' : '↺'}</div><div className="l">{res.sentido}</div></div>
        </div>
        {desenho && <svg viewBox={`0 0 ${desenho.S} ${desenho.S}`} className="poli-svg">
          {desenho.reais.length === desenho.pts.length && <polygon className="poli-real" points={desenho.reais.map(m => `${desenho.X(m.e)},${desenho.Y(m.n)}`).join(' ')} />}
          <polygon className="poli-medida" points={desenho.pts.map(p => `${desenho.X(p.utm_e)},${desenho.Y(p.utm_n)}`).join(' ')} />
          {desenho.pts.map((p, i) => <g key={p.id}><circle cx={desenho.X(p.utm_e)} cy={desenho.Y(p.utm_n)} r="5" className="poli-v" /><text x={desenho.X(p.utm_e) + 7} y={desenho.Y(p.utm_n) - 6} className="radar-lab">{i + 1} {p.nome}</text></g>)}
          {desenho.reais.map(m => <circle key={m.nome} cx={desenho.X(m.e)} cy={desenho.Y(m.n)} r="4" className="poli-marco" />)}
          <text x="8" y="14" className="radar-lab">N ↑</text>
        </svg>}
        <div className="scrollx"><table className="matrix"><thead><tr><th className="nm">Lado</th><th>distância</th><th>azimute</th><th>rumo</th></tr></thead>
          <tbody>{res.lados.map((l, i) => <tr key={i}><td className="nm">{l.de} → {l.para}</td><td>{metros(l.dist, 1)} m</td><td>{grausDMS(l.azimute)}</td><td>{rumo(l.azimute)}</td></tr>)}</tbody></table></div>
        <p className="note"><b>Azimute</b>: ângulo a partir do norte, no sentido horário, de 0° a 360°. <b>Rumo</b>: o mesmo ângulo contado a partir do N ou do S para o E ou O, de 0° a 90° — a forma da caderneta antiga.</p>
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
