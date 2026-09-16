/* Som de conquista das insígnias: sai junto com a carta, gerado na hora pelo Web Audio —
   sem arquivo, funciona offline. No Android vibra junto.
   O navegador só libera som depois de um toque na tela: prepararSom() destrava no primeiro
   toque do aluno; se a carta abrir antes disso, o som sai no primeiro toque seguinte.
   O aluno pode trocar ou desligar na coleção (sala de aula com 35 celulares). */

const K_SOM = 'agc2_som_insignias'
let ctx = null

// valor guardado: chave de SONS ou '0' (desligado). Antigo '1' = sino.
// Padrão: sino (decisão dela, 16/09/2026 — "ainda quero mudar").
export const SOM_PADRAO = 'sino'
export const somEscolhido = () => { try { const v = localStorage.getItem(K_SOM); return !v || v === '1' ? SOM_PADRAO : v } catch (e) { return SOM_PADRAO } }
export const somLigado = () => somEscolhido() !== '0'
export const definirSom = v => { try { localStorage.setItem(K_SOM, v === true ? SOM_PADRAO : v === false ? '0' : v) } catch (e) {} }

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
function nota(c, saida, freq, t, dura, parciais, forma = 'sine', ataque = 0.012) {
  parciais.forEach(([mult, vol]) => {
    const o = c.createOscillator(), g = c.createGain()
    o.type = forma
    o.frequency.value = freq * mult
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + ataque)
    g.gain.exponentialRampToValueAtTime(0.0008, t + dura)
    o.connect(g); g.connect(saida)
    o.start(t); o.stop(t + dura + 0.05)
  })
}

function ruido(c, dura) {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dura), c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  return src
}

/* Os três primeiros são os originais. Os quatro "tecnológicos" crescem — volume e altura
   sobem — e resolvem num acorde no fim (pedido dela, 16/09/2026: o sino "não parece
   tecnológico e crescente"). Arquivos para ouvir fora do app em Insígnias/Sons,
   gravados deste mesmo código. */
export const SONS = [
  ['sino', 'Sino'],
  ['brilho', 'Brilho'],
  ['missao', 'Missão cumprida'],
  ['sinal', 'Sinal GPS'],
  ['orbita', 'Órbita'],
  ['radar', 'Radar'],
  ['carga', 'Carga'],
]

