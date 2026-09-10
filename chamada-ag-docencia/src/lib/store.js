import { supabase } from '../supabaseClient'
import { SEED } from '../seed'

const CACHE_TURMAS = 'agc2_turmas_cache'
const OUTBOX = 'agc2_outbox'

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

/* ---------- carregar turmas + alunos ---------- */
export async function loadTurmas() {
  const { data: turmas, error } = await supabase
    .from('turmas').select('id,nome,codigo').order('nome')
  if (error) throw error
  const { data: alunos, error: e2 } = await supabase
    .from('alunos').select('id,turma_id,matricula,nome,foto').order('nome')
  if (e2) throw e2
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
  const { error } = await supabase.from('alunos').update({ foto: dataUrl }).eq('id', alunoId)
  if (error) throw error
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

export async function marcarPresente(userId, chamadaId, alunoId) {
  const { error } = await supabase.from('presencas')
    .upsert({ owner_id: userId, chamada_id: chamadaId, aluno_id: alunoId }, { onConflict: 'chamada_id,aluno_id' })
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
      if (op.type === 'present') await marcarPresente(userId, op.chamadaId, op.alunoId)
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

/* ---------- resumo ---------- */
export async function resumoTurma(turmaId) {
  const { data: chs, error } = await supabase
    .from('chamadas').select('id,data').eq('turma_id', turmaId).order('data')
  if (error) throw error
  const ids = chs.map(c => c.id)
  let pres = []
  if (ids.length) {
    const { data, error: e2 } = await supabase.from('presencas').select('chamada_id,aluno_id').in('chamada_id', ids)
    if (e2) throw e2
    pres = data
  }
  return { chamadas: chs, presencas: pres }
}
