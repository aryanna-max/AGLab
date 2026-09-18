-- A selfie da Presença é o avatar do aluno no resto do app (18/09/2026).
--
-- O aluno já mandava a selfie (salvar_selfie → alunos.foto_data) e ela aparecia para a
-- professora. Faltava o caminho de volta: o app do aluno só sabia se a selfie EXISTE
-- (tem_selfie), nunca recebia a imagem. Quem trocava de celular, reinstalava ou limpava
-- o navegador ficava sem a própria cara — e não podia mandar outra, porque a selfie é
-- uma só e só a professora libera uma nova.
--
-- validar_sessao passa a devolver 'selfie' junto com 'tem_selfie'.
--
-- Só no modo LIVRE (abrir o app e se identificar). No modo AULA, que roda a cada leitura
-- do QR da chamada, a resposta continua sem a imagem: são ~40 KB que não fazem falta ali.
--
-- Não abre nada de novo: quem chama validar_sessao já se identificou com matrícula ou com
-- o aluno_id do próprio cartão, e recebe apenas a foto DELE. A foto que a professora sobe
-- pelo Storage (foto_path) continua fora — ela exige URL assinada e não sai por RPC anônima.

create or replace function public.validar_sessao(p_codigo text, p_matricula text, p_aluno_id uuid default null::uuid)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare a record; t record; sid uuid; tid uuid; jini timestamptz; jfim timestamptz; loc text;
  mat text := upper(replace(btrim(coalesce(p_matricula,'')), ' ', ''));
  livre boolean := (p_codigo is null or btrim(p_codigo) = '');
begin
  if mat = '' and p_aluno_id is null then return json_build_object('ok', false, 'erro', 'Identifique-se: matrícula ou o seu QR.'); end if;
  if livre then
    if p_aluno_id is not null then select * into a from alunos where id = p_aluno_id;
    else select * into a from alunos where upper(replace(btrim(matricula), ' ', '')) = mat order by created_at desc limit 1; end if;
    if not found then return json_build_object('ok', false, 'erro', 'Aluno não encontrado.'); end if;
    select nome, teste into t from turmas where id = a.turma_id;
    return json_build_object('ok', true, 'modo', 'livre', 'nome', split_part(btrim(a.nome), ' ', 1),
      'turma', t.nome, 'turma_id', a.turma_id, 'aluno_id', a.id, 'matricula', a.matricula,
      'tem_foto', (a.foto_data is not null or a.foto_path is not null), 'tem_selfie', (a.foto_data is not null),
      'selfie', a.foto_data, 'teste', coalesce(t.teste, false));
  end if;
  select id, turma_id, janela_inicio, janela_fim, local into sid, tid, jini, jfim, loc
    from sessoes_coleta where upper(codigo) = upper(btrim(p_codigo)) and expira_em > now();
  if sid is null then return json_build_object('ok', false, 'erro', 'Este QR não é de uma aula válida hoje.'); end if;
  if p_aluno_id is not null then select * into a from alunos where id = p_aluno_id and turma_id = tid;
  else select * into a from alunos where turma_id = tid and upper(replace(btrim(matricula), ' ', '')) = mat; end if;
  if not found then return json_build_object('ok', false, 'erro', 'Você não está na turma desta aula.'); end if;
  select nome, teste into t from turmas where id = tid;
  return json_build_object('ok', true, 'modo', 'aula', 'nome', split_part(btrim(a.nome), ' ', 1),
    'turma', t.nome, 'turma_id', tid, 'aluno_id', a.id, 'matricula', a.matricula, 'local', loc,
    'janela_aberta', (jini is not null and now() between jini and jfim),
    'tem_foto', (a.foto_data is not null or a.foto_path is not null), 'tem_selfie', (a.foto_data is not null), 'teste', coalesce(t.teste, false));
end $function$;
