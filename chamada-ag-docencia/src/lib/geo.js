/* Geodésia para uso didático.
   Conversão UTM validada contra a monografia oficial da PERC: reproduz
   N 9.108.688,600 / E 285.059,950 com diferença de 0,000 m. */

// Estação RBMC do IBGE dentro do IFPE Recife, no Bloco A (prédio da reitoria).
// SIRGAS2000, época 2000,4. Sigma de 1 mm em lat/lon.
export const PERC = {
  nome: 'PERC · RECIFE-IFPE',
  lat: -8.05880089,
  lon: -34.95038468,
  utmN: 9108688.600,
  utmE: 285059.950,
  altElip: 12.212,
  sigma: 0.001,
  desde: '13/08/2018'
}

/* Altitude do celular → as duas altitudes (18/09/2026, pedido dela).
   H (altitude ortométrica; "cota" é outra coisa: referência arbitrária) = h (elipsoidal) − N. No campus N ≈ −5,56 m (relatório RTK de 21/01/2023, −5,557 m).
   O navegador não diz qual altitude entrega. Pelos dados do campus: Android dá a elipsoidal (mediana 6,3 m)
   e iPhone já dá a ortométrica (mediana 11,7 m) — diferença ≈ N. Conferir com a altitude ortométrica do M0452. */
export const N_GEOIDE = -5.56
export const EH_IOS = typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1))
export function altitudes(alt, ios = EH_IOS) {
  if (alt == null || !isFinite(alt)) return null
  return ios ? { h: alt + N_GEOIDE, H: alt, veio: 'ortométrica' } : { h: alt, H: alt - N_GEOIDE, veio: 'elipsoidal' }
}

// Marco levantado mais próximo do Bloco F (rede do campus, 2023)
export const M0452 = { nome: 'M0452', utmN: 9108720.996, utmE: 284958.028 }

/* --- SIRGAS2000 / UTM fuso 25 S · elipsoide GRS80 · MC -33° --- */
const A = 6378137.0
const INV_F = 298.2572221
const F = 1 / INV_F
const E2 = F * (2 - F)
const K0 = 0.9996
const FALSO_E = 500000.0
const FALSO_N = 10000000.0
const MC = -33.0

export function paraUTM25S(lat, lon) {
  const la = (lat * Math.PI) / 180
  const lo = (lon * Math.PI) / 180
  const l0 = (MC * Math.PI) / 180

  const N = A / Math.sqrt(1 - E2 * Math.sin(la) ** 2)
  const T = Math.tan(la) ** 2
  const ep2 = E2 / (1 - E2)
  const C = ep2 * Math.cos(la) ** 2
  const a1 = (lo - l0) * Math.cos(la)

  const M = A * (
    (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256) * la -
    ((3 * E2) / 8 + (3 * E2 ** 2) / 32 + (45 * E2 ** 3) / 1024) * Math.sin(2 * la) +
    ((15 * E2 ** 2) / 256 + (45 * E2 ** 3) / 1024) * Math.sin(4 * la) -
    ((35 * E2 ** 3) / 3072) * Math.sin(6 * la)
  )

  const E = FALSO_E + K0 * N * (
    a1 + ((1 - T + C) * a1 ** 3) / 6 +
    ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * a1 ** 5) / 120
  )

  let Nn = K0 * (M + N * Math.tan(la) * (
    (a1 * a1) / 2 + ((5 - T + 9 * C + 4 * C * C) * a1 ** 4) / 24 +
    ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * a1 ** 6) / 720
  ))
  if (lat < 0) Nn += FALSO_N

  return { n: Nn, e: E }
}

/* Inversa da UTM 25 S (SIRGAS2000/GRS80): N, E em metros -> lat, lon em graus.
   Séries de Snyder; erro submilimétrico no campus. Usada para colocar tiles de
   mapa (Web Mercator) por baixo da planta. */
export function deUTM25S(n, e) {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, lon0 = -33 * Math.PI / 180
  const e2 = 2 * f - f * f, ep2 = e2 / (1 - e2)
  const M = (n - 10000000) / k0
  const mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256))
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu)
  const s1 = Math.sin(phi1), c1 = Math.cos(phi1), t1 = Math.tan(phi1)
  const C1 = ep2 * c1 * c1, T1 = t1 * t1
  const N1 = a / Math.sqrt(1 - e2 * s1 * s1), R1 = a * (1 - e2) / Math.pow(1 - e2 * s1 * s1, 1.5)
  const D = (e - 500000) / (N1 * k0)
  const lat = phi1 - (N1 * t1 / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720)
  const lon = lon0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / c1
  return { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI }
}

export function distanciaUTM(n1, e1, n2, e2) {
  return Math.hypot(n1 - n2, e1 - e2)
}

/* --- formatação --- */
export function grausMinSeg(v, ehLat) {
  const sinal = v < 0 ? (ehLat ? 'S' : 'W') : (ehLat ? 'N' : 'E')
  const abs = Math.abs(v)
  const g = Math.floor(abs)
  const m = Math.floor((abs - g) * 60)
  const s = ((abs - g) * 60 - m) * 60
  return `${g}° ${String(m).padStart(2, '0')}' ${s.toFixed(2).padStart(5, '0')}" ${sinal}`
}

export function metros(v, casas = 1) {
  if (v == null || !isFinite(v)) return '—'
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

// Quantas vezes o erro do celular é maior que o da estação do IBGE.
// É o número que resume a aula inteira.
export function vezesPiorQuePerc(acuracia) {
  if (!acuracia || !isFinite(acuracia)) return null
  return Math.round(acuracia / PERC.sigma)
}
