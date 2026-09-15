import { supabase } from '../supabaseClient'

/* Avisos no celular com o app fechado (Web Push).
   A chave pública VAPID fica aqui; a privada está no cofre do Supabase e só a função
   enviar-avisos lê. Android recebe com o app fechado; iPhone só com o app instalado
   na Tela de Início (iOS 16.4+). */

export const VAPID_PUBLICA = 'BFuZq7MGNhzawkuZPCpRAI0Qp43b1zH3fCNqizo-v1sCA9U3RSnXlA7oQN2hmpe5hgkVNe3vwZMiTT03WyPjP3Q'

const ehIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
const instalado = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true
const plataforma = () => ehIOS ? 'iOS' : /Android/.test(navigator.userAgent) ? 'Android' : 'outro'

function chaveBytes(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// 'ativo' | 'inativo' | 'negado' | 'ios-instalar' | 'sem-suporte'
export async function estadoAvisos() {
  if (ehIOS && !instalado()) return 'ios-instalar'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'sem-suporte'
  if (Notification.permission === 'denied') return 'negado'
  if (Notification.permission !== 'granted') return 'inativo'
  try {
    const reg = await navigator.serviceWorker.ready
    return (await reg.pushManager.getSubscription()) ? 'ativo' : 'inativo'
  } catch (e) { return 'inativo' }
}

async function obterInscricao(pedirPermissao) {
  if (pedirPermissao) {
    const p = await Notification.requestPermission()
    if (p !== 'granted') throw new Error(p === 'denied' ? 'Avisos bloqueados. Libere nas configurações do celular.' : 'Permissão não concedida.')
  }
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBytes(VAPID_PUBLICA) })
  return { endpoint: sub.endpoint, p256dh: b64url(sub.getKey('p256dh')), auth: b64url(sub.getKey('auth')) }
}

const idArgs = ident => ({ p_matricula: ident?.matricula || '', p_aluno_id: ident?.alunoId || null })

export async function ativarAvisosAluno(ident) {
  const s = await obterInscricao(true)
  const { data, error } = await supabase.rpc('inscrever_push', { ...idArgs(ident), p_endpoint: s.endpoint, p_p256dh: s.p256dh, p_auth: s.auth, p_plataforma: plataforma() })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.erro || 'Não consegui ativar.')
}

// ao abrir o app: se já deu permissão, confirma a inscrição no servidor (o navegador pode trocar o endereço)
export async function sincronizarAvisosAluno(ident) {
  if (!ident || (await estadoAvisos()) !== 'ativo') return
  try {
    const s = await obterInscricao(false)
    await supabase.rpc('inscrever_push', { ...idArgs(ident), p_endpoint: s.endpoint, p_p256dh: s.p256dh, p_auth: s.auth, p_plataforma: plataforma() })
  } catch (e) {}
}

export async function ativarAvisosProfessora() {
  const s = await obterInscricao(true)
  const { data, error } = await supabase.rpc('inscrever_push_professora', { p_endpoint: s.endpoint, p_p256dh: s.p256dh, p_auth: s.auth, p_plataforma: plataforma() })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.erro || 'Não consegui ativar.')
}

export const TEXTO_ESTADO = {
  'ios-instalar': 'No iPhone, os avisos só chegam com o Orbe instalado: Compartilhar → Adicionar à Tela de Início, e abra por lá.',
  'sem-suporte': 'Este navegador não recebe avisos. Use o Orbe instalado no celular.',
  negado: 'Os avisos estão bloqueados neste celular. Libere em Configurações → Notificações → Orbe (ou do navegador).',
}
