// Mock do store para renderizar a tela da professora sem login.
const T1 = 'turma-edif', T2 = 'turma-f61'
const alunos = (tid, n) => Array.from({ length: n }, (_, i) => ({ id: tid + '-a' + i, turma_id: tid, nome: 'Aluno ' + (i + 1) + ' Sobrenome', matricula: '2023' + i }))
const turmas = [
  { id: T1, nome: 'Edificações — A32RC (2026.2)', codigo: 'edif_a32rc_2026_2', alunos: alunos(T1, 33) },
  { id: T2, nome: 'Saneamento Integrado — F61RC (2026.2)', codigo: 'san_integ_f61rc_2026_2', alunos: alunos(T2, 19) },
]
const agora = new Date().toISOString()
const sess = { id: 's1', codigo: 'F61GPS', aberta: true, criada_em: agora, expira_em: agora, tempo: 'ensolarado', chamada_id: 'c1', janela_inicio: agora, janela_fim: agora, local: 'sala' }
const leit = Array.from({ length: 40 }, (_, i) => ({ id: 'l' + i, rotulo: ['sala', 'corredor', 'patio'][i % 3], lat: -8.0587 + i * 1e-5, lon: -34.9512 + i * 1e-5, acuracia_m: 5 + i, altitude_m: 10, alt_acuracia_m: 20, utm_n: 9108692 + i, utm_e: 284965 + i, dist_perc_m: 95, ttff_ms: 3000, criado_em: agora, capturado_em: agora, online_na_captura: true, presenca_marcada: i % 2 === 0, sessao_id: 's1', extra: i % 5 === 0 ? { chamada: true, plataforma: 'iOS' } : { plataforma: 'Android' }, aluno_id: T2 + '-a' + (i % 19), alunos: { nome: 'Aluno ' + (i % 19 + 1), matricula: '2023' + (i % 19), turma_id: T2 } }))
const mkPin = (id, nome, n, e, al) => ({ id, nome, lat: 0, lon: 0, utm_n: n, utm_e: e, altitude_m: 10, n_leituras: 12, acuracia_media_m: 6, desvio_n_m: 1.2, desvio_e_m: 0.8, marco_ref: /^M0/.test(nome) ? nome : null, tem_foto: false, sessao_id: 's1', criado_em: agora, aluno_id: T2 + '-a' + al, alunos: { nome: 'Aluno ' + (al + 1), matricula: '2023' + al, turma_id: T2 } })
const pins = [mkPin('p1', 'M0451', 9108742.923, 284999.477, 1), mkPin('p2', 'A', 9108716.767, 284989.427, 1), mkPin('p3', 'M0452', 9108718.897, 284960.406, 1), mkPin('p4', 'B', 9108740.061, 284973.009, 1),
  mkPin('p5', 'M0451', 9108741.7, 284997.5, 2), mkPin('p6', 'M0452', 9108720.8, 284958.0, 2), mkPin('p7', 'B', 9108744.2, 284974.3, 2)]
const polis = [
  { id: 'q1', nome: 'Poligonal M0451-M0452-A-B', pin_ids: ['p1', 'p3', 'p2', 'p4'], resultado: { vertices: 4, perimetro: 130.1, area: 58 }, criado_em: agora, aluno_id: T2 + '-a1', alunos: { nome: 'Aluno 2' } },
  { id: 'q2', nome: 'Poligonal M0451-B-M0452', pin_ids: ['p5', 'p7', 'p6'], resultado: { vertices: 3, perimetro: 91, area: 300 }, criado_em: agora, aluno_id: T2 + '-a2', alunos: { nome: 'Aluno 3' } },
]
// auxiliar do dia: guarda o acesso em memória para dar para brincar com liberar/encerrar
let acessoAux = null
const hojeMock = () => new Date().toISOString().slice(0, 10)

