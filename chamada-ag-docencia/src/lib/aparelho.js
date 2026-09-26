/* Computador = sem UA de celular e sem toque. No computador a geolocalização vem do
   Wi-Fi/IP e não vale como medição; e a tela do aluno é só para celular (regra dela). */
export const EH_COMPUTADOR = !(/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) && !(navigator.maxTouchPoints > 1)

/* Identidade do celular, não do aluno: sorteada uma vez e mantida quando o aluno
   troca de matrícula. É com ela que o servidor percebe um mesmo aparelho marcando
   presença para duas pessoas no mesmo dia (caso de 26/09) — as duas ficam a conferir. */
const K_APARELHO = 'agc2_aparelho'
export function aparelhoId() {
  try {
    let id = localStorage.getItem(K_APARELHO)
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2))
      localStorage.setItem(K_APARELHO, id)
    }
    return id
  } catch (e) { return null }
}
