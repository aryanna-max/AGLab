-- Caderneta de estação total dentro da missão + equipes que os alunos formam entre os presentes.
-- (Transporte de Coordenadas, 25/09/2026.) Tudo aditivo: missão sem caderneta e lançamento
-- sem equipes_livres continuam exatamente como antes.

-- missoes.caderneta: liga a caderneta na missão. {"alvo": "M0451A"} = nome do ponto a determinar.
alter table public.missoes add column if not exists caderneta jsonb;
-- missao_lancamentos.equipes_livres: null = a professora forma as equipes (como sempre);
-- N = os alunos se escolhem entre os presentes, em até N equipes.
alter table public.missao_lancamentos add column if not exists equipes_livres integer;
-- a caderneta preenchida: gravada em todas as linhas da equipe, como etapas e texto.
alter table public.missao_entregas add column if not exists caderneta jsonb;
alter table public.missao_entregas add column if not exists caderneta_em timestamptz;
alter table public.missao_entregas add column if not exists caderneta_por uuid references public.alunos(id) on delete set null;

-- Presentes do dia: a chamada de hoje; sem chamada hoje, a última chamada da turma.
create or replace function public._presentes_da_turma(p_turma uuid)
returns table(aluno_id uuid, data date)
language sql stable security definer set search_path to 'public'
as $$
  with c as (select id, data from chamadas where turma_id = p_turma and data <= hoje_recife() order by data desc limit 1)
  select p.aluno_id, c.data from c join presencas p on p.chamada_id = c.id
$$;

-- O que o aluno vê para escolher: as equipes (as que já existem e as vagas até N) e os presentes,
-- cada um com a equipe em que já está (é isso que trava o nome na tela).
create or replace function public.escolha_de_equipe(p_matricula text, p_aluno_id uuid, p_lancamento_id uuid)
returns json
language plpgsql stable security definer set search_path to 'public'
as $$
declare a alunos; l missao_lancamentos; eqs json; pres json; dia date; minha text;
begin
  a := _aluno_por(p_matricula, p_aluno_id);
  if a.id is null then return json_build_object('ok', false, 'erro', 'Aluno não encontrado.'); end if;
  select * into l from missao_lancamentos where id = p_lancamento_id and turma_id = a.turma_id;
  if l.id is null then return json_build_object('ok', false, 'erro', 'Missão não encontrada para a sua turma.'); end if;
  if not l.em_equipe or l.equipes_livres is null then return json_build_object('ok', false, 'erro', 'Nesta missão quem forma as equipes é a professora.'); end if;

  select eq.nome into minha from missao_equipe_membros mm join missao_equipes eq on eq.id = mm.equipe_id
   where mm.lancamento_id = l.id and mm.aluno_id = a.id;

  with existentes as (
    select eq.id, eq.nome, eq.criado_em from missao_equipes eq where eq.lancamento_id = l.id
  ), vagas as (
    select null::uuid as id, 'Equipe ' || k as nome, null::timestamptz as criado_em
      from generate_series(1, l.equipes_livres) k
     where not exists (select 1 from existentes x where lower(x.nome) = lower('Equipe ' || k))
     limit greatest(l.equipes_livres - (select count(*) from existentes), 0)
  ), todas as (select * from existentes union all select * from vagas)
  select coalesce(json_agg(json_build_object(
      'nome', t.nome,
      'membros', coalesce((select json_agg(json_build_object('id', al.id, 'nome', split_part(btrim(al.nome), ' ', 1), 'avatar', al.avatar, 'eu', al.id = a.id) order by al.nome)
                    from missao_equipe_membros m2 join alunos al on al.id = m2.aluno_id where m2.equipe_id = t.id), '[]'::json),
      'enviou', exists (select 1 from missao_entregas e join missao_equipe_membros m3 on m3.aluno_id = e.aluno_id and m3.equipe_id = t.id
                         where e.lancamento_id = l.id and e.enviada_em is not null and coalesce(e.status, '') <> 'refazer'))
    order by t.nome), '[]'::json) into eqs from todas t;

  select max(pp.data) into dia from _presentes_da_turma(a.turma_id) pp;
  select coalesce(json_agg(json_build_object('id', al.id, 'nome', btrim(al.nome), 'avatar', al.avatar, 'eu', al.id = a.id, 'equipe', eq.nome) order by al.nome), '[]'::json) into pres
    from _presentes_da_turma(a.turma_id) pp join alunos al on al.id = pp.aluno_id
    left join missao_equipe_membros mm on mm.lancamento_id = l.id and mm.aluno_id = al.id
    left join missao_equipes eq on eq.id = mm.equipe_id;

  return json_build_object('ok', true, 'n', l.equipes_livres, 'minha', minha, 'equipes', eqs, 'presentes', pres,
    'dia', dia, 'hoje', dia = hoje_recife());
