import React, { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { qrDataUrl } from './lib/qr'

/* Caderneta do dia para quem está substituindo a professora.
   Entra com a própria matrícula (ela já está no cadastro da turma) + o PIN que a
   professora liberou naquele dia. O PIN morre à meia-noite de Recife, então isto
   é a chave da sala emprestada, não uma cópia do molho: só a turma liberada, só
   o dia de hoje, e nada de fotos, notas, missões ou outras turmas.

   Tudo passa por painel_auxiliar / auxiliar_marcar (RPCs no banco). Esta tela
   não fala com nenhuma tabela direto — não teria permissão. */

const K_AUX = 'agc2_auxiliar'
const ler = () => { try { return JSON.parse(localStorage.getItem(K_AUX) || 'null') } catch (e) { return null } }
const gravar = v => { try { v ? localStorage.setItem(K_AUX, JSON.stringify(v)) : localStorage.removeItem(K_AUX) } catch (e) {} }

const hhmm = s => s ? new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''

export default function Auxiliar() {
  const [cred, setCred] = useState(ler)
  const [painel, setPainel] = useState(null)
  const [erro, setErro] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [salvando, setSalvando] = useState(null)   // aluno_id em gravação
  const [toast, setToast] = useState('')
  const [pos, setPos] = useState(null)             // a posição dela, referência do dia
  const [gps, setGps] = useState('off')            // off | on | negada | indisponivel
  const watchRef = useRef(null)
  const posRef = useRef(null); useEffect(() => { posRef.current = pos }, [pos])
  const credRef = useRef(cred); useEffect(() => { credRef.current = cred }, [cred])

  const aviso = t => { setToast(t); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  const carregar = useCallback(async (silencioso) => {
    const c = credRef.current
    if (!c || !navigator.onLine) return
    try {
      const { data, error } = await supabase.rpc('painel_auxiliar', { p_matricula: c.matricula, p_pin: c.pin })
      if (error) throw error
      if (!data?.ok) {
        // o acesso pode ter sido revogado ou ter virado o dia enquanto a tela estava aberta
        setErro(data?.erro || 'Acesso encerrado.'); setPainel(null); gravar(null); setCred(null); return
      }
      setPainel(data); setErro('')
    } catch (e) { if (!silencioso) setErro('Sem resposta do servidor. Tente de novo.') }
  }, [])

  // enquanto a caderneta está aberta, ela se atualiza sozinha — quem registrar pelo QR aparece aqui
  useEffect(() => {
    if (!cred) { setPainel(null); return }
    carregar()
    const it = setInterval(() => carregar(true), 5000)
    return () => clearInterval(it)
  }, [cred, carregar])

  /* A professora está longe: quem está em campo é que vira o centro do radar dela.
     Mesmo batimento que o aluno manda, com modo 'referencia' para o radar saber
     que esta é a posição de apoio do dia. */
  useEffect(() => {
    if (!cred) return
    if (!navigator.geolocation) { setGps('indisponivel'); return }
    watchRef.current = navigator.geolocation.watchPosition(
      p => { setPos({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }); setGps('on') },
      () => setGps('negada'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 })
    return () => { if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null } }
  }, [cred])

  useEffect(() => {
    if (!cred) return
    const bate = () => {
      const pp = posRef.current, c = credRef.current
      if (!pp || !c || !navigator.onLine) return
      supabase.rpc('ping_posicao', { p_matricula: c.matricula, p_aluno_id: null,
        p_lat: pp.lat, p_lon: pp.lon, p_acuracia: pp.acc, p_modo: 'referencia' }).catch(() => {})
    }
    const primeiro = setTimeout(bate, 2000)
    const it = setInterval(bate, 20000)
    return () => { clearTimeout(primeiro); clearInterval(it) }
  }, [cred])

  async function entrar(e) {
    e.preventDefault()
    const f = new FormData(e.target)
    const matricula = String(f.get('matricula') || '').trim()
    const pin = String(f.get('pin') || '').replace(/\D/g, '')
    if (!matricula || pin.length !== 6) { setErro('Digite a matrícula e o PIN de 6 dígitos.'); return }
    setEntrando(true); setErro('')
    try {
      const { data, error } = await supabase.rpc('painel_auxiliar', { p_matricula: matricula, p_pin: pin })
      if (error) throw error
      if (!data?.ok) { setErro(data?.erro || 'Não consegui liberar o acesso.'); return }
      const c = { matricula, pin }
      gravar(c); setCred(c); setPainel(data)
    } catch (er) {
      setErro('Falhou a conferência: ' + (er.message || 'sem rede'))
    } finally { setEntrando(false) }
  }

  function sair() { gravar(null); setCred(null); setPainel(null); setErro('') }

  async function alternar(aluno) {
    if (!online) { aviso('Sem rede — a marcação precisa de conexão.'); return }
    const c = credRef.current
    setSalvando(aluno.id)
    try {
      const { data, error } = await supabase.rpc('auxiliar_marcar', {
        p_matricula: c.matricula, p_pin: c.pin, p_aluno_id: aluno.id, p_presente: !aluno.presente
      })
      if (error) throw error
      if (!data?.ok) { aviso(data?.erro || 'Não deu para mudar.'); }
      await carregar(true)
    } catch (e) { aviso('Erro ao salvar. Tente de novo.') }
    finally { setSalvando(null) }
  }

  /* ---------- entrada ---------- */
  if (!cred) return (
    <div className="wrap">
      <div className="marca">
        <img className="marca-img" src="/orbe-mascote.png" alt="" width="360" height="290" />
        <h1 className="marca-nome">Caderneta do dia</h1>
        <p className="marca-sub">Orbe · Topografia · IFPE</p>
      </div>
      <div className="panel" style={{ maxWidth: 420, margin: '0 auto' }}>
        <p className="hint">Para quem está dando a aula no lugar da professora titular. Ela libera o acesso do dia e te manda o PIN.</p>
        <form onSubmit={entrar}>
          <label className="fld">Sua matrícula</label>
          <input name="matricula" inputMode="numeric" autoCorrect="off" autoCapitalize="off" placeholder="a mesma do cadastro" />
          <label className="fld" style={{ marginTop: 10 }}>PIN de hoje</label>
          <input name="pin" inputMode="numeric" maxLength={6} placeholder="6 dígitos" />
          {erro && <p className="note" style={{ color: 'var(--miss)' }}>{erro}</p>}
          <div className="btnrow"><button className="btn" type="submit" disabled={entrando}>{entrando ? 'Conferindo…' : 'Abrir a caderneta'}</button></div>
        </form>
        <p className="note">O PIN vale só para a aula de hoje e para uma turma. À meia-noite ele deixa de funcionar sozinho.</p>
      </div>
    </div>
  )

  /* ---------- caderneta ---------- */
  const alunos = painel?.alunos || []
  const presentes = alunos.filter(a => a.presente).length
  const sessao = painel?.sessao
  const link = sessao ? `${location.origin}/?aula=${encodeURIComponent(sessao.codigo)}` : ''
  const qr = sessao ? qrDataUrl(link, 190) : null

  return (
    <div className="wrap">
      <header className="app">
        <img className="orbe-mini" src="/orbe-mascote.png" alt="" />
        <h1>Caderneta do dia</h1>
        <span className="sub">{painel?.turma || ''}</span>
        <span className="spacer" />
        <span className={'badge ' + (online ? 'on' : 'off')}>{online ? 'Online' : 'Offline'}</span>
        <button className="btn ghost mini" onClick={sair}>Sair</button>
      </header>

      {painel && <div className="lgpd">
        <b>{painel.nome}</b>, você está com a caderneta de <b>{new Date(painel.data + 'T12:00:00').toLocaleDateString('pt-BR')}</b>.
        O acesso se encerra sozinho à meia-noite. Só esta turma, só hoje — o resto do app continua com a professora.
      </div>}

      {!painel && <div className="spin">Abrindo a caderneta…</div>}

      {painel && <div className="panel">
        <h2>QR da aula</h2>
        {sessao ? <>
          <p className="hint">Projete ou mostre esta tela: é lendo o QR que o aluno registra a presença.</p>
          <div className="codigo-box">
            <div className="cb-lab">Código da aula{sessao.local ? ' · local: ' + sessao.local : ''}
              {sessao.janela_inicio && <> · janela {hhmm(sessao.janela_inicio)}–{hhmm(sessao.janela_fim)}</>}</div>
            <div className="cb-cod">{sessao.codigo}</div>
            {qr && <img className="cb-qr" src={qr} alt={'QR da aula, código ' + sessao.codigo} />}
            <div className="cb-link">{link}</div>
          </div>
        </> : <p className="note" style={{ color: 'var(--miss)' }}>
          A professora ainda não abriu a aula de hoje — sem isso não há QR nem presença automática. Avise que falta abrir a sessão.
        </p>}
      </div>}

      {painel && <div className="panel">
        <h2>Sua posição é a referência de hoje</h2>
        <p className="hint">A professora está longe, então o radar dela gira em torno de <b>onde você está</b>. Deixe esta tela aberta durante a aula.</p>
        {gps === 'on' && pos && <p className="note">
          Transmitindo · precisão de <b>{pos.acc != null ? Math.round(pos.acc) + ' m' : '—'}</b>.
          {pos.acc != null && pos.acc > 30 ? ' Sinal fraco: se puder, saia de baixo da laje.' : ''}
        </p>}
        {gps === 'off' && <p className="note">Ligando o GPS…</p>}
        {gps === 'negada' && <p className="note" style={{ color: 'var(--miss)' }}>
          A localização está bloqueada neste aparelho. Libere para o navegador e recarregue — sem isso o radar da professora fica sem centro.
        </p>}
        {gps === 'indisponivel' && <p className="note" style={{ color: 'var(--miss)' }}>Este aparelho não tem localização. O radar da professora vai cair para o Bloco F.</p>}
      </div>}

      {painel && <div className="panel">
        <h2>Presença</h2>
        <div className="count-strip">
          <div className="c ok"><div className="n">{presentes}</div><div className="l">presentes</div></div>
          <div className="c miss"><div className="n">{alunos.length - presentes}</div><div className="l">faltam</div></div>
        </div>
        <p className="hint">Quem lê o QR entra sozinho nesta lista. Marque na mão só quem está sem celular.</p>
        <ul className="people">
          {alunos.map(a => <li key={a.id}>
            <div className="left">
              <span className="avatar">{(a.nome || '?').trim().charAt(0).toUpperCase()}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.nome}</div>
                <div className="note" style={{ margin: 0 }}>
                  {a.presente ? (a.origem === 'auxiliar' ? 'marcado por você' : 'registrou pelo app') : (a.matricula || 'sem matrícula')}
                </div>
              </div>
            </div>
            <button
              className={'btn mini' + (a.presente ? '' : ' ghost')}
              disabled={salvando === a.id || !online}
              onClick={() => alternar(a)}>
              {salvando === a.id ? '…' : a.presente ? '✓ presente' : 'marcar'}
            </button>
          </li>)}
        </ul>
        <p className="note">Você só desfaz o que você mesma marcou. Presença que veio do QR do aluno fica para a professora resolver.</p>
      </div>}

      {erro && <p className="note" style={{ color: 'var(--miss)', textAlign: 'center' }}>{erro}</p>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
