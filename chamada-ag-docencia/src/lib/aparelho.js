/* Computador = sem UA de celular e sem toque. No computador a geolocalização vem do
   Wi-Fi/IP e não vale como medição; e a tela do aluno é só para celular (regra dela). */
export const EH_COMPUTADOR = !(/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) && !(navigator.maxTouchPoints > 1)
