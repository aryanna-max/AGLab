import { supabase } from '../supabaseClient'
import { SEED } from '../seed'

const CACHE_TURMAS = 'agc2_turmas_cache'
const OUTBOX = 'agc2_outbox'
const URLCACHE = 'agc2_foto_urls'

/* Fotos ficam no Storage (bucket privado), não na linha da tabela.
   Caminho: <owner_id>/<aluno_id>.jpg — casa com a policy do bucket. */
const BUCKET = 'fotos'
const SIGNED_TTL = 60 * 60 * 24 * 30   // URL assinada vale 30 dias
const SIGNED_RENEW = 60 * 60 * 24 * 3  // renova quando faltarem menos de 3 dias

/* ---------- cache local (para offline) ---------- */
export function getCachedTurmas() {
  try { return JSON.parse(localStorage.getItem(CACHE_TURMAS) || '[]') } catch (e) { return [] }
}
function setCachedTurmas(t) {
  try { localStorage.setItem(CACHE_TURMAS, JSON.stringify(t)) } catch (e) {}
}

/* ---------- outbox (presenças feitas offline) ---------- */
function getOutbox() { try { return JSON.parse(localStorage.getItem(OUTBOX) || '[]') } catch (e) { return [] } }
function setOutbox(o) { try { localStorage.setItem(OUTBOX, JSON.stringify(o)) } catch (e) {} }
export function outboxCount() { return getOutbox().length }

/* ---------- helpers de foto ---------- */
async function currentUserId() {
  const { data } = await supabase.auth.getSession()
  return data && data.session ? data.session.user.id : null
}

function dataUrlToBlob(dataUrl) {
  const partes = String(dataUrl).split(',')
  const mime = (partes[0].match(/data:([^;]+)/) || [])[1] || 'image/jpeg'
  const bin = atob(partes[1])
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

/* As URLs assinadas são guardadas e reaproveitadas. Isso importa para o
   offline: se a URL mudasse a cada carga, o service worker nunca acertaria
   o cache e a foto sumiria sem rede. */
function getUrlCache() { try { return JSON.parse(localStorage.getItem(URLCACHE) || '{}') } catch (e) { return {} } }
function setUrlCache(c) { try { localStorage.setItem(URLCACHE, JSON.stringify(c)) } catch (e) {} }

function esquecerUrl(path) {
  const c = getUrlCache()
  delete c[path]
  setUrlCache(c)
}

/* Preenche aluno.foto com a URL assinada. Alunos que ainda tenham o campo
   antigo (data URL na tabela) continuam aparecendo, sem migração. */
async function resolverFotos(alunos) {
  const cache = getUrlCache()
  const agora = Math.floor(Date.now() / 1000)
  const pendentes = []

  for (const a of alunos) {
    if (!a.foto_path) continue
    const c = cache[a.foto_path]
    if (c && c.exp - agora > SIGNED_RENEW) a.foto = c.url
    else pendentes.push(a.foto_path)
  }

  if (!pendentes.length) return alunos

  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(pendentes, SIGNED_TTL)
    if (error || !data) return alunos
    for (const item of data) {
      if (!item || item.error || !item.signedUrl) continue
      cache[item.path] = { url: item.signedUrl, exp: agora + SIGNED_TTL }
    }
    setUrlCache(cache)
    for (const a of alunos) {
      if (a.foto_path && cache[a.foto_path]) a.foto = cache[a.foto_path].url
    }
  } catch (e) { /* sem rede: fica com o que já houver em cache */ }

  return alunos
}

/* ---------- carregar turmas + alunos ---------- */
export async function loadTurmas() {
  const { data: turmas, error } = await supabase
    .from('turmas').select('id,nome,codigo').order('nome')
  if (error) throw error
  const { data: alunos, error: e2 } = await supabase
    .from('alunos').select('id,turma_id,matricula,nome,foto,foto_path').order('nome')
  if (e2) throw e2

  await resolverFotos(alunos)

  const byT = {}
  turmas.forEach(t => { byT[t.id] = { ...t, alunos: [] } })
  alunos.forEach(a => { if (byT[a.turma_id]) byT[a.turma_id].alunos.push(a) })
  const list = Object.values(byT)
  setCachedTurmas(list)
  return list
}

