import React, { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { PERC, paraUTM25S, distanciaUTM, metros, vezesPiorQuePerc } from './lib/geo'
import { gravarPerfil } from './Escolha.jsx'
import { decodeFromVideo } from './lib/qr'

/* Tela do aluno. Sem conta, sem senha.
   Ele digita o codigo da aula e a propria matricula, ve a precisao ao vivo
   e envia leituras rotuladas por ambiente. Nao le nenhuma tabela: fala
   apenas com a funcao enviar_leitura, que valida no banco. */

/* Fila offline. A leitura fica no celular com a hora da captura e sobe
   quando houver rede — na hora, ao voltar a rede, ou em outro dia. */
const FILA = 'agc2_fila_leituras'
const lerFila = () => { try { return JSON.parse(localStorage.getItem(FILA) || '[]') } catch (e) { return [] } }
const gravarFila = f => { try { localStorage.setItem(FILA, JSON.stringify(f)) } catch (e) {} }
const ehErroDeRede = e => !e?.code && /fetch|network|conex|Failed|load/i.test(String(e?.message || e))

async function postar(item) {
  const { data, error } = await supabase.rpc('enviar_leitura', {
    p_codigo: item.codigo, p_matricula: item.matricula,
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

/* Contexto do aparelho no instante da captura, para pesquisa.
   Tudo aqui e "o que o navegador consegue dar": no iPhone a Network
   Information API nao existe (fica nulo), e o user agent e generico. */
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

function codigoDoQR(texto) {
  const t = String(texto || '').trim()
  try { const u = new URL(t); const a = u.searchParams.get('aula'); if (a) return a.toUpperCase() } catch (e) {}
  if (/^[A-Z0-9]{3,12}$/i.test(t)) return t.toUpperCase()
  return null
}

const AMBIENTES = [
  { k: 'sala', rotulo: 'Dentro da sala', emoji: '🏫' },
  { k: 'corredor', rotulo: 'Corredor', emoji: '🚪' },
  { k: 'patio', rotulo: 'Pátio / céu aberto', emoji: '🌤️' }
]

export default function Aluno() {
  const params = new URLSearchParams(location.search)
  const [codigo, setCodigo] = useState(() => {
    const daUrl = (params.get('aula') || '').toUpperCase()
    if (daUrl) return daUrl
    try { return (localStorage.getItem('agc2_codigo_aula') || '').toUpperCase() } catch (e) { return '' }
  })
  const [matricula, setMatricula] = useState(() => { try { return localStorage.getItem('agc2_matricula') || '' } catch (e) { return '' } })
  const [dentro, setDentro] = useState(false)
  const [nome, setNome] = useState('')
  const [pos, setPos] = useState(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviadas, setEnviadas] = useState(0)
  const [placar, setPlacar] = useState(null)
  const [naFila, setNaFila] = useState(() => lerFila().length)
  const [online, setOnline] = useState(navigator.onLine)
  const watchRef = useRef(null), t0 = useRef(0), ttff = useRef(null), autoRef = useRef(false)
  const nFixRef = useRef(0), melhorRef = useRef(null)
  const [lendoQR, setLendoQR] = useState(false)
  const [turma, setTurma] = useState('')
  const [conferindo, setConferindo] = useState(false)
  const [erroQR, setErroQR] = useState('')
  const qrVideo = useRef(null), qrCanvas = useRef(null), qrStream = useRef(null), qrVivo = useRef(false), qrUlt = useRef(0)

  useEffect(() => () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current) }, [])

  // sobe a fila: ao abrir, quando a rede volta, e de 30 em 30 s
  async function esvaziarFila() {
    const fila = lerFila()
    if (!fila.length || !navigator.onLine) return
    const resto = []
    for (const item of fila) {
      try {
        const d = await postar(item)
        if (d?.ok) { setPlacar({ meu: d.meu_melhor, turma: d.melhor_turma, alunos: d.alunos }); if (d.nome) setNome(d.nome) }
        // ok:false (código/matrícula inválidos) não volta para a fila: não vai passar nunca
      } catch (e) {
        if (ehErroDeRede(e)) { resto.push(item); break }
      }
    }
    gravarFila(resto); setNaFila(resto.length)
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

  function abrirLeitorQR() {
    setErroQR('')
    if (!navigator.mediaDevices?.getUserMedia) { setErroQR('Este navegador não dá acesso à câmera. Digite o código.'); return }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(s => { qrStream.current = s; setLendoQR(true) })
      .catch(e => { qrStream.current?.getTracks().forEach(x => x.stop()); qrStream.current = null
        setErroQR(e?.name === 'NotAllowedError' ? 'Permissão de câmera negada. Digite o código.' : 'Não consegui abrir a câmera. Digite o código.') })
  }
  function fecharLeitorQR() {
    qrVivo.current = false; setLendoQR(false)
    qrStream.current?.getTracks().forEach(x => x.stop()); qrStream.current = null
    if (qrVideo.current) qrVideo.current.srcObject = null
  }
  useEffect(() => {
    if (!lendoQR) return
    const v = qrVideo.current, s = qrStream.current
    if (!v || !s) return
    v.srcObject = s
    const p = v.play(); if (p && p.catch) p.catch(() => {})
    qrVivo.current = true
    const loop = ts => {
      if (!qrVivo.current) return
      requestAnimationFrame(loop)
      if (ts && ts - qrUlt.current < 80) return
      qrUlt.current = ts || 0
      const d = decodeFromVideo(qrVideo.current, qrCanvas.current)
      if (!d) return
      const c = codigoDoQR(d)
      if (c) { setCodigo(c); fecharLeitorQR() }
    }
    requestAnimationFrame(loop)
    return () => { qrVivo.current = false }
  }, [lendoQR])
  useEffect(() => () => fecharLeitorQR(), [])

  async function entrar(e) {
    e.preventDefault()
    setErro('')
    if (!codigo.trim() || !matricula.trim()) { setErro('Preencha o código da aula e a sua matrícula.'); return }
    if (lendoQR) fecharLeitorQR()
    setConferindo(true)
    try {
      // confere código + matrícula ANTES de entrar; se estiver errado, fica aqui
      const { data, error } = await supabase.rpc('validar_sessao', { p_codigo: codigo.trim(), p_matricula: matricula.trim() })
      if (error) throw error
      if (!data?.ok) { setErro(data?.erro || 'Não consegui conferir. Tente de novo.'); return }
      setNome(data.nome || ''); setTurma(data.turma || '')
    } catch (er) {
      if (!ehErroDeRede(er)) { setErro('Falhou a conferência: ' + (er.message || 'erro')); return }
      // sem rede: deixa entrar; a leitura fica na fila e é validada quando subir
      setAviso('Sem rede agora — não deu para conferir o código. Suas leituras ficam guardadas e sobem depois.')
      setTimeout(() => setAviso(''), 5000)
    } finally { setConferindo(false) }
    try { localStorage.setItem('agc2_matricula', matricula.trim()); localStorage.setItem('agc2_codigo_aula', codigo.trim()) } catch (er) {}
    setDentro(true)
    liga()
  }

  // volta para a tela de entrada, parando o GPS e zerando a sessão local
  function sair() {
    if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null }
    autoRef.current = false; nFixRef.current = 0; melhorRef.current = null; ttff.current = null
    setPos(null); setPlacar(null); setEnviadas(0); setNome(''); setTurma(''); setErro(''); setAviso('')
    setDentro(false)
  }

  function liga() {
    if (!navigator.geolocation) { setErro('Este navegador não tem geolocalização.'); return }
    t0.current = performance.now(); ttff.current = null
    watchRef.current = navigator.geolocation.watchPosition(
      p => {
        if (ttff.current == null) ttff.current = Math.round(performance.now() - t0.current)
        const c = p.coords
        const u = paraUTM25S(c.latitude, c.longitude)
        nFixRef.current += 1
        if (melhorRef.current == null || c.accuracy < melhorRef.current) melhorRef.current = c.accuracy
        setPos({
          lat: c.latitude, lon: c.longitude, acc: c.accuracy,
          alt: c.altitude, altAcc: c.altitudeAccuracy,
          utmN: u.n, utmE: u.e,
          distPerc: distanciaUTM(u.n, u.e, PERC.utmN, PERC.utmE),
          fixTs: p.timestamp ? new Date(p.timestamp).toISOString() : null,
          rumo: c.heading, velocidade: c.speed
        })
        setErro('')
        // o registro da aula e automatico: a primeira fixacao ja vira amostra
        if (!autoRef.current) {
          autoRef.current = true
          const leitura = { lat: c.latitude, lon: c.longitude, acc: c.accuracy, alt: c.altitude,
            altAcc: c.altitudeAccuracy, utmN: u.n, utmE: u.e,
            distPerc: distanciaUTM(u.n, u.e, PERC.utmN, PERC.utmE),
            fixTs: p.timestamp ? new Date(p.timestamp).toISOString() : null,
            rumo: c.heading, velocidade: c.speed }
          enviar('registro', leitura)
        }
      },
      e => setErro(e.code === 1
        ? 'Você precisa permitir o acesso à localização para participar.'
        : 'Não consegui obter a posição. Tente sair e voltar para a tela.'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    )
  }

  async function enviar(rotulo, posArg) {
    const pp = posArg || pos
    if (!pp || enviando) return
    setEnviando(true); setErro(''); setAviso('')
    const item = {
      codigo: codigo.trim(), matricula: matricula.trim(), rotulo, ...pp,
      capturado_em: new Date().toISOString(),
      online: navigator.onLine,                 // no instante da captura, nao do envio
      extra: {
        ...contextoDoAparelho(),
        ttff_ms: ttff.current,
        n_fixes_antes: Math.max(0, nFixRef.current - 1),
        melhor_acuracia_sessao: melhorRef.current,
        rumo: pp.rumo == null || Number.isNaN(pp.rumo) ? null : pp.rumo,
        velocidade: pp.velocidade == null || Number.isNaN(pp.velocidade) ? null : pp.velocidade
      }
    }
    try {
      const data = await postar(item)
      if (!data?.ok) { setErro(data?.erro || 'Não consegui registrar.'); return }
      setNome(data.nome || '')
      setEnviadas(data.n || (enviadas + 1))
      setPlacar({ meu: data.meu_melhor, turma: data.melhor_turma, alunos: data.alunos })
      if (rotulo === 'registro') {
        setAviso(data.presenca ? 'Presença registrada ✓'
          : data.motivo === 'fora_da_janela' ? 'Registro enviado fora do horário da aula — a professora decide a presença'
          : 'Leitura de registro enviada')
      } else setAviso('Leitura enviada — ' + rotulo)
      setTimeout(() => setAviso(''), 3500)
    } catch (e) {
      if (ehErroDeRede(e)) {
        const f = lerFila(); f.push(item); gravarFila(f); setNaFila(f.length)
        setAviso('Sem rede: leitura guardada no celular. Sobe sozinha quando tiver conexão.')
        setTimeout(() => setAviso(''), 4000)
      } else setErro('Falhou o envio: ' + (e.message || 'erro'))
    } finally { setEnviando(false) }
  }

  const vezes = pos ? vezesPiorQuePerc(pos.acc) : null
  const razaoVert = pos && pos.altAcc && pos.acc ? pos.altAcc / pos.acc : null

  if (!dentro) return (
    <div className="wrap">
      <header className="app"><h1>Posição · GNSS</h1><span className="sub">experimento da aula</span></header>
      <form className="panel login" onSubmit={entrar}>
        <h2>Entrar na coleta</h2>
        <p className="hint">Sem senha. Só o código que está na tela da sala e a sua matrícula.</p>
        <label className="fld">Código da aula</label>
        <div className="row">
          <input value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())}
            placeholder="Ex.: F19GPS" autoCapitalize="characters" autoCorrect="off" style={{ flex: 2 }} />
          {!lendoQR
            ? <button type="button" className="btn ghost" onClick={abrirLeitorQR} style={{ flex: 1, minWidth: 130 }}>📷 Ler QR da aula</button>
            : <button type="button" className="btn ghost" onClick={fecharLeitorQR} style={{ flex: 1, minWidth: 130 }}>Cancelar</button>}
        </div>
        {erroQR && <div className="flash err" style={{ textAlign: 'left' }}>{erroQR}</div>}
        {lendoQR && <div className="videowrap" style={{ marginTop: 10 }}>
          <video ref={qrVideo} playsInline muted />
          <div className="scanline" />
        </div>}
        <canvas ref={qrCanvas} hidden />
        <label className="fld">Sua matrícula</label>
        <input value={matricula} onChange={e => setMatricula(e.target.value)}
          placeholder="20262F61RC0000" inputMode="text" autoCorrect="off" />
        {erro && <div className="flash err" style={{ textAlign: 'left' }}>{erro}</div>}
        <div className="btnrow"><button className="btn" type="submit" disabled={conferindo}>{conferindo ? 'Conferindo…' : 'Começar'}</button></div>
        {aviso && <div className="flash dup" style={{ textAlign: 'left' }}>{aviso}</div>}
        <p className="note">O aparelho vai pedir permissão de localização. Sem ela não dá para participar
          do experimento — só a sua posição é usada, e apenas nesta aula.</p>
      </form>

      <div className="panel">
        <h2>Vira app no seu celular</h2>
        <p className="hint" style={{ marginBottom: 6 }}>Instale para abrir direto pelo ícone, sem digitar endereço.</p>
        <p className="note" style={{ marginTop: 4 }}><b>iPhone:</b> botão Compartilhar → <b>Adicionar à Tela de Início</b>.<br />
          <b>Android:</b> menu do navegador (⋮) → <b>Instalar app</b>.</p>
      </div>

      <p className="note" style={{ textAlign: 'center', cursor: 'pointer' }}
        onClick={() => { gravarPerfil('professor'); location.href = '/' }}>Sou professor(a)</p>
    </div>
  )

  return (
    <div className="wrap">
      <header className="app">
        <h1>Posição · GNSS</h1>
        {nome && <span className="sub">oi, {nome}{turma ? ' · ' + turma : ''}</span>}
        <span className="spacer" />
        <button className="btn ghost mini" onClick={sair} title="trocar código ou matrícula">↩ Voltar</button>
        {enviadas > 0 && <span className="badge on">{enviadas} enviada{enviadas > 1 ? 's' : ''}</span>}
        {naFila > 0 && <span className="badge off">{naFila} na fila</span>}
        {!online && <span className="badge off">sem rede</span>}
      </header>

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

          <label className="fld" style={{ marginTop: 16 }}>Onde você está agora? Toque para enviar a leitura.</label>
          <div className="amb-row">
            {AMBIENTES.map(a => (
              <button key={a.k} className="amb" disabled={enviando} onClick={() => enviar(a.k)}>
                <span className="amb-emoji">{a.emoji}</span>
                <span className="amb-txt">{a.rotulo}</span>
              </button>
            ))}
          </div>
          {aviso && <div className="flash ok">{aviso}</div>}

          {placar && <div className="placar">
            <div className="pl-item"><div className="pl-n">± {metros(placar.meu, 1)}</div><div className="pl-l">seu recorde</div></div>
            <div className="pl-item destaque"><div className="pl-n">± {metros(placar.turma, 1)}</div><div className="pl-l">melhor da turma</div></div>
            <div className="pl-item"><div className="pl-n">{placar.alunos}</div><div className="pl-l">participando</div></div>
          </div>}
          {placar && placar.meu > placar.turma && <p className="note" style={{textAlign:'center'}}>
            Alguém está com leitura melhor que a sua. Onde será que essa pessoa está?
          </p>}
          {placar && placar.meu <= placar.turma && <p className="note" style={{textAlign:'center'}}>
            <b>Você está com a melhor leitura da turma.</b> Consegue melhorar ainda mais?
          </p>}
          <p className="note">Ande até outro lugar e envie de novo. O que interessa é comparar.</p>
        </>}
      </div>
    </div>
  )
}
