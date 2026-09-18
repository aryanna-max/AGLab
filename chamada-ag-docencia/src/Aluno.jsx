import React, { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { PERC, paraUTM25S, distanciaUTM, metros, vezesPiorQuePerc } from './lib/geo'
import { decodeFromVideo, parsePayload } from './lib/qr'
import { gravarPerfil, irParaProfessora } from './Escolha.jsx'
import Orbe from './Orbe.jsx'
import MinhaFoto from './MinhaFoto.jsx'
import PresencaAluno from './PresencaAluno.jsx'
import MissoesAluno from './MissoesAluno.jsx'
import { useHistoricoPresenca, useMissoes, useInsignias, useAvisosAluno, fmtQuando, fmtPrazo, missaoVista, resumoFaltas } from './lib/alunoApi'
import InsigniasAluno, { Vitrine, CartaoInsignia } from './InsigniasAluno.jsx'
import { prepararSom, tocarAviso } from './lib/som'
import { EH_COMPUTADOR } from './lib/aparelho'
import { resumirOcupacao } from './lib/topo'
import { estadoAvisos, ativarAvisosAluno, sincronizarAvisosAluno, TEXTO_ESTADO } from './lib/avisos'
import Avatar from './Avatar.jsx'
import MeuAvatar from './MeuAvatar.jsx'
import { guardarSelfieDoServidor } from './lib/selfie'

const CHAMADA_S = 20          // a presença é uma ocupação: 20 s parado, média das leituras (decisão dela, 15/09)
const CHAMADA_MIN = 3
const ACC_GROSSEIRA = 150   // acima disso o celular está em localização aproximada, não em GNSS
const ehIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
const AvisoPrecisao = ({ pos }) => pos && pos.acc > ACC_GROSSEIRA ? (
  <div className="flash err" style={{ textAlign: 'left' }}>
    <b>± {Math.round(pos.acc)} m não é GPS — é localização aproximada.</b> O celular está sem a localização precisa.
    {ehIOS
      ? <> Ajustes → Privacidade e Segurança → Serviços de Localização → <b>Safari</b> (ou Orbe, se instalado) → ligue <b>Localização Precisa</b>. Depois volte aqui.</>
      : <> Configurações → Localização → permissões do <b>navegador</b> → ligue <b>Usar localização precisa</b>. Depois volte aqui.</>}
    {' '}Ao ar livre, com o céu visível, a leitura fica em ± 5 a 15 m.
  </div>) : null

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
const K_AVISOS_DISP = 'agc2_avisos_dispensado'  // quando o aluno tocou em "agora não" (o cartão volta em 3 dias)
export const NOME_GPS = 'Campo'         // área de medições (decisão dela, 15/09: cards Presença · Campo · Missões)

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

  const [tela, setTela] = useState('home')   // home | presenca | missoes | insignias | avatar | ler-aula | identificar | chamada-ok | medir
  const [ident, setIdent] = useState(() => { const i = ler(K_IDENT, null); return EH_COMPUTADOR && i && !i.teste ? null : i })
  const [presenca, setPresenca] = useState(() => { const p = ler(K_PRES, null); return p && p.data === hojeISO() ? p : null })
  const [codigoAula, setCodigoAula] = useState(codigoDaUrl)   // código lido do QR do dia (só na chamada)
  const [aula, setAula] = useState(null)                       // {turma, local, janela_aberta}
  const [modo, setModo] = useState('livre')                    // 'aula' quando chegou pela chamada
  const [pos, setPos] = useState(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [medirNaAula, setMedirNaAula] = useState(false)
  const [ocupando, setOcupando] = useState(false)
  const [ocupProg, setOcupProg] = useState(0)
  const [ocupN, setOcupN] = useState(0)
  const ocupRef = useRef({ ativa: false, lista: [], ultimoFix: null, t0: 0, timer: null })

  function comecarChamada() {
    if (!pos) { setErro('Espere a posição aparecer.'); return }
    setErro(''); ocupRef.current = { ativa: true, lista: [{ ...pos }], ultimoFix: pos.fixTs, t0: performance.now(), timer: null }
    setOcupN(1); setOcupando(true); setOcupProg(0)
    ocupRef.current.timer = setInterval(() => {
      const s = (performance.now() - ocupRef.current.t0) / 1000
      setOcupProg(Math.min(1, s / CHAMADA_S))
      if (s >= CHAMADA_S) terminarChamada()
    }, 200)
  }
  function cancelarChamada() { clearInterval(ocupRef.current.timer); ocupRef.current.ativa = false; setOcupando(false); setOcupProg(0) }
  function terminarChamada() {
    clearInterval(ocupRef.current.timer); ocupRef.current.ativa = false; setOcupando(false)
    const ls = ocupRef.current.lista
    if (ls.length < CHAMADA_MIN) { setErro(`Só ${ls.length} leitura(s) em ${CHAMADA_S} s — o GPS está lento aqui. Tente de novo, parado, com o céu mais aberto.`); return }
    const r = resumirOcupacao(ls)
    const ult = ls[ls.length - 1]
    const altAccs = ls.filter(l => l.altAcc != null).map(l => l.altAcc)
    const media = { lat: r.lat, lon: r.lon, acc: r.acc, alt: r.alt, altAcc: altAccs.length ? altAccs.reduce((a, b) => a + b, 0) / altAccs.length : null,
      utmN: r.utmN, utmE: r.utmE, distPerc: distanciaUTM(r.utmN, r.utmE, PERC.utmN, PERC.utmE), fixTs: ult.fixTs, rumo: null, velocidade: null }
    enviar('chamada', media, undefined, { ocupacao_s: CHAMADA_S, n_leituras: r.n, desvio_n_m: r.desvioN, desvio_e_m: r.desvioE, espalhamento_m: r.desvioHz,
      leituras: ls.map(l => ({ lat: l.lat, lon: l.lon, acc: l.acc, alt: l.alt, fixTs: l.fixTs })) })
  }   // na Chamada, medir é um passo explícito (confusão relatada em 15/09)
  const [enviando, setEnviando] = useState(false)
  const [aConferir, setAConferir] = useState(false)   // registrado, mas a presença fica para a professora conferir
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
  const historico = useHistoricoPresenca(ident, online)
  const missoes = useMissoes(ident, online)
  const avisosProf = useAvisosAluno(ident, online)
  const insignias = useInsignias(ident, online)
  useEffect(() => { if (tela === 'home') insignias.recarregar() }, [tela])
  useEffect(() => { prepararSom() }, [])   // destrava o som da conquista no primeiro toque
  // ao abrir: confirma no servidor nome, foto e turma de teste (a selfie pode ter sido enviada em outra versão ou aparelho)
  useEffect(() => {
    const id = identRef.current
    if (!id || !navigator.onLine) return
    supabase.rpc('validar_sessao', { p_codigo: '', p_matricula: id.matricula || '', p_aluno_id: id.alunoId || null }).then(({ data }) => {
      if (!data?.ok) return
      guardarSelfieDoServidor(id, data.selfie)   // celular novo ou app reinstalado: a cara dele volta com ele
      if (data.tem_foto !== id.temFoto || data.tem_selfie !== id.temSelfie || data.nome !== id.nome || !!data.teste !== !!id.teste
          || (data.avatar || '') !== (id.avatar || '') || (data.avatar_em || null) !== (id.avatarEm || null)) {
        const i = { ...id, nome: data.nome, turma: data.turma, turmaId: data.turma_id, temFoto: data.tem_foto, temSelfie: data.tem_selfie,
          avatar: data.avatar || '', avatarEm: data.avatar_em || null, teste: !!data.teste }
        gravar(K_IDENT, i); setIdent(i); identRef.current = i
      }
    }).catch(() => {})
  }, [ident?.alunoId])

  /* avisos da professora com o app fechado */
  const [estadoAv, setEstadoAv] = useState(null)
  const [ativandoAv, setAtivandoAv] = useState(false)
  const [erroAv, setErroAv] = useState('')
  const [avDispensado, setAvDispensado] = useState(() => Date.now() - (ler(K_AVISOS_DISP, 0) || 0) < 3 * 86400000)
  const [abrirMissaoId, setAbrirMissaoId] = useState(null)
  useEffect(() => { estadoAvisos().then(setEstadoAv); if (ident) sincronizarAvisosAluno(ident) }, [ident?.alunoId, ident?.matricula])
  async function ativarAvisos() {
    setAtivandoAv(true); setErroAv('')
    try { await ativarAvisosAluno(identRef.current); setEstadoAv('ativo'); setAviso('Avisos ativados. A professora consegue falar com você mesmo com o app fechado.'); setTimeout(() => setAviso(''), 5000) }
    catch (e) { setErroAv(e.message || 'Não consegui ativar.'); estadoAvisos().then(setEstadoAv) }
    finally { setAtivandoAv(false) }
  }

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
    setTimeout(() => historico.recarregar(), 1500)
  }

  /* ---------- identificação ---------- */
  async function identificar({ matricula, alunoId }) {
    setErro(''); setConferindo(true)
    try {
      const { data, error } = await supabase.rpc('validar_sessao', { p_codigo: '', p_matricula: matricula || '', p_aluno_id: alunoId || null })
      if (error) throw error
      if (!data?.ok) { setErro(data?.erro || 'Não encontrei você.'); return false }
      // no computador, só o login de teste (regra dela, 16/09): aluno real usa o celular
      if (EH_COMPUTADOR && !data.teste) { setErro('No computador a tela do aluno é só para teste: entre com uma matrícula da TURMA TESTE (TESTE1 a TESTE4). Alunos usam o celular.'); return false }
      const i = { alunoId: data.aluno_id, matricula: data.matricula, nome: data.nome, turma: data.turma, turmaId: data.turma_id, temFoto: data.tem_foto, temSelfie: data.tem_selfie,
        avatar: data.avatar || '', avatarEm: data.avatar_em || null, teste: !!data.teste }
      gravar(K_IDENT, i); setIdent(i); identRef.current = i; setMatInput(i.matricula || '')
      guardarSelfieDoServidor(i, data.selfie)
      return true
    } catch (e) {
      if (ehErroDeRede(e) && (matricula || alunoId) && !EH_COMPUTADOR) {
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
    if (EH_COMPUTADOR) { setErro('No computador a localização vem do Wi-Fi e não vale como medição. Presença e Campo só pelo celular.'); return }
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
        // durante a ocupação da chamada, cada fixação nova entra na média
        if (ocupRef.current.ativa && ocupRef.current.ultimoFix !== leitura.fixTs) { ocupRef.current.ultimoFix = leitura.fixTs; ocupRef.current.lista.push(leitura); setOcupN(ocupRef.current.lista.length) }
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
  async function enviar(rotulo, posArg, descricao, extraMais) {
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
        velocidade: pp.velocidade == null || Number.isNaN(pp.velocidade) ? null : pp.velocidade, ...(extraMais || {}) }
    }
    try {
      const data = await postar(item)
      if (!data?.ok) { setErro(data?.erro || 'Não consegui registrar.'); return }
      if (data.nome && !id.nome) { const i = { ...id, nome: data.nome }; gravar(K_IDENT, i); setIdent(i); identRef.current = i }
      setPlacar({ meu: data.meu_melhor, turma: data.melhor_turma, alunos: data.alunos })
      if (rotulo === 'chamada') {
        if (data.presenca) fixarPresenca(data, item.codigo, false)
        else if (data.motivo === 'fora_da_janela') fixarPresenca(data, item.codigo, true)
        else if (data.motivo === 'a_conferir') setAConferir(true)
        else if (data.motivo === 'sem_sessao') setErro('Não achei aula aberta agora para a sua turma. Confira o horário ou fale com a professora.')
      } else { setAviso('Leitura enviada — ' + (rotulo === 'outro' && descricao ? descricao : nomeLocal(rotulo))); setTimeout(() => setAviso(''), 2500) }
    } catch (e) {
      if (ehErroDeRede(e)) {
        const f = ler(K_FILA, []); f.push(item); gravar(K_FILA, f); setNaFila(f.length)
        setAviso('Sem rede: leitura guardada no celular. Sobe sozinha quando tiver conexão.'); setTimeout(() => setAviso(''), 4000)
      } else setErro('Falhou o envio: ' + (e.message || 'erro'))
    } finally { setEnviando(false) }
  }

  /* ---------- navegação ---------- */
  /* Presença na sala (regra dela, 18/09/2026: "pra eles é na sala"): com aula da turma aberta
     agora, marca sem QR — o servidor confere se a posição está perto da referência do dia e,
     se não estiver, deixa "a conferir" para a professora. O aluno não vê distância nem raio.
     O QR nunca abre sozinho (pedido dela, 18/09): é o botão "Ler QR da aula", opcional. */
  function irChamada() {
    setErro(''); setAConferir(false)
    const h = historico.dados?.hoje
    setCodigoAula(''); codigoRef.current = ''
    setAula({ turma: identRef.current?.turma || '', local: h?.local || null, janela_aberta: true })
    setModo('aula'); modoRef.current = 'aula'; autoRef.current = false
    setTela('chamada-ok'); ligarGPS()
  }
  function irArea(area) {
    setErro('')
    if (!identRef.current) { setDepoisDeIdent(area); setTela('identificar'); return }
    setTela(area)
  }
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
      if (data.nome && (data.nome !== id?.nome || !id?.turmaId || id?.temFoto !== data.tem_foto)) { const i = { ...id, nome: data.nome, turma: data.turma, turmaId: data.turma_id, temFoto: data.tem_foto }; gravar(K_IDENT, i); setIdent(i); identRef.current = i }
    } catch (e) {
      if (!ehErroDeRede(e)) { setErro('Falhou: ' + (e.message || 'erro')); setTela('home'); return }
      setAviso('Sem rede — a presença vai subir quando a conexão voltar.'); setTimeout(() => setAviso(''), 4000)
    } finally { setConferindo(false) }
    setModo('aula'); modoRef.current = 'aula'; autoRef.current = false
    setTela('chamada-ok'); ligarGPS()
  }
  async function identificarEContinuar(dados) {
    const ok = await identificar(dados)
    if (!ok) return
    const destino = depoisDeIdent; setDepoisDeIdent(null)
    if (destino === 'chamada') await entrarNaAula(codigoRef.current)
    else if (destino === 'presenca' || destino === 'missoes' || destino === 'insignias') setTela(destino)
    else { setModo('livre'); modoRef.current = 'livre'; setTela('medir'); ligarGPS() }
  }
  function voltarHome() { if (ocupRef.current.ativa) cancelarChamada(); pararGPS(); setPos(null); setPlacar(null); setErro(''); setAviso(''); setMedirNaAula(false); setAbrirMissaoId(null); setTela('home') }

  // tocou num aviso da professora: abre na tela que ela escolheu (home | presenca | campo | missoes | missao:<id>)
  function abrirPorAviso(abrir) {
    if (!abrir || abrir === 'home') { voltarHome(); return }
    if (abrir === 'campo') { irMedir(); return }
    if (abrir.startsWith('missao:')) { setAbrirMissaoId(abrir.slice(7)); irArea('missoes'); return }
    if (abrir === 'presenca' || abrir === 'missoes') irArea(abrir)
  }
  useEffect(() => {
    const a = params.get('abrir')
    if (a) { history.replaceState(null, '', location.pathname); abrirPorAviso(a) }
    if (!('serviceWorker' in navigator)) return
    const f = e => {
      if (e.data?.tipo === 'orbe-abrir') { missoes.recarregar(); avisosProf.recarregar(); abrirPorAviso(e.data.abrir) }
      // aviso chegou com o app aberto: o sistema não toca nada, então o Radar sai daqui
      if (e.data?.tipo === 'orbe-aviso') { avisosProf.recarregar(); tocarAviso() }
    }
    navigator.serviceWorker.addEventListener('message', f)
    return () => navigator.serviceWorker.removeEventListener('message', f)
  }, [])

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
      {ident && <Avatar nome={ident.nome} avatar={ident.avatar} tam="mini" />}
    </header>
  )

  const CardPresenca = () => presenca && (
    <div className={'presenca-fixa' + (presenca.fora ? ' fora' : '')}>
      <div className="pf-tit">{presenca.fora ? '⏱ Presença fora do horário' : '✓ Presença de hoje registrada'}</div>
      <div className="pf-sub">{presenca.hora} · {nomeLocal(presenca.local)}{presenca.turma ? ' · ' + presenca.turma : ''}</div>
      {presenca.fora && <div className="pf-sub">A professora decide. Sua leitura ficou guardada.</div>}
    </div>
  )

  if (tela === 'presenca') return (
    <div className="wrap"><Cabecalho titulo="Presença" />
      <PresencaAluno historico={historico} presencaHoje={presenca} online={online} onMarcar={irChamada} onLerQR={() => { setErro(''); setTela('ler-aula') }}
        foto={ident && <MinhaFoto ident={ident} online={online} pedir={ident.temFoto === false} jaEnviada={ident.temSelfie}
          onTrocarAvatar={() => irArea('avatar')}
          onEnviada={() => { insignias.recarregar(); const i = { ...ident, temFoto: true, temSelfie: true }; gravar(K_IDENT, i); setIdent(i) }} />} />
    </div>
  )

  if (tela === 'avatar') return (
    <div className="wrap"><Cabecalho titulo="Meu avatar" />
      <MeuAvatar ident={ident} online={online} onVoltar={voltarHome}
        onEscolhido={(av, em) => { const i = { ...identRef.current, avatar: av, avatarEm: em }; gravar(K_IDENT, i); setIdent(i); identRef.current = i }} />
    </div>
  )

  if (tela === 'missoes') return (
    <div className="wrap"><Cabecalho titulo="Missões" />
      <MissoesAluno ident={ident} online={online} missoes={missoes} abrirId={abrirMissaoId} />
    </div>
  )

  if (tela === 'insignias') return (
    <div className="wrap"><Cabecalho titulo="Insígnias" />
      <InsigniasAluno insignias={insignias} nome={ident?.nome} avatar={ident?.avatar} />
    </div>
  )

  if (tela === 'ler-aula') return (
    <div className="wrap"><Cabecalho titulo="Presença" />
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
            <p className="hint">{EH_COMPUTADOR ? 'Modo de teste no computador: use TESTE1, TESTE2, TESTE3 ou TESTE4.' : 'Fica guardado neste celular. Sem senha.'}</p>
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

  // resumo para os cards da home
  const hojeJan = historico.dados?.hoje
  const rf = resumoFaltas(historico.dados)
  const subPresenca = presenca && !presenca.fora ? `Registrada hoje às ${presenca.hora}.`
    : hojeJan ? (hojeJan.aberta_agora ? `Aula aberta até ${hojeJan.fim}. Marque agora.` : `Janela de hoje: ${hojeJan.inicio}–${hojeJan.fim}.`)
    : rf ? `${rf.presencas} presença(s) · ${rf.faltasHa} h-a de falta.` : 'Marcar presença e acompanhar faltas.'
  const faltaFoto = ident && ident.temFoto === false
  const listaM = missoes.dados?.missoes || []
  const listaAv = avisosProf.dados?.avisos || []
  const abertasM = listaM.filter(m => m.aberta)
  const nAbertas = abertasM.length
  const proxima = abertasM.slice().sort((a, b) => new Date(a.prazo_em) - new Date(b.prazo_em))[0]
  const subMissoes = proxima ? `${nAbertas} aberta(s) · ${fmtPrazo(proxima.prazo_em).texto}` : 'O que a professora lançou para a turma.'
  // alerta ao abrir o app: missão nova ainda não vista, ou prazo vencendo em breve
  const novaM = abertasM.find(m => !missaoVista(m.lancamento_id))
  const urgM = abertasM.find(m => fmtPrazo(m.prazo_em).urgente && (m.minha?.status !== 'enviada' && m.minha?.status !== 'aceita'))
  const minhasIns = insignias.dados?.insignias || []
  const novaIns = minhasIns.find(i => i.nova)
  const alerta = novaM ? { titulo: `Nova missão: ${novaM.titulo}`, sub: fmtPrazo(novaM.prazo_em).texto, urgente: false }
    : urgM ? { titulo: `Prazo acabando: ${urgM.titulo}`, sub: fmtPrazo(urgM.prazo_em).texto, urgente: true } : null

  if (tela === 'home') return (
    <div className="wrap">
      <header className="app"><img className="orbe-mini" src="/orbe-mascote.png" alt="" /><h1>Orbe</h1><span className="sub">Topografia · IFPE · aluno</span><span className="spacer" />
        {naFila > 0 && <span className="badge off">{naFila} na fila</span>}{!online && <span className="badge off">sem rede</span>}
        {ident && <button className="eu-avatar" onClick={() => irArea('avatar')} title="Meu avatar" aria-label="Meu avatar">
          <Avatar nome={ident.nome} avatar={ident.avatar} tam="mini" /></button>}</header>
      {EH_COMPUTADOR && <div className="flash dup" style={{ textAlign: 'left' }}>
        <b>Modo de teste: tela do aluno no computador.</b> Missões, presença, insígnias e avisos funcionam para conferir.
        Medir posição não: no computador a localização vem do Wi-Fi e não vale como dado — use o celular para Presença e Campo.{' '}
        <span style={{ cursor: 'pointer', textDecoration: 'underline', fontWeight: 700 }} onClick={irParaProfessora}>Voltar para a professora</span>
      </div>}
      <img className="home-turma" src="/orbe-turma.png" width="1120" height="606" alt="A turma do Orbe: Orbe, Vértice, Navi, Lumi e Téo" />
      <CardPresenca />
      {listaAv.length > 0 && <div className="panel avisos-home">
        <h2>🔔 Avisos da professora</h2>
        {listaAv.map(v => <button key={v.id} className={'av-item' + (v.abrir && v.abrir !== 'home' ? ' clica' : '')} onClick={() => abrirPorAviso(v.abrir)}>
          <span className="av-tit"><b>{v.titulo}</b><span className="av-em">{fmtQuando(v.em)}</span></span>
          {v.texto && <span className="av-txt">{v.texto}</span>}
        </button>)}
      </div>}
      {/* sempre à vista, mesmo com zero: as bloqueadas mostram o caminho (princípio do guia) */}
      <Vitrine minhas={minhasIns} onAbrir={() => irArea('insignias')} />
      {novaIns && <CartaoInsignia chave={novaIns.chave} dado={novaIns.dado} onFechar={() => { insignias.marcarVistas(); irArea('insignias') }} />}
      {alerta && <button className={'alerta-missao' + (alerta.urgente ? ' urgente' : '')} onClick={() => irArea('missoes')}>
        <span className="am-ico">{alerta.urgente ? '⏱' : '✨'}</span>
        <span className="am-txt"><b>{alerta.titulo}</b><span>{alerta.sub}</span></span>
      </button>}
      {ident && !ident.avatar && <button className="alerta-missao" onClick={() => irArea('avatar')}>
        <span className="am-ico">🙂</span>
        <span className="am-txt"><b>Escolha o seu avatar</b><span>É a sua cara no app e para a turma. A sua foto continua só com a professora.</span></span>
      </button>}
      <div className="escolha tres">
        <button className="card-perfil" onClick={() => irArea('presenca')}>
          <span className="cp-emoji">📍</span><span className="cp-tit">Presença</span>
          <span className="cp-sub">{subPresenca}{faltaFoto && <><br />📷 Falta a sua foto.</>}</span>
        </button>
        <button className="card-perfil" onClick={irMedir}>
          <span className="cp-emoji">🛰️</span><span className="cp-tit">{NOME_GPS}</span>
          <span className="cp-sub">Ir até, pins e poligonais, a qualquer hora.</span>
        </button>
        <button className="card-perfil" onClick={() => irArea('missoes')}>
          <span className="cp-emoji">🎯</span><span className="cp-tit">Missões{nAbertas > 0 && <span className="cp-badge">{nAbertas}</span>}</span>
          <span className="cp-sub">{subMissoes}</span>
        </button>
      </div>
      {erro && <div className="flash err">{erro}</div>}
      {aviso && <div className="flash dup">{aviso}</div>}
      {ident && !EH_COMPUTADOR && estadoAv && estadoAv !== 'ativo' && estadoAv !== 'sem-suporte' && !avDispensado && <div className="panel aviso-push">
        <b>🔔 Ativar avisos da professora</b>
        <p className="note" style={{ margin: '4px 0 0' }}>Missão nova e recados da aula chegam no celular, mesmo com o app fechado.</p>
        {estadoAv !== 'inativo' && <p className="note" style={{ margin: '6px 0 0' }}>{TEXTO_ESTADO[estadoAv]}</p>}
        <div className="btnrow">
          {estadoAv === 'inativo' && <button className="btn" onClick={ativarAvisos} disabled={ativandoAv || !online}>{ativandoAv ? 'Ativando…' : 'Ativar avisos'}</button>}
          <button className="btn ghost" onClick={() => { gravar(K_AVISOS_DISP, Date.now()); setAvDispensado(true) }}>Agora não</button>
        </div>
        {erroAv && <div className="flash err" style={{ textAlign: 'left' }}>{erroAv}</div>}
      </div>}

      <p className="note" style={{ textAlign: 'center' }}>
        {ident ? <>Você: <b>{ident.nome || ident.matricula}</b> · <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={trocarIdent}>trocar</span></>
          : 'Na primeira vez, o app pede a sua matrícula ou o QR do seu cartão.'}
      </p>
      <div className="panel">
        <h2>Vira app no seu celular</h2>
        <p className="note" style={{ marginTop: 4 }}><b>iPhone:</b> Compartilhar → <b>Adicionar à Tela de Início</b>. <b>Android:</b> menu ⋮ → <b>Instalar app</b>.</p>
      </div>
      <p className="note" style={{ textAlign: 'center', cursor: 'pointer' }} onClick={irParaProfessora}>Sou professor(a)</p>
    </div>
  )

  /* medir (livre) e chamada-ok (aula) compartilham a tela de medição */
  const emAula = tela === 'chamada-ok'
  return (
    <div className="wrap">
      <Cabecalho titulo={emAula ? 'Presença' : NOME_GPS} />
      <CardPresenca />
      {!emAula && !presenca && <p className="note">Medição livre — não registra presença. Para marcar presença, use o card Presença na tela inicial.</p>}

      {emAula && !medirNaAula && <div className="panel" style={{ textAlign: 'center' }}>
        {presenca
          ? <><h2 style={{ marginTop: 0 }}>Pronto. Presença enviada.</h2>
              <p className="hint">Pode guardar o celular. Se a professora pedir para medir, toque abaixo.</p></>
          : aConferir && !ocupando
          ? <><h2 style={{ marginTop: 0 }}>Registrado.</h2>
              <p className="hint">A professora vai conferir a sua presença. Se o GPS estava ruim, dá para tentar de novo, parado.</p>
              <div className="btnrow" style={{ justifyContent: 'center' }}>
                <button className="btn" onClick={() => { setAConferir(false); comecarChamada() }} disabled={!pos || enviando}>Tentar de novo</button>
                <button className="btn ghost" onClick={voltarHome}>Voltar</button>
              </div></>
          : ocupando
          ? <div className="ocup">
              {(() => { const R = 44, C = 2 * Math.PI * R; return <svg viewBox="0 0 100 100" className="ocup-anel">
                <circle cx="50" cy="50" r={R} fill="none" stroke="var(--line)" strokeWidth="8" />
                <circle cx="50" cy="50" r={R} fill="none" stroke="var(--ok)" strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - ocupProg)} transform="rotate(-90 50 50)" />
                <text x="50" y="46" textAnchor="middle" className="ocup-n">{ocupN}</text>
                <text x="50" y="62" textAnchor="middle" className="ocup-l">leituras</text>
              </svg> })()}
              <div className="ocup-txt"><b>Fique parado.</b> {Math.ceil(CHAMADA_S * (1 - ocupProg))} s</div>
              <button className="btn ghost mini" onClick={cancelarChamada}>Cancelar</button>
            </div>
          : <><h2 style={{ marginTop: 0 }}>Registrar presença</h2>
              <p className="hint">A presença é uma <b>ocupação</b>: {CHAMADA_S} segundos parado, o app junta as leituras e registra a <b>média</b>. Um toque só ensina a errar.</p>
              <ol className="orienta">
                <li>Fique <b>onde a professora indicou</b>{aula?.local ? <> — hoje: <b>{nomeLocal(aula.local)}</b></> : null}.</li>
                <li>Celular <b>na mão, tela para cima</b>, afastado do corpo. Não no bolso.</li>
                <li>Espere a posição aparecer{pos ? <> — apareceu: <b>± {metros(pos.acc, 0)} m</b></> : <> — <i>procurando satélites…</i></>}.</li>
                <li>Toque em registrar e <b>não ande</b> durante os {CHAMADA_S} s.</li>
              </ol>
              <AvisoPrecisao pos={pos} />
              {erro && <div className="flash err" style={{ textAlign: 'left' }}>{erro}</div>}
              <div className="btnrow" style={{ justifyContent: 'center' }}>
                <button className="btn" onClick={comecarChamada} disabled={!pos || enviando}>{enviando ? 'Registrando…' : `📍 Registrar presença · ${CHAMADA_S} s`}</button>
                <button className="btn ghost" onClick={voltarHome}>Voltar</button>
              </div></>}
        {presenca && <div className="btnrow" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={() => setMedirNaAula(true)} disabled={!pos}>🛰️ Medir a posição agora</button>
          <button className="btn ghost" onClick={voltarHome}>Voltar</button>
        </div>}
      </div>}

      {(!emAula || medirNaAula) && <div className="panel">
        {!pos && !erro && <div className="spin">Procurando satélites…</div>}
        {erro && <div className="flash err" style={{ textAlign: 'left' }}>{erro}</div>}
        {pos && <>
          <AvisoPrecisao pos={pos} />
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
      </div>}

      {(!emAula || medirNaAula) && pos && ident && <Orbe pos={pos} ident={ident} codigo={modo === 'aula' ? codigoAula : ''}
        onAviso={m => { setAviso(m); setTimeout(() => setAviso(''), 4000) }} />}
    </div>
  )
}
