-- O avatar que o aluno escolhe (18/09/2026).
--
-- Regra dela: a SELFIE é só para a professora — é como ela reconhece o aluno na chamada,
-- no radar, nas insígnias, nas missões, nas equipes e na análise. No app do aluno, e em
-- qualquer lugar onde outro aluno enxergue, quem aparece é um AVATAR escolhido por ele
-- numa lista. Ninguém além da professora vê rosto.
--
-- Guardamos só a CHAVE do avatar (ex.: 'lumi'); a arte mora no app, em public/avatares.
--
-- Troca: livre na primeira vez, depois uma a cada 7 dias. O limite é do servidor, não da
-- tela — senão bastava limpar o navegador para trocar de novo. Escolher o mesmo que já
-- está não gasta a troca da semana.

alter table alunos add column if not exists avatar text;
alter table alunos add column if not exists avatar_em timestamptz;

create or replace function public.salvar_avatar(p_matricula text, p_aluno_id uuid, p_avatar text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare a alunos; espera constant interval := interval '7 days';
begin
  a := _aluno_por(p_matricula, p_aluno_id);
  if a.id is null then return json_build_object('ok', false, 'erro', 'Aluno não encontrado.'); end if;
  if p_avatar is null or p_avatar !~ '^[a-z0-9_]{1,24}$' then
    return json_build_object('ok', false, 'erro', 'Avatar inválido.');
  end if;
  -- já é esse: não gasta a troca da semana
  if a.avatar = p_avatar then
    return json_build_object('ok', true, 'avatar', a.avatar, 'avatar_em', a.avatar_em,
      'proxima_em', coalesce(a.avatar_em, now()) + espera);
  end if;
  if a.avatar is not null and a.avatar_em is not null and a.avatar_em > now() - espera then
    return json_build_object('ok', false, 'limite', true, 'avatar', a.avatar, 'avatar_em', a.avatar_em,
      'proxima_em', a.avatar_em + espera,
      'erro', 'Você já trocou de avatar esta semana. Dá para trocar de novo depois.');
  end if;
  update alunos set avatar = p_avatar, avatar_em = now() where id = a.id;
  return json_build_object('ok', true, 'avatar', p_avatar, 'avatar_em', now(), 'proxima_em', now() + espera);
end $function$;

-- validar_sessao: além da selfie (que só o dono recebe, para a tela "Minha foto"), devolve
-- o avatar escolhido e desde quando — é com isso que o app do aluno se desenha ao abrir.
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
      'selfie', a.foto_data, 'avatar', a.avatar, 'avatar_em', a.avatar_em, 'teste', coalesce(t.teste, false));
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

-- minhas_missoes: onde um aluno vê OUTRO aluno — os membros da equipe e o pódio do
-- semestre — vai a chave do avatar junto do primeiro nome. Rosto, nunca.
create or replace function public.minhas_missoes(p_matricula text, p_aluno_id uuid)
 returns json
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare a alunos; r json; rk json; minha_pos int; total int; meus int;
begin
  a := _aluno_por(p_matricula, p_aluno_id);
  if a.id is null then return json_build_object('ok', false, 'erro', 'Aluno não encontrado.'); end if;

  select coalesce(json_agg(x order by x.aberta desc, x.prazo_em asc), '[]'::json) into r from (
    select l.id as lancamento_id, m.titulo, m.frente, m.descricao, m.etapas, m.entrega, m.niveis, m.medalha,
      l.prazo_tipo, l.prazo_em, coalesce(l.inicia_em, l.criado_em) as lancada_em, l.mostrar_ranking, l.em_equipe,
      (not l.encerrado and now() <= l.prazo_em) as aberta,
      json_build_object('status', e.status, 'etapas_feitas', coalesce(e.etapas_feitas, '{}'::jsonb), 'texto', e.texto,
        'enviada_em', e.enviada_em, 'fora_do_prazo', e.fora_do_prazo, 'nivel', e.nivel, 'devolutiva', e.devolutiva,
        'medalha_auto', e.medalha_auto,
        'enviada_por', (select split_part(btrim(al.nome), ' ', 1) from alunos al where al.id = e.enviada_por),
        'enviada_por_mim', e.enviada_por = a.id) as minha,
      case when l.em_equipe then (
        select json_build_object('nome', eq.nome,
          'membros', (select json_agg(json_build_object('nome', split_part(btrim(al.nome), ' ', 1), 'avatar', al.avatar, 'eu', al.id = a.id) order by al.nome)
                        from missao_equipe_membros m2 join alunos al on al.id = m2.aluno_id where m2.equipe_id = eq.id))
        from missao_equipe_membros mm join missao_equipes eq on eq.id = mm.equipe_id
        where mm.lancamento_id = l.id and mm.aluno_id = a.id)
      else null end as equipe,
      case when l.mostrar_ranking then (
        select json_build_object(
          'ouro', coalesce(json_agg(split_part(btrim(al.nome), ' ', 1)) filter (where e2.nivel = 'ouro'), '[]'::json),
          'prata', count(*) filter (where e2.nivel = 'prata'),
          'bronze', count(*) filter (where e2.nivel = 'bronze'),
          'enviadas', count(*) filter (where e2.enviada_em is not null))
        from missao_entregas e2 join alunos al on al.id = e2.aluno_id where e2.lancamento_id = l.id)
      else null end as ranking
    from missao_lancamentos l
    join missoes m on m.id = l.missao_id
    left join missao_entregas e on e.lancamento_id = l.id and e.aluno_id = a.id
    where l.turma_id = a.turma_id and now() >= coalesce(l.inicia_em, l.criado_em)
  ) x;

  with pts as (
    select al.id, split_part(btrim(al.nome), ' ', 1) as nome, al.avatar,
           coalesce(sum(_pontos_nivel(e.nivel)) filter (where l.id is not null), 0) as pontos
    from alunos al
    left join missao_entregas e on e.aluno_id = al.id
    left join missao_lancamentos l on l.id = e.lancamento_id and l.mostrar_ranking
    where al.turma_id = a.turma_id
    group by al.id, al.nome, al.avatar
  ), ord as (select *, rank() over (order by pontos desc) as pos from pts)
  select json_agg(json_build_object('nome', nome, 'avatar', avatar, 'pontos', pontos) order by pontos desc) filter (where pos <= 3 and pontos > 0),
         max(pos) filter (where id = a.id), count(*), max(pontos) filter (where id = a.id)
    into rk, minha_pos, total, meus from ord;

  return json_build_object('ok', true, 'missoes', r,
    'semestre', json_build_object('podio', coalesce(rk, '[]'::json), 'minha_posicao', minha_pos, 'meus_pontos', coalesce(meus, 0), 'total', total));
end $function$;
