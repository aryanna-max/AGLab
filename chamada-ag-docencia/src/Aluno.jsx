import React, { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { PERC, paraUTM25S, distanciaUTM, metros, vezesPiorQuePerc } from './lib/geo'
import { decodeFromVideo, parsePayload } from './lib/qr'
import { gravarPerfil } from './Escolha.jsx'
import Orbe from './Orbe.jsx'

/* App do aluno. Sem conta, sem senha, sem campo de código.

   Dois cards:
   - CHAMADA: lê o QR do dia com a câmera. A leitura É a chamada. Presença só
     nasce aqui, e só dentro da janela da aula (decidido no servidor).
   - ORBE: mede a posição a qualquer hora. Nunca marca presença.

   Os dois levam à mesma tela de medição, mas a confirmação de presença fica
   FIXA na tela e volta se ele reabrir o app no mesmo dia.

   Identificação: matrícula digitada ou o QR do próprio cartão (AGC1;turma;aluno).
   O aluno fala só com validar_sessao e enviar_leitura — nenhuma tabela é lida. */

const K_IDENT = 'agc2_ident'            // {alunoId, matricula, nome, turma}
const K_PRES = 'agc2_presenca_dia'      // {data, codigo, hora, local, turma, fora}
const K_FILA = 'agc2_fila_leituras'
export const NOME_GPS = 'Orbe'          // o card de medição tem o nome do app (decisão dela, 10/09)

const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const ler = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def } catch (e) { return def } }
const gravar = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)) } catch (e) {} }
const ehErroDeRede = e => !e?.code && /fetch|network|conex|Failed|load/i.test(String(e?.message || e))

const AMBIENTES = [
  { k: 'sala', rotulo: 'Dentro da sala', emoji: '🏫' },
  { k: 'corredor', rotulo: 'Corredor', emoji: '🚪' },
  { k: 'patio', rotulo: 'Pátio / céu aberto', emoji: '🌤️' },
  { k: 'outro', rotulo: 'Outro lugar — descreva', emoji: '✍️' }
]
const nomeLocal = k => ({ sala: 'Dentro da sala', corredor: 'Corredor', patio: 'Pátio', outro: 'Outro' })[k] || k

function contextoDoAparelho() {
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection
  const ua = navigator.userAgent || ''
  return {
    plataforma: /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : 'outro',
    user_agent: ua.slice(0, 200),
    tela: `${screen.width}x${screen.height}@${window.devicePixelRatio || 1}`,
    tipo_conexao: c && c.effectiveType ? c.effectiveType : null,
    downlink_mbps: c && typeof c.downlink === 'number' ? c.downlink : null,
    rtt_ms: c && typeof c.rtt === 'number' ? c.rtt : null,
    app_versao: typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : null
  }
}

// batimento para o radar da professora: uma linha por aluno, atualizada no lugar
async function ping(id, pp, modo) {
  try {
    await supabase.rpc('ping_posicao', { p_matricula: id?.matricula || '', p_aluno_id: id?.alunoId || null,
      p_lat: pp.lat, p_lon: pp.lon, p_acuracia: pp.acc, p_modo: modo })
  } catch (e) {}
}

async function postar(item) {
  const { data, error } = await supabase.rpc('enviar_leitura', {
    p_codigo: item.codigo || '', p_matricula: item.matricula || '',
    p_aluno_id: item.alunoId || null,
    p_lat: item.lat, p_lon: item.lon,
    p_acuracia: item.acc, p_altitude: item.alt, p_alt_acuracia: item.altAcc,
    p_rotulo: item.rotulo, p_utm_n: item.utmN, p_utm_e: item.utmE, p_dist_perc: item.distPerc,
    p_capturado_em: item.capturado_em,
    p_online: item.online == null ? null : !!item.online,
    p_fix_ts: item.fixTs || null,
    p_extra: item.extra || null
  })
  if (error) throw error
  return data
}