/* ---------- importar as 3 turmas semente ---------- */
export async function importSeed(userId) {
  for (const key of Object.keys(SEED)) {
    const s = SEED[key]
    const { data: t, error } = await supabase
      .from('turmas').insert({ owner_id: userId, nome: s.nome, codigo: key }).select('id').single()
    if (error) throw error
    const rows = s.alunos.map(a => ({
      owner_id: userId, turma_id: t.id, matricula: a.matricula || null, nome: a.nome
    }))
    // insere em blocos
    for (let i = 0; i < rows.length; i += 200) {
      const { error: er } = await supabase.from('alunos').insert(rows.slice(i, i + 200))
      if (er) throw er
    }
  }
}

/* ---------- foto ---------- */
export async function saveFoto(alunoId, dataUrl) {
  const uid = await currentUserId()
  if (!uid) throw new Error('Sessão expirada. Entre novamente para salvar a foto.')
  const path = uid + '/' + alunoId + '.jpg'

  // string vazia = remover
  if (!dataUrl) {
    await supabase.storage.from(BUCKET).remove([path])
    const { error } = await supabase.from('alunos').update({ foto_path: null, foto: null }).eq('id', alunoId)
    if (error) throw error
    esquecerUrl(path)
    return
  }

  const blob = dataUrlToBlob(dataUrl)
  const { error: upErr } = await supabase.storage.from(BUCKET)
    .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true })
  if (upErr) throw upErr

  const { error } = await supabase.from('alunos').update({ foto_path: path, foto: null }).eq('id', alunoId)
  if (error) throw error

  // a foto trocou no mesmo caminho: descarta a URL antiga para não servir cache velho
  esquecerUrl(path)
}

/* ---------- chamada / presenças ---------- */
export async function ensureChamada(userId, turmaId, dataISO) {
  // tenta achar; se não houver, cria
  let { data, error } = await supabase
    .from('chamadas').select('id,confirmada').eq('turma_id', turmaId).eq('data', dataISO).maybeSingle()
  if (error) throw error
  if (data) return data
  const ins = await supabase.from('chamadas')
    .insert({ owner_id: userId, turma_id: turmaId, data: dataISO }).select('id,confirmada').single()
  if (ins.error) throw ins.error
  return ins.data
}

export async function getPresentes(chamadaId) {
  const { data, error } = await supabase.from('presencas').select('aluno_id').eq('chamada_id', chamadaId)
  if (error) throw error
  return data.map(r => r.aluno_id)
}

// origem: 'manual' (toque na lista) | 'qr_professora' (scanner) | 'chamada_aluno' (QR do dia, pelo app do aluno).
// ignoreDuplicates: a primeira origem e a que fica registrada na ata.
export async function marcarPresente(userId, chamadaId, alunoId, origem) {
  const { error } = await supabase.from('presencas')
    .upsert({ owner_id: userId, chamada_id: chamadaId, aluno_id: alunoId, origem: origem || 'manual' },
            { onConflict: 'chamada_id,aluno_id', ignoreDuplicates: true })
  if (error) throw error
}
export async function desmarcarPresente(chamadaId, alunoId) {
  const { error } = await supabase.from('presencas').delete()
    .eq('chamada_id', chamadaId).eq('aluno_id', alunoId)
  if (error) throw error
}

/* ---------- outbox: registra offline e sincroniza depois ---------- */
export function queueOp(op) { const o = getOutbox(); o.push(op); setOutbox(o) }

export async function flushOutbox(userId) {
  let o = getOutbox()
  if (!o.length) return 0
  const rest = []
  for (const op of o) {
    try {
      if (op.type === 'present') await marcarPresente(userId, op.chamadaId, op.alunoId, op.origem)
      else if (op.type === 'absent') await desmarcarPresente(op.chamadaId, op.alunoId)
      else if (op.type === 'confirm') await supabase.from('chamadas').update({ confirmada: true }).eq('id', op.chamadaId)
    } catch (e) { rest.push(op) }
  }
  setOutbox(rest)
  return o.length - rest.length
}

export async function confirmarChamada(chamadaId) {
  const { error } = await supabase.from('chamadas').update({ confirmada: true }).eq('id', chamadaId)
  if (error) throw error
}

