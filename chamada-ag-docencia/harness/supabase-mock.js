// supabase falso para o harness: RPCs do aluno devolvem dados de exemplo
const agora = Date.now()
const iso = ms => new Date(ms).toISOString()
const RPC = {
  minhas_presencas: { ok: true, turma: 'Saneamento Integrado — F61RC (2026.2)', tempos_por_aula: 6, ch_ha: 108,
    aulas: [{ data: '2026-09-18', presente: false, conteudo: 'Nivelamento geométrico' }, { data: '2026-09-11', presente: true, origem: 'chamada_aluno', hora: '13:09', conteudo: 'Aula 01 — Onde você está' }],
    hoje: { inicio: '12:50', fim: '17:40', aberta_agora: true, local: 'sala' } },
  minhas_missoes: { ok: true, funcoes_ja_exercidas: ['Anotador'], semestre: { podio: [{ nome: 'Alice', pontos: 6 }, { nome: 'Bruno', pontos: 4 }, { nome: 'Carla', pontos: 3 }], minha_posicao: 2, meus_pontos: 4, total: 19 },
    missoes: [
      { lancamento_id: 'l0', titulo: 'Caderneta de nivelamento', frente: 'altimetria', descricao: 'Nivelamento geométrico com fechamento.', etapas: ['Nivelar o instrumento', 'Ré e vante', 'Cotas', 'Fechamento'], funcoes: ['Operador do nível', 'Porta-mira', 'Anotador', 'Calculista'], entrega: 'Caderneta e erro de fechamento.', niveis: { bronze: 'Completa', prata: 'Na tolerância', ouro: 'Metade da tolerância' }, prazo_tipo: 'aula', prazo_em: iso(agora + 90 * 60000), aberta: true, em_equipe: true, mostrar_ranking: true,
        minha: { status: 'enviada', etapas_feitas: { 0: 1, 1: 1 }, enviada_em: iso(agora - 60000), enviada_por: 'Bruno', texto: 'Erro de 4 mm.' },
        equipe: { nome: 'Equipe 2', minha_funcao: null, membros: [{ nome: 'Alice', funcao: null, eu: true }, { nome: 'Bruno', funcao: 'Anotador', eu: false }, { nome: 'Carla', funcao: 'Porta-mira', eu: false }] } },
      { lancamento_id: 'l9', titulo: 'Transporte de RN', frente: 'altimetria', etapas: ['a'], prazo_tipo: 'aula', prazo_em: iso(agora + 90 * 60000), aberta: true, em_equipe: true, equipe: null, minha: {} },
      { lancamento_id: 'l1', titulo: 'Posição do celular', frente: 'geral', descricao: 'Ocupe o M0452 em quatro posições.', etapas: ['Deitado', 'Em pé', 'No peito', 'No bolso'], entrega: 'Qual posição mediu melhor?', niveis: { bronze: 'Quatro ocupações', prata: 'Comparação correta', ouro: 'Explicação física' }, prazo_tipo: 'aula', prazo_em: iso(agora + 40 * 60000), lancada_em: iso(agora - 3600000), mostrar_ranking: true, aberta: true, minha: { status: 'em_andamento', etapas_feitas: { 0: iso(agora) } }, ranking: { ouro: ['Alice'], prata: 2, bronze: 1, enviadas: 5 } },
      { lancamento_id: 'l2', titulo: 'Caça ao azimute', frente: 'planimetria', etapas: ['a', 'b'], prazo_tipo: 'data', prazo_em: iso(agora - 86400000), aberta: false, mostrar_ranking: true, minha: { status: 'aceita', nivel: 'prata', devolutiva: 'Boa orientação.', etapas_feitas: { 0: 1, 1: 1 } }, ranking: { ouro: [], prata: 3, bronze: 2, enviadas: 12 } },
    ] },
}
export const supabase = {
  auth: { signOut: async () => {}, getSession: async () => ({ data: { session: null } }) },
  rpc: async nome => ({ data: RPC[nome] ?? { ok: true }, error: null }),
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  storage: { from: () => ({}) },
}