end $$;

-- Entrar numa equipe levando colegas (ou, já dentro de uma, trazer colegas para ela).
-- Quem já está em equipe fica de fora: a trava é a unique (lancamento_id, aluno_id) em
-- missao_equipe_membros, e o lock do lançamento faz duas escolhas simultâneas não se atropelarem.
-- Sair ou trocar de equipe é com a professora.
create or replace function public.entrar_em_equipe(p_matricula text, p_aluno_id uuid, p_lancamento_id uuid, p_equipe text, p_colegas uuid[])
returns json
language plpgsql security definer set search_path to 'public'
as $$
declare a alunos; l missao_lancamentos; alvo uuid; alvo_nome text; minha uuid; n_eq int; entraram text[] := '{}'; fora text[] := '{}'; r record;
begin
  a := _aluno_por(p_matricula, p_aluno_id);
  if a.id is null then return json_build_object('ok', false, 'erro', 'Aluno não encontrado.'); end if;
  select * into l from missao_lancamentos where id = p_lancamento_id and turma_id = a.turma_id;
  if l.id is null then return json_build_object('ok', false, 'erro', 'Missão não encontrada para a sua turma.'); end if;
  if not l.em_equipe or l.equipes_livres is null then return json_build_object('ok', false, 'erro', 'Nesta missão quem forma as equipes é a professora.'); end if;
  perform pg_advisory_xact_lock(hashtext('equipes:' || l.id::text));

  select mm.equipe_id, eq.nome into minha, alvo_nome from missao_equipe_membros mm join missao_equipes eq on eq.id = mm.equipe_id
   where mm.lancamento_id = l.id and mm.aluno_id = a.id;
  if minha is not null then
    if nullif(btrim(coalesce(p_equipe, '')), '') is not null and lower(btrim(p_equipe)) <> lower(alvo_nome) then
      return json_build_object('ok', false, 'erro', 'Você já está na ' || alvo_nome || '. Para trocar de equipe, fale com a professora.');
    end if;
    alvo := minha;
  else
    if nullif(btrim(coalesce(p_equipe, '')), '') is null then return json_build_object('ok', false, 'erro', 'Escolha a equipe.'); end if;
    select id, nome into alvo, alvo_nome from missao_equipes where lancamento_id = l.id and lower(nome) = lower(btrim(p_equipe)) limit 1;
    if alvo is null then
      select count(*) into n_eq from missao_equipes where lancamento_id = l.id;
      if n_eq >= l.equipes_livres then return json_build_object('ok', false, 'erro', 'As ' || l.equipes_livres || ' equipes já existem. Escolha uma delas.'); end if;
      insert into missao_equipes (owner_id, lancamento_id, nome) values (l.owner_id, l.id, left(btrim(p_equipe), 40)) returning id, nome into alvo, alvo_nome;
    end if;
  end if;

  if exists (select 1 from missao_entregas e join missao_equipe_membros m3 on m3.aluno_id = e.aluno_id and m3.equipe_id = alvo
              where e.lancamento_id = l.id and e.enviada_em is not null and coalesce(e.status, '') <> 'refazer') then
    return json_build_object('ok', false, 'erro', 'A ' || alvo_nome || ' já enviou a missão. Fale com a professora.');
  end if;

  if minha is null then
    insert into missao_equipe_membros (owner_id, lancamento_id, equipe_id, aluno_id) values (l.owner_id, l.id, alvo, a.id);
    entraram := entraram || split_part(btrim(a.nome), ' ', 1);
  end if;

  for r in
    select al.id, split_part(btrim(al.nome), ' ', 1) as nome,
           exists (select 1 from _presentes_da_turma(a.turma_id) pp where pp.aluno_id = al.id) as presente,
           exists (select 1 from missao_equipe_membros mm where mm.lancamento_id = l.id and mm.aluno_id = al.id) as ocupado
      from alunos al where al.id = any(coalesce(p_colegas, '{}')) and al.id <> a.id and al.turma_id = a.turma_id
  loop
    if r.ocupado or not r.presente then fora := fora || r.nome; continue; end if;
    insert into missao_equipe_membros (owner_id, lancamento_id, equipe_id, aluno_id) values (l.owner_id, l.id, alvo, r.id)
      on conflict (lancamento_id, aluno_id) do nothing;
    if found then entraram := entraram || r.nome; else fora := fora || r.nome; end if;
  end loop;

  -- linhas de entrega que já existiam passam a apontar para a equipe (como faz o "Salvar equipes")
  update missao_entregas e set equipe_id = alvo
   where e.lancamento_id = l.id and e.aluno_id in (select aluno_id from missao_equipe_membros where equipe_id = alvo);

  return json_build_object('ok', true, 'equipe', alvo_nome, 'entraram', to_json(entraram), 'ja_tinham_equipe', to_json(fora));