// destino e t0 permitem gravar o som num OfflineAudioContext (arquivo idêntico ao do app)
export function tocarSom(c, qual, destino = c.destination, t0 = c.currentTime + 0.02) {
  const saida = c.createGain()
  saida.connect(destino)

  if (qual === 'sinal') {
    // Sinal GPS: bipes que aceleram e sobem, como satélites sendo encontrados, até travar num acorde
    saida.gain.value = 0.22
    const intervalos = [0.2, 0.16, 0.125, 0.1, 0.08, 0.065, 0.052, 0.045]
    let t = t0
    intervalos.forEach((dt, i) => {
      const f = 880 * Math.pow(2, i / intervalos.length)             // sobe uma oitava
      nota(c, saida, f, t, 0.07, [[1, 0.25 + 0.6 * i / intervalos.length]], 'square', 0.004)
      t += dt
    })
    nota(c, saida, 440, t, 0.9, [[1, 0.35]])                           // grave de apoio
    nota(c, saida, 1760, t, 0.9, [[1, 0.55], [1.5, 0.28], [2, 0.12]], 'sine', 0.006)   // trava: quinta aberta
    nota(c, saida, 3520, t + 0.05, 0.5, [[1, 0.1]])
  } else if (qual === 'orbita') {
    // Órbita: um "whoosh" subindo com um acorde que abre o filtro e um brilho digital no topo
    saida.gain.value = 0.25
    const sobe = 1.0
    const r = ruido(c, sobe + 0.2), bp = c.createBiquadFilter(), gr = c.createGain()
    bp.type = 'bandpass'; bp.Q.value = 1.4
    bp.frequency.setValueAtTime(300, t0); bp.frequency.exponentialRampToValueAtTime(5000, t0 + sobe)
    gr.gain.setValueAtTime(0.0001, t0); gr.gain.exponentialRampToValueAtTime(0.35, t0 + sobe); gr.gain.exponentialRampToValueAtTime(0.0001, t0 + sobe + 0.2)
    r.connect(bp); bp.connect(gr); gr.connect(saida); r.start(t0); r.stop(t0 + sobe + 0.2)
    const lp = c.createBiquadFilter(), gp = c.createGain()
    lp.type = 'lowpass'; lp.Q.value = 4
    lp.frequency.setValueAtTime(350, t0); lp.frequency.exponentialRampToValueAtTime(6000, t0 + sobe)
    gp.gain.setValueAtTime(0.0001, t0); gp.gain.exponentialRampToValueAtTime(0.22, t0 + sobe); gp.gain.exponentialRampToValueAtTime(0.0001, t0 + sobe + 0.6)
    lp.connect(gp); gp.connect(saida)
    ;[220, 277.18, 329.63, 440].forEach((f, i) => {
      const o = c.createOscillator()
      o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = [-6, 4, -3, 5][i]
      o.connect(lp); o.start(t0); o.stop(t0 + sobe + 0.65)
    })
    ;[1760, 2217.46, 2637.02, 3520].forEach((f, i) => nota(c, saida, f, t0 + sobe + i * 0.045, 0.5, [[1, 0.35]], 'triangle', 0.004))
  } else if (qual === 'radar') {
    // Radar: pings com eco, cada vez mais perto e mais agudos, e uma subida final
    saida.gain.value = 0.26
    const eco = c.createDelay(0.5), volta = c.createGain(), molhado = c.createGain()
    eco.delayTime.value = 0.085; volta.gain.value = 0.38; molhado.gain.value = 0.5
    eco.connect(volta); volta.connect(eco); eco.connect(molhado); molhado.connect(saida)
    ;[[0, 1046.5, 0.3], [0.3, 1174.66, 0.45], [0.52, 1396.91, 0.62], [0.68, 1567.98, 0.8]].forEach(([dt, f, v]) => {
      const o = c.createOscillator(), g = c.createGain(), t = t0 + dt
      o.type = 'sine'; o.frequency.value = f
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.12)
      o.connect(g); g.connect(saida); g.connect(eco); o.start(t); o.stop(t + 0.15)
    })
    const t = t0 + 0.8, o = c.createOscillator(), g = c.createGain()
    o.type = 'sine'; o.frequency.setValueAtTime(784, t); o.frequency.exponentialRampToValueAtTime(2093, t + 0.25)
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.9)
    o.connect(g); g.connect(saida); o.start(t); o.stop(t + 0.95)
    ;[2093, 2637.02, 3135.96].forEach(f => nota(c, saida, f, t + 0.24, 0.7, [[1, 0.22]]))
  } else if (qual === 'carga') {
    // Carga: um motor que acelera (dente de serra subindo com o filtro abrindo) e estala num acorde brilhante
    saida.gain.value = 0.2
    const sobe = 1.05
    const o = c.createOscillator(), o2 = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain()
    o.type = 'sawtooth'; o2.type = 'triangle'
    o.frequency.setValueAtTime(110, t0); o.frequency.exponentialRampToValueAtTime(880, t0 + sobe)
    o2.frequency.setValueAtTime(220, t0); o2.frequency.exponentialRampToValueAtTime(1760, t0 + sobe)
    lp.type = 'lowpass'; lp.Q.value = 9
    lp.frequency.setValueAtTime(250, t0); lp.frequency.exponentialRampToValueAtTime(7000, t0 + sobe)
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.5, t0 + sobe); g.gain.linearRampToValueAtTime(0.0001, t0 + sobe + 0.04)
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(saida)
    o.start(t0); o2.start(t0); o.stop(t0 + sobe + 0.06); o2.stop(t0 + sobe + 0.06)
    const t = t0 + sobe
    const r = ruido(c, 0.12), hp = c.createBiquadFilter(), gr = c.createGain()
    hp.type = 'highpass'; hp.frequency.value = 3000
    gr.gain.setValueAtTime(0.4, t); gr.gain.exponentialRampToValueAtTime(0.0008, t + 0.1)
    r.connect(hp); hp.connect(gr); gr.connect(saida); r.start(t); r.stop(t + 0.12)
    ;[880, 1108.73, 1318.51, 1760].forEach(f => nota(c, saida, f, t, 0.8, [[1, 0.35], [2, 0.08]], 'square', 0.003))
  } else if (qual === 'brilho') {
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
