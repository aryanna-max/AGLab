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
  { k: 'primeira_foto', cat: 'passos', nome: 'Primeira foto', regra: 'O primeiro pin seu com foto do ponto.', surpresa: true },
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
  { k: 'bandeira', cat: 'especiais', nome: 'Bandeira fincada', regra: 'O primeiro pin com foto do ponto da turma inteira. Uma vez por turma.', surpresa: true },
]

/* Insígnia de surpresa (surpresa: true): some da coleção do aluno enquanto ele não ganha,
   e a regra nunca fica à vista. Ela vale justamente por ter sido feita sem ninguém pedir —
   e uma regra escrita na tela já seria o pedido. A professora continua vendo todas. */

export const POR_CHAVE = Object.fromEntries(INSIGNIAS.map(i => [i.k, i]))
export const NOME_CAT = Object.fromEntries(CATEGORIAS.map(([k, n]) => [k, n]))
export const COR_CAT = Object.fromEntries(CATEGORIAS.map(([k, , c]) => [k, c]))
export const TOTAL = INSIGNIAS.length
// o que o aluno pode ver: as de surpresa só entram depois de ganhas (inclusive na conta "X de N")
export const visiveisParaAluno = ganhas => INSIGNIAS.filter(i => !i.surpresa || ganhas.has(i.k))
export const totalParaAluno = ganhas => visiveisParaAluno(ganhas).length
// arte: joias hexagonais (15/09/2026). Equipe em campo e Envio oficial ainda usam o rascunho.
// Primeira foto e Bandeira fincada entraram em 21/09/2026; a bloqueada delas saiu de
// scripts/bloquear-insignia.py, com a mesma receita das antigas.
export const arte = (k, { tam = 128, bloqueada = false } = {}) =>
  `/insignias/${k}${bloqueada ? '-bloqueada-128' : '-' + (tam > 128 ? 256 : 128)}.png`
