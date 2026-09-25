import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

/* Leituras do app do aluno que não passam pelo GPS: histórico de presença e missões.
   Tudo por RPC anônima (o aluno não lê tabela nenhuma). A última resposta fica no
   celular, para a tela abrir sem rede e mostrar o que já se sabia. */

const K_PRES_HIST = 'agc2_hist_presenca'
const K_MISSOES = 'agc2_missoes'
const K_VISTAS = 'agc2_missoes_vistas'   // lançamentos que o aluno já abriu (para o alerta de "nova")
const K_AULAS = 'agc2_aulas'
const K_AULA = 'agc2_aula_'            // + lancamento_id: a aula aberta, para reler sem rede

const ler = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def } catch (e) { return def } }
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) {} }
const idArgs = ident => ({ p_matricula: ident?.matricula || '', p_aluno_id: ident?.alunoId || null })

export function useHistoricoPresenca(ident, online) {
  const chave = ident?.alunoId || ident?.matricula || ''
  const [dados, setDados] = useState(() => { const c = ler(K_PRES_HIST, null); return c && c.chave === chave ? c.dados : null })
  const [carregando, setCarregando] = useState(false)
  const recarregar = useCallback(async () => {
    if (!ident || !navigator.onLine) return
    setCarregando(true)
    try {
      const { data, error } = await supabase.rpc('minhas_presencas', idArgs(ident))
      if (!error && data?.ok) { setDados(data); gravar(K_PRES_HIST, { chave, dados: data }) }
    } catch (e) {} finally { setCarregando(false) }
  }, [chave])
  useEffect(() => { recarregar() }, [recarregar, online])
  return { dados, carregando, recarregar }
}

const K_AVISOS_ALUNO = 'agc2_avisos_aluno'

/* Últimos avisos da professora (os mesmos do push), para a tela inicial:
   quem não ativou a notificação também lê. Pedido dela em 18/09/2026. */
export function useAvisosAluno(ident, online) {
  const chave = ident?.alunoId || ident?.matricula || ''
  const [dados, setDados] = useState(() => { const c = ler(K_AVISOS_ALUNO, null); return c && c.chave === chave ? c.dados : null })
  const recarregar = useCallback(async () => {
    if (!ident || !navigator.onLine) return
    try {
      const { data, error } = await supabase.rpc('meus_avisos', idArgs(ident))
      if (!error && data?.ok) { setDados(data); gravar(K_AVISOS_ALUNO, { chave, dados: data }) }
    } catch (e) {}
  }, [chave])
  useEffect(() => { recarregar() }, [recarregar, online])
  useEffect(() => {
    const f = () => { if (!document.hidden) recarregar() }
    document.addEventListener('visibilitychange', f)
    const t = setInterval(f, 60000)
    return () => { document.removeEventListener('visibilitychange', f); clearInterval(t) }
  }, [recarregar])
  return { dados, recarregar }
}

export function fmtQuando(iso) {
  if (!iso) return ''
  const d = new Date(iso), hoje = new Date()
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === hoje.toDateString()) return 'hoje, ' + hora
  const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1)
  if (d.toDateString() === ontem.toDateString()) return 'ontem, ' + hora
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ', ' + hora
}

