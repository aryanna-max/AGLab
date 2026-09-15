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
const pins = [{ id: 'p1', nome: 'M0452', lat: 0, lon: 0, utm_n: 9108722, utm_e: 284960, altitude_m: 10, n_leituras: 12, acuracia_media_m: 6, desvio_n_m: 1.2, desvio_e_m: 0.8, marco_ref: 'M0452', tem_foto: false, sessao_id: 's1', criado_em: agora, aluno_id: T2 + '-a1', alunos: { nome: 'Aluno 2', matricula: '20231', turma_id: T2 } }]
const especificos = {
  getCachedTurmas: () => turmas, loadTurmas: async () => turmas, outboxCount: () => 0, flushOutbox: async () => 0,
  ensureChamada: async () => ({ id: 'c1' }), getPresentes: async () => [T2 + '-a0', T2 + '-a3'],
  sessoesAbertas: async tid => tid === T2 ? [sess] : [], leiturasDaSessao: async () => leit, vivos: async () => [],
  minhaUltimaLeitura: async () => ({ lat: -8.0587, lon: -34.9512, acuracia_m: 8, rotulo: 'sala', criado_em: agora, capturado_em: agora }),
  leiturasDaTurma: async () => leit, pinsDaTurma: async () => pins, poligonaisDaTurma: async () => [], sessoesDaTurma: async () => [sess],
  resumoTurma: async () => ({ chamadas: [{ id: 'c1', data: '2026-09-11' }], presencas: [] }), turmasDoSeedFaltando: async () => [],
}

export const abrirSessao = especificos['abrirSessao'] || (async () => null)
export const adicionarAluno = especificos['adicionarAluno'] || (async () => null)
export const apagarTurma = especificos['apagarTurma'] || (async () => null)
export const confirmarChamada = especificos['confirmarChamada'] || (async () => null)
export const desmarcarPresente = especificos['desmarcarPresente'] || (async () => null)
export const ensureChamada = especificos['ensureChamada'] || (async () => null)
export const fecharSessao = especificos['fecharSessao'] || (async () => null)
export const flushOutbox = especificos['flushOutbox'] || (async () => null)
export const fotoDoPin = especificos['fotoDoPin'] || (async () => null)
export const getCachedTurmas = especificos['getCachedTurmas'] || (async () => null)
export const getPresentes = especificos['getPresentes'] || (async () => null)
export const importSeed = especificos['importSeed'] || (async () => null)
export const importarFaltantes = especificos['importarFaltantes'] || (async () => null)
export const leiturasDaSessao = especificos['leiturasDaSessao'] || (async () => null)
export const leiturasDaTurma = especificos['leiturasDaTurma'] || (async () => null)
export const listarLeituras = especificos['listarLeituras'] || (async () => null)
export const loadTurmas = especificos['loadTurmas'] || (async () => null)
export const marcarPresente = especificos['marcarPresente'] || (async () => null)
export const minhaUltimaLeitura = especificos['minhaUltimaLeitura'] || (async () => null)
export const outboxCount = especificos['outboxCount'] || (async () => null)
export const pinsDaTurma = especificos['pinsDaTurma'] || (async () => null)
export const poligonaisDaTurma = especificos['poligonaisDaTurma'] || (async () => null)
export const queueOp = especificos['queueOp'] || (async () => null)
export const resumoTurma = especificos['resumoTurma'] || (async () => null)
export const salvarLeitura = especificos['salvarLeitura'] || (async () => null)
export const saveFoto = especificos['saveFoto'] || (async () => null)
export const sessoesAbertas = especificos['sessoesAbertas'] || (async () => null)
export const sessoesDaTurma = especificos['sessoesDaTurma'] || (async () => null)
export const turmasDoSeedFaltando = especificos['turmasDoSeedFaltando'] || (async () => null)
export const vivos = especificos['vivos'] || (async () => null)
