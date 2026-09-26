import { useEffect, useState } from 'react'

/* A selfie do próprio aluno, guardada no aparelho dele.

   Uma cópia só, neste arquivo: MinhaFoto grava aqui quando o aluno envia, e o app grava
   aqui o que o servidor devolve em validar_sessao — o aluno que trocou de celular ou
   reinstalou recupera a própria cara sem ter que mandar outra.

   Daí ela sai para as telas do aluno como avatar: cabeçalho e coleção de insígnias.
   O aparelho guarda só a selfie de quem está identificado nele — nunca a dos colegas. */

const K = 'agc2_selfie'   // {alunoId, src, enviada, em}
const EV = 'agc2-selfie'  // a mesma aba avisa as outras telas; entre abas, vale o 'storage'

export function lerSelfie() { try { return JSON.parse(localStorage.getItem(K) || 'null') } catch (e) { return null } }

export function gravarSelfie(v) {
  try { v ? localStorage.setItem(K, JSON.stringify(v)) : localStorage.removeItem(K) } catch (e) {}
  try { window.dispatchEvent(new Event(EV)) } catch (e) {}
}

/* A selfie guardada é deste aluno? (trocou de matrícula no mesmo celular → não é dele) */
export const selfieDe = ident => { const s = lerSelfie(); return s && ident && s.alunoId === ident.alunoId ? s : null }
export const minhaSelfie = ident => selfieDe(ident)?.src || ''

/* Guarda a selfie que veio do servidor. Nasce como "enviada": é a que já está no banco.
   Troca a guardada quando o aluno a substituiu em outro celular; uma nova ainda
   "a enviar" neste aparelho não é tocada — ela vai substituir a do banco. */
export function guardarSelfieDoServidor(ident, src) {
  if (!src || !ident?.alunoId) return false
  const s = selfieDe(ident)
  if (s && (!s.enviada || s.src === src)) return false
  gravarSelfie({ alunoId: ident.alunoId, src, enviada: true, em: new Date().toISOString() })
  return true
}

function assinar(ident, escolher) {
  const [v, setV] = useState(() => escolher(ident))
  useEffect(() => {
    const f = () => setV(escolher(ident))
    f()
    window.addEventListener(EV, f); window.addEventListener('storage', f)
    return () => { window.removeEventListener(EV, f); window.removeEventListener('storage', f) }
  }, [ident?.alunoId])
  return v
}

/* O registro inteiro (com "enviada"), para a tela que manda a selfie. */
export const useSelfieGuardada = ident => assinar(ident, selfieDe)
/* Só a imagem, para quem só quer mostrar o avatar. */
export const useMinhaSelfie = ident => assinar(ident, minhaSelfie)
