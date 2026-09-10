import React, { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'
import * as store from './lib/store'
import { qrDataUrl, decodeFromVideo, parsePayload, QR_PREFIX } from './lib/qr'
import { PERC, M0452, paraUTM25S, distanciaUTM, grausMinSeg, metros, vezesPiorQuePerc } from './lib/geo'

/* ---------- utils ---------- */
const todayISO = () => { const d = new Date(); const m = String(d.getMonth() + 1).padStart(2, '0'); const dd = String(d.getDate()).padStart(2, '0'); return `${d.getFullYear()}-${m}-${dd}` }
const fmtDate = iso => { if (!iso) return ''; const p = iso.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}` : iso }
const initials = n => { const p = String(n || '').trim().split(/\s+/); return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?' }

function Avatar({ a, big }) {
  const cls = big ? 'confirm-photo' : 'avatar'
  return <span className={cls}>{a.foto ? <img src={a.foto} alt="" /> : initials(a.nome)}</span>
}

/* ---------- LOGIN ---------- */
function Login() {
  const [modo, setModo] = useState('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault(); setBusy(true); setMsg('')
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
        if (error) setMsg('Não consegui entrar: ' + error.message)
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password: senha })
        if (error) setMsg('Erro ao criar conta: ' + error.message)
        else if (!data.session) setMsg('Conta criada. Enviamos um e-mail de confirmação — confirme e depois entre.')
      }
    } finally { setBusy(false) }
  }

  return (
    <div className="wrap">
      <div className="panel login">
        <div className="brandrow"><span className="dot" /><div><h1 style={{ margin: 0, fontSize: 18 }}>Chamada AG Docência</h1><div className="sub" style={{ color: 'var(--muted)', fontSize: 12.5 }}>Topografia · IFPE</div></div></div>
        <p className="hint">{modo === 'entrar' ? 'Entre com seu e-mail e senha.' : 'Crie sua conta de professora.'}</p>
        <form onSubmit={submit}>
          <label className="fld">E-mail</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
          <label className="fld">Senha</label>
          <input type="password" value={senha} onChange={e => setSenha(e.target.value)} required minLength={6} autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} />
          <div className="btnrow"><button className="btn" disabled={busy} type="submit">{busy ? '...' : (modo === 'entrar' ? 'Entrar' : 'Criar conta')}</button></div>
        </form>
        {msg && <p className="note" style={{ color: 'var(--brand2)' }}>{msg}</p>}
        <p className="note" style={{ cursor: 'pointer' }} onClick={() => { setModo(modo === 'entrar' ? 'criar' : 'entrar'); setMsg('') }}>
          {modo === 'entrar' ? 'Primeira vez? Criar conta' : 'Já tenho conta — entrar'}
        </p>
      </div>
    </div>
  )
}

/* ---------- APP PRINCIPAL ---------- */
export default function App() {
  const [session, setSession] = useState(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div className="spin">Carregando…</div>
  if (!session) return <Login />
  return <Main session={session} />
}

function Main({ session }) {
  const userId = session.user.id
  const [tab, setTab] = useState('chamada')
  const [online, setOnline] = useState(navigator.onLine)
  const [turmas, setTurmas] = useState(() => store.getCachedTurmas())
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [pending, setPending] = useState(store.outboxCount())
  const toastT = useRef(null)

  const showToast = useCallback(msg => {
    setToast(msg); if (toastT.current) clearTimeout(toastT.current)
    toastT.current = setTimeout(() => setToast(''), 2500)
  }, [])

  const refresh = useCallback(async () => {
    if (!navigator.onLine) { setTurmas(store.getCachedTurmas()); setLoading(false); return }
    try { const t = await store.loadTurmas(); setTurmas(t) }
    catch (e) { setTurmas(store.getCachedTurmas()) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    const on = async () => { setOnline(true); const n = await store.flushOutbox(userId); setPending(store.outboxCount()); if (n) { showToast(`${n} marcação(ões) sincronizada(s)`); refresh() } }
    const off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    if (navigator.onLine) on()
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [userId, refresh, showToast])

  const turmasMap = {}; turmas.forEach(t => turmasMap[t.id] = t)

  return (
    <div className="wrap">
      <header className="app">
        <h1>Chamada · QR</h1><span className="sub">AG Docência</span>
        <span className="sub" style={{ opacity: .6 }} title="versão que está rodando neste aparelho">v{__BUILD_ID__}</span>
        <span className="spacer" />
        <span className={'badge ' + (online ? 'on' : 'off')}>{online ? 'Online' : 'Offline'}</span>
        {pending > 0 && <span className="badge off">{pending} p/ sincronizar</span>}
        <button className="btn ghost mini" onClick={() => supabase.auth.signOut()}>Sair</button>
      </header>

      <div className="lgpd"><b>Dentro da lei (LGPD).</b> Dados no seu banco privado em São Paulo, só a sua conta acessa. As fotos servem para você conferir na tela — sem biometria. Guarde o termo de consentimento assinado dos alunos.</div>

      <nav className="tabs">
        {[['chamada', 'Chamada'], ['turmas', 'Turmas & Fotos'], ['conferir', 'Conferir faltantes'], ['resumo', 'Resumo / Exportar'], ['posicao', 'Posição · GNSS']].map(([k, l]) =>
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </nav>

      {loading ? <div className="spin">Carregando turmas…</div> :
        turmas.length === 0 ? <SeedPanel userId={userId} onDone={refresh} showToast={showToast} /> :
          <>
            {tab === 'chamada' && <Chamada userId={userId} turmas={turmas} turmasMap={turmasMap} online={online} setPending={setPending} showToast={showToast} goConferir={() => setTab('conferir')} />}
            {tab === 'turmas' && <TurmasFotos turmas={turmas} refresh={refresh} showToast={showToast} online={online} />}
            {tab === 'conferir' && <Conferir userId={userId} turmas={turmas} online={online} setPending={setPending} showToast={showToast} />}
            {tab === 'resumo' && <Resumo turmas={turmas} showToast={showToast} />}
            {tab === 'posicao' && <><ColetaTurma userId={userId} turmas={turmas} online={online} showToast={showToast} /><Posicao userId={userId} online={online} showToast={showToast} /></>}
          </>}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

/* ---------- importar turmas semente ---------- */
function SeedPanel({ userId, onDone, showToast }) {
  const [busy, setBusy] = useState(false)
  async function go() {
    setBusy(true)
    try { await store.importSeed(userId); showToast('Turmas importadas'); onDone() }
    catch (e) { alert('Erro ao importar: ' + e.message); setBusy(false) }
  }
  return (
    <div className="panel">
      <h2>Bem-vinda!</h2>
      <p className="hint">Você ainda não tem turmas neste app. Posso importar as 3 turmas de 2026.2 (71 alunos) que já preparamos.</p>
      <div className="btnrow"><button className="btn" disabled={busy} onClick={go}>{busy ? 'Importando…' : 'Importar 3 turmas (2026.2)'}</button></div>
      {!navigator.onLine && <p className="note" style={{ color: 'var(--miss)' }}>Você está offline — conecte-se à internet para importar as turmas na primeira vez.</p>}
    </div>
  )
}

/* ---------- selfie overlay ---------- */
function SelfieOverlay({ aluno, onCapture, onClose }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let alive = true
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user' } })
      .then(s => { if (!alive) { s.getTracks().forEach(t => t.stop()); return } streamRef.current = s; if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play() } })
      .catch(e => setErr('Câmera indisponível (' + (e?.name || 'erro') + '). Use “Arquivo”.'))
    return () => { alive = false; streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])
  function snap() {
    const v = videoRef.current; const w = v.videoWidth, h = v.videoHeight; if (!w || !h) return
    const side = Math.min(w, h), sx = (w - side) / 2, sy = (h - side) / 2, max = 220
    const cv = document.createElement('canvas'); cv.width = max; cv.height = max
    const ctx = cv.getContext('2d'); ctx.translate(max, 0); ctx.scale(-1, 1)
    ctx.drawImage(v, sx, sy, side, side, 0, 0, max, max)
    let url = null; try { url = cv.toDataURL('image/jpeg', 0.7) } catch (e) {}
    streamRef.current?.getTracks().forEach(t => t.stop())
    onCapture(url)
  }
  return (
    <div className="camoverlay">
      <div className="cambox">
        <div className="camtitle">Selfie — {aluno.nome}</div>
        {err ? <p className="note" style={{ color: 'var(--miss)' }}>{err}</p> :
          <div className="videowrap"><video ref={videoRef} playsInline muted /></div>}
        <div className="btnrow" style={{ justifyContent: 'center' }}>
          {!err && <button className="btn" onClick={snap}>📸 Capturar</button>}
          <button className="btn ghost" onClick={() => { streamRef.current?.getTracks().forEach(t => t.stop()); onClose() }}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

/* downscale de arquivo */
function fileToDataUrl(file, max, cb) {
  const r = new FileReader()
  r.onload = ev => { const img = new Image(); img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)); const w = Math.round(img.width * s), h = Math.round(img.height * s); const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h); try { cb(cv.toDataURL('image/jpeg', 0.7)) } catch (e) { cb(null) } }; img.onerror = () => cb(null); img.src = ev.target.result }
  r.onerror = () => cb(null); r.readAsDataURL(file)
}

/* ---------- TURMAS & FOTOS ---------- */
function TurmasFotos({ turmas, refresh, showToast, online }) {
  const [tid, setTid] = useState(turmas[0]?.id || '')
  const [selfie, setSelfie] = useState(null)
  const [cards, setCards] = useState(null)
  const fileRef = useRef(null)
  const alvo = useRef(null)
  const t = turmas.find(x => x.id === tid) || turmas[0]

  async function saveFoto(alunoId, url) {
    if (!url) return
    if (!online) { showToast('Offline — conecte para salvar a foto'); return }
    try { await store.saveFoto(alunoId, url); showToast('Foto salva'); refresh() } catch (e) { alert('Erro: ' + e.message) }
  }
  function pickFile(alunoId) { alvo.current = alunoId; fileRef.current.value = ''; fileRef.current.click() }
  function onFile(e) { const f = e.target.files?.[0]; if (f && alvo.current) fileToDataUrl(f, 220, url => saveFoto(alvo.current, url)) }

  function gerarCartoes() {
    if (!t) return
    setCards(t.alunos.map(a => ({ ...a, qr: qrDataUrl(`${QR_PREFIX};${t.id};${a.id}`, 150) })))
  }

  return (
    <>
      <div className="panel">
        <h2>Fotos dos alunos</h2>
        <p className="hint">A foto aparece grande na sua tela quando o aluno lê o QR — sua conferência visual. “Selfie” abre a câmera; “Arquivo” escolhe uma imagem.</p>
        <label className="fld">Turma</label>
        <select value={tid} onChange={e => setTid(e.target.value)}>{turmas.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
        <ul className="people" style={{ maxHeight: 420 }}>
          {t?.alunos.map(a =>
            <li key={a.id}>
              <span className="left"><Avatar a={a} /><span className="who"><span>{a.nome}</span>{a.matricula && <span className="m">Mat. {a.matricula}</span>}</span></span>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button className="btn ghost mini" onClick={() => setSelfie(a)}>Selfie</button>
                <button className="btn ghost mini" onClick={() => pickFile(a.id)}>Arquivo</button>
                {a.foto && <button className="btn danger mini" onClick={() => saveFoto(a.id, '')}>Remover</button>}
              </span>
            </li>)}
        </ul>
        <input ref={fileRef} type="file" accept="image/*" capture="user" hidden onChange={onFile} />
      </div>

      <div className="panel">
        <h2>Cartões de QR para imprimir</h2>
        <p className="hint">Gere os cartõezinhos e imprima (ou salve em PDF). Cada aluno recebe o seu.</p>
        <div className="btnrow noprint">
          <button className="btn" onClick={gerarCartoes}>Gerar cartões</button>
          {cards && <button className="btn ghost" onClick={() => window.print()}>Imprimir / PDF</button>}
        </div>
        {cards && <div className="cards">{cards.map(a => <div className="card" key={a.id}>{a.qr && <img src={a.qr} alt="" />}<div className="cn">{a.nome}</div>{a.matricula && <div className="cm">Mat. {a.matricula}</div>}<div className="cm">{t.nome}</div></div>)}</div>}
      </div>

      {selfie && <SelfieOverlay aluno={selfie} onClose={() => setSelfie(null)} onCapture={url => { setSelfie(null); saveFoto(selfie.id, url) }} />}
    </>
  )
}

/* ---------- POSIÇÃO · GNSS (instrumento didático) ---------- */
function Posicao({ userId, online, showToast }) {
  const [lendo, setLendo] = useState(false)
  const [pos, setPos] = useState(null)      // leitura corrente
  const [melhor, setMelhor] = useState(null) // melhor acurácia da sessão
  const [n, setN] = useState(0)             // quantas atualizações
  const [erro, setErro] = useState('')
  const [rotulo, setRotulo] = useState('sala')
  const [salvas, setSalvas] = useState([])
  const watchRef = useRef(null), t0Ref = useRef(0), ttffRef = useRef(null)

  useEffect(() => () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current) }, [])

  function comeca() {
    setErro('')
    if (!navigator.geolocation) { setErro('Este navegador não expõe geolocalização.'); return }
    setLendo(true); setN(0); setMelhor(null); setPos(null)
    t0Ref.current = performance.now(); ttffRef.current = null
    watchRef.current = navigator.geolocation.watchPosition(
      p => {
        if (ttffRef.current == null) ttffRef.current = Math.round(performance.now() - t0Ref.current)
        const c = p.coords
        const u = paraUTM25S(c.latitude, c.longitude)
        const leitura = {
          lat: c.latitude, lon: c.longitude,
          acuracia_m: c.accuracy,
          altitude_m: c.altitude, alt_acuracia_m: c.altitudeAccuracy,
          utm_n: u.n, utm_e: u.e,
          dist_perc_m: distanciaUTM(u.n, u.e, PERC.utmN, PERC.utmE),
          dist_m0452_m: distanciaUTM(u.n, u.e, M0452.utmN, M0452.utmE),
          ttff_ms: ttffRef.current
        }
        setPos(leitura); setN(k => k + 1)
        setMelhor(m => (!m || (leitura.acuracia_m || 1e9) < (m.acuracia_m || 1e9)) ? leitura : m)
      },
      e => { setErro(e.code === 1 ? 'Permissão de localização negada.' : 'Não consegui obter posição (' + (e.message || e.code) + ').'); para() },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    )
  }
  function para() {
    if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null }
    setLendo(false)
  }

  async function salvar() {
    const l = pos
    if (!l) return
    if (!online) { showToast('Offline — conecte para salvar a leitura'); return }
    try {
      const { dist_m0452_m, ...campos } = l
      await store.salvarLeitura(userId, { ...campos, rotulo })
      showToast('Leitura salva')
      carregar()
    } catch (e) { showToast('Erro ao salvar: ' + e.message) }
  }
  const carregar = useCallback(async () => {
    if (!online) return
    try { setSalvas(await store.listarLeituras(20)) } catch (e) {}
  }, [online])
  useEffect(() => { carregar() }, [carregar])

  const vezes = pos ? vezesPiorQuePerc(pos.acuracia_m) : null
  const razaoVert = pos && pos.alt_acuracia_m && pos.acuracia_m ? (pos.alt_acuracia_m / pos.acuracia_m) : null

  return (
    <>
      <div className="panel">
        <h2>Posição · GNSS</h2>
        <p className="hint">O seu celular medido contra a estação da rede geodésica nacional que fica dentro do campus.</p>

        <div className="btnrow">
          {!lendo
            ? <button className="btn" onClick={comeca}>Ler posição</button>
            : <button className="btn ghost" onClick={para}>Parar leitura</button>}
          {pos && <button className="btn ghost" onClick={salvar} disabled={!online}>Salvar leitura</button>}
        </div>

        {erro && <div className="flash err" style={{ textAlign: 'left' }}>{erro}</div>}

        {lendo && !pos && <div className="spin">Adquirindo satélites…</div>}

        {pos && <>
          <div className="gps-grid">
            <div className="gp"><div className="gl">Latitude</div><div className="gv">{grausMinSeg(pos.lat, true)}</div></div>
            <div className="gp"><div className="gl">Longitude</div><div className="gv">{grausMinSeg(pos.lon, false)}</div></div>
            <div className="gp"><div className="gl">UTM 25 S · N</div><div className="gv">{metros(pos.utm_n, 1)}</div></div>
            <div className="gp"><div className="gl">UTM 25 S · E</div><div className="gv">{metros(pos.utm_e, 1)}</div></div>
          </div>

          <div className="count-strip" style={{ marginTop: 12 }}>
            <div className="c"><div className="n">±{metros(pos.acuracia_m, 0)}</div><div className="l">horizontal (m)</div></div>
            <div className="c"><div className="n">{pos.alt_acuracia_m ? '±' + metros(pos.alt_acuracia_m, 0) : '—'}</div><div className="l">vertical (m)</div></div>
            <div className="c"><div className="n">{n}</div><div className="l">leituras</div></div>
          </div>

          {razaoVert && <p className="note">
            O erro <b>vertical é {razaoVert.toFixed(1)}× o horizontal</b>. Os satélites estão todos acima do
            horizonte, nunca abaixo — a componente vertical é mal condicionada. É por isso que rede de esgoto
            por gravidade não se nivela com GNSS.
          </p>}

          {pos.altitude_m != null && <p className="note">
            Altitude <b>{metros(pos.altitude_m, 1)} m</b> — é <b>elipsoidal</b>, não a altitude do mar.
            Para virar ortométrica falta a ondulação geoidal (MAPGEO2015); no campus ela é de cerca de −5,56 m.
          </p>}

          <div className="perc-box">
            <div className="pb-tit">Referência: {PERC.nome}</div>
            <div className="pb-sub">Estação RBMC do IBGE, no Bloco A · SIRGAS2000 época 2000,4 · em operação desde {PERC.desde}</div>
            <table className="pb-tab"><tbody>
              <tr><td>Distância medida até ela</td><td><b>{metros(pos.dist_perc_m, 0)} m</b></td></tr>
              <tr><td>Distância até o marco M0452</td><td><b>{metros(pos.dist_m0452_m, 0)} m</b></td></tr>
              <tr><td>Incerteza do seu celular</td><td><b>± {metros(pos.acuracia_m, 1)} m</b></td></tr>
              <tr><td>Incerteza da PERC</td><td><b>± 0,001 m</b></td></tr>
            </tbody></table>
            {vezes && <div className="pb-punch">Seu celular erra <b>{vezes.toLocaleString('pt-BR')}×</b> mais que a estação — a poucos metros dela, com os mesmos satélites.</div>}
          </div>

          {pos.ttff_ms != null && <p className="note">Primeira fixação em <b>{(pos.ttff_ms / 1000).toFixed(1)} s</b> (TTFF).
            {melhor && melhor.acuracia_m < pos.acuracia_m && <> Melhor acurácia da sessão: ±{metros(melhor.acuracia_m, 1)} m.</>}
          </p>}

          <label className="fld" style={{ marginTop: 12 }}>Onde você está?</label>
          <select value={rotulo} onChange={e => setRotulo(e.target.value)}>
            <option value="sala">Dentro da sala</option>
            <option value="corredor">Corredor</option>
            <option value="patio">Pátio / céu aberto</option>
            <option value="outro">Outro</option>
          </select>
          <p className="note">Esse rótulo é a variável do experimento: é o que permite comparar a precisão dentro e fora do prédio ao longo do semestre.</p>
        </>}
      </div>

      {salvas.length > 0 && <div className="panel">
        <h2>Leituras salvas</h2>
        <p className="hint">{salvas.length} mais recentes. Vira dataset da turma ao longo do semestre.</p>
        <div className="scrollx">
          <table className="matrix"><thead><tr>
            <th className="nm">Quando</th><th>Onde</th><th>± horiz.</th><th>± vert.</th><th>até PERC</th>
          </tr></thead><tbody>
            {salvas.map(r => <tr key={r.id}>
              <td className="nm">{new Date(r.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
              <td>{r.rotulo || '—'}</td>
              <td>{metros(r.acuracia_m, 1)}</td>
              <td>{r.alt_acuracia_m != null ? metros(r.alt_acuracia_m, 1) : '—'}</td>
              <td>{metros(r.dist_perc_m, 0)}</td>
            </tr>)}
          </tbody></table>
        </div>
      </div>}
    </>
  )
}

/* ---------- COLETA DA TURMA (aula prática) ---------- */
function ColetaTurma({ userId, turmas, online, showToast }) {
  const [tid, setTid] = useState(turmas[0]?.id || '')
  const [codigo, setCodigo] = useState('F19GPS')
  const [tempo, setTempo] = useState('ensolarado')
  const [sessao, setSessao] = useState(null)
  const [linhas, setLinhas] = useState([])
  const [busy, setBusy] = useState(false)

  const linkAluno = sessao ? `${location.origin}/?aula=${encodeURIComponent(sessao.codigo)}` : ''
  const qr = sessao ? qrDataUrl(linkAluno, 190) : null

  useEffect(() => {
    if (!tid || !online) return
    store.sessoesAbertas(tid).then(s => setSessao(s?.find(x => x.aberta) || null)).catch(() => {})
  }, [tid, online])

  // atualiza as leituras enquanto a sessão estiver aberta
  useEffect(() => {
    if (!sessao?.id || !online) return
    let vivo = true
    const puxa = () => store.leiturasDaSessao(sessao.id).then(d => vivo && setLinhas(d)).catch(() => {})
    puxa()
    const it = setInterval(puxa, 5000)
    return () => { vivo = false; clearInterval(it) }
  }, [sessao, online])

  async function abrir() {
    if (!tid) { showToast('Selecione a turma'); return }
    if (!codigo.trim()) { showToast('Defina um código'); return }
    setBusy(true)
    try {
      const t = turmas.find(x => x.id === tid)
      setSessao(await store.abrirSessao(userId, tid, codigo.trim(), t?.nome || null, tempo))
      showToast('Sessão aberta')
    } catch (e) {
      showToast(e.message?.includes('duplicate') ? 'Esse código já existe. Use outro.' : 'Erro: ' + e.message)
    } finally { setBusy(false) }
  }
  async function fechar() {
    if (!sessao) return
    try { await store.fecharSessao(sessao.id); setSessao({ ...sessao, aberta: false }); showToast('Sessão encerrada') }
    catch (e) { showToast('Erro ao encerrar') }
  }

  // média de acurácia por ambiente — é o resultado do experimento
  const porAmbiente = ['registro', 'sala', 'corredor', 'patio'].map(k => {
    const ls = linhas.filter(l => l.rotulo === k && l.acuracia_m != null)
    const med = ls.length ? ls.reduce((s, l) => s + l.acuracia_m, 0) / ls.length : null
    return { k, n: ls.length, med }
  })
  const alunosDistintos = new Set(linhas.map(l => l.aluno_id)).size
  const presentesColeta = new Set(linhas.filter(l => l.rotulo === 'registro').map(l => l.aluno_id)).size
  // o campus inteiro cabe em ~250 m da PERC; acima disso a leitura veio de fora
  const LONGE_M = 400
  const foraDoCampus = l => l.dist_perc_m != null && l.dist_perc_m > LONGE_M

  return (
    <div className="panel">
      <h2>Aula prática — coleta da turma</h2>
      <p className="hint">Os alunos entram pelo celular sem conta: só o código da aula e a matrícula.</p>

      {!sessao?.aberta && <>
        <div className="row">
          <div><label className="fld">Turma</label>
            <select value={tid} onChange={e => setTid(e.target.value)}>
              {turmas.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select></div>
          <div><label className="fld">Código da aula</label>
            <input value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} maxLength={12} /></div>
          <div><label className="fld">Céu agora</label>
            <select value={tempo} onChange={e => setTempo(e.target.value)}>
              <option value="ensolarado">☀️ Ensolarado</option>
              <option value="parcial">⛅ Parcialmente nublado</option>
              <option value="nublado">☁️ Nublado</option>
              <option value="chuva">🌧️ Chuva</option>
            </select></div>
        </div>
        <div className="btnrow"><button className="btn" onClick={abrir} disabled={busy || !online}>Abrir sessão</button></div>
      </>}

      {sessao?.aberta && <>
        <div className="codigo-box">
          <div className="cb-lab">Código da aula — projete esta tela{sessao.tempo ? ' · céu: ' + sessao.tempo : ''}</div>
          <div className="cb-cod">{sessao.codigo}</div>
          {qr && <img className="cb-qr" src={qr} alt="" />}
          <div className="cb-link">{linkAluno}</div>
        </div>
        <div className="count-strip" style={{ marginTop: 12 }}>
          <div className="c ok"><div className="n">{presentesColeta}</div><div className="l">presentes pela coleta</div></div>
          <div className="c"><div className="n">{alunosDistintos}</div><div className="l">alunos</div></div>
          <div className="c"><div className="n">{linhas.length}</div><div className="l">leituras</div></div>
        </div>

        <div className="scrollx" style={{ marginTop: 12 }}>
          <table className="matrix"><thead><tr>
            <th className="nm">Ambiente</th><th>Leituras</th><th>Acurácia média</th>
          </tr></thead><tbody>
            {porAmbiente.map(a => <tr key={a.k}>
              <td className="nm">{a.k === 'registro' ? 'Registro (automático)' : a.k === 'sala' ? 'Dentro da sala' : a.k === 'corredor' ? 'Corredor' : 'Pátio'}</td>
              <td>{a.n}</td>
              <td className={a.med != null ? (a.k === 'patio' ? 'P' : 'F') : ''}>{a.med != null ? '± ' + metros(a.med, 1) + ' m' : '—'}</td>
            </tr>)}
          </tbody></table>
        </div>
        <p className="note">É este o resultado do experimento: a mesma turma, os mesmos satélites, três ambientes.
          {sessao.chamada_id && <> O registro de cada aluno já marcou presença na chamada de hoje.</>}</p>

        <div className="btnrow"><button className="btn ghost" onClick={fechar}>Encerrar sessão</button></div>
      </>}

      {linhas.length > 0 && <div className="scrollx" style={{ marginTop: 14 }}>
        <table className="matrix"><thead><tr>
          <th className="nm">Aluno</th><th>Onde</th><th>± horiz.</th><th>± vert.</th><th>até PERC</th><th>Hora</th>
        </tr></thead><tbody>
          {linhas.slice(0, 40).map(l => <tr key={l.id}>
            <td className="nm">{l.alunos?.nome || '—'}</td>
            <td>{l.rotulo}</td>
            <td>{metros(l.acuracia_m, 1)}</td>
            <td>{l.alt_acuracia_m != null ? metros(l.alt_acuracia_m, 1) : '—'}</td>
            <td className={foraDoCampus(l) ? 'F' : ''} title={foraDoCampus(l) ? 'leitura longe do campus — conferir' : ''}>
              {l.dist_perc_m == null ? '—' : l.dist_perc_m > 2000 ? metros(l.dist_perc_m / 1000, 1) + ' km' : metros(l.dist_perc_m, 0) + ' m'}{foraDoCampus(l) ? ' ⚠' : ''}
            </td>
            <td>{new Date(l.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
          </tr>)}
        </tbody></table>
      </div>}
    </div>
  )
}

/* ---------- CHAMADA ---------- */
function Chamada({ userId, turmas, online, setPending, showToast, goConferir }) {
  const [tid, setTid] = useState(turmas[0]?.id || '')
  const [data, setData] = useState(todayISO())
  const [chamadaId, setChamadaId] = useState(null)
  const [present, setPresent] = useState({})
  const [scanning, setScanning] = useState(false)
  const [flash, setFlash] = useState({ msg: 'Aponte um QR para a câmera…', cls: '' })
  const [confirmA, setConfirmA] = useState(null)
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [hit, setHit] = useState('')
  const videoRef = useRef(null), canvasRef = useRef(null), streamRef = useRef(null)
  const scanRef = useRef(false), lastRef = useRef({ t: '', at: 0 }), confT = useRef(null)
  const hitT = useRef(null), audioRef = useRef(null), lastScanRef = useRef(0)
  // espelhos do estado, para o loop de leitura enxergar sempre o valor atual
  const presentRef = useRef({}), chamadaRef = useRef(null), onlineRef = useRef(true)
  const tRef = useRef(null), tidRef = useRef('')
  const t = turmas.find(x => x.id === tid)

  // abre/garante a chamada do dia
  useEffect(() => {
    let alive = true
    setChamadaId(null); setPresent({})
    if (!tid) return
    if (!online) { setFlash({ msg: 'Offline: a chamada será sincronizada depois.', cls: 'dup' }); return }
    setBusy(true)
    store.ensureChamada(userId, tid, data)
      .then(async ch => { if (!alive) return; setChamadaId(ch.id); const p = await store.getPresentes(ch.id); const m = {}; p.forEach(id => m[id] = true); setPresent(m) })
      .catch(e => showToast('Erro ao abrir chamada'))
      .finally(() => alive && setBusy(false))
    return () => { alive = false }
  }, [tid, data, online, userId, showToast])

  const counts = (() => { const tot = t ? t.alunos.length : 0; let p = 0; if (t) t.alunos.forEach(a => { if (present[a.id]) p++ }); return { tot, p, f: tot - p } })()

  /* O loop de leitura é agendado uma vez, quando a câmera abre, e carrega
     consigo a versão das funções daquele instante. Sem estes espelhos ele
     enxergaria para sempre o estado do começo do escaneamento — era por
     isso que reler o mesmo QR aparecia como presença nova. */
  useEffect(() => { presentRef.current = present }, [present])
  useEffect(() => { chamadaRef.current = chamadaId }, [chamadaId])
  useEffect(() => { onlineRef.current = online }, [online])
  useEffect(() => { tRef.current = t; tidRef.current = tid })

  function doFlash(msg, cls) { setFlash({ msg, cls }) }
  function showConfirm(aluno, statusText, kind) {
    setConfirmA({ aluno, statusText, kind }); if (confT.current) clearTimeout(confT.current)
    confT.current = setTimeout(() => setConfirmA(null), 4000)
  }

  /* ---- sinal de leitura: pisca o quadro e apita ----
     O visual é o principal: o iPhone não tem vibração para web, e com o
     aparelho no silencioso o som não sai. O pisca funciona sempre. */
  function pulse(kind) {
    setHit(kind)
    if (hitT.current) clearTimeout(hitT.current)
    hitT.current = setTimeout(() => setHit(''), 320)
    beep(kind)
  }
  // o contexto de áudio precisa nascer dentro de um toque do usuário (iOS)
  function unlockAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      if (!audioRef.current) audioRef.current = new AC()
      if (audioRef.current.state === 'suspended') audioRef.current.resume()
    } catch (e) {}
  }
  function beep(kind) {
    const ctx = audioRef.current
    if (!ctx || ctx.state !== 'running') return
    try {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = kind === 'ok' ? 880 : kind === 'dup' ? 587 : 300
      const t0 = ctx.currentTime
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16)
      o.connect(g); g.connect(ctx.destination)
      o.start(t0); o.stop(t0 + 0.18)
    } catch (e) {}
  }

  async function mark(alunoId) {
    setPresent(p => ({ ...p, [alunoId]: true })); presentRef.current = { ...presentRef.current, [alunoId]: true }
    const chamadaId = chamadaRef.current, online = onlineRef.current
    if (chamadaId && online) { try { await store.marcarPresente(userId, chamadaId, alunoId) } catch (e) { store.queueOp({ type: 'present', chamadaId, alunoId }); setPending(store.outboxCount()) } }
    else if (chamadaId) { store.queueOp({ type: 'present', chamadaId, alunoId }); setPending(store.outboxCount()) }
    else { showToast('Sem chamada aberta (offline). Abra online uma vez.') }
  }
  async function unmark(alunoId) {
    setPresent(p => { const n = { ...p }; delete n[alunoId]; return n })
    const n = { ...presentRef.current }; delete n[alunoId]; presentRef.current = n
    const chamadaId = chamadaRef.current, online = onlineRef.current
    if (chamadaId && online) { try { await store.desmarcarPresente(chamadaId, alunoId) } catch (e) { store.queueOp({ type: 'absent', chamadaId, alunoId }); setPending(store.outboxCount()) } }
    else if (chamadaId) { store.queueOp({ type: 'absent', chamadaId, alunoId }); setPending(store.outboxCount()) }
  }
  function toggle(alunoId) { presentRef.current[alunoId] ? unmark(alunoId) : mark(alunoId) }

  function onDecoded(text) {
    const now = Date.now()
    if (text === lastRef.current.t && now - lastRef.current.at < 1500) return
    lastRef.current = { t: text, at: now }
    const p = parsePayload(text)
    const turma = tRef.current
    if (!p) { doFlash('QR não reconhecido.', 'err'); pulse('err'); return }
    if (!turma) { doFlash('Selecione uma turma.', 'err'); pulse('err'); return }
    if (p.turmaId !== tidRef.current) { doFlash('Esse QR é de outra turma.', 'err'); pulse('err'); return }
    const aluno = turma.alunos.find(a => a.id === p.alunoId)
    if (!aluno) { doFlash('Aluno não está nesta turma.', 'err'); pulse('err'); return }
    if (presentRef.current[aluno.id]) { doFlash('Já registrado', 'dup'); pulse('dup'); showConfirm(aluno, '✓ Já registrado', 'dup'); return }
    mark(aluno.id); doFlash('Presença registrada', 'ok'); pulse('ok'); showConfirm(aluno, '✓ Presença confirmada', 'ok')
  }

  function loop(ts) {
    if (!scanRef.current) return
    requestAnimationFrame(loop)
    // decodifica ~12x por segundo em vez de a cada quadro. O olho não nota
    // diferença ao apontar o QR, e sobra CPU (e bateria) no celular.
    if (ts && ts - lastScanRef.current < 80) return
    lastScanRef.current = ts || 0
    const d = decodeFromVideo(videoRef.current, canvasRef.current)
    if (d) onDecoded(d)
  }
  function startCam() {
    if (!t) { alert('Selecione uma turma.'); return }
    if (!navigator.mediaDevices?.getUserMedia) { alert('Sem acesso à câmera. Use a marcação manual tocando nos nomes.'); return }
    unlockAudio()   // precisa acontecer dentro do toque, senão o iOS não libera o som
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(s => { streamRef.current = s; setScanning(true) })
      .catch(e => {
        streamRef.current?.getTracks().forEach(x => x.stop()); streamRef.current = null
        alert('Não consegui abrir a câmera (' + (e?.name || 'erro') + '). Use a marcação manual.')
      })
  }

  // O <video> só existe no DOM depois que `scanning` vira true. Acoplar o stream
  // aqui, e não dentro do .then do getUserMedia, evita videoRef.current === null
  // (o TypeError caía no catch e era reportado como falha de câmera).
  useEffect(() => {
    if (!scanning) return
    const v = videoRef.current, s = streamRef.current
    if (!v || !s) return
    v.srcObject = s
    const p = v.play()
    if (p && p.catch) p.catch(() => {})   // iOS rejeita play() em alguns casos
    scanRef.current = true
    doFlash('Câmera pronta. Aponte os QR.', '')
    requestAnimationFrame(loop)
  }, [scanning])

  function stopCam() {
    scanRef.current = false; setScanning(false)
    streamRef.current?.getTracks().forEach(x => x.stop()); streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setConfirmA(null)
  }
  useEffect(() => () => stopCam(), [])

  const rows = t ? t.alunos.filter(a => !q || a.nome.toLowerCase().includes(q.toLowerCase()) || (a.matricula || '').includes(q)) : []

  return (
    <div className="panel">
      <h2>Fazer a chamada</h2>
      <p className="hint">A lista preenche sozinha conforme você lê o QR. No fim, confira só os faltantes.</p>
      <div className="row">
        <div><label className="fld">Turma</label><select value={tid} onChange={e => { stopCam(); setTid(e.target.value) }}>{turmas.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></div>
        <div><label className="fld">Data</label><input type="date" value={data} onChange={e => setData(e.target.value)} /></div>
      </div>
      <div className="btnrow">
        {!scanning ? <button className="btn" onClick={startCam}>Abrir câmera e ler QR</button> : <button className="btn ghost" onClick={stopCam}>Parar câmera</button>}
      </div>

      {scanning && <div style={{ marginTop: 12 }}>
        <div className="videowrap">
          <video ref={videoRef} playsInline muted />
          <div className="scanline" />
          <div className={'hitflash' + (hit ? ' on ' + hit : '')} />
          {confirmA && <div className={'confirm-over ' + (confirmA.kind || 'ok')}>
            <Avatar a={confirmA.aluno} big />
            <div className="co-txt">
              <div className="co-nome">{confirmA.aluno.nome}</div>
              {confirmA.aluno.matricula && <div className="co-mat">Mat. {confirmA.aluno.matricula}</div>}
              <div className="co-status">{confirmA.statusText}</div>
            </div>
          </div>}
        </div>
        <div className={'flash ' + flash.cls}>{flash.msg}</div>
      </div>}

      <div className="count-strip" style={{ marginTop: 14 }}>
        <div className="c ok"><div className="n">{counts.p}</div><div className="l">Presentes</div></div>
        <div className="c miss"><div className="n">{counts.f}</div><div className="l">Faltantes</div></div>
        <div className="c"><div className="n">{counts.tot}</div><div className="l">Turma</div></div>
      </div>

      <label className="fld" style={{ marginTop: 14 }}>Marcação manual (toque para alternar)</label>
      <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar aluno…" />
      <ul className="people">
        {busy ? <li className="empty">Abrindo chamada…</li> :
          rows.map(a => { const isP = !!present[a.id]; return (
            <li key={a.id} onClick={() => toggle(a.id)} style={{ cursor: 'pointer' }}>
              <span className="left"><Avatar a={a} /><span className="who"><span>{a.nome}</span>{a.matricula && <span className="m">Mat. {a.matricula}</span>}</span></span>
              <span className={'tag ' + (isP ? 'P' : 'F')}>{isP ? 'Presente' : 'Falta'}</span>
            </li>) })}
      </ul>
      <div className="btnrow"><button className="btn" onClick={() => { stopCam(); goConferir() }}>Encerrar e conferir faltantes ▸</button></div>
      <canvas ref={canvasRef} hidden />
    </div>
  )
}

/* ---------- CONFERIR ---------- */
function Conferir({ userId, turmas, online, setPending, showToast }) {
  const [tid, setTid] = useState(turmas[0]?.id || '')
  const [data, setData] = useState(todayISO())
  const [chamadaId, setChamadaId] = useState(null)
  const [present, setPresent] = useState({})
  const [busy, setBusy] = useState(false)
  const t = turmas.find(x => x.id === tid)

  const load = useCallback(async () => {
    if (!tid || !online) return
    setBusy(true)
    try { const ch = await store.ensureChamada(userId, tid, data); setChamadaId(ch.id); const p = await store.getPresentes(ch.id); const m = {}; p.forEach(id => m[id] = true); setPresent(m) }
    catch (e) { showToast('Erro ao carregar') } finally { setBusy(false) }
  }, [tid, data, online, userId, showToast])
  useEffect(() => { load() }, [load])

  const faltantes = t ? t.alunos.filter(a => !present[a.id]) : []
  async function marcar(alunoId) {
    setPresent(p => ({ ...p, [alunoId]: true }))
    if (chamadaId && online) { try { await store.marcarPresente(userId, chamadaId, alunoId) } catch (e) { store.queueOp({ type: 'present', chamadaId, alunoId }); setPending(store.outboxCount()) } }
    else if (chamadaId) { store.queueOp({ type: 'present', chamadaId, alunoId }); setPending(store.outboxCount()) }
  }
  async function salvar() {
    if (chamadaId && online) { try { await store.confirmarChamada(chamadaId); showToast('Chamada salva') } catch (e) { showToast('Erro ao salvar') } }
    else if (chamadaId) { store.queueOp({ type: 'confirm', chamadaId }); setPending(store.outboxCount()); showToast('Salvo offline — sincroniza depois') }
  }

  return (
    <div className="panel">
      <h2>Conferir faltantes</h2>
      <p className="hint">Estes não leram o QR. Chame os nomes; se algum estava presente, toque em “estava presente”.</p>
      <div className="row">
        <div><label className="fld">Turma</label><select value={tid} onChange={e => setTid(e.target.value)}>{turmas.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></div>
        <div><label className="fld">Data</label><input type="date" value={data} onChange={e => setData(e.target.value)} /></div>
      </div>
      {!online && <p className="note" style={{ color: 'var(--miss)' }}>Offline — a conferência precisa de internet para carregar a chamada.</p>}
      <div className="count-strip" style={{ marginTop: 12 }}>
        <div className="c miss"><div className="n">{faltantes.length}</div><div className="l">Faltantes</div></div>
        <div className="c ok"><div className="n">{t ? t.alunos.length - faltantes.length : 0}</div><div className="l">Presentes</div></div>
      </div>
      <ul className="people">
        {busy ? <li className="empty">Carregando…</li> :
          faltantes.length ? faltantes.map(a =>
            <li key={a.id}><span className="left"><Avatar a={a} /><span className="who"><span>{a.nome}</span>{a.matricula && <span className="m">Mat. {a.matricula}</span>}</span></span>
              <button className="btn ghost mini" onClick={() => marcar(a.id)}>estava presente ✓</button></li>) :
            <li className="empty">Todos presentes 🎉</li>}
      </ul>
      <div className="btnrow"><button className="btn" onClick={salvar}>Salvar chamada do dia</button></div>
    </div>
  )
}

/* ---------- RESUMO ---------- */
function Resumo({ turmas, showToast }) {
  const [tid, setTid] = useState(turmas[0]?.id || '')
  const [dados, setDados] = useState(null)
  const [busy, setBusy] = useState(false)
  const t = turmas.find(x => x.id === tid)

  useEffect(() => {
    let alive = true
    if (!tid || !navigator.onLine) { setDados(null); return }
    setBusy(true)
    store.resumoTurma(tid).then(d => { if (alive) setDados(d) }).catch(() => showToast('Erro ao carregar resumo')).finally(() => alive && setBusy(false))
    return () => { alive = false }
  }, [tid, showToast])

  const presSet = {}; if (dados) dados.presencas.forEach(p => { presSet[p.chamada_id + '|' + p.aluno_id] = true })
  const dates = dados ? dados.chamadas : []

  function exportCSV() {
    if (!t || !dados) return
    const sep = ';'
    const head = ['Matricula', 'Nome', ...dates.map(c => fmtDate(c.data)), 'Faltas']
    const lines = [head.join(sep)]
    t.alunos.forEach(a => { let f = 0; const cols = dates.map(c => { const pr = presSet[c.id + '|' + a.id]; if (!pr) f++; return pr ? 'P' : 'F' }); lines.push([a.matricula || '', '"' + a.nome.replace(/"/g, '""') + '"', ...cols, String(f)].join(sep)) })
    const csv = '﻿' + lines.join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'frequencia_' + t.nome.replace(/[^\w\-]+/g, '_') + '.csv'
    document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 1500)
  }

  return (
    <div className="panel">
      <h2>Resumo & exportar</h2>
      <label className="fld">Turma</label>
      <select value={tid} onChange={e => setTid(e.target.value)}>{turmas.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
      <div className="btnrow"><button className="btn" onClick={exportCSV} disabled={!dados || !dates.length}>Exportar CSV (Excel)</button></div>
      <p className="note">P = presente · F = falta. A coluna “Faltas” conta os dias F.</p>
      {!navigator.onLine ? <p className="note" style={{ color: 'var(--miss)' }}>Offline — o resumo precisa de internet.</p> :
        busy ? <div className="spin">Carregando…</div> :
          !dates.length ? <p className="empty">Sem chamadas registradas para esta turma.</p> :
            <div className="scrollx"><table className="matrix"><thead><tr><th className="nm">Aluno</th>{dates.map(c => <th key={c.id}>{fmtDate(c.data)}</th>)}<th>Faltas</th></tr></thead>
              <tbody>{t.alunos.map(a => { let f = 0; const tds = dates.map(c => { const pr = presSet[c.id + '|' + a.id]; if (!pr) f++; return <td key={c.id} className={pr ? 'P' : 'F'}>{pr ? 'P' : 'F'}</td> }); return <tr key={a.id}><td className="nm">{a.nome}</td>{tds}<td><b>{f}</b></td></tr> })}</tbody>
            </table></div>}
    </div>
  )
}
