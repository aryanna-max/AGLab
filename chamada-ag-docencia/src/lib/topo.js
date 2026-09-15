/* Cálculo topográfico sobre coordenadas UTM (SIRGAS2000 / 25 S).
   Tudo aqui trabalha em metros no plano; o erro de escala do UTM no campus
   (~0,99983) fica abaixo do erro do celular e é ignorado de propósito. */

import { PERC, M0452 } from './geo'

// Marcos conhecidos do campus (levantamento RTK de 21/01/2023, base na PERC) + PERC + Bloco F.
// Os valores UTM vêm do LS7_ifpe.html; os nomes com pessoa são marcos da rede local.
export const MARCOS = [
  { nome: 'PERC (IBGE, Bloco A)', n: PERC.utmN, e: PERC.utmE, sigma: 0.001, tipo: 'rbmc' },
  /* M0451 foi removido numa obra e reimplantado em outro lugar (informação da professora, 15/09/2026).
     A coordenada oficial de 2023 (N 9108752,854 · E 284999,577) NÃO vale mais. Esta é PROVISÓRIA:
     mediana de 16 ocupações válidas e não suspeitas (15 alunos) em 12/09/2026, deslocada 10,9 m a 197° da antiga; o mesmo
     método errou 1,9 m no M0452 (controle). Substituir pela medição RTK quando ela fizer. */
  { nome: 'M0451', n: 9108742.43, e: 284996.47, sigma: 2.5, tipo: 'provisorio', antigo: { n: 9108752.854, e: 284999.577 }, nota: 'reimplantado em obra — coordenada provisória: mediana de 16 ocupações válidas e não suspeitas (12/09/2026); aguarda RTK' },
  { nome: 'M0452', n: 9108720.996, e: 284958.028, sigma: 0.02, tipo: 'marco' },
  { nome: 'M0453', n: 9108603.791, e: 284922.902, sigma: 0.03, tipo: 'marco' },
  { nome: 'M0454', n: 9108580.430, e: 284976.942, sigma: 0.02, tipo: 'marco' },
  { nome: 'M0455', n: 9108647.814, e: 285012.322, sigma: 0.02, tipo: 'marco' },
  { nome: 'M0456', n: 9108493.432, e: 285116.812, sigma: 0.02, tipo: 'marco' },
  { nome: 'M0457', n: 9108619.453, e: 285173.019, sigma: 0.02, tipo: 'marco' },
  { nome: 'aramis', n: 9108590.226, e: 284919.799, sigma: 0.02, tipo: 'marco' },
  { nome: 'messias', n: 9108599.264, e: 284904.690, sigma: 0.02, tipo: 'marco' },
  { nome: 'sergio', n: 9108608.368, e: 284881.125, sigma: 0.02, tipo: 'marco' },
  { nome: 'aryana', n: 9108617.181, e: 284853.860, sigma: 0.02, tipo: 'marco' },
  { nome: 'M2', n: 9108586.210, e: 284839.346, sigma: 0.02, tipo: 'marco' },
  { nome: 'rejane', n: 9108562.241, e: 284911.353, sigma: 0.02, tipo: 'marco' },
  { nome: 'Bloco F (salas)', n: 9108692.6, e: 284965.3, sigma: 25, tipo: 'referencia' }
]

export function marcoPorNome(nome) {
  const k = String(nome || '').trim().toLowerCase()
  return MARCOS.find(m => m.nome.toLowerCase() === k || m.nome.toLowerCase().split(' ')[0] === k) || null
}

// Azimute topográfico: 0° = norte, sentido horário, em graus [0, 360)
export function azimute(dN, dE) {
  let a = (Math.atan2(dE, dN) * 180) / Math.PI
  if (a < 0) a += 360
  return a
}
export function grausDMS(a) {
  const g = Math.floor(a), m = Math.floor((a - g) * 60), s = Math.round(((a - g) * 60 - m) * 60)
  return `${g}° ${String(m).padStart(2, '0')}' ${String(s).padStart(2, '0')}"`
}
/* Rumo em quadrante: N 45° 30' E, S 20° 00' O… — a forma tradicional da caderneta. */
export function rumo(az) {
  const a = ((az % 360) + 360) % 360
  if (a <= 90) return `N ${grausDMS(a)} E`
  if (a <= 180) return `S ${grausDMS(180 - a)} E`
  if (a <= 270) return `S ${grausDMS(a - 180)} O`
  return `N ${grausDMS(360 - a)} O`
}
export function pontoCardeal(a) {
  const r = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO']
  return r[Math.round(a / 45) % 8]
}

