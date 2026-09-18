/* A lista de avatares que o aluno escolhe para si.

   Regra dela (18/09/2026): a selfie é só da professora — é como ela reconhece o aluno nas
   telas dela. No app do aluno, e em qualquer lugar onde outro aluno enxergue (equipe,
   pódio), quem aparece é o avatar escolhido aqui. Ninguém além dela vê rosto.

   O banco guarda só a chave ('lumi'); a arte mora em public/avatares e é trocada aqui,
   neste arquivo, sem mexer em banco nem em tela.

   A arte dela entra por avatares-professora.json, gerado pelo sincronizar-avatares.py da
   pasta "00_Orbe — Projeto/Avatares" (que também gera os jpg de public/avatares). Nome é
   opcional: sem nome, a grade mostra só a imagem. A turma do Orbe vem depois. */

import DELA from './avatares-professora.json'

const TURMA_ORBE = [
  { k: 'orbe', nome: 'Orbe' },
  { k: 'vertice', nome: 'Vértice' },
  { k: 'navi', nome: 'Navi' },
  { k: 'lumi', nome: 'Lumi' },
  { k: 'teo', nome: 'Téo' },
]

const semRepetir = lista => lista.filter((a, i) => lista.findIndex(x => x.k === a.k) === i)
export const AVATARES = semRepetir([...DELA, ...TURMA_ORBE])

export const POR_CHAVE = Object.fromEntries(AVATARES.map(a => [a.k, a]))
export const existe = k => !!(k && POR_CHAVE[k])
export const nomeAvatar = k => POR_CHAVE[k]?.nome || ''
export const arteAvatar = (k, { tam = 128 } = {}) => `/avatares/${k}-${tam > 128 ? 256 : 128}.jpg`

/* Uma troca por semana — o servidor é quem manda (salvar_avatar), isto aqui é só a tela. */
export const ESPERA_MS = 7 * 24 * 3600 * 1000
export function podeTrocar(avatar, avatarEm, agora = Date.now()) {
  if (!avatar || !avatarEm) return { pode: true, proxima: null }   // primeira escolha é livre
  const proxima = new Date(avatarEm).getTime() + ESPERA_MS
  return { pode: agora >= proxima, proxima: new Date(proxima) }
}
export const fmtDia = d => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''
