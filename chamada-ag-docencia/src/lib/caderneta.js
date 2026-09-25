/* Caderneta de estação total (irradiação) e o gabarito dela.

   O aluno anota, visada por visada: estação, ponto visado, ângulo horizontal (Hz) e
   distância horizontal (DH). Depois calcula à mão as coordenadas do ponto a determinar
   e do marco de controle e digita o resultado. O app refaz a conta a partir da própria
   caderneta dele. Isso separa duas coisas que a nota misturaria:
     · o CAMPO — o quanto a caderneta fecha no marco de controle (coordenada oficial);
     · a CONTA — o quanto o que ele digitou bate com o que a caderneta dele dá.

   Convenção da caderneta: numa estação, a PRIMEIRA visada é a ré. O Hz das vantes é
   lido no mesmo sentido (horário) e o azimute sai de Az = Az(ré) + Hz(vante) − Hz(ré).
   Quem zera na ré anota 0 00 00 nela, e a fórmula vira a de sala: Az = Az(ré) + Hz. */

import { MARCOS, azimute, grausDMS } from './topo.js'

/* Marcos que valem como estação, ré e controle: os oficiais. Fica de fora o que é só
   referência (Bloco F) e o M0451 antigo, deslocado numa obra — o ponto novo é o M0451A,
   e é justamente ele que a turma determina. O nome vai curto ("PERC", não "PERC (IBGE…)"). */
export const marcosOficiais = () => MARCOS.filter(m => m.tipo !== 'referencia' && m.tipo !== 'deslocado').map(m => ({ nome: m.nome.split(' (')[0], n: m.n, e: m.e }))

// Diferença entre a conta à mão e a do app que ainda é arredondamento, não erro de cálculo.
export const TOL_CALCULO = 0.02   // m
// Fechamento acima disso: a caderneta não fechou no controle, é caso de voltar a campo.
export const TOL_FECHAMENTO = 0.10   // m

export const caderVazia = () => ({ linhas: [{ est: '', pv: '', hz: '', dh: '' }], resultado: { alvo: { n: '', e: '' }, controle: { marco: '', n: '', e: '' } } })

/* Número digitado no celular: aceita vírgula ou ponto decimal e separador de milhar
   ("9.108.742,431", "9108742.431", "9 108 742,431"). */
export function lerNumero(s) {
  let t = String(s ?? '').trim().replace(/\s+/g, '')
  if (!t) return NaN
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.')
  else if (t.includes(',')) t = t.replace(',', '.')
  else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '')
  if (!/^[+-]?\d+(\.\d+)?$/.test(t)) return NaN
  return Number(t)
}

/* Ângulo em graus, minutos e segundos: "123 45 30", "123°45'30\"", "123 45 30,5".
   Um número só, sem minutos, vale graus inteiros ("90"). Número com casa decimal e
   sem minutos é recusado de propósito: "123.4530" é DMS na calculadora e graus
   decimais na planilha, e adivinhar erraria metade da turma. */
export function lerHz(s) {
  const t = String(s ?? '').trim().replace(/,/g, '.')
  if (!t) return NaN
  const partes = t.split(/[^\d.]+/).filter(Boolean)
  if (!partes.length || partes.length > 3) return NaN
  if (partes.length === 1 && partes[0].includes('.')) return NaN
  const [g, m = '0', sg = '0'] = partes
  if (!/^\d+$/.test(g) || !/^\d+$/.test(m) || !/^\d+(\.\d+)?$/.test(sg)) return NaN
  const G = Number(g), M = Number(m), S = Number(sg)
  if (G >= 360 || M >= 60 || S >= 60) return NaN
  return G + M / 60 + S / 3600
}

export const nomeChave = s => String(s || '').trim().toLowerCase()
const norm360 = a => ((a % 360) + 360) % 360

/* Refaz a caderneta. `marcos`: [{ nome, n, e }] com coordenada oficial.
   Devolve, linha a linha, o papel (ré/vante), o azimute e a coordenada calculada;
   os pontos novos; a conferência da ré (DH medida × DH das coordenadas); e cada
   marco conhecido visado como vante (é o fechamento). */