// Ocupação: média e desvio-padrão (precisão) de N leituras em UTM
export function resumirOcupacao(leituras) {
  const n = leituras.length
  if (!n) return null
  const mN = leituras.reduce((s, l) => s + l.utmN, 0) / n
  const mE = leituras.reduce((s, l) => s + l.utmE, 0) / n
  const mLat = leituras.reduce((s, l) => s + l.lat, 0) / n
  const mLon = leituras.reduce((s, l) => s + l.lon, 0) / n
  const alts = leituras.filter(l => l.alt != null)
  const mAlt = alts.length ? alts.reduce((s, l) => s + l.alt, 0) / alts.length : null
  const accs = leituras.filter(l => l.acc != null)
  const mAcc = accs.length ? accs.reduce((s, l) => s + l.acc, 0) / accs.length : null
  const sd = f => n > 1 ? Math.sqrt(leituras.reduce((s, l) => s + (f(l) - (f === (x => x.utmN) ? mN : mE)) ** 2, 0) / (n - 1)) : 0
  const dN = n > 1 ? Math.sqrt(leituras.reduce((s, l) => s + (l.utmN - mN) ** 2, 0) / (n - 1)) : 0
  const dE = n > 1 ? Math.sqrt(leituras.reduce((s, l) => s + (l.utmE - mE) ** 2, 0) / (n - 1)) : 0
  return { n, utmN: mN, utmE: mE, lat: mLat, lon: mLon, alt: mAlt, acc: mAcc, desvioN: dN, desvioE: dE, desvioHz: Math.hypot(dN, dE) }
}

// Poligonal fechada por uma lista ordenada de pontos {nome, n, e}
/* Dois segmentos (a,b) e (c,d) se cruzam? (orientação com produto vetorial) */
function cruzam(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q.e - p.e) * (r.n - p.n) - (q.n - p.n) * (r.e - p.e))
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b) && o(a, b, c) !== 0 && o(c, d, a) !== 0
}
/* Poligonal com lados não adjacentes se cruzando ("laço"): a área de Gauss não vale. */
export function seCruza(pts) {
  const k = pts.length
  for (let i = 0; i < k; i++) for (let j = i + 2; j < k; j++) {
    if (i === 0 && j === k - 1) continue   // último lado é adjacente ao primeiro
    if (cruzam(pts[i], pts[(i + 1) % k], pts[j], pts[(j + 1) % k])) return true
  }
  return false
}
/* Reordena os vértices em volta do centro (sentido horário a partir do norte): dá a
   poligonal simples para figuras convexas — o caso dos marcos do campus. */
export function ordenarPorAngulo(pts) {
  const cN = pts.reduce((s, p) => s + p.n, 0) / pts.length, cE = pts.reduce((s, p) => s + p.e, 0) / pts.length
  return pts.slice().sort((a, b) => Math.atan2(a.e - cE, a.n - cN) - Math.atan2(b.e - cE, b.n - cN))
}

export function calcularPoligonal(pts) {
  const k = pts.length
  if (k < 3) return null
  const lados = []
  for (let i = 0; i < k; i++) {
    const a = pts[i], b = pts[(i + 1) % k]
    const dN = b.n - a.n, dE = b.e - a.e
    lados.push({ de: a.nome, para: b.nome, dist: Math.hypot(dN, dE), azimute: azimute(dN, dE) })
  }
  const perimetro = lados.reduce((s, l) => s + l.dist, 0)
  // área pela fórmula de Gauss (shoelace)
  let s2 = 0
  for (let i = 0; i < k; i++) { const a = pts[i], b = pts[(i + 1) % k]; s2 += a.e * b.n - b.e * a.n }
  const area = Math.abs(s2) / 2
  const sentido = s2 > 0 ? 'anti-horário' : 'horário'
  // ângulos internos: entre o lado que chega e o que sai
  const angulos = pts.map((p, i) => {
    const prev = pts[(i - 1 + k) % k], next = pts[(i + 1) % k]
    const a1 = Math.atan2(prev.e - p.e, prev.n - p.n), a2 = Math.atan2(next.e - p.e, next.n - p.n)
    let d = ((a2 - a1) * 180) / Math.PI; d = ((d % 360) + 360) % 360
    if (sentido === 'horário') d = 360 - d
    return { vertice: p.nome, interno: d }
  })
  const somaAngulos = angulos.reduce((s, a) => s + a.interno, 0)
  const somaTeorica = (k - 2) * 180
  return { vertices: k, lados, perimetro, area, sentido, angulos, somaAngulos, somaTeorica, erroAngular: somaAngulos - somaTeorica, cruzada: seCruza(pts) }
}

// Compara uma poligonal medida com a verdadeira (mesmos nomes de marcos)
export function compararComMarcos(pts) {
  const pares = pts.map(p => ({ p, m: marcoPorNome(p.nome) })).filter(x => x.m && x.m.tipo !== 'referencia')
  if (pares.length < pts.length) return null
  const verdadeira = calcularPoligonal(pares.map(x => ({ nome: x.m.nome, n: x.m.n, e: x.m.e })))
  const medida = calcularPoligonal(pts)
  const errosVertice = pares.map(x => ({ vertice: x.p.nome, erro: Math.hypot(x.p.n - x.m.n, x.p.e - x.m.e),
    dN: x.p.n - x.m.n, dE: x.p.e - x.m.e }))
  return {
    errosVertice,
    erroMedioVertice: errosVertice.reduce((s, v) => s + v.erro, 0) / errosVertice.length,
    perimetro: { medido: medida.perimetro, real: verdadeira.perimetro, erroPct: ((medida.perimetro - verdadeira.perimetro) / verdadeira.perimetro) * 100 },
    area: { medida: medida.area, real: verdadeira.area, erroPct: ((medida.area - verdadeira.area) / verdadeira.area) * 100 }
  }
}