/* --- leitor de QR reutilizável (QR da aula ou QR do cartão) --- */
function LeitorQR({ titulo, onLido, onCancelar }) {
  const video = useRef(null), canvas = useRef(null), stream = useRef(null), vivo = useRef(false), ult = useRef(0)
  const [erro, setErro] = useState('')
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) { setErro('Este navegador não dá acesso à câmera.'); return }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(s => { stream.current = s; setPronto(true) })
      .catch(e => setErro(e?.name === 'NotAllowedError' ? 'Permissão de câmera negada.' : 'Não consegui abrir a câmera.'))
    return () => { vivo.current = false; stream.current?.getTracks().forEach(x => x.stop()); stream.current = null }
  }, [])

  // acopla o stream DEPOIS de o <video> existir (lição do scanner da chamada)
  useEffect(() => {
    if (!pronto) return
    const v = video.current, s = stream.current
    if (!v || !s) return
    v.srcObject = s
    const p = v.play(); if (p && p.catch) p.catch(() => {})
    vivo.current = true
    const loop = ts => {
      if (!vivo.current) return
      requestAnimationFrame(loop)
      if (ts && ts - ult.current < 80) return
      ult.current = ts || 0
      const d = decodeFromVideo(video.current, canvas.current)
      if (d) { vivo.current = false; onLido(d) }
    }
    requestAnimationFrame(loop)
  }, [pronto])

  return (
    <div className="panel">
      <h2>{titulo}</h2>
      {erro ? <div className="flash err" style={{ textAlign: 'left' }}>{erro}</div>
        : <div className="videowrap" style={{ marginTop: 8 }}><video ref={video} playsInline muted /><div className="scanline" /></div>}
      <canvas ref={canvas} hidden />
      <div className="btnrow"><button className="btn ghost" onClick={onCancelar}>Cancelar</button></div>
    </div>
  )
}

