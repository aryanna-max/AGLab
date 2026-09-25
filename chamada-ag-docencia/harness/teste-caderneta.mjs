/* Teste do gabarito da caderneta. Roda com:
   npx esbuild harness/teste-caderneta.mjs --bundle --platform=node --format=esm --outfile=/tmp/t.mjs && node /tmp/t.mjs
   Monta uma caderneta sintética a partir de coordenadas conhecidas (Hz ao segundo, DH ao mm),
   e confere que o app devolve as coordenadas de volta, mede o fechamento e a conta à mão. */
import { MARCOS, azimute } from '../src/lib/topo.js'
import { lerHz, lerNumero, calcularCaderneta, gabarito, sugerirMedalhas, marcosOficiais, partesHz, juntarHz, sugerirVirgula } from '../src/lib/caderneta.js'

let falhas = 0
const ok = (cond, msg) => { console.log((cond ? '  ok  ' : '  FALHOU ') + msg); if (!cond) falhas++ }
const perto = (a, b, tol) => Math.abs(a - b) <= tol

// ---------- leitura dos números ----------
ok(perto(lerHz('123 45 30'), 123.758333, 1e-6), 'Hz "123 45 30"')
ok(perto(lerHz('123°45\'30"'), 123.758333, 1e-6), 'Hz com símbolos')
ok(perto(lerHz('0 00 00'), 0, 1e-12), 'Hz zero na ré')
ok(perto(lerHz('359 59 59,5'), 359.999861, 1e-6), 'Hz com segundo decimal (vírgula)')
ok(perto(lerHz('90'), 90, 1e-12), 'Hz só graus inteiros')
ok(Number.isNaN(lerHz('123.4530')), 'Hz "123.4530" recusado (ambíguo)')
ok(Number.isNaN(lerHz('123 75 00')), 'Hz com 75 minutos recusado')
ok(Number.isNaN(lerHz('400 00 00')), 'Hz acima de 360 recusado')
ok(lerNumero('9.108.742,431') === 9108742.431, 'número com milhar e vírgula')
ok(lerNumero('9108742.431') === 9108742.431, 'número com ponto')
ok(lerNumero('9 108 742,431') === 9108742.431, 'número com espaços')
ok(lerNumero('12,5') === 12.5, 'DH com vírgula')
ok(Number.isNaN(lerNumero('12,5m')), 'DH com letra recusada')

// ---------- ângulo em três caixas ----------
ok(JSON.stringify(partesHz('123 45 30')) === '["123","45","30"]', 'texto antigo "123 45 30" abre separado nas caixas')
ok(JSON.stringify(partesHz('123°45\'30,5"')) === '["123","45","30,5"]', 'texto com símbolos abre nas caixas')
ok(JSON.stringify(partesHz('')) === '["","",""]', 'vazio abre vazio')
ok(juntarHz(['123', '', '30']) === '123 00 30' && perto(lerHz(juntarHz(['123', '', '30'])), 123.008333, 1e-6), 'minuto em branco vira 00 (não lê 123°30\')')
ok(juntarHz(['0', '0', '0']) === '0 0 0' && lerHz(juntarHz(['0', '0', '0'])) === 0, 'ré zerada')
ok(juntarHz(['', '', '']) === '', 'caixas vazias gravam vazio')
ok(Number.isNaN(lerHz(juntarHz(partesHz('123.4530')))), 'o ambíguo "123.4530" continua marcado como inválido')
ok(Number.isNaN(lerHz(juntarHz(['123', '75', '00']))), '75 minutos marcado como inválido')

// ---------- caderneta sintética ----------
const marcos = marcosOficiais()
const P = n => marcos.find(m => m.nome === n)
const M52 = P('M0452'), M55 = P('M0455'), M53 = P('M0453')
const E1 = { nome: 'E1', n: 9108700.000, e: 284990.000 }
const ALVO = { nome: 'M0451A', n: 9108742.430, e: 284996.470 }
const dms = a => { let s = Math.round(((a % 360) + 360) % 360 * 3600); const g = Math.floor(s / 3600); s -= g * 3600; const m = Math.floor(s / 60); s -= m * 60; return `${g} ${String(m).padStart(2, '0')} ${String(s).padStart(2, '0')}` }
const az = (a, b) => azimute(b.n - a.n, b.e - a.e)
const dh = (a, b) => Math.hypot(b.n - a.n, b.e - a.e).toFixed(3)
const visada = (est, re, pv, hzRe = 0) => ({ est: est.nome, pv: pv.nome, hz: dms(hzRe + az(est, pv) - az(est, re)), dh: dh(est, pv) })

// estação M0452 com ré no M0455 (zerada), irradia E1 e o M0451A; estação E1 com ré no M0452 (Hz 90° na ré) fecha no M0453
const linhas = [
  { ...visada(M52, M55, M55), hz: '0 00 00' },
  visada(M52, M55, E1),
  visada(M52, M55, ALVO),
  { ...visada(E1, M52, M52, 90), hz: '90 00 00' },
  visada(E1, M52, M53, 90)
]
const cad = { linhas, resultado: { alvo: { n: '9108742,43', e: '284996,47' }, controle: { marco: 'M0453', n: String(M53.n).replace('.', ','), e: String(M53.e).replace('.', ',') } } }
const c = calcularCaderneta(cad, marcos)
ok(c.problemas.length === 0, 'caderneta limpa não aponta problema ' + JSON.stringify(c.problemas))
ok(c.linhas[0].papel === 're' && c.linhas[1].papel === 'vante' && c.linhas[3].papel === 're', 'primeira visada de cada estação é a ré')
const alvoCalc = c.pontos.find(p => p.nome === 'M0451A')
ok(alvoCalc && perto(alvoCalc.n, ALVO.n, 0.002) && perto(alvoCalc.e, ALVO.e, 0.002), `M0451A recalculado: ${alvoCalc?.n.toFixed(3)} ${alvoCalc?.e.toFixed(3)}`)
ok(c.controles.length === 1 && c.controles[0].erro < 0.003, `fechamento no M0453 ~ 0 (${(c.controles[0]?.erro * 1000).toFixed(1)} mm)`)
ok(c.conferenciasRe.every(r => Math.abs(r.dif) < 0.001), 'conferência da ré: DH medida = DH das coordenadas')

