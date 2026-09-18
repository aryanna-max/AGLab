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
    .from('alunos').select('id,turma_id,matricula,nome,foto,foto_path,foto_data').order('nome')
  if (e2) throw e2

  await resolverFotos(alunos)
  // selfie tirada pelo próprio aluno (data URL pequena): vale quando não há foto no Storage
  alunos.forEach(a => { if (!a.foto && a.foto_data) a.foto = a.foto_data })

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

/* Quais turmas do seed ainda NAO existem (compara pelo codigo).
   Serve para importar sem duplicar, mesmo ja havendo outras turmas. */
export async function turmasDoSeedFaltando() {
  const { data, error } = await supabase.from('turmas').select('codigo')
  if (error) throw error
  const tem = new Set((data || []).map(t => t.codigo))
  return Object.keys(SEED).filter(k => !tem.has(k)).map(k => ({ codigo: k, nome: SEED[k].nome, alunos: SEED[k].alunos.length }))
}

/* Importa so as que faltam. Devolve quantas turmas e quantos alunos entraram. */
export async function importarFaltantes(userId) {
  const faltam = await turmasDoSeedFaltando()
  let alunos = 0
  for (const f of faltam) {
    const s = SEED[f.codigo]
    const { data: t, error } = await supabase
      .from('turmas').insert({ owner_id: userId, nome: s.nome, codigo: f.codigo }).select('id').single()
    if (error) throw error
    const rows = s.alunos.map(a => ({ owner_id: userId, turma_id: t.id, matricula: a.matricula || null, nome: a.nome }))
    for (let i = 0; i < rows.length; i += 200) {
      const { error: er } = await supabase.from('alunos').insert(rows.slice(i, i + 200))
      if (er) throw er
    }
    alunos += rows.length
  }
  return { turmas: faltam.length, alunos }
}

/* Apaga a turma. As fotos no Storage saem junto; alunos, chamadas, presencas
   e leituras caem por cascata no banco. */
export async function apagarTurma(turmaId) {
  const uid = await currentUserId()
  const { data: alunos } = await supabase.from('alunos').select('foto_path').eq('turma_id', turmaId)
  const paths = (alunos || []).map(a => a.foto_path).filter(Boolean)
  if (paths.length) { try { await supabase.storage.from(BUCKET).remove(paths) } catch (e) {} }
  const { error } = await supabase.from('turmas').delete().eq('id', turmaId)
  if (error) throw error
  try { localStorage.removeItem(CACHE_TURMAS) } catch (e) {}
}

/* ---------- alunos: incluir e remover ---------- */
export async function adicionarAluno(userId, turmaId, nome, matricula) {
  const mat = (matricula || '').trim()
  if (mat) {
    const { data: ja } = await supabase.from('alunos').select('id').eq('turma_id', turmaId).ilike('matricula', mat).maybeSingle()
    if (ja) throw new Error('Já existe aluno com essa matrícula nesta turma.')
  }
  const { data, error } = await supabase.from('alunos')
    .insert({ owner_id: userId, turma_id: turmaId, nome: nome.trim(), matricula: mat || null })
    .select('id,nome,matricula').single()
  if (error) throw error
  return data
}

export async function removerAluno(alunoId) {
  const { data } = await supabase.from('alunos').select('foto_path').eq('id', alunoId).maybeSingle()
  if (data && data.foto_path) { try { await supabase.storage.from(BUCKET).remove([data.foto_path]) } catch (e) {} }
  const { error } = await supabase.from('alunos').delete().eq('id', alunoId)
  if (error) throw error
}