const especificos = {
  acessoAuxiliarHoje: async tid => (acessoAux && acessoAux.turma_id === tid) ? acessoAux : null,
  liberarAuxiliar: async (tid, alunoId) => {
    const t = turmas.find(x => x.id === tid), a = (t?.alunos || []).find(x => x.id === alunoId)
    acessoAux = { id: 'ax1', turma_id: tid, aluno_id: alunoId, data: hojeMock(), pin: '135790',
                  expira_em: new Date(Date.now() + 8 * 3600000).toISOString(), revogado: false, usado_em: null, tentativas: 0 }
    return { ok: true, pin: '135790', nome: a?.nome || '(mock)', data: acessoAux.data, expira_em: acessoAux.expira_em }
  },
  revogarAuxiliar: async () => { acessoAux = null },
  listarMissoes: async () => [{ id: 'm1', titulo: 'Caça ao azimute', frente: 'planimetria', etapas: ['a','b','c'], entrega: 'Distância ao ponto certo', niveis: {}, arquivada: false }],
  lancamentosDaTurma: async () => [{ id: 'l1', missao_id: 'm1', turma_id: T2, prazo_tipo: 'aula', prazo_em: new Date(Date.now()+3600000).toISOString(), mostrar_ranking: true, encerrado: false, missoes: { titulo: 'Caça ao azimute', etapas: ['a','b','c'] } },
    { id: 'l2', missao_id: 'm2', turma_id: T2, prazo_tipo: 'aula', prazo_em: new Date(Date.now()+3600000).toISOString(), mostrar_ranking: true, encerrado: false, em_equipe: true, missoes: { titulo: 'Caderneta de nivelamento', etapas: ['a','b','c','d'], funcoes: ['Operador do nível', 'Porta-mira', 'Anotador', 'Calculista'] } },
    { id: 'l3', missao_id: 'm2', turma_id: T2, prazo_tipo: 'aula', prazo_em: new Date(Date.now()+3600000).toISOString(), mostrar_ranking: true, encerrado: false, em_equipe: true, missoes: { titulo: 'Transporte de RN', etapas: ['a'], funcoes: [] } }],
  entregasDaTurma: async () => [{ id: 'e1', lancamento_id: 'l1', aluno_id: T2 + '-a1', etapas_feitas: { 0: 1 }, texto: 'Cheguei a 4 m do ponto.', status: 'enviada', enviada_em: new Date().toISOString(), fora_do_prazo: false, nivel: 'prata', missao_lancamentos: { mostrar_ranking: true } },
    { id: 'e2', lancamento_id: 'l2', aluno_id: T2 + '-a0', etapas_feitas: { 0: 1, 1: 1 }, texto: 'Erro de fechamento 4 mm.', status: 'enviada', enviada_em: new Date().toISOString(), enviada_por: T2 + '-a2', fora_do_prazo: false, nivel: null, missao_lancamentos: { mostrar_ranking: true } }],
  equipesDoLancamento: async id => id === 'l2' ? [{ id: 'q1', nome: 'Equipe 1', membros: [{ aluno_id: T2 + '-a0' }, { aluno_id: T2 + '-a1' }, { aluno_id: T2 + '-a2' }] }, { id: 'q2', nome: 'Equipe 2', membros: [{ aluno_id: T2 + '-a3' }, { aluno_id: T2 + '-a4' }] }] : [],
  ultimasEquipesDaTurma: async () => null, presentesDeHoje: async () => [T2 + '-a0', T2 + '-a3', T2 + '-a5', T2 + '-a6'],
  insigniasDaTurma: async () => [
    { id: 'i1', aluno_id: T2 + '-a0', chave: 'presente', dado: 'Primeira presença pelo app em 11/09', origem: 'automatica', concedida_em: agora },
    { id: 'i2', aluno_id: T2 + '-a0', chave: 'na_mosca', dado: 'Pin a 2,4 m do M0452', origem: 'automatica', concedida_em: agora },
    { id: 'i3', aluno_id: T2 + '-a1', chave: 'primeiro_pin', dado: 'Pin "A" em 12/09', origem: 'automatica', concedida_em: agora },
    { id: 'i4', aluno_id: T2 + '-a2', chave: 'olho', dado: 'Percebeu que o M0451 saiu do lugar', origem: 'professora', concedida_em: agora }],
  conferirInsignias: async () => 3, concederInsignia: async () => null, removerInsignia: async () => null,
  inscricoesAtivas: async () => [{ aluno_id: T2 + '-a0' }, { aluno_id: T2 + '-a3' }, { aluno_id: null }],
  avisosDaTurma: async () => [{ id: 'av1', titulo: 'Missão nova: Caderneta', texto: 'Prazo 17:40', rotulo_alvo: 'Saneamento Integrado — F61RC', status: 'enviado', enviado_em: agora, agendado_para: agora, aparelhos: 12, aceitos: 12, sem_aviso: [T2 + '-a1'] }, { id: 'av2', titulo: 'Levem trena', texto: '', rotulo_alvo: 'F61RC', status: 'agendado', agendado_para: agora, sem_aviso: [] }],
  janelaDeHoje: async () => ({ codigo: 'F61GPS', janela_fim: new Date(Date.now()+3600000).toISOString() }),
  listarLeituras: async () => [], salvarLeitura: async () => ({}), listarMarcos: async () => [{ id: 'm1', nome: 'TESTE', utm_n: 9108700, utm_e: 284950, sigma: 0.02, tipo: 'marco', nota: 'mock' }], marcosPublicos: async () => [],
  apiProfessora: () => ({ meusPins: async () => pins.slice(0, 2), salvarPin: async () => ({ ok: true, pin_id: 'x' }), minhasPoligonais: async () => [], salvarPoligonal: async () => ({ ok: true, id: 'y' }) }),
  getCachedTurmas: () => turmas, loadTurmas: async () => turmas, outboxCount: () => 0, flushOutbox: async () => 0,
  ensureChamada: async () => ({ id: 'c1' }), getPresentes: async () => [T2 + '-a0', T2 + '-a3'],
  sessoesAbertas: async tid => tid === T2 ? [sess] : [], leiturasDaSessao: async () => leit, vivos: async tid => {
    // seis transmitindo em volta do Bloco F, para o radar ter o que desenhar
    const t = turmas.find(x => x.id === tid); if (!t) return []
    const BF = { lat: -8.0587608, lon: -34.9512426 }
    return t.alunos.slice(0, 6).map((a, i) => ({
      aluno_id: a.id, lat: BF.lat + (i - 2.5) * 0.00018, lon: BF.lon + (i % 3 - 1) * 0.00022,
      acuracia_m: 5 + i, modo: i === 3 ? 'referencia' : 'gps', visto_em: new Date().toISOString(),
    }))
  },
  minhaUltimaLeitura: async () => ({ lat: -8.0587, lon: -34.9512, acuracia_m: 8, rotulo: 'sala', criado_em: agora, capturado_em: agora }),
  leiturasDaTurma: async () => leit, pinsDaTurma: async () => pins, poligonaisDaTurma: async () => polis, sessoesDaTurma: async () => [sess],
  resumoTurma: async () => ({ chamadas: [{ id: 'c1', data: '2026-09-11' }], presencas: [] }), turmasDoSeedFaltando: async () => [],
}