export function calcularCaderneta(cad, marcos) {
  const conhecidos = new Map((marcos || []).map(m => [nomeChave(m.nome), { nome: m.nome, n: m.n, e: m.e }]))
  const calculados = new Map()          // pontos novos: chave → { nome, n, e, az, est }
  const coord = k => conhecidos.get(k) || calculados.get(k) || null
  const linhas = [], problemas = [], controles = [], conferenciasRe = []
  let bloco = null                      // estação ocupada agora: { chave, az0, hz0 } ou { chave, invalida }

  ;(cad?.linhas || []).forEach((l, i) => {
    const n = i + 1
    const est = String(l.est || '').trim(), pv = String(l.pv || '').trim()
    const kEst = nomeChave(est), kPv = nomeChave(pv)
    if (!est && !pv && !String(l.hz || '').trim() && !String(l.dh || '').trim()) return   // linha em branco
    const hz = lerHz(l.hz), dh = lerNumero(l.dh)
    const out = { i, est, pv, hz, dh, papel: null, az: null, n: null, e: null }
    linhas.push(out)
    if (!est || !pv) { problemas.push(`Linha ${n}: falta ${!est ? 'a estação' : 'o ponto visado'}.`); return }
    if (kEst === kPv) { problemas.push(`Linha ${n}: a estação visa ela mesma.`); return }

    const novaEstacao = !bloco || bloco.chave !== kEst
    if (novaEstacao) {
      out.papel = 're'
      const E = coord(kEst), R = coord(kPv)
      bloco = { chave: kEst, invalida: true }
      if (!E) { problemas.push(`Linha ${n}: a estação ${est} não tem coordenada (não é marco conhecido nem foi calculada antes).`); return }
      if (!R) { problemas.push(`Linha ${n}: a ré ${pv} não tem coordenada. A primeira visada de cada estação é a ré, e ela precisa ser um ponto já conhecido.`); return }
      if (!Number.isFinite(hz)) { problemas.push(String(l.hz || '').trim() ? `Linha ${n}: ângulo da ré ilegível ("${l.hz}"). Use graus, minutos e segundos: 0 00 00.` : `Linha ${n}: falta o ângulo da ré (quem zera na ré anota 0 00 00).`); return }
      const az0 = azimute(R.n - E.n, R.e - E.e)
      bloco = { chave: kEst, az0, hz0: hz, E }
      out.az = az0
      if (Number.isFinite(dh)) {
        const dhCoord = Math.hypot(R.n - E.n, R.e - E.e)
        conferenciasRe.push({ linha: n, est: E.nome, re: R.nome, dhMedida: dh, dhCoord, dif: dh - dhCoord })
      }
      return
    }

    out.papel = 'vante'
    if (bloco.invalida) { problemas.push(`Linha ${n}: a estação ${est} ficou sem orientação (veja a ré dela).`); return }
    if (!Number.isFinite(hz)) { problemas.push(String(l.hz || '').trim() ? `Linha ${n}: ângulo ilegível ("${l.hz}"). Use graus, minutos e segundos: 123 45 30.` : `Linha ${n}: falta o ângulo horizontal.`); return }
    if (!Number.isFinite(dh) || dh <= 0) { problemas.push(String(l.dh || '').trim() ? `Linha ${n}: distância horizontal ilegível ("${l.dh}").` : `Linha ${n}: falta a distância horizontal.`); return }
    const az = norm360(bloco.az0 + hz - bloco.hz0)
    const N = bloco.E.n + dh * Math.cos(az * Math.PI / 180), Ecalc = bloco.E.e + dh * Math.sin(az * Math.PI / 180)
    Object.assign(out, { az, n: N, e: Ecalc })
    const K = conhecidos.get(kPv)
    if (K) { controles.push({ linha: n, nome: K.nome, n: N, e: Ecalc, oficial: K, dn: N - K.n, de: Ecalc - K.e, erro: Math.hypot(N - K.n, Ecalc - K.e) }); return }
    const ja = calculados.get(kPv)
    if (ja) { out.repetido = { dn: N - ja.n, de: Ecalc - ja.e, dist: Math.hypot(N - ja.n, Ecalc - ja.e) }; return }   // vale a primeira determinação
    calculados.set(kPv, { nome: pv, n: N, e: Ecalc, az, est: bloco.E.nome })
  })

  return { linhas, pontos: [...calculados.values()], controles, conferenciasRe, problemas }
}

