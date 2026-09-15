import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

/* Leituras do app do aluno que não passam pelo GPS: histórico de presença e missões.
   Tudo por RPC anônima (o aluno não lê tabela nenhuma). A última resposta fica no
   celular, para a tela abrir sem rede e mostrar o que já se sabia. */

const K_PRES_HIST = 'agc2_hist_presenca'
const K_MISSOES = 'agc2_missoes'
const K_VISTAS = 'agc2_missoes_vistas'   // lançamentos que o aluno já abriu (para o alerta de "nova")

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

export async function marcarEtapa(ident, lancamentoId, etapa, feita) {
  const { data, error } = await supabase.rpc('marcar_etapa_missao', { ...idArgs(ident), p_lancamento_id: lancamentoId, p_etapa: etapa, p_feita: feita })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.erro || 'Não consegui gravar a etapa.')
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