export const abrirSessao = especificos['abrirSessao'] || (async () => null)
export const adicionarAluno = especificos['adicionarAluno'] || (async () => null)
export const apagarLancamento = especificos['apagarLancamento'] || (async () => null)
export const apagarMarco = especificos['apagarMarco'] || (async () => null)
export const apagarMissao = especificos['apagarMissao'] || (async () => null)
export const apagarTurma = especificos['apagarTurma'] || (async () => null)
export const apiProfessora = especificos['apiProfessora'] || (async () => null)
export const atualizarLancamento = especificos['atualizarLancamento'] || (async () => null)
export const avaliarEntrega = especificos['avaliarEntrega'] || (async () => null)
export const avaliarVarios = especificos['avaliarVarios'] || (async () => null)
export const avisosDaTurma = especificos['avisosDaTurma'] || (async () => null)
export const cancelarAviso = especificos['cancelarAviso'] || (async () => null)
export const concederInsignia = especificos['concederInsignia'] || (async () => null)
export const conferirInsignias = especificos['conferirInsignias'] || (async () => null)
export const confirmarChamada = especificos['confirmarChamada'] || (async () => null)
export const conteudoDaChamada = especificos['conteudoDaChamada'] || (async () => null)
export const criarAviso = especificos['criarAviso'] || (async () => null)
export const desmarcarPresente = especificos['desmarcarPresente'] || (async () => null)
export const dispararAvisos = especificos['dispararAvisos'] || (async () => null)
export const ensureChamada = especificos['ensureChamada'] || (async () => null)
export const entregasDaTurma = especificos['entregasDaTurma'] || (async () => null)
export const equipesDoLancamento = especificos['equipesDoLancamento'] || (async () => null)
export const fecharSessao = especificos['fecharSessao'] || (async () => null)
export const flushOutbox = especificos['flushOutbox'] || (async () => null)
export const fotoDoPin = especificos['fotoDoPin'] || (async () => null)
export const getCachedTurmas = especificos['getCachedTurmas'] || (async () => null)
export const getPresentes = especificos['getPresentes'] || (async () => null)
export const importSeed = especificos['importSeed'] || (async () => null)
export const importarCardapio = especificos['importarCardapio'] || (async () => null)
export const importarFaltantes = especificos['importarFaltantes'] || (async () => null)
export const inscricoesAtivas = especificos['inscricoesAtivas'] || (async () => null)
export const insigniasDaTurma = especificos['insigniasDaTurma'] || (async () => null)
export const janelaDeHoje = especificos['janelaDeHoje'] || (async () => null)
export const lancamentosDaTurma = especificos['lancamentosDaTurma'] || (async () => null)
export const lancarMissao = especificos['lancarMissao'] || (async () => null)
export const leiturasDaSessao = especificos['leiturasDaSessao'] || (async () => null)
export const leiturasDaTurma = especificos['leiturasDaTurma'] || (async () => null)
export const listarLeituras = especificos['listarLeituras'] || (async () => null)
export const listarMarcos = especificos['listarMarcos'] || (async () => null)
export const listarMissoes = especificos['listarMissoes'] || (async () => null)
export const loadTurmas = especificos['loadTurmas'] || (async () => null)
export const marcarPresente = especificos['marcarPresente'] || (async () => null)
export const marcosPublicos = especificos['marcosPublicos'] || (async () => null)
export const acessoAuxiliarHoje = especificos['acessoAuxiliarHoje'] || (async () => null)
export const liberarAuxiliar = especificos['liberarAuxiliar'] || (async () => null)
export const revogarAuxiliar = especificos['revogarAuxiliar'] || (async () => null)
export const minhaUltimaLeitura = especificos['minhaUltimaLeitura'] || (async () => null)
export const outboxCount = especificos['outboxCount'] || (async () => null)
export const pinsDaTurma = especificos['pinsDaTurma'] || (async () => null)
export const poligonaisDaTurma = especificos['poligonaisDaTurma'] || (async () => null)
export const presentesDeHoje = especificos['presentesDeHoje'] || (async () => null)
export const queueOp = especificos['queueOp'] || (async () => null)
export const removerAluno = especificos['removerAluno'] || (async () => null)
export const removerInsignia = especificos['removerInsignia'] || (async () => null)
export const resumoTurma = especificos['resumoTurma'] || (async () => null)
export const salvarConteudo = especificos['salvarConteudo'] || (async () => null)
export const salvarEquipes = especificos['salvarEquipes'] || (async () => null)
export const salvarLeitura = especificos['salvarLeitura'] || (async () => null)
export const salvarMarco = especificos['salvarMarco'] || (async () => null)
export const salvarMissao = especificos['salvarMissao'] || (async () => null)
export const saveFoto = especificos['saveFoto'] || (async () => null)
export const sessoesAbertas = especificos['sessoesAbertas'] || (async () => null)
export const sessoesDaTurma = especificos['sessoesDaTurma'] || (async () => null)
export const turmasDoSeedFaltando = especificos['turmasDoSeedFaltando'] || (async () => null)
export const ultimasEquipesDaTurma = especificos['ultimasEquipesDaTurma'] || (async () => null)
export const vivos = especificos['vivos'] || (async () => null)