export function useMissoes(ident, online) {
  const chave = ident?.alunoId || ident?.matricula || ''
  const [dados, setDados] = useState(() => { const c = ler(K_MISSOES, null); return c && c.chave === chave ? c.dados : null })
  const [carregando, setCarregando] = useState(false)
  const recarregar = useCallback(async () => {
    if (!ident || !navigator.onLine) return
    setCarregando(true)
    try {
      const { data, error } = await supabase.rpc('minhas_missoes', idArgs(ident))
      if (!error && data?.ok) { setDados(data); gravar(K_MISSOES, { chave, dados: data }) }
    } catch (e) {} finally { setCarregando(false) }
  }, [chave])
  useEffect(() => { recarregar() }, [recarregar, online])
  // volta ao primeiro plano: confere de novo (é aí que aparece missão nova)
  useEffect(() => {
    const f = () => { if (!document.hidden) recarregar() }
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [recarregar])
  return { dados, carregando, recarregar }
}

const K_INSIGNIAS = 'agc2_insignias'
const instalado = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true

export function useInsignias(ident, online) {
  const chave = ident?.alunoId || ident?.matricula || ''
  const [dados, setDados] = useState(() => { const c = ler(K_INSIGNIAS, null); return c && c.chave === chave ? c.dados : null })
  const recarregar = useCallback(async () => {
    if (!ident || !navigator.onLine) return
    try {
      const { data, error } = await supabase.rpc('minhas_insignias', { ...idArgs(ident), p_instalado: instalado() })
      if (!error && data?.ok) { setDados(data); gravar(K_INSIGNIAS, { chave, dados: data }) }
    } catch (e) {}
  }, [chave])
  useEffect(() => { recarregar() }, [recarregar, online])
  useEffect(() => {
    const f = () => { if (!document.hidden) recarregar() }
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [recarregar])
  // some do "nova" depois que o aluno viu o cartão
  const marcarVistas = useCallback(async () => {
    setDados(d => d ? { ...d, insignias: (d.insignias || []).map(i => ({ ...i, nova: false })) } : d)
    try { await supabase.rpc('marcar_insignias_vistas', idArgs(ident)) } catch (e) {}
  }, [chave])
  return { dados, recarregar, marcarVistas }
}

/* Avatar escolhido. O limite de uma troca por semana é decidido no servidor: se ele
   recusar, o erro traz o avatar que continua valendo e a data da próxima troca. */
export async function salvarAvatar(ident, chave) {
  const { data, error } = await supabase.rpc('salvar_avatar', { ...idArgs(ident), p_avatar: chave })
  if (error) throw error
  if (!data?.ok) { const e = new Error(data?.erro || 'Não consegui salvar o avatar.'); e.avatar = data?.avatar; e.avatar_em = data?.avatar_em; e.limite = !!data?.limite; throw e }
  return data
}

export async function marcarEtapa(ident, lancamentoId, etapa, feita) {
  const { data, error } = await supabase.rpc('marcar_etapa_missao', { ...idArgs(ident), p_lancamento_id: lancamentoId, p_etapa: etapa, p_feita: feita })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.erro || 'Não consegui gravar a etapa.')
  return data
}

// respostas salvas sem enviar (a professora só vê o que foi enviado)
export async function salvarRascunho(ident, lancamentoId, texto) {
  const { data, error } = await supabase.rpc('salvar_rascunho_missao', { ...idArgs(ident), p_lancamento_id: lancamentoId, p_texto: texto })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.erro || 'Não consegui salvar.')
  return data
}
/* Equipes que os alunos formam: a lista de equipes e de presentes (com quem já foi escolhido)
   e o pedido de entrada, que o servidor trava — quem já está numa equipe não entra em outra. */
export async function escolhaDeEquipe(ident, lancamentoId) {
  const { data, error } = await supabase.rpc('escolha_de_equipe', { ...idArgs(ident), p_lancamento_id: lancamentoId })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.erro || 'Não consegui carregar as equipes.')
  return data
}
export async function entrarEmEquipe(ident, lancamentoId, equipe, colegas) {
  const { data, error } = await supabase.rpc('entrar_em_equipe', { ...idArgs(ident), p_lancamento_id: lancamentoId, p_equipe: equipe || null, p_colegas: colegas || [] })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.erro || 'Não consegui entrar na equipe.')
  return data
}
/* Caderneta da equipe. base = o caderneta_em que este celular carregou; se um colega salvou
   depois, volta { conflito: true, caderneta, em, por } em vez de sobrescrever. */
export async function salvarCaderneta(ident, lancamentoId, caderneta, base) {
  const { data, error } = await supabase.rpc('salvar_caderneta_missao', { ...idArgs(ident), p_lancamento_id: lancamentoId, p_caderneta: caderneta, p_base: base || null })
  if (error) throw error
  if (!data?.ok && !data?.conflito) throw new Error(data?.erro || 'Não consegui salvar a caderneta.')
  return data
}

