// Cadernetas de exemplo para o harness: três equipes do Transporte de Coordenadas.
// Equipe 1 fecha bem; Equipe 2 tem 4 cm de erro de campo; Equipe 3 errou a conta do M0451A.
import { MARCOS, azimute } from '../src/lib/topo.js'

const P = n => MARCOS.find(m => m.nome === n)
const M52 = P('M0452'), M55 = P('M0455'), M53 = P('M0453')
const E1 = { nome: 'E1', n: 9108700.000, e: 284990.000 }
const ALVO = { nome: 'M0451A', n: 9108742.430, e: 284996.470 }
const dms = a => { let s = Math.round(((a % 360) + 360) % 360 * 3600); const g = Math.floor(s / 3600); s -= g * 3600; const m = Math.floor(s / 60); s -= m * 60; return `${g} ${String(m).padStart(2, '0')} ${String(s).padStart(2, '0')}` }
const az = (a, b) => azimute(b.n - a.n, b.e - a.e)
const dh = (a, b, erro = 0) => (Math.hypot(b.n - a.n, b.e - a.e) + erro).toFixed(3).replace('.', ',')
const v = (est, re, pv, hzRe = 0, erro = 0) => ({ est: est.nome, pv: pv.nome, hz: dms(hzRe + az(est, pv) - az(est, re)), dh: dh(est, pv, erro) })
const br = x => x.toFixed(3).replace('.', ',')

function cad(erroCampo, erroConta) {
  const linhas = [v(M52, M55, M55), v(M52, M55, E1), v(M52, M55, ALVO), v(E1, M52, M52, 90), v(E1, M52, M53, 90, erroCampo)]
  // o controle "calculado" que a equipe digita: onde a caderneta dela leva
  const d = Math.hypot(M53.n - E1.n, M53.e - E1.e) + erroCampo, a = az(E1, M53) * Math.PI / 180
  return { linhas, resultado: { alvo: { n: br(ALVO.n + erroConta), e: br(ALVO.e) }, controle: { marco: 'M0453', n: br(E1.n + d * Math.cos(a)), e: br(E1.e + d * Math.sin(a)) } } }
}
export const CAD_EQ1 = cad(0, 0)
export const CAD_EQ2 = cad(0.04, 0)
export const CAD_EQ3 = cad(0, 0.30)
export const CAD_PARCIAL = { linhas: [{ est: 'M0452', pv: 'M0455', hz: '0 00 00', dh: '99,98' }, { est: 'M0452', pv: 'M0451A', hz: '', dh: '' }], resultado: { alvo: { n: '', e: '' }, controle: { marco: '', n: '', e: '' } } }