export default function Aluno() {
  const params = new URLSearchParams(location.search)
  const codigoDaUrl = (params.get('aula') || '').toUpperCase()

  const [tela, setTela] = useState('home')   // home | ler-aula | identificar | chamada-ok | medir
  const [ident, setIdent] = useState(() => ler(K_IDENT, null))
  const [presenca, setPresenca] = useState(() => { const p = ler(K_PRES, null); return p && p.data === hojeISO() ? p : null })
  const [codigoAula, setCodigoAula] = useState(codigoDaUrl)   // código lido do QR do dia (só na chamada)
  const [aula, setAula] = useState(null)                       // {turma, local, janela_aberta}
  const [modo, setModo] = useState('livre')                    // 'aula' quando chegou pela chamada
  const [pos, setPos] = useState(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [placar, setPlacar] = useState(null)
  const [naFila, setNaFila] = useState(() => ler(K_FILA, []).length)
  const [online, setOnline] = useState(navigator.onLine)
  const [matInput, setMatInput] = useState(() => ler(K_IDENT, null)?.matricula || '')
  const [lendoCartao, setLendoCartao] = useState(false)
  const [conferindo, setConferindo] = useState(false)
  const [depoisDeIdent, setDepoisDeIdent] = useState(null)     // para onde ir após identificar
  const [outroTxt, setOutroTxt] = useState('')                 // descrição livre quando o lugar é 'outro'
  const [pedindoOutro, setPedindoOutro] = useState(false)

  const watchRef = useRef(null), t0 = useRef(0), ttff = useRef(null), autoRef = useRef(false)
  const nFixRef = useRef(0), melhorRef = useRef(null), modoRef = useRef('livre'), identRef = useRef(ident), codigoRef = useRef(codigoDaUrl)
  useEffect(() => { modoRef.current = modo }, [modo])
  useEffect(() => { identRef.current = ident }, [ident])
  useEffect(() => { codigoRef.current = codigoAula }, [codigoAula])

  /* ---------- fila offline ---------- */
  async function esvaziarFila() {
    const fila = ler(K_FILA, [])
    if (!fila.length || !navigator.onLine) return
    const resto = []
    for (const item of fila) {
      try {
        const d = await postar(item)
        if (d?.ok) {
          setPlacar({ meu: d.meu_melhor, turma: d.melhor_turma, alunos: d.alunos })
          if (d.presenca) fixarPresenca(d, item.codigo, false)
        }
      } catch (e) { if (ehErroDeRede(e)) { resto.push(item); break } }
    }
    gravar(K_FILA, resto); setNaFila(resto.length)
    const subiu = fila.length - resto.length
    if (subiu > 0) { setAviso(subiu + ' leitura(s) da fila enviada(s)'); setTimeout(() => setAviso(''), 3000) }
  }
  useEffect(() => {
    const on = () => { setOnline(true); esvaziarFila() }
    const off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    esvaziarFila()
    const it = setInterval(esvaziarFila, 30000)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(it) }
  }, [])
  useEffect(() => () => pararGPS(), [])

  // enquanto a tela de medição está aberta, avisa a professora onde está (a cada 20 s)
  const posRef = useRef(null); useEffect(() => { posRef.current = pos }, [pos])
  useEffect(() => {
    if (tela !== 'medir' && tela !== 'chamada-ok') return
    const bate = () => { const pp = posRef.current, id = identRef.current; if (pp && id && navigator.onLine) ping(id, pp, tela === 'chamada-ok' ? 'chamada' : 'gps') }
    const it = setInterval(bate, 20000)
    const primeiro = setTimeout(bate, 2500)
    return () => { clearInterval(it); clearTimeout(primeiro) }
  }, [tela])

  function fixarPresenca(d, codigo, fora) {
    const p = { data: hojeISO(), codigo, hora: d.hora, local: d.local, turma: aula?.turma || identRef.current?.turma || '', fora: !!fora }
    gravar(K_PRES, p); setPresenca(p)
  }

  /* ---------- identificação ---------- */
  async function identificar({ matricula, alunoId }) {
    setErro(''); setConferindo(true)
    try {
      const { data, error } = await supabase.rpc('validar_sessao', { p_codigo: '', p_matricula: matricula || '', p_aluno_id: alunoId || null })
      if (error) throw error
      if (!data?.ok) { setErro(data?.erro || 'Não encontrei você.'); return false }
      const i = { alunoId: data.aluno_id, matricula: data.matricula, nome: data.nome, turma: data.turma }
      gravar(K_IDENT, i); setIdent(i); identRef.current = i; setMatInput(i.matricula || '')
      return true
    } catch (e) {
      if (ehErroDeRede(e) && (matricula || alunoId)) {
        const i = { alunoId: alunoId || null, matricula: matricula || '', nome: '', turma: '' }
        gravar(K_IDENT, i); setIdent(i); identRef.current = i
        setAviso('Sem rede — vou confirmar quem você é quando a conexão voltar.'); setTimeout(() => setAviso(''), 4000)
        return true
      }
      setErro('Falhou a conferência: ' + (e.message || 'erro')); return false
    } finally { setConferindo(false) }
  }
  function trocarIdent() { gravar(K_IDENT, null); setIdent(null); identRef.current = null; setMatInput(''); setPlacar(null) }

  /* ---------- GPS ---------- */
  function ligarGPS() {
    if (!navigator.geolocation) { setErro('Este navegador não tem geolocalização.'); return }
    if (watchRef.current != null) return
    t0.current = performance.now(); ttff.current = null; nFixRef.current = 0; melhorRef.current = null
    watchRef.current = navigator.geolocation.watchPosition(
      p => {
        if (ttff.current == null) ttff.current = Math.round(performance.now() - t0.current)
        const c = p.coords, u = paraUTM25S(c.latitude, c.longitude)
        nFixRef.current += 1
        if (melhorRef.current == null || c.accuracy < melhorRef.current) melhorRef.current = c.accuracy
        const leitura = {
          lat: c.latitude, lon: c.longitude, acc: c.accuracy, alt: c.altitude, altAcc: c.altitudeAccuracy,
          utmN: u.n, utmE: u.e, distPerc: distanciaUTM(u.n, u.e, PERC.utmN, PERC.utmE),
          fixTs: p.timestamp ? new Date(p.timestamp).toISOString() : null, rumo: c.heading, velocidade: c.speed
        }
        setPos(leitura); setErro('')
        // a chamada é automática na primeira fixação — só quando veio pelo QR do dia
        if (modoRef.current === 'aula' && !autoRef.current) { autoRef.current = true; enviar('chamada', leitura) }
      },
      e => setErro(e.code === 1 ? 'Você precisa permitir a localização para participar.' : 'Não consegui obter a posição.'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    )
  }
  function pararGPS() {
    if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null }
    autoRef.current = false
  }

  /* ---------- envio ---------- */
  async function enviar(rotulo, posArg, descricao) {
    const pp = posArg || pos, id = identRef.current
    if (!pp || enviando || !id) return
    setEnviando(true); setErro(''); setAviso('')
    const item = {
      codigo: modoRef.current === 'aula' ? codigoRef.current : '',
      matricula: id.matricula, alunoId: id.alunoId, rotulo, ...pp,
      capturado_em: new Date().toISOString(), online: navigator.onLine,
      extra: { ...contextoDoAparelho(), ttff_ms: ttff.current, n_fixes_antes: Math.max(0, nFixRef.current - 1),
        melhor_acuracia_sessao: melhorRef.current,
        local_descricao: descricao ? String(descricao).slice(0, 80) : undefined,
        rumo: pp.rumo == null || Number.isNaN(pp.rumo) ? null : pp.rumo,
        velocidade: pp.velocidade == null || Number.isNaN(pp.velocidade) ? null : pp.velocidade }
    }
    try {
      const data = await postar(item)
      if (!data?.ok) { setErro(data?.erro || 'Não consegui registrar.'); return }
      if (data.nome && !id.nome) { const i = { ...id, nome: data.nome }; gravar(K_IDENT, i); setIdent(i); identRef.current = i }
      setPlacar({ meu: data.meu_melhor, turma: data.melhor_turma, alunos: data.alunos })
      if (rotulo === 'chamada') {
        if (data.presenca) fixarPresenca(data, item.codigo, false)
        else if (data.motivo === 'fora_da_janela') fixarPresenca(data, item.codigo, true)
      } else { setAviso('Leitura enviada — ' + (rotulo === 'outro' && descricao ? descricao : nomeLocal(rotulo))); setTimeout(() => setAviso(''), 2500) }
    } catch (e) {
      if (ehErroDeRede(e)) {
        const f = ler(K_FILA, []); f.push(item); gravar(K_FILA, f); setNaFila(f.length)
        setAviso('Sem rede: leitura guardada no celular. Sobe sozinha quando tiver conexão.'); setTimeout(() => setAviso(''), 4000)
      } else setErro('Falhou o envio: ' + (e.message || 'erro'))
    } finally { setEnviando(false) }
  }

  /* ---------- navegação ---------- */
  function irChamada() { setErro(''); setTela('ler-aula') }
  function irMedir() {
    setErro('')
    if (!identRef.current) { setDepoisDeIdent('medir'); setTela('identificar'); return }
    setModo('livre'); modoRef.current = 'livre'; setAula(null); setTela('medir'); ligarGPS()
  }
  async function qrDaAulaLido(texto) {
    let cod = null
    try { cod = new URL(String(texto).trim()).searchParams.get('aula') } catch (e) {}
    if (!cod && /^[A-Z0-9]{3,12}$/i.test(String(texto).trim())) cod = String(texto).trim()
    if (!cod) { setErro('Esse QR não é o da aula.'); setTela('home'); return }
    cod = cod.toUpperCase(); setCodigoAula(cod); codigoRef.current = cod
    if (!identRef.current) { setDepoisDeIdent('chamada'); setTela('identificar'); return }
    await entrarNaAula(cod)
  }
  async function entrarNaAula(cod) {
    const id = identRef.current
    setConferindo(true); setErro('')
    try {
      const { data, error } = await supabase.rpc('validar_sessao', { p_codigo: cod, p_matricula: id?.matricula || '', p_aluno_id: id?.alunoId || null })
      if (error) throw error
      if (!data?.ok) { setErro(data?.erro || 'QR inválido.'); setTela('home'); return }
      setAula({ turma: data.turma, local: data.local, janela_aberta: data.janela_aberta })
      if (data.nome && data.nome !== id?.nome) { const i = { ...id, nome: data.nome, turma: data.turma }; gravar(K_IDENT, i); setIdent(i); identRef.current = i }
    } catch (e) {
      if (!ehErroDeRede(e)) { setErro('Falhou: ' + (e.message || 'erro')); setTela('home'); return }
      setAviso('Sem rede — a chamada vai subir quando a conexão voltar.'); setTimeout(() => setAviso(''), 4000)
    } finally { setConferindo(false) }
    setModo('aula'); modoRef.current = 'aula'; autoRef.current = false
    setTela('chamada-ok'); ligarGPS()
  }
  async function identificarEContinuar(dados) {
    const ok = await identificar(dados)
    if (!ok) return
    const destino = depoisDeIdent; setDepoisDeIdent(null)
    if (destino === 'chamada') await entrarNaAula(codigoRef.current)
    else { setModo('livre'); modoRef.current = 'livre'; setTela('medir'); ligarGPS() }
  }
  function voltarHome() { pararGPS(); setPos(null); setPlacar(null); setErro(''); setAviso(''); setTela('home') }

  // chegou por link ?aula= (QR lido pela câmera nativa): segue direto o fluxo da chamada
  useEffect(() => {
    if (!codigoDaUrl) return
    if (!identRef.current) { setDepoisDeIdent('chamada'); setTela('identificar') } else entrarNaAula(codigoDaUrl)
  }, [])

  const vezes = pos ? vezesPiorQuePerc(pos.acc) : null
  const razaoVert = pos && pos.altAcc && pos.acc ? pos.altAcc / pos.acc : null

  /* ================= telas ================= */
  const Cabecalho = ({ titulo }) => (
    <header className="app">
      <button className="btn ghost mini" onClick={voltarHome}>↩</button>
      <h1>{titulo}</h1>
      {ident?.nome && <span className="sub">{ident.nome}{ident.turma ? ' · ' + ident.turma : ''}</span>}
      <span className="spacer" />
      {naFila > 0 && <span className="badge off">{naFila} na fila</span>}
      {!online && <span className="badge off">sem rede</span>}
    </header>
  )

  const CardPresenca = () => presenca && (
    <div className={'presenca-fixa' + (presenca.fora ? ' fora' : '')}>
      <div className="pf-tit">{presenca.fora ? '⏱ Chamada fora do horário' : '✓ Presença de hoje registrada'}</div>
      <div className="pf-sub">{presenca.hora} · {nomeLocal(presenca.local)}{presenca.turma ? ' · ' + presenca.turma : ''}</div>
      {presenca.fora && <div className="pf-sub">A professora decide. Sua leitura ficou guardada.</div>}
    </div>
  )

  if (tela === 'ler-aula') return (
    <div className="wrap"><Cabecalho titulo="Chamada" />
      <LeitorQR titulo="Aponte para o QR da aula" onLido={qrDaAulaLido} onCancelar={voltarHome} />
    </div>
  )

  if (tela === 'identificar') return (
    <div className="wrap"><Cabecalho titulo="Quem é você?" />
      {lendoCartao
        ? <LeitorQR titulo="Aponte para o QR do seu cartão" onCancelar={() => setLendoCartao(false)}
            onLido={t => { const p = parsePayload(t); setLendoCartao(false); if (p) identificarEContinuar({ alunoId: p.alunoId }); else setErro('Esse QR não é de um cartão de aluno.') }} />
        : <form className="panel" onSubmit={e => { e.preventDefault(); identificarEContinuar({ matricula: matInput.trim() }) }}>
            <h2>Identifique-se uma vez</h2>
            <p className="hint">Fica guardado neste celular. Sem senha.</p>
            <label className="fld">Sua matrícula</label>
            <input value={matInput} onChange={e => setMatInput(e.target.value)} placeholder="20262F61RC0000" autoCorrect="off" />
            {erro && <div className="flash err" style={{ textAlign: 'left' }}>{erro}</div>}
            {aviso && <div className="flash dup" style={{ textAlign: 'left' }}>{aviso}</div>}
            <div className="btnrow">
              <button className="btn" type="submit" disabled={conferindo || !matInput.trim()}>{conferindo ? 'Conferindo…' : 'Continuar'}</button>
              <button className="btn ghost" type="button" onClick={() => { setErro(''); setLendoCartao(true) }}>🪪 Ler meu QR</button>
            </div>
          </form>}
    </div>
  )

  if (tela === 'home') return (
    <div className="wrap">
      <header className="app"><img className="orbe-mini" src="/orbe-mascote.png" alt="" /><h1>Orbe</h1><span className="sub">Topografia · IFPE · aluno</span><span className="spacer" />
        {naFila > 0 && <span className="badge off">{naFila} na fila</span>}{!online && <span className="badge off">sem rede</span>}</header>
      <CardPresenca />
      <div className="escolha">
        <button className="card-perfil" onClick={irChamada}>
          <span className="cp-emoji">📋</span><span className="cp-tit">Chamada</span>
          <span className="cp-sub">Leia o QR da aula. É assim que a presença é registrada — só no horário da aula.</span>
        </button>
        <button className="card-perfil" onClick={irMedir}>
          <span className="cp-emoji">🛰️</span><span className="cp-tit">{NOME_GPS}</span>
          <span className="cp-sub">Meça a sua posição a qualquer hora e compare com a estação do IBGE. Não marca presença.</span>
        </button>
      </div>
      {erro && <div className="flash err">{erro}</div>}
      {aviso && <div className="flash dup">{aviso}</div>}
      <p className="note" style={{ textAlign: 'center' }}>
        {ident ? <>Você: <b>{ident.nome || ident.matricula}</b> · <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={trocarIdent}>trocar</span></>
          : 'Na primeira vez, o app pede a sua matrícula ou o QR do seu cartão.'}
      </p>
      <div className="panel">
        <h2>Vira app no seu celular</h2>
        <p className="note" style={{ marginTop: 4 }}><b>iPhone:</b> Compartilhar → <b>Adicionar à Tela de Início</b>. <b>Android:</b> menu ⋮ → <b>Instalar app</b>.</p>
      </div>
      <p className="note" style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => { gravarPerfil('professor'); location.href = '/' }}>Sou professor(a)</p>
    </div>
  )

  /* medir (livre) e chamada-ok (aula) compartilham a tela de medição */
  const emAula = tela === 'chamada-ok'
  return (
    <div className="wrap">
      <Cabecalho titulo={emAula ? 'Chamada' : NOME_GPS} />
      {emAula && !presenca && !erro && <div className="flash dup">Registrando a chamada…{aula?.local ? ' · ' + nomeLocal(aula.local) : ''}</div>}
      <CardPresenca />
      {!emAula && !presenca && <p className="note">Medição livre — não registra presença. Para a chamada, use o card 📋 na tela inicial.</p>}

      <div className="panel">
        {!pos && !erro && <div className="spin">Procurando satélites…</div>}
        {erro && <div className="flash err" style={{ textAlign: 'left' }}>{erro}</div>}
        {pos && <>
          <div className="acc-big">
            <div className="ab-num">± {metros(pos.acc, 0)} m</div>
            <div className="ab-lab">é o raio dentro do qual o seu celular acha que você está</div>
          </div>
          <div className="count-strip">
            <div className="c"><div className="n">±{metros(pos.acc, 0)}</div><div className="l">horizontal (m)</div></div>
            <div className="c"><div className="n">{pos.altAcc ? '±' + metros(pos.altAcc, 0) : '—'}</div><div className="l">vertical (m)</div></div>
            <div className="c"><div className="n">{pos.distPerc > 2000 ? metros(pos.distPerc / 1000, 1) + ' km' : metros(pos.distPerc, 0) + ' m'}</div><div className="l">até a PERC</div></div>
          </div>
          {razaoVert && <p className="note">A incerteza <b>vertical é {razaoVert.toFixed(1)}× a horizontal</b>.</p>}
          {vezes && <div className="perc-box">
            <div className="pb-tit">A estação do IBGE, aqui no campus</div>
            <div className="pb-sub">PERC · Bloco A · incerteza de <b>1 milímetro</b></div>
            <div className="pb-punch">O seu celular erra <b>{vezes.toLocaleString('pt-BR')}×</b> mais que ela.</div>
          </div>}

          <label className="fld" style={{ marginTop: 16 }}>Onde você está agora? Toque para enviar uma medição.</label>
          <div className="amb-row">
            {AMBIENTES.map(a => <button key={a.k} className={'amb' + (a.k === 'outro' && pedindoOutro ? ' on' : '')} disabled={enviando}
              onClick={() => a.k === 'outro' ? setPedindoOutro(v => !v) : enviar(a.k)}>
              <span className="amb-emoji">{a.emoji}</span><span className="amb-txt">{a.rotulo}</span></button>)}
          </div>
          {pedindoOutro && <form className="row" style={{ marginTop: 8 }} onSubmit={e => { e.preventDefault(); if (outroTxt.trim()) { enviar('outro', null, outroTxt.trim()); setPedindoOutro(false) } }}>
            <input value={outroTxt} onChange={e => setOutroTxt(e.target.value)} maxLength={80} placeholder="Onde? Ex.: escada do Bloco F, quadra, ponto de ônibus" style={{ flex: 3 }} autoFocus />
            <button className="btn" type="submit" disabled={!outroTxt.trim() || enviando} style={{ flex: 1, minWidth: 110 }}>Enviar</button>
          </form>}
          {aviso && <div className="flash ok">{aviso}</div>}

          {placar && <div className="placar">
            <div className="pl-item"><div className="pl-n">± {metros(placar.meu, 1)}</div><div className="pl-l">seu recorde</div></div>
            <div className="pl-item destaque"><div className="pl-n">± {metros(placar.turma, 1)}</div><div className="pl-l">melhor da turma</div></div>
            <div className="pl-item"><div className="pl-n">{placar.alunos}</div><div className="pl-l">participando</div></div>
          </div>}
          {placar && placar.alunos > 1 && (placar.meu > placar.turma
            ? <p className="note" style={{ textAlign: 'center' }}>Alguém está com leitura melhor que a sua. Onde será que essa pessoa está?</p>
            : <p className="note" style={{ textAlign: 'center' }}><b>Você está com a melhor leitura da turma.</b> Consegue melhorar?</p>)}
          <p className="note">Ande até outro lugar e envie de novo. O que interessa é comparar.</p>
        </>}
      </div>

      {pos && ident && <Orbe pos={pos} ident={ident} codigo={modo === 'aula' ? codigoAula : ''}
        onAviso={m => { setAviso(m); setTimeout(() => setAviso(''), 4000) }} />}
    </div>
  )
}
