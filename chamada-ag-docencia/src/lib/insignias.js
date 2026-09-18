/* Catálogo das insígnias do Orbe (guia de 15/09/2026).
   A regra automática é conferida no servidor (_avaliar_insignias); aqui ficam só nome,
   categoria, texto da regra e a arte. Duas são dadas pela professora. */

/* Cores tiradas da própria arte (paleta de 15/09/2026, depois da inversão dela:
   Primeiros passos virou esmeralda e Altimetria virou rubi). */
export const CATEGORIAS = [
  ['passos', 'Primeiros passos', '#12804A'],
  ['metodo', 'Método de coleta', '#0E8C9E'],
  ['plani', 'Planimetria', '#2749B0'],
  ['alti', 'Altimetria', '#B01B1B'],
  ['missoes', 'Missões', '#B8860B'],
  ['especiais', 'Especiais', '#6B4FA0'],
]

export const INSIGNIAS = [
  { k: 'no_ar', cat: 'passos', nome: 'No ar', regra: 'Instale o Orbe na tela de início do celular.' },
  { k: 'presente', cat: 'passos', nome: 'Presente', regra: 'Marque a primeira presença pelo app, dentro da janela da aula.' },
  { k: 'rosto', cat: 'passos', nome: 'Rosto no radar', regra: 'Envie a sua selfie no app.' },
  { k: 'primeiro_pin', cat: 'passos', nome: 'Primeiro pin', regra: 'Faça a primeira ocupação de 20 segundos.' },
  { k: 'parado', cat: 'metodo', nome: 'Parado de verdade', regra: 'Uma ocupação com 10 leituras ou mais e espalhamento abaixo de 1 m.' },
  { k: 'tres_amb', cat: 'metodo', nome: 'Três ambientes', regra: 'Meça dentro da sala, no corredor e no pátio no mesmo dia.' },
  { k: 'no_marco', cat: 'plani', nome: 'No marco', regra: 'Um pin a menos de 5 m de um marco oficial.' },
  { k: 'na_mosca', cat: 'plani', nome: 'Na mosca', regra: 'Um pin a menos de 3 m de um marco oficial.' },
  { k: 'poligonal', cat: 'plani', nome: 'Poligonal fechada', regra: 'Salve uma poligonal com 3 ou mais vértices, sem lados cruzados.' },
  { k: 'cadastrador', cat: 'plani', nome: 'Cadastrador', regra: 'Cinco pins com foto do ponto.' },
  { k: 'caderneta', cat: 'alti', nome: 'Caderneta fechada', regra: 'Um nivelamento geométrico fechado dentro da tolerância.', daProfessora: true },
  { k: 'primeiro_ouro', cat: 'missoes', nome: 'Primeiro ouro', regra: 'Alcance o nível ouro numa missão.' },
  { k: 'pontual', cat: 'missoes', nome: 'Pontual', regra: 'Três missões seguidas entregues dentro do prazo.' },
  { k: 'volta', cat: 'missoes', nome: 'Volta por cima', regra: 'Uma missão que foi para refazer e depois foi aceita.' },
  { k: 'tres_frentes', cat: 'missoes', nome: 'Três frentes', regra: 'Nível alcançado em missões de planimetria, altimetria e planialtimetria.' },
  { k: 'equipe', cat: 'missoes', nome: 'Equipe em campo', regra: 'Primeira missão em equipe aceita.' },
  { k: 'envio_oficial', cat: 'missoes', nome: 'Envio oficial', regra: 'Faça o envio oficial de uma missão em equipe que foi aceita. Uma vez por aluno.' },
  { k: 'olho', cat: 'especiais', nome: 'Olho de topógrafo', regra: 'Percebeu algo que ninguém tinha visto. A professora concede.', daProfessora: true },
  { k: 'parceiro', cat: 'especiais', nome: 'Parceiro de campo', regra: 'Segurou a equipe numa prática difícil. A professora concede.', daProfessora: true },
]

/* Família Pioneiro (18/09/2026, decisões dela): o primeiro da turma a estrear cada função do Orbe
   ganha a versão ametista (Especiais) com a bandeira marfim — por abrir caminho, não por domínio.
   Automática (servidor, _conferir_pioneiros a cada 5 min); ela pode passar ao próximo.
   Não entram na contagem "x de N": só aparecem para quem ganhou. */
const FUNCOES_SEM_BASE = { avatar: 'Avatar', avisos: 'Avisos', missao: 'Missão enviada' }
export const BASES_PIONEIRO = ['no_ar', 'presente', 'rosto', 'avatar', 'avisos', 'primeiro_pin', 'parado', 'tres_amb', 'no_marco',
  'na_mosca', 'poligonal', 'cadastrador', 'caderneta', 'missao', 'equipe', 'envio_oficial', 'primeiro_ouro', 'tres_frentes']
const nomeFuncao = b => FUNCOES_SEM_BASE[b] || INSIGNIAS.find(i => i.k === b)?.nome || b
export const PIONEIRAS = BASES_PIONEIRO.map(b => ({
  k: 'pioneiro_' + b, base: b, cat: 'especiais', pioneiro: true, nome: 'Pioneiro · ' + nomeFuncao(b),
  regra: 'Primeiro da turma a estrear: ' + nomeFuncao(b) + '.',
}))
export const ehPioneira = k => (k || '').startsWith('pioneiro_')

export const POR_CHAVE = Object.fromEntries([...INSIGNIAS, ...PIONEIRAS].map(i => [i.k, i]))
export const NOME_CAT = Object.fromEntries(CATEGORIAS.map(([k, n]) => [k, n]))
export const COR_CAT = Object.fromEntries(CATEGORIAS.map(([k, , c]) => [k, c]))
export const TOTAL = INSIGNIAS.length
// arte: joias hexagonais (15/09/2026). Equipe em campo e Envio oficial ainda usam o rascunho.
// ARTE_V muda a cada arte nova publicada: o celular guarda a arte por 180 dias (CacheFirst) pelo endereço
const ARTE_V = '2026-09-18'
export const arte = (k, { tam = 128, bloqueada = false } = {}) =>
  `/insignias/${k}${bloqueada && !ehPioneira(k) ? '-bloqueada-128' : '-' + (tam > 128 ? 256 : 128)}.png?v=${ARTE_V}`