end $$;

-- Salva a caderneta para a equipe toda. p_base = o caderneta_em que o celular carregou:
-- se um colega salvou depois disso, não sobrescreve, devolve a versão dele (conflito).
create or replace function public.salvar_caderneta_missao(p_matricula text, p_aluno_id uuid, p_lancamento_id uuid, p_caderneta jsonb, p_base timestamptz)
returns json
language plpgsql security definer set search_path to 'public'
as $$
declare a alunos; l missao_lancamentos; n int; err text; cur record; agora timestamptz := now();
begin
  a := _aluno_por(p_matricula, p_aluno_id);
  if a.id is null then return json_build_object('ok', false, 'erro', 'Aluno não encontrado.'); end if;
  select * into l from missao_lancamentos where id = p_lancamento_id and turma_id = a.turma_id and now() >= coalesce(inicia_em, criado_em);
  if l.id is null then return json_build_object('ok', false, 'erro', 'Missão não encontrada para a sua turma.'); end if;
  if p_caderneta is null or length(p_caderneta::text) > 60000 then return json_build_object('ok', false, 'erro', 'Caderneta vazia ou grande demais.'); end if;
  select count(*) into n from _alvos_missao(l, a.id);
  if n = 0 then return json_build_object('ok', false, 'erro', 'Missão em equipe: entre numa equipe antes de anotar.'); end if;

  insert into missao_entregas (owner_id, lancamento_id, aluno_id, equipe_id)
    select l.owner_id, l.id, t.aluno_id, t.equipe_id from _alvos_missao(l, a.id) t
    on conflict (lancamento_id, aluno_id) do nothing;
  err := _equipe_ja_enviou(l, a.id);
  if err is not null then return json_build_object('ok', false, 'erro', err); end if;
  if exists (select 1 from missao_entregas where lancamento_id = l.id and aluno_id = a.id and status = 'aceita') then
    return json_build_object('ok', false, 'erro', 'A missão já foi aceita pela professora.');
  end if;

  select e.caderneta, e.caderneta_em, split_part(btrim(al.nome), ' ', 1) as por into cur
    from missao_entregas e left join alunos al on al.id = e.caderneta_por
   where e.lancamento_id = l.id and e.aluno_id in (select t.aluno_id from _alvos_missao(l, a.id) t) and e.caderneta_em is not null
   order by e.caderneta_em desc limit 1;
  if cur.caderneta_em is not null and (p_base is null or cur.caderneta_em > p_base) then
    return json_build_object('ok', false, 'conflito', true, 'caderneta', cur.caderneta, 'em', cur.caderneta_em, 'por', cur.por,
      'erro', coalesce(cur.por, 'Um colega') || ' salvou a caderneta depois que você abriu.');
  end if;

  update missao_entregas set caderneta = p_caderneta, caderneta_em = agora, caderneta_por = a.id
   where lancamento_id = l.id and aluno_id in (select t.aluno_id from _alvos_missao(l, a.id) t);
  return json_build_object('ok', true, 'em', agora);
