-- Gabarito liberado pela professora (25/09/2026, pedido dela: "só para quem já enviou").
-- O gabarito é calculado no celular a partir da caderneta da própria equipe; o servidor só
-- diz se a professora liberou. A tela mostra apenas a quem já enviou e não está em "refazer".
alter table public.missao_lancamentos add column if not exists gabarito_liberado boolean not null default false;

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
      l.prazo_tipo, l.prazo_em, coalesce(l.inicia_em, l.criado_em) as lancada_em, l.mostrar_ranking, l.em_equipe, l.equipes_livres, l.gabarito_liberado,
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