/* ---------- foto ---------- */
// libera o aluno para mandar uma nova selfie (a que ele enviou some da lista)
export async function liberarSelfie(alunoId) {
  const { error } = await supabase.from('alunos').update({ foto_data: null, foto_em: null }).eq('id', alunoId)
  if (error) throw error
}

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
  // O código é único no banco e cada turma tem um dia de aula por semana: o mesmo código
  // (F61GPS) serve toda semana. Se já existe, a sessão é REABERTA para a aula de hoje.
  const linha = { owner_id: userId, turma_id: turmaId, codigo: codigo.toUpperCase(), titulo, tempo: tempo || null, aberta: true,
                  chamada_id: ch.id, janela_inicio: janelaInicio, janela_fim: janelaFim, expira_em: expira, local: local || 'sala' }
  const { data, error } = await supabase.from('sessoes_coleta')
    .upsert(linha, { onConflict: 'codigo' })
    .select('id,codigo,aberta,criada_em,expira_em,tempo,chamada_id,janela_inicio,janela_fim,local').single()
  if (error) throw error
  return data
}

/* ---------- conteúdo da aula (texto livre na chamada do dia) ---------- */
export async function conteudoDaChamada(chamadaId) {
  const { data, error } = await supabase.from('chamadas').select('conteudo').eq('id', chamadaId).maybeSingle()
  if (error) throw error
  return data ? (data.conteudo || '') : ''
}
export async function salvarConteudo(chamadaId, texto) {
  const { error } = await supabase.from('chamadas').update({ conteudo: (texto || '').trim() || null }).eq('id', chamadaId)
  if (error) throw error
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
// desde: a sessão reaberta numa semana nova carrega as leituras da anterior — a tela do dia pede só as de hoje
export async function leiturasDaSessao(sessaoId, desde) {
  let q = supabase.from('leituras_gps')
    .select('id,rotulo,acuracia_m,alt_acuracia_m,altitude_m,dist_perc_m,criado_em,capturado_em,presenca_marcada,extra,aluno_id,alunos(nome,matricula)')
    .eq('sessao_id', sessaoId)
  if (desde) q = q.gte('criado_em', desde)
  const { data, error } = await q.order('criado_em', { ascending: false })
  if (error) throw error
  return data
}

/* ---------- radar: batimentos dos alunos da turma ---------- */
export async function vivos(turmaId) {
  const { data, error } = await supabase.from('presenca_viva')
    .select('aluno_id,lat,lon,acuracia_m,modo,visto_em,alunos!inner(turma_id)')
    .eq('alunos.turma_id', turmaId)
  if (error) throw error
  return data
}

/* ---------- pins e poligonais da turma (professora) ---------- */
export async function pinsDaTurma(turmaId) {
  const { data, error } = await supabase.from('pins')
    .select('id,nome,lat,lon,utm_n,utm_e,altitude_m,n_leituras,acuracia_media_m,desvio_n_m,desvio_e_m,marco_ref,tem_foto,sessao_id,criado_em,aluno_id,alunos!inner(nome,matricula,turma_id)')
    .eq('alunos.turma_id', turmaId).order('criado_em', { ascending: false }).limit(200)
  if (error) throw error
  return data
}
export async function poligonaisDaTurma(turmaId) {
  const { data, error } = await supabase.from('poligonais')
    .select('id,nome,pin_ids,resultado,criado_em,aluno_id,alunos!inner(nome,turma_id)')
    .eq('alunos.turma_id', turmaId).order('criado_em', { ascending: false }).limit(100)
  if (error) throw error
  return data
}

export async function fotoDoPin(id) {
  const { data, error } = await supabase.from('pins').select('foto').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? data.foto : null
}

/* ---------- análise (professora, computador) ---------- */
export async function leiturasDaTurma(turmaId, desdeISO) {
  let q = supabase.from('leituras_gps')
    .select('id,rotulo,lat,lon,acuracia_m,altitude_m,alt_acuracia_m,utm_n,utm_e,dist_perc_m,ttff_ms,criado_em,capturado_em,fix_timestamp,online_na_captura,presenca_marcada,sessao_id,extra,aluno_id,alunos!inner(nome,matricula,turma_id)')
    .eq('alunos.turma_id', turmaId).order('capturado_em', { ascending: false }).limit(5000)
  if (desdeISO) q = q.gte('criado_em', desdeISO)
  const { data, error } = await q
  if (error) throw error
  return data
}
export async function sessoesDaTurma(turmaId) {
  const { data, error } = await supabase.from('sessoes_coleta')
    .select('id,codigo,titulo,aberta,criada_em,tempo,local,janela_inicio,janela_fim')
    .eq('turma_id', turmaId).order('criada_em', { ascending: false }).limit(60)
  if (error) throw error
  return data
}
/* Última medição da PROFESSORA feita pelo celular (aluno_id nulo). No computador a
   geolocalização é do Wi-Fi/IP e não vale: a posição oficial dela é esta. */
export async function minhaUltimaLeitura() {
  const { data, error } = await supabase.from('leituras_gps')
    .select('lat,lon,acuracia_m,rotulo,criado_em,capturado_em')
    .is('aluno_id', null).order('criado_em', { ascending: false }).limit(1)
  if (error) throw error
  return data && data[0] ? data[0] : null
}

/* A leitura de melhor acurácia informada de uma pessoa da turma (ex.: a auxiliar).
   Serve de centro fixo do radar quando a professora prefere um ponto medido com calma
   a uma posição ao vivo que oscila. */
export async function melhorLeituraDe(alunoId) {
  const { data, error } = await supabase.from('leituras_gps')
    .select('lat,lon,acuracia_m,criado_em,capturado_em')
    .eq('aluno_id', alunoId).not('acuracia_m', 'is', null)
    .order('acuracia_m', { ascending: true }).limit(1)
  if (error) throw error
  return data && data[0] ? data[0] : null
}

/* ---------- a professora usa o Orbe (Ir até, pins, poligonais) com a conta dela ----------
   Mesma interface que a RPC do aluno (apiAluno em Orbe.jsx), mas direto nas tabelas via RLS,
   com aluno_id nulo. As chaves p_* são as da RPC, para o Orbe não saber quem está usando. */
export function apiProfessora(userId) {
  const mapPin = p => ({ id: p.id, nome: p.nome, lat: p.lat, lon: p.lon, utm_n: p.utm_n, utm_e: p.utm_e, altitude_m: p.altitude_m, n: p.n_leituras, acc: p.acuracia_media_m, dn: p.desvio_n_m, de: p.desvio_e_m, marco_ref: p.marco_ref, criado_em: p.criado_em, tem_foto: p.tem_foto })
  return {
    meusPins: async () => {
      const { data, error } = await supabase.from('pins').select('id,nome,lat,lon,utm_n,utm_e,altitude_m,n_leituras,acuracia_media_m,desvio_n_m,desvio_e_m,marco_ref,criado_em,tem_foto')
        .is('aluno_id', null).order('criado_em', { ascending: true }).limit(60)
      if (error) throw error; return (data || []).map(mapPin)
    },
    salvarPin: async c => {
      const { data, error } = await supabase.from('pins').insert({ owner_id: userId, aluno_id: null, nome: c.p_nome, lat: c.p_lat, lon: c.p_lon, utm_n: c.p_utm_n, utm_e: c.p_utm_e,
        altitude_m: c.p_altitude, n_leituras: c.p_n, acuracia_media_m: c.p_acc_media, desvio_n_m: c.p_desvio_n, desvio_e_m: c.p_desvio_e, duracao_s: c.p_duracao, marco_ref: c.p_marco_ref, foto: c.p_foto || null }).select('id').single()
      if (error) throw error; return { ok: true, pin_id: data.id }
    },
    minhasPoligonais: async () => {
      const { data, error } = await supabase.from('poligonais').select('id,nome,pin_ids,resultado,criado_em').is('aluno_id', null).order('criado_em', { ascending: false }).limit(40)
      if (error) throw error; return data || []
    },
    salvarPoligonal: async c => {
      if (c.p_resultado && c.p_resultado.cruzada) return { ok: false, erro: 'Os lados se cruzam: corrija a ordem antes de salvar.' }
      const { data, error } = await supabase.from('poligonais').insert({ owner_id: userId, aluno_id: null, nome: c.p_nome, pin_ids: c.p_pin_ids, resultado: c.p_resultado }).select('id').single()
      if (error) throw error; return { ok: true, id: data.id }
    }
  }
}

/* ---------- marcos cadastrados por ela ---------- */
export async function listarMarcos() {
  const { data, error } = await supabase.from('marcos').select('id,nome,utm_n,utm_e,sigma,tipo,nota,criado_em').order('nome')
  if (error) throw error; return data || []
}
export async function salvarMarco(userId, m) {
  const { data, error } = await supabase.from('marcos').upsert({ owner_id: userId, nome: m.nome.trim(), utm_n: m.utm_n, utm_e: m.utm_e, sigma: m.sigma, tipo: m.tipo || 'marco', nota: m.nota || null }, { onConflict: 'owner_id,nome' }).select('id,nome,utm_n,utm_e,sigma,tipo,nota').single()
  if (error) throw error; return data
}
export async function apagarMarco(id) { const { error } = await supabase.from('marcos').delete().eq('id', id); if (error) throw error }
export async function marcosPublicos() { const { data, error } = await supabase.rpc('marcos_publicos'); if (error) throw error; return data || [] }

/* ---------- missões (professora) ----------
   Cardápio dela (missoes, sem turma) · lançamentos (missão × turma × prazo) · entregas dos alunos. */
export async function listarMissoes() {
  const { data, error } = await supabase.from('missoes').select('*').order('arquivada').order('frente').order('titulo')
  if (error) throw error; return data || []
}
export async function salvarMissao(userId, m) {
  const linha = { owner_id: userId, titulo: m.titulo.trim(), frente: m.frente || 'geral', descricao: m.descricao || null,
    etapas: (m.etapas || []).map(e => String(e).trim()).filter(Boolean), entrega: m.entrega || null, niveis: m.niveis || {}, arquivada: !!m.arquivada,
    equipe: !!m.equipe, funcoes: (m.funcoes || []).map(f => String(f).trim()).filter(Boolean) }
  const q = m.id ? supabase.from('missoes').update(linha).eq('id', m.id) : supabase.from('missoes').insert(linha)
  const { data, error } = await q.select('*').single()
  if (error) throw error; return data
}
export async function apagarMissao(id) { const { error } = await supabase.from('missoes').delete().eq('id', id); if (error) throw error }
export async function importarCardapio(userId, lista) {
  const linhas = lista.map(m => ({ owner_id: userId, titulo: m.titulo, frente: m.frente, descricao: m.descricao, etapas: m.etapas, entrega: m.entrega, niveis: m.niveis, equipe: !!m.equipe, funcoes: m.funcoes || [] }))
  const { error } = await supabase.from('missoes').insert(linhas)
  if (error) throw error
}
export async function janelaDeHoje(turmaId) {
  const ini = new Date(); ini.setHours(0, 0, 0, 0)
  const fim = new Date(); fim.setHours(23, 59, 59, 999)
  const { data, error } = await supabase.from('sessoes_coleta').select('id,codigo,janela_inicio,janela_fim,aberta')
    .eq('turma_id', turmaId).gte('janela_inicio', ini.toISOString()).lte('janela_inicio', fim.toISOString())
    .order('janela_inicio', { ascending: false }).limit(1)
  if (error) throw error; return data && data[0] ? data[0] : null
}
export async function lancarMissao(userId, l) {
  const { data, error } = await supabase.from('missao_lancamentos').insert({ owner_id: userId, missao_id: l.missao_id, turma_id: l.turma_id,
    prazo_tipo: l.prazo_tipo, prazo_em: l.prazo_em, mostrar_ranking: l.mostrar_ranking !== false, em_equipe: !!l.em_equipe }).select('*').single()
  if (error) throw error; return data
}
export async function lancamentosDaTurma(turmaId) {
  const { data, error } = await supabase.from('missao_lancamentos').select('*,missoes(titulo,frente,etapas,niveis,entrega,equipe,funcoes)')
    .eq('turma_id', turmaId).order('criado_em', { ascending: false })
  if (error) throw error; return data || []
}
export async function atualizarLancamento(id, campos) { const { error } = await supabase.from('missao_lancamentos').update(campos).eq('id', id); if (error) throw error }
export async function apagarLancamento(id) { const { error } = await supabase.from('missao_lancamentos').delete().eq('id', id); if (error) throw error }
export async function entregasDaTurma(turmaId) {
  const { data, error } = await supabase.from('missao_entregas')
    .select('*,missao_lancamentos!inner(turma_id,mostrar_ranking,prazo_em)')
    .eq('missao_lancamentos.turma_id', turmaId)
  if (error) throw error; return data || []
}
/* ---------- equipes de um lançamento ---------- */
export async function equipesDoLancamento(lancamentoId) {
  const { data, error } = await supabase.from('missao_equipes').select('id,nome,missao_equipe_membros(aluno_id)')
    .eq('lancamento_id', lancamentoId).order('nome')
  if (error) throw error
  return (data || []).map(e => ({ id: e.id, nome: e.nome, membros: e.missao_equipe_membros || [] }))
}
// substitui todas as equipes do lançamento. As entregas já existentes são realinhadas à nova equipe.
export async function salvarEquipes(userId, lancamentoId, equipes) {
  await supabase.from('missao_entregas').update({ equipe_id: null }).eq('lancamento_id', lancamentoId)
  const { error: e1 } = await supabase.from('missao_equipes').delete().eq('lancamento_id', lancamentoId)
  if (e1) throw e1
  for (const eq of equipes) {
    if (!eq.membros.length) continue
    const { data, error } = await supabase.from('missao_equipes').insert({ owner_id: userId, lancamento_id: lancamentoId, nome: eq.nome }).select('id').single()
    if (error) throw error
    const { error: e2 } = await supabase.from('missao_equipe_membros').insert(eq.membros.map(m => ({ owner_id: userId, lancamento_id: lancamentoId, equipe_id: data.id, aluno_id: m.aluno_id })))
    if (e2) throw e2
    await supabase.from('missao_entregas').update({ equipe_id: data.id }).eq('lancamento_id', lancamentoId).in('aluno_id', eq.membros.map(m => m.aluno_id))
  }
}
// presentes na chamada de hoje, sem criar chamada (para sortear equipes só entre quem veio)
export async function presentesDeHoje(turmaId) {
  const { data, error } = await supabase.from('chamadas').select('id').eq('turma_id', turmaId).eq('data', hojeISO()).maybeSingle()
  if (error) throw error
  return data ? getPresentes(data.id) : []
}
// equipes do último lançamento em equipe desta turma (para repetir a formação)
export async function ultimasEquipesDaTurma(turmaId, excetoLancamentoId) {
  const { data, error } = await supabase.from('missao_lancamentos').select('id').eq('turma_id', turmaId).eq('em_equipe', true)
    .neq('id', excetoLancamentoId).order('criado_em', { ascending: false }).limit(1)
  if (error) throw error
  if (!data || !data[0]) return null
  return equipesDoLancamento(data[0].id)
}
export async function avaliarVarios(userId, lancamentoId, alunoIds, campos) {
  const agora = new Date().toISOString()
  const { error } = await supabase.from('missao_entregas')
    .upsert(alunoIds.map(id => ({ owner_id: userId, lancamento_id: lancamentoId, aluno_id: id, ...campos, atualizado_em: agora })), { onConflict: 'lancamento_id,aluno_id' })
  if (error) throw error
}

export async function avaliarEntrega(userId, lancamentoId, alunoId, campos) {
  // a professora pode avaliar mesmo quem não abriu a missão (ex.: entregou no papel): cria a linha se faltar
  const { data, error } = await supabase.from('missao_entregas')
    .upsert({ owner_id: userId, lancamento_id: lancamentoId, aluno_id: alunoId, ...campos, atualizado_em: new Date().toISOString() }, { onConflict: 'lancamento_id,aluno_id' })
    .select('*').single()
  if (error) throw error; return data
}

/* ---------- insígnias ---------- */
export async function insigniasDaTurma(turmaId) {
  const { data, error } = await supabase.from('insignias')
    .select('id,aluno_id,chave,dado,origem,concedida_em,alunos!inner(turma_id)')
    .eq('alunos.turma_id', turmaId).order('concedida_em', { ascending: false })
  if (error) throw error; return data || []
}
// confere as regras automáticas da turma inteira (vale retroativo)
export async function conferirInsignias(turmaId) {
  const { data, error } = await supabase.rpc('conferir_insignias_turma', { p_turma: turmaId })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.erro || 'Não consegui conferir.')
  return data.novas
}
export async function concederInsignia(userId, alunoId, chave, dado) {
  const { error } = await supabase.from('insignias')
    .upsert({ owner_id: userId, aluno_id: alunoId, chave, dado: dado || null, origem: 'professora' }, { onConflict: 'aluno_id,chave' })
  if (error) throw error
}
export async function removerInsignia(id) {
  const { error } = await supabase.from('insignias').delete().eq('id', id)
  if (error) throw error
}

