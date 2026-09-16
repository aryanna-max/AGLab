/* Som de conquista das insígnias: três opções curtas (menos de 1,5 s), geradas na hora
   pelo Web Audio — sem arquivo, funciona offline. No Android vibra junto.
   O navegador só libera som depois de um toque na tela: prepararSom() destrava no primeiro
   toque do aluno; se o cartão abrir antes disso, o som sai no primeiro toque seguinte.
   O aluno pode desligar na coleção (sala de aula com 35 celulares). */

const K_SOM = 'agc2_som_insignias'
let ctx = null

// valor guardado: 'sino' | 'brilho' | 'missao' | '0' (desligado). Antigo '1' = sino.
export const somEscolhido = () => { try { const v = localStorage.getItem(K_SOM); return !v || v === '1' ? 'sino' : v } catch (e) { return 'sino' } }
export const somLigado = () => somEscolhido() !== '0'
export const definirSom = v => { try { localStorage.setItem(K_SOM, v === true ? 'sino' : v === false ? '0' : v) } catch (e) {} }

function contexto() {
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  if (!ctx) ctx = new AC()
  return ctx
}

// chamado uma vez no app do aluno: o primeiro toque destrava o áudio para depois
export function prepararSom() {
  const f = () => {
    document.removeEventListener('pointerdown', f, true)
    try { const c = contexto(); if (c && c.state !== 'running') c.resume().catch(() => {}) } catch (e) {}
  }
  document.addEventListener('pointerdown', f, true)
}

// uma nota com envelope de sino: ataque curto e queda exponencial
function nota(c, saida, freq, t, dura, parciais, forma = 'sine') {
  parciais.forEach(([mult, vol]) => {
    const o = c.createOscillator(), g = c.createGain()
    o.type = forma
    o.frequency.value = freq * mult
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0008, t + dura)
    o.connect(g); g.connect(saida)
    o.start(t); o.stop(t + dura + 0.05)
  })
}

// três sons curtos (arquivos de referência em Insígnias/Sons, para ouvir fora do app)
export const SONS = [
  ['sino', 'Sino'],
  ['brilho', 'Brilho'],
  ['missao', 'Missão cumprida'],
]

function tocarSom(c, qual) {
  const t0 = c.currentTime + 0.02
  const saida = c.createGain()
  saida.connect(c.destination)
  if (qual === 'brilho') {
    // faíscas rápidas subindo e um acorde que abre
    saida.gain.value = 0.22
    ;[1046.5, 1174.7, 1318.5, 1568.0, 1760.0, 2093.0].forEach((f, i) => nota(c, saida, f, t0 + i * 0.035, 0.14, [[1, 0.5], [2, 0.12]]))
    ;[1046.5, 1318.5, 1568.0, 2093.0].forEach(f => nota(c, saida, f, t0 + 0.23, 1.1, [[1, 0.35], [2, 0.08]], 'triangle'))
  } else if (qual === 'missao') {
    // duas notas de jogo (Sol → Ré) e um brilho no fim
    saida.gain.value = 0.24
    nota(c, saida, 783.99, t0, 0.12, [[1, 0.8], [2, 0.15]], 'triangle')
    nota(c, saida, 1174.66, t0 + 0.11, 0.7, [[1, 0.8], [2, 0.2], [3, 0.06]], 'triangle')
    nota(c, saida, 2349.3, t0 + 0.2, 0.5, [[1, 0.18]])
  } else {
    // sino: Mi maior subindo, a última nota fica soando
    saida.gain.value = 0.2
    ;[659.25, 830.61, 987.77, 1318.51].forEach((f, i) => nota(c, saida, f, t0 + i * 0.09, i === 3 ? 1.2 : 0.45, [[1, 0.9], [2.01, 0.22], [3.02, 0.08]]))
  }
}

export function tocarConquista(qual) {
  qual = qual || somEscolhido()
  if (qual === '0') return
  try { if (navigator.vibrate) navigator.vibrate([25, 40, 70]) } catch (e) {}
  const c = contexto()
  if (!c) return
  let tocou = false
  const tocar = () => { if (tocou) return; tocou = true; try { tocarSom(c, qual) } catch (e) {} }
  if (c.state === 'running') { tocar(); return }
  c.resume().then(() => { if (c.state === 'running') tocar() }).catch(() => {})
  // som bloqueado até o aluno tocar na tela: sai no primeiro toque
  const noToque = () => {
    document.removeEventListener('pointerdown', noToque, true)
    c.resume().then(tocar).catch(() => {})
  }
  setTimeout(() => { if (!tocou) document.addEventListener('pointerdown', noToque, true) }, 80)
}
