// supabase falso para o harness: RPCs do aluno devolvem dados de exemplo
const agora = Date.now()
const iso = ms => new Date(ms).toISOString()
const RPC = {
  minhas_presencas: { ok: true, turma: 'Saneamento Integrado — F61RC (2026.2)', tempos_por_aula: 6, ch_ha: 108,
    aulas: [{ data: '2026-09-18', presente: false, conteudo: 'Nivelamento geométrico' }, { data: '2026-09-11', presente: true, origem: 'chamada_aluno', hora: '13:09', conteudo: 'Aula 01 — Onde você está' }],
    hoje: { inicio: '12:50', fim: '17:40', aberta_agora: true, local: 'sala' } },
  minhas_missoes: { ok: true, funcoes_ja_exercidas: ['Anotador'], semestre: { podio: [{ nome: 'Alice', avatar: 'lumi', pontos: 6 }, { nome: 'Bruno', avatar: 'teo', pontos: 4 }, { nome: 'Carla', avatar: 'vertice', pontos: 3 }], minha_posicao: 2, meus_pontos: 4, total: 19 },
    missoes: [
      { lancamento_id: 'l0', titulo: 'Caderneta de nivelamento', frente: 'altimetria', descricao: 'Nivelamento geométrico com fechamento.', etapas: ['Nivelar o instrumento', 'Ré e vante', 'Cotas', 'Fechamento'], funcoes: ['Operador do nível', 'Porta-mira', 'Anotador', 'Calculista'], entrega: 'Caderneta e erro de fechamento.', niveis: { bronze: 'Completa', prata: 'Na tolerância', ouro: 'Metade da tolerância' }, prazo_tipo: 'aula', prazo_em: iso(agora + 90 * 60000), aberta: true, em_equipe: true, mostrar_ranking: true,
        minha: { status: 'enviada', etapas_feitas: { 0: 1, 1: 1 }, enviada_em: iso(agora - 60000), enviada_por: 'Bruno', texto: 'Erro de 4 mm.' },
        equipe: { nome: 'Equipe 2', membros: [{ nome: 'Alice', avatar: 'lumi', eu: true }, { nome: 'Bruno', avatar: 'teo', eu: false }, { nome: 'Carla', avatar: 'vertice', eu: false }] } },
      { lancamento_id: 'l8', titulo: 'Trena contra celular', frente: 'planimetria', etapas: ['Pins', 'Poligonal', 'Trena', 'Comparar'], prazo_tipo: 'aula', prazo_em: iso(agora + 90 * 60000), aberta: true, em_equipe: true, minha: { status: 'em_andamento', etapas_feitas: { 0: 1 } },
        equipe: { nome: 'Equipe 4', membros: [{ nome: 'Alice', avatar: 'lumi', eu: true }, { nome: 'Davi', eu: false }] } },
      { lancamento_id: 'l9', titulo: 'Transporte de RN', frente: 'altimetria', etapas: ['a'], prazo_tipo: 'aula', prazo_em: iso(agora + 90 * 60000), aberta: true, em_equipe: true, equipe: null, minha: {} },
      { lancamento_id: 'l1', titulo: 'Posição do celular', frente: 'geral', descricao: 'Ocupe o M0452 em quatro posições.', etapas: ['Deitado', 'Em pé', 'No peito', 'No bolso'], entrega: 'Qual posição mediu melhor?', niveis: { bronze: 'Quatro ocupações', prata: 'Comparação correta', ouro: 'Explicação física' }, prazo_tipo: 'aula', prazo_em: iso(agora + 40 * 60000), lancada_em: iso(agora - 3600000), mostrar_ranking: true, aberta: true, minha: { status: 'em_andamento', etapas_feitas: { 0: iso(agora) } }, ranking: { ouro: ['Alice'], prata: 2, bronze: 1, enviadas: 5 } },
      { lancamento_id: 'l2', titulo: 'Caça ao azimute', frente: 'planimetria', etapas: ['a', 'b'], prazo_tipo: 'data', prazo_em: iso(agora - 86400000), aberta: false, mostrar_ranking: true, minha: { status: 'aceita', nivel: 'prata', devolutiva: 'Boa orientação.', etapas_feitas: { 0: 1, 1: 1 } }, ranking: { ouro: [], prata: 3, bronze: 2, enviadas: 12 } },
    ] },
  minhas_insignias: { ok: true, insignias: [
    { chave: 'presente', dado: 'Primeira presença pelo app em 11/09', origem: 'automatica', em: iso(agora - 4 * 86400000), nova: false },
    { chave: 'primeiro_pin', dado: 'Pin "M0452" em 12/09', origem: 'automatica', em: iso(agora - 3 * 86400000), nova: false },
    { chave: 'parado', dado: 'Espalhamento de 0,42 m numa ocupação', origem: 'automatica', em: iso(agora - 3 * 86400000), nova: false },
    { chave: 'na_mosca', dado: 'Pin a 2,4 m do M0452', origem: 'automatica', em: iso(agora - 60000), nova: true },
    { chave: 'primeira_foto', dado: 'Pin "M0452" com foto em 19/09', origem: 'automatica', em: iso(agora - 2 * 86400000), nova: false },
    { chave: 'olho', dado: 'Percebeu que o M0451 saiu do lugar', origem: 'professora', em: iso(agora - 86400000), nova: false }] },
}
// o app do aluno recebe a própria selfie de volta (validar_sessao, modo livre): ela serve
// só ao painel "Minha foto", em Presença — quem aparece como avatar é a escolha dele
const MINHA_SELFIE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#1f4e79"/>' +
  '<circle cx="32" cy="25" r="11" fill="#fff" opacity=".9"/><ellipse cx="32" cy="56" rx="19" ry="14" fill="#fff" opacity=".9"/></svg>')
RPC.validar_sessao = { ok: true, modo: 'livre', nome: 'Alice', turma: 'Saneamento Integrado — F61RC (2026.2)', turma_id: 't',
  aluno_id: 'x', matricula: '20231F61RC0280', tem_foto: true, tem_selfie: true, selfie: MINHA_SELFIE,
  avatar: 'lumi', avatar_em: iso(agora - 9 * 86400000), teste: false }   // 9 dias: já pode trocar de novo
RPC.salvar_avatar = { ok: true, avatar: 'navi', avatar_em: iso(agora), proxima_em: iso(agora + 7 * 86400000) }

export const supabase = {
  auth: { signOut: async () => {}, getSession: async () => ({ data: { session: null } }) },
  rpc: async nome => ({ data: RPC[nome] ?? { ok: true }, error: null }),
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  storage: { from: () => ({}) },
}