/* ---------- avisos no celular (Web Push) ---------- */
// alunos com avisos ativos (aluno_id) e aparelhos da própria professora (aluno_id null)
export async function inscricoesAtivas() {
  const { data, error } = await supabase.from('push_inscricoes').select('aluno_id,plataforma,atualizado_em').eq('ativo', true)
  if (error) throw error; return data || []
}
export async function avisosDaTurma(turmaId) {
  const { data, error } = await supabase.from('avisos').select('*').or(`turma_id.eq.${turmaId},turma_id.is.null`)
    .order('agendado_para', { ascending: false }).limit(30)
  if (error) throw error; return data || []
}
export async function criarAviso(userId, a) {
  const { data, error } = await supabase.from('avisos').insert({ owner_id: userId, turma_id: a.turma_id || null, titulo: a.titulo.trim(), texto: (a.texto || '').trim(),
    abrir: a.abrir || 'home', alvo_tipo: a.alvo_tipo || 'turma', alvo_ids: a.alvo_ids || [], rotulo_alvo: a.rotulo_alvo || null,
    agendado_para: a.agendado_para || new Date().toISOString() }).select('*').single()
  if (error) throw error; return data
}
export async function cancelarAviso(id) {
  const { error } = await supabase.from('avisos').update({ status: 'cancelado' }).eq('id', id).eq('status', 'agendado')
  if (error) throw error
}
// processa na hora os avisos vencidos (os agendados o servidor manda sozinho, a cada minuto)
export async function dispararAvisos() {
  const { data, error } = await supabase.functions.invoke('enviar-avisos', { body: {} })
  if (error) throw error; return data
}

