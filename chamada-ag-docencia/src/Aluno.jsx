import React, { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { PERC, paraUTM25S, distanciaUTM, metros, vezesPiorQuePerc } from './lib/geo'

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
    p_capturado_em: item.capturado_em
  })
  if (error) throw error
  return data
}

const AMBIENTES = [
  { k: 'sala', rotulo: 'Dentro da sala', emoji: '🏫' },
  { k: 'corredor', rotulo: 'Corredor', emoji: '🚪' },
  { k: 'patio', rotulo: 'Pátio / céu aberto', emoji: '🌤️' }
]

export default function Aluno() {
  const params = new URLSearchParams(location.search)
  const [codigo, setCodigo] = useState((params.get('aula') || '').toUpperCase())
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

  function entrar(e) {
    e.preventDefault()
    setErro('')
    if (!codigo.trim() || !matricula.trim()) { setErro('Preencha o código da aula e a sua matrícula.'); return }
    try { localStorage.setItem('agc2_matricula', matricula.trim()) } catch (er) {}
    setDentro(true)
    liga()
  }

  function liga() {
    if (!navigator.geolocation) { setErro('Este navegador não tem geolocalização.'); return }
    t0.current = performance.now(); ttff.current = null
    watchRef.current = navigator.geolocation.watchPosition(
      p => {
        if (ttff.current == null) ttff.current = Math.round(performance.now() - t0.current)
        const c = p.coords
        const u = paraUTM25S(c.latitude, c.longitude)
        setPos({
          lat: c.latitude, lon: c.longitude, acc: c.accuracy,
          alt: c.altitude, altAcc: c.altitudeAccuracy,
          utmN: u.n, utmE: u.e,
          distPerc: distanciaUTM(u.n, u.e, PERC.utmN, PERC.utmE)
        })
        setErro('')
        // o registro da aula e automatico: a primeira fixacao ja vira amostra
        if (!autoRef.current) {
          autoRef.current = true
          const leitura = { lat: c.latitude, lon: c.longitude, acc: c.accuracy, alt: c.altitude,
            altAcc: c.altitudeAccuracy, utmN: u.n, utmE: u.e,
            distPerc: distanciaUTM(u.n, u.e, PERC.utmN, PERC.utmE) }
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
    const item = { codigo: codigo.trim(), matricula: matricula.trim(), rotulo, ...pp, capturado_em: new Date().toISOString() }
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
        <input value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())}
          placeholder="Ex.: F19GPS" autoCapitalize="characters" autoCorrect="off" />
        <label className="fld">Sua matrícula</label>
        <input value={matricula} onChange={e => setMatricula(e.target.value)}
          placeholder="20262F61RC0000" inputMode="text" autoCorrect="off" />
        {erro && <div className="flash err" style={{ textAlign: 'left' }}>{erro}</div>}
        <div className="btnrow"><button className="btn" type="submit">Começar</button></div>
        <p className="note">O aparelho vai pedir permissão de localização. Sem ela não dá para participar
          do experimento — só a sua posição é usada, e apenas nesta aula.</p>
      </form>
    </div>
  )

  return (
    <div className="wrap">
      <header className="app">
        <h1>Posição · GNSS</h1>
        {nome && <span className="sub">oi, {nome}</span>}
        <span className="spacer" />
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