/* Gabarito de uma entrega: o que a caderneta dá × o que a equipe digitou. */
export function gabarito(cad, marcos, alvoNome) {
  const calc = calcularCaderneta(cad, marcos)
  const res = cad?.resultado || {}
  const kAlvo = nomeChave(alvoNome)
  const alvo = calc.pontos.find(p => nomeChave(p.nome) === kAlvo) || null
  const nomeCtrl = String(res.controle?.marco || '').trim()
  // controle: o que a equipe apontou; se não apontou, o último marco conhecido visado
  const ctrl = (nomeCtrl ? calc.controles.filter(c => nomeChave(c.nome) === nomeChave(nomeCtrl)) : calc.controles).slice(-1)[0] || null
  const dig = (o) => { const n = lerNumero(o?.n), e = lerNumero(o?.e); return Number.isFinite(n) && Number.isFinite(e) ? { n, e } : null }
  const conta = (d, g) => d && g ? { dn: d.n - g.n, de: d.e - g.e, dist: Math.hypot(d.n - g.n, d.e - g.e) } : null
  const digAlvo = dig(res.alvo), digCtrl = dig(res.controle)
  const contaAlvo = conta(digAlvo, alvo), contaCtrl = conta(digCtrl, ctrl)
  const contas = [contaAlvo, contaCtrl]
  const calculoConfere = contas.every(c => c && c.dist <= TOL_CALCULO)
  const problemas = [...calc.problemas]
  if (!alvo) problemas.push(`A caderneta não chega ao ${alvoNome}: nenhuma vante com esse nome.`)
  if (!ctrl) problemas.push(nomeCtrl ? `O marco de controle ${nomeCtrl} não aparece como vante na caderneta.` : 'Nenhum marco conhecido foi visado como vante: a caderneta não tem fechamento.')
  if (!digAlvo) problemas.push(`Coordenada do ${alvoNome} não digitada (ou ilegível).`)
  if (!digCtrl) problemas.push('Coordenada do marco de controle não digitada (ou ilegível).')
  return { calc, alvo, ctrl, digAlvo, digCtrl, contaAlvo, contaCtrl, calculoConfere, fechamento: ctrl ? ctrl.erro : null, problemas }
}

/* Medalhas sugeridas entre as unidades (equipes ou alunos) que enviaram.
   Ordem: menor erro de fechamento no controle; empate (até 1 mm) → quem enviou primeiro.
   Só entra no pódio quem tem fechamento e a conta à mão conferindo com a caderneta —
   medalha não premia conta errada que por acaso chegou perto. */
export function sugerirMedalhas(unidades) {
  const NIV = ['ouro', 'prata', 'bronze']
  const aptas = unidades.filter(u => u.enviadaEm && u.gab && u.gab.fechamento != null && u.gab.calculoConfere)
    .sort((a, b) => (Math.round(a.gab.fechamento * 1000) - Math.round(b.gab.fechamento * 1000)) || String(a.enviadaEm).localeCompare(String(b.enviadaEm)))
  const sug = {}
  aptas.forEach((u, i) => { sug[u.id] = { nivel: NIV[i] || null, pos: i + 1 } })
  unidades.forEach(u => {
    if (sug[u.id]) return
    sug[u.id] = { nivel: null, motivo: !u.enviadaEm ? 'não enviou' : !u.gab || u.gab.fechamento == null ? 'sem fechamento no controle' : 'a conta à mão não confere com a caderneta' }
  })
  return sug
}

export const fmtM = (v, casas = 3) => Number.isFinite(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) : '—'
export const fmtCm = v => Number.isFinite(v) ? (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' cm' : '—'
export const fmtAz = a => Number.isFinite(a) ? grausDMS(a) : '—'

/* Texto que vai no envio (é o que a professora já lê na lista de entregas). */
export function resumoTexto(cad, alvoNome, obs) {
  const ls = (cad?.linhas || []).filter(l => l.est || l.pv || l.hz || l.dh)
  const r = cad?.resultado || {}
  const t = ['Caderneta (estação · ponto visado · Hz · DH):',
    ...ls.map((l, i) => `${i + 1}. ${l.est || '?'} → ${l.pv || '?'} · ${l.hz || '?'} · ${l.dh || '?'} m`),
    `${alvoNome}: N ${r.alvo?.n || '?'} · E ${r.alvo?.e || '?'}`,
    `Controle ${r.controle?.marco || '?'}: N ${r.controle?.n || '?'} · E ${r.controle?.e || '?'}`]
  if ((obs || '').trim()) t.push('Observações: ' + obs.trim())
  return t.join('\n')
}