/* ---------- resumo ---------- */
export async function resumoTurma(turmaId) {
  const { data: chs, error } = await supabase
    .from('chamadas').select('id,data,conteudo').eq('turma_id', turmaId).order('data')
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

/* ---------- professor(a) auxiliar do dia ----------
   A professora empresta a caderneta de hoje para alguém que já está no cadastro
   da turma: um PIN de 6 dígitos que o banco gera e que morre à meia-noite de
   Recife. Quem recebe entra em /auxiliar com a própria matrícula e esse PIN. */
export async function acessoAuxiliarHoje(turmaId) {
  // sem join: o nome e a matrícula saem da turma que a tela já tem em mãos
  const { data, error } = await supabase.from('auxiliar_acessos')
    .select('id,aluno_id,data,pin,expira_em,revogado,usado_em,tentativas')
    .eq('turma_id', turmaId).order('data', { ascending: false }).limit(1)
  if (error) throw error
  const a = data && data[0]
  // vale só enquanto não foi revogado e não virou o dia
  if (!a || a.revogado || new Date(a.expira_em) <= new Date()) return null
  return a
}

export async function liberarAuxiliar(turmaId, alunoId) {
  const { data, error } = await supabase.rpc('liberar_auxiliar', { p_turma_id: turmaId, p_aluno_id: alunoId })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.erro || 'Não consegui liberar.')
  return data
}

export async function revogarAuxiliar(turmaId) {
  const { error } = await supabase.rpc('revogar_auxiliar', { p_turma_id: turmaId })
  if (error) throw error
}