const g = gabarito(cad, marcos, 'M0451A')
ok(g.calculoConfere, 'conta à mão confere (digitou o que a caderneta dá)')
ok(g.problemas.length === 0, 'gabarito sem problema ' + JSON.stringify(g.problemas))

// erro de campo: DH do M0453 medida 5 cm a mais → fechamento ~5 cm, a conta continua conferindo se ele digitar o que deu
const cadCampo = JSON.parse(JSON.stringify(cad))
cadCampo.linhas[4].dh = (Number(cadCampo.linhas[4].dh) + 0.05).toFixed(3)
const gc0 = gabarito(cadCampo, marcos, 'M0451A')
cadCampo.resultado.controle.n = gc0.ctrl.n.toFixed(3); cadCampo.resultado.controle.e = gc0.ctrl.e.toFixed(3)
const gc = gabarito(cadCampo, marcos, 'M0451A')
ok(perto(gc.fechamento, 0.05, 0.003), `erro de campo aparece no fechamento (${(gc.fechamento * 100).toFixed(1)} cm)`)
ok(gc.calculoConfere, 'erro de campo não vira erro de conta')

// erro de conta: digitou o M0451A 30 cm fora
const cadConta = JSON.parse(JSON.stringify(cad))
cadConta.resultado.alvo.n = String(ALVO.n + 0.30)
const gt = gabarito(cadConta, marcos, 'M0451A')
ok(!gt.calculoConfere && perto(gt.contaAlvo.dist, 0.30, 0.003), 'conta errada é pega (30 cm no M0451A)')

// ré com ângulo em branco = zerada: mesma resposta que anotando 0 00 00
const cadBranco = JSON.parse(JSON.stringify(cad)); cadBranco.linhas[0].hz = ''
const gb = gabarito(cadBranco, marcos, 'M0451A')
ok(gb.problemas.length === 0 && perto(gb.alvo.n, g.alvo.n, 1e-9) && perto(gb.alvo.e, g.alvo.e, 1e-9), 'ré em branco vale 0° 00\' 00" (mesmo M0451A)')
const cadVanteBranco = JSON.parse(JSON.stringify(cad)); cadVanteBranco.linhas[2].hz = ''
ok(calcularCaderneta(cadVanteBranco, marcos).problemas.some(p => p.includes('Linha 3: falta o ângulo')), 'vante em branco continua acusada')

// distância sem vírgula (caso real da Equipe 3, 25/09)
ok(sugerirVirgula('132838') === '132,838' && sugerirVirgula('43817') === '43,817', 'sugere a vírgula nos milímetros')
ok(sugerirVirgula('132,838') === null && sugerirVirgula('999') === null && sugerirVirgula('') === null, 'não sugere quando já está certo')
const cadSemVirgula = JSON.parse(JSON.stringify(cad)); cadSemVirgula.linhas[2].dh = cadSemVirgula.linhas[2].dh.replace('.', '').replace(',', ''); cadSemVirgula.linhas[0].dh = '132838'
const csv = calcularCaderneta(cadSemVirgula, marcos)
ok(csv.problemas.some(p => p.includes('Linha 3') && p.includes('faltou a vírgula')) && !csv.pontos.some(p => p.nome === 'M0451A'), 'vante sem vírgula é acusada e não vira coordenada a km')
ok(csv.problemas.some(p => p.includes('Linha 1') && p.includes('(132,838 m)')) && !csv.conferenciasRe.some(r => r.linha === 1), 'ré sem vírgula é acusada e fica fora da conferência')

// ré que não é ponto conhecido
const cadRe = { linhas: [{ est: 'M0452', pv: 'X9', hz: '0 00 00', dh: '10' }, { est: 'M0452', pv: 'M0451A', hz: '10 00 00', dh: '20' }], resultado: {} }
const gr = calcularCaderneta(cadRe, marcos)
ok(gr.problemas.some(p => p.includes('ré X9')), 'ré sem coordenada é apontada')

// medalhas: menor fechamento ganha; conta errada fica fora; empate vai para quem enviou primeiro
const sug = sugerirMedalhas([
  { id: 'A', enviadaEm: '2026-10-02T15:00:00Z', gab: gc },    // 5 cm
  { id: 'B', enviadaEm: '2026-10-02T16:00:00Z', gab: g },     // ~0
  { id: 'C', enviadaEm: '2026-10-02T14:00:00Z', gab: gt },    // conta errada
  { id: 'D', enviadaEm: null, gab: g }
])
ok(sug.B.nivel === 'ouro' && sug.A.nivel === 'prata', 'ouro para o menor fechamento, prata para o seguinte')
ok(sug.C.nivel === null && sug.C.motivo.includes('conta'), 'conta errada não entra no pódio')
ok(sug.D.nivel === null && sug.D.motivo === 'não enviou', 'quem não enviou fica fora')
const emp = sugerirMedalhas([{ id: 'X', enviadaEm: '2026-10-02T16:00:00Z', gab: g }, { id: 'Y', enviadaEm: '2026-10-02T15:00:00Z', gab: g }])
ok(emp.Y.nivel === 'ouro' && emp.X.nivel === 'prata', 'empate: quem enviou primeiro fica à frente')

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.')
process.exit(falhas ? 1 : 0)