end $$;

-- minhas_missoes: + a configuração da caderneta, equipes_livres e a caderneta mais recente da equipe.
create or replace function public.minhas_missoes(p_matricula text, p_aluno_id uuid)
returns json
language plpgsql stable security definer set search_path to 'public'
as $function$
declare a alunos; r json; rk json; minha_pos int; total int; meus int;
begin
  a := _aluno_por(p_matricula, p_aluno_id);
  if a.id is null then return json_build_object('ok', false, 'erro', 'Aluno não encontrado.'); end if;

  select coalesce(json_agg(x order by x.aberta desc, x.prazo_em asc), '[]'::json) into r from (
    select l.id as lancamento_id, m.titulo, m.frente, m.descricao, m.etapas, m.campos, m.entrega, m.niveis, m.medalha, m.caderneta,
      l.prazo_tipo, l.prazo_em, coalesce(l.inicia_em, l.criado_em) as lancada_em, l.mostrar_ranking, l.em_equipe, l.equipes_livres,
      (not l.encerrado and now() <= l.prazo_em) as aberta,
      json_build_object('status', e.status, 'etapas_feitas', coalesce(e.etapas_feitas, '{}'::jsonb), 'texto', e.texto, 'rascunho', e.rascunho, 'rascunho_em', e.rascunho_em,
        'enviada_em', e.enviada_em, 'fora_do_prazo', e.fora_do_prazo, 'nivel', e.nivel, 'devolutiva', e.devolutiva,
        'medalha_auto', e.medalha_auto,
        'caderneta', cd.caderneta, 'caderneta_em', cd.caderneta_em, 'caderneta_por', cd.por,
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
    left join lateral (
      select e3.caderneta, e3.caderneta_em, (select split_part(btrim(al.nome), ' ', 1) from alunos al where al.id = e3.caderneta_por) as por
        from missao_entregas e3
       where m.caderneta is not null and e3.lancamento_id = l.id and e3.caderneta_em is not null
         and e3.aluno_id in (select t.aluno_id from _alvos_missao(l, a.id) t)
       order by e3.caderneta_em desc limit 1) cd on true
    where l.turma_id = a.turma_id and now() >= coalesce(l.inicia_em, l.criado_em)
  ) x;

  with pts as (
    select al.id, split_part(btrim(al.nome), ' ', 1) as nome, al.avatar,
           coalesce(sum(_pontos_nivel(e.nivel)) filter (where l.id is not null), 0) as pontos
    from alunos al
    left join missao_entregas e on e.aluno_id = al.id
    left join missao_lancamentos l on l.id = e.lancamento_id and l.mostrar_ranking
    where al.turma_id = a.turma_id and al.papel = 'aluno'
    group by al.id, al.nome, al.avatar
  ), ord as (select *, rank() over (order by pontos desc) as pos from pts)
  select json_agg(json_build_object('nome', nome, 'avatar', avatar, 'pontos', pontos) order by pontos desc) filter (where pos <= 3 and pontos > 0),
         max(pos) filter (where id = a.id), count(*), max(pontos) filter (where id = a.id)
    into rk, minha_pos, total, meus from ord;

  return json_build_object('ok', true, 'missoes', r,
    'semestre', json_build_object('podio', coalesce(rk, '[]'::json), 'minha_posicao', minha_pos, 'meus_pontos', coalesce(meus, 0), 'total', total));
end $function$;

grant execute on function public.escolha_de_equipe(text, uuid, uuid) to anon, authenticated;
grant execute on function public.entrar_em_equipe(text, uuid, uuid, text, uuid[]) to anon, authenticated;
grant execute on function public.salvar_caderneta_missao(text, uuid, uuid, jsonb, timestamptz) to anon, authenticated;
revoke execute on function public._presentes_da_turma(uuid) from anon, authenticated, public;