export async function enviarMissao(ident, lancamentoId, texto) {
  const { data, error } = await supabase.rpc('enviar_missao', { ...idArgs(ident), p_lancamento_id: lancamentoId, p_texto: texto })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.erro || 'Não consegui enviar.')
  return data
}

export const missaoVista = id => (ler(K_VISTAS, []) || []).includes(id)
export const marcarVista = id => { const v = ler(K_VISTAS, []) || []; if (!v.includes(id)) { v.push(id); gravar(K_VISTAS, v.slice(-200)) } }


/* ---------- aulas (material) ---------- */
/* A lista fica no celular como as missões. A aula aberta também: material que
   some sem rede não é material à mão, que é a razão de tudo isto existir. */
export function useAulas(ident, online) {
  const chave = ident?.alunoId || ident?.matricula || ''
  const [dados, setDados] = useState(() => { const c = ler(K_AULAS, null); return c && c.chave === chave ? c.dados : null })
  const [carregando, setCarregando] = useState(false)
  const recarregar = useCallback(async () => {
    if (!ident || !navigator.onLine) return
    setCarregando(true)
    try {
      const { data, error } = await supabase.rpc('minhas_aulas', idArgs(ident))
      if (!error && data?.ok) { setDados(data); gravar(K_AULAS, { chave, dados: data }) }
    } catch (e) {} finally { setCarregando(false) }
  }, [chave])
  useEffect(() => { recarregar() }, [recarregar, online])
  return { dados, carregando, recarregar }
}

export function aulaGuardada(lancamentoId) { return ler(K_AULA + lancamentoId, null) }

export async function carregarAula(ident, lancamentoId) {
  const { data, error } = await supabase.rpc('minha_aula', { ...idArgs(ident), p_lancamento_id: lancamentoId })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.erro || 'Não consegui abrir a aula.')
  gravar(K_AULA + lancamentoId, data)
  return data
}

/* Registra que o aluno abriu a peça. Falhou (sem rede, servidor fora)? A tela
   não trava por causa disso: leitura é registro, não permissão. */
export async function marcarLeitura(ident, lancamentoId, pecaId) {
  try { await supabase.rpc('marcar_leitura', { ...idArgs(ident), p_lancamento_id: lancamentoId, p_peca_id: pecaId }) } catch (e) {}
}

/* ---------- utilidades de exibição ---------- */
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export function fmtData(iso) {
  if (!iso) return ''
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  const dt = new Date(a, m - 1, d)
  return `${DIAS[dt.getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}
export function fmtPrazo(isoTs, agora = Date.now()) {
  const t = new Date(isoTs).getTime(), dif = t - agora
  const hora = new Date(isoTs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const data = new Date(isoTs).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  if (dif <= 0) return { texto: `encerrado ${data} ${hora}`, vencido: true, urgente: false }
  const min = Math.round(dif / 60000)
  if (min < 60) return { texto: `faltam ${min} min · até ${hora}`, vencido: false, urgente: true }
  const mesmoDia = new Date(isoTs).toDateString() === new Date(agora).toDateString()
  if (min < 24 * 60) return { texto: mesmoDia ? `até ${hora} de hoje` : `até ${data} às ${hora}`, vencido: false, urgente: min < 180 }
  return { texto: `até ${data} às ${hora}`, vencido: false, urgente: false }
}

/* Faltas em horas-aula: cada aula perdida vale os tempos da turma (6 na Planialtimétrica,
   5 nas outras). Limite de faltas = 25% da carga horária (frequência mínima de 75%). */
export function resumoFaltas(dados) {
  if (!dados) return null
  const tempos = dados.tempos_por_aula || 5
  const aulas = dados.aulas || []
  const presencas = aulas.filter(a => a.presente).length
  const ausentes = aulas.length - presencas
  const faltasHa = ausentes * tempos
  const limiteHa = dados.ch_ha ? Math.floor(dados.ch_ha * 0.25) : null
  return { aulas: aulas.length, presencas, ausentes, faltasHa, tempos, limiteHa, restamHa: limiteHa != null ? limiteHa - faltasHa : null }
}