/* ---------- leituras de GPS (uso didático) ---------- */
export async function salvarLeitura(userId, dados) {
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection
  const ua = navigator.userAgent || ''
  const extra = {
    plataforma: /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : 'outro',
    user_agent: ua.slice(0, 200),
    tela: `${screen.width}x${screen.height}@${window.devicePixelRatio || 1}`,
    tipo_conexao: c && c.effectiveType ? c.effectiveType : null,
    downlink_mbps: c && typeof c.downlink === 'number' ? c.downlink : null,
    rtt_ms: c && typeof c.rtt === 'number' ? c.rtt : null,
    app_versao: typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : null,
    ...(dados.extra || {})
  }
  const { extra: _e, ...campos } = dados
  const { data, error } = await supabase.from('leituras_gps')
    .insert({ owner_id: userId, ...campos, online_na_captura: navigator.onLine, capturado_em: new Date().toISOString(), extra })
    .select('id,criado_em').single()
  if (error) throw error
  return data
}

export async function listarLeituras(limite = 60) {
  const { data, error } = await supabase.from('leituras_gps')
    .select('id,rotulo,lat,lon,acuracia_m,altitude_m,alt_acuracia_m,utm_n,utm_e,dist_perc_m,ttff_ms,criado_em')
    .order('criado_em', { ascending: false }).limit(limite)
  if (error) throw error
  return data
}

/* ---------- sessão de coleta (aula prática) ---------- */
function hojeISO() {
  const d = new Date(); const m = String(d.getMonth() + 1).padStart(2, '0'); const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}

// A sessão nasce amarrada à chamada de hoje: o registro do aluno vira presença.
export async function abrirSessao(userId, turmaId, codigo, titulo, tempo, janelaInicio, janelaFim, local) {
  const ch = await ensureChamada(userId, turmaId, hojeISO())
  // upload da fila do aluno é aceito até 7 dias depois da aula; presença só dentro da janela
  const expira = new Date(new Date(janelaFim).getTime() + 7 * 24 * 3600 * 1000).toISOString()
  const { data, error } = await supabase.from('sessoes_coleta')
    .insert({ owner_id: userId, turma_id: turmaId, codigo: codigo.toUpperCase(), titulo, tempo: tempo || null,
              chamada_id: ch.id, janela_inicio: janelaInicio, janela_fim: janelaFim, expira_em: expira, local: local || 'sala' })
    .select('id,codigo,aberta,criada_em,expira_em,tempo,chamada_id,janela_inicio,janela_fim,local').single()
  if (error) throw error
  return data
}

export async function sessoesAbertas(turmaId) {
  const { data, error } = await supabase.from('sessoes_coleta')
    .select('id,codigo,titulo,aberta,criada_em,expira_em,tempo,chamada_id,janela_inicio,janela_fim,local')
    .eq('turma_id', turmaId).order('criada_em', { ascending: false }).limit(5)
  if (error) throw error
  return data
}

export async function fecharSessao(id) {
  const { error } = await supabase.from('sessoes_coleta').update({ aberta: false }).eq('id', id)
  if (error) throw error
}

/* Leituras da sessão, já com o nome do aluno — a professora enxerga tudo
   pelo RLS dela; o aluno nunca lê esta tabela. */
export async function leiturasDaSessao(sessaoId) {
  const { data, error } = await supabase.from('leituras_gps')
    .select('id,rotulo,acuracia_m,alt_acuracia_m,altitude_m,dist_perc_m,criado_em,capturado_em,presenca_marcada,extra,aluno_id,alunos(nome,matricula)')
    .eq('sessao_id', sessaoId).order('criado_em', { ascending: false })
  if (error) throw error
  return data
}

/* ---------- resumo ---------- */
export async function resumoTurma(turmaId) {
  const { data: chs, error } = await supabase
    .from('chamadas').select('id,data').eq('turma_id', turmaId).order('data')
  if (error) throw error
  const ids = chs.map(c => c.id)
  let pres = []
  if (ids.length) {
    const { data, error: e2 } = await supabase.from('presencas').select('chamada_id,aluno_id,origem,created_at').in('chamada_id', ids)
    if (e2) throw e2
    pres = data
  }
  return { chamadas: chs, presencas: pres }
}
