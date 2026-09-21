-- Insígnias Pioneiro (18/09/2026, decisões dela): cada insígnia de aprendizagem tem a sua
-- versão Pioneiro (joia ametista, mesmo símbolo + bandeira marfim). Uma por turma.
-- Pioneiro = primeira realização VÁLIDA da turma (quem tem a insígnia-base, pela hora do
-- feito, não da concessão). O app indica o candidato; a professora confirma ou recusa
-- (recusado passa ao próximo). Só a confirmação entrega a insígnia 'pioneiro_<base>'.

create table if not exists public.pioneiros (
  owner_id uuid not null default auth.uid(),
  turma_id uuid not null references turmas(id) on delete cascade,
  base text not null,
  aluno_id uuid not null references alunos(id) on delete cascade,
  status text not null check (status in ('confirmado', 'recusado')),
  feito_em timestamptz,
  decidido_em timestamptz not null default now(),
  primary key (turma_id, base, aluno_id)
);
create unique index if not exists pioneiros_um_por_turma on public.pioneiros (turma_id, base) where status = 'confirmado';
alter table public.pioneiros enable row level security;
drop policy if exists pioneiros_owner on public.pioneiros;
create policy pioneiros_owner on public.pioneiros for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- insígnias que têm versão Pioneiro (aprendizagem; não comportamento nem instalação)
create or replace function public._bases_pioneiro() returns text[] language sql immutable as $$
  select array['primeiro_pin','parado','tres_amb','no_marco','na_mosca','poligonal','cadastrador','caderneta','primeiro_ouro','tres_frentes']
$$;

-- quando o aluno FEZ o que a insígnia-base reconhece (mesmos critérios do _avaliar_insignias)
create or replace function public._momento_insignia(p_aluno uuid, p_chave text)
returns timestamptz language plpgsql stable security definer set search_path to 'public' as $$
declare t timestamptz;
begin
  if p_chave = 'primeiro_pin' then
    select min(criado_em) into t from pins where aluno_id = p_aluno;
  elsif p_chave = 'parado' then
    select min(criado_em) into t from pins where aluno_id = p_aluno and n_leituras >= 10 and desvio_n_m is not null
       and sqrt(coalesce(desvio_n_m, 0) ^ 2 + coalesce(desvio_e_m, 0) ^ 2) between 0.05 and 1.0;
  elsif p_chave = 'tres_amb' then
    select min(fim) into t from (
      select dia, max(prim) fim from (
        select date_trunc('day', coalesce(capturado_em, criado_em) at time zone 'America/Recife') dia, rotulo,
               min(coalesce(capturado_em, criado_em)) prim
          from leituras_gps where aluno_id = p_aluno and rotulo in ('sala', 'corredor', 'patio') group by 1, 2) x
      group by dia having count(*) = 3) y;
  elsif p_chave in ('no_marco', 'na_mosca') then
    select min(p.criado_em) into t from pins p
     where p.aluno_id = p_aluno and p.utm_n is not null
       and exists (select 1 from _marcos_oficiais() m
                    where sqrt((p.utm_n - m.n) ^ 2 + (p.utm_e - m.e) ^ 2) <= case when p_chave = 'na_mosca' then 3 else 5 end);
  elsif p_chave = 'poligonal' then
    select min(criado_em) into t from poligonais where aluno_id = p_aluno and coalesce(array_length(pin_ids, 1), 0) >= 3
       and coalesce((resultado->>'cruzada')::boolean, false) = false;
  elsif p_chave = 'cadastrador' then
    select criado_em into t from pins where aluno_id = p_aluno and tem_foto order by criado_em offset 4 limit 1;
  elsif p_chave = 'primeiro_ouro' then
    select min(coalesce(e.enviada_em, e.atualizado_em)) into t from missao_entregas e where e.aluno_id = p_aluno and e.nivel = 'ouro';
  end if;
  if t is null then
    select concedida_em into t from insignias where aluno_id = p_aluno and chave = p_chave;
  end if;
  return t;
end $$;

-- painel da professora: por insígnia-base, o pioneiro confirmado ou o candidato da vez
create or replace function public.pioneiros_da_turma(p_turma uuid)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare dono uuid; r json;
begin
  select owner_id into dono from turmas where id = p_turma;
  if dono is null or dono <> auth.uid() then return json_build_object('ok', false, 'erro', 'Turma não é sua.'); end if;
  select coalesce(json_agg(x order by array_position(_bases_pioneiro(), x.base)), '[]'::json) into r from (
    select b.base,
      (select json_build_object('aluno_id', p.aluno_id, 'nome', al.nome, 'feito_em', p.feito_em, 'decidido_em', p.decidido_em)
         from pioneiros p join alunos al on al.id = p.aluno_id
        where p.turma_id = p_turma and p.base = b.base and p.status = 'confirmado') as confirmado,
      (select json_build_object('aluno_id', c.aluno_id, 'nome', c.nome, 'feito_em', c.feito_em, 'dado', c.dado,
                                'na_fila', c.na_fila, 'recusados', c.recusados)
         from (select i.aluno_id, al.nome, i.dado, _momento_insignia(i.aluno_id, b.base) feito_em,
                      count(*) over () na_fila,
                      (select count(*) from pioneiros p2 where p2.turma_id = p_turma and p2.base = b.base and p2.status = 'recusado') recusados
                 from insignias i join alunos al on al.id = i.aluno_id
                where al.turma_id = p_turma and i.chave = b.base
                  and not exists (select 1 from pioneiros p3 where p3.turma_id = p_turma and p3.base = b.base and p3.aluno_id = i.aluno_id)
                order by 4 nulls last, al.nome limit 1) c
        where not exists (select 1 from pioneiros p4 where p4.turma_id = p_turma and p4.base = b.base and p4.status = 'confirmado')) as candidato
    from unnest(_bases_pioneiro()) b(base)
  ) x;
  return json_build_object('ok', true, 'pioneiros', r);
end $$;

-- confirmar | recusar | desfazer (desfazer apaga a decisão e tira a insígnia, se tiver)
create or replace function public.decidir_pioneiro(p_turma uuid, p_base text, p_aluno uuid, p_acao text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare dono uuid; al alunos; quando timestamptz; motivo text;
begin
  select owner_id into dono from turmas where id = p_turma;
  if dono is null or dono <> auth.uid() then return json_build_object('ok', false, 'erro', 'Turma não é sua.'); end if;
  if not (p_base = any(_bases_pioneiro())) then return json_build_object('ok', false, 'erro', 'Essa insígnia não tem versão Pioneiro.'); end if;
  select * into al from alunos where id = p_aluno and turma_id = p_turma;
  if al.id is null then return json_build_object('ok', false, 'erro', 'Aluno não é desta turma.'); end if;

  if p_acao = 'desfazer' then
    delete from pioneiros where turma_id = p_turma and base = p_base and aluno_id = p_aluno;
    delete from insignias where aluno_id = p_aluno and chave = 'pioneiro_' || p_base;
    return json_build_object('ok', true);
  end if;

  if not exists (select 1 from insignias where aluno_id = p_aluno and chave = p_base) then
    return json_build_object('ok', false, 'erro', 'O aluno ainda não tem a insígnia-base.');
  end if;
  quando := _momento_insignia(p_aluno, p_base);

  if p_acao = 'recusar' then
    insert into pioneiros (owner_id, turma_id, base, aluno_id, status, feito_em) values (dono, p_turma, p_base, p_aluno, 'recusado', quando)
    on conflict (turma_id, base, aluno_id) do update set status = 'recusado', decidido_em = now();
    return json_build_object('ok', true);
  elsif p_acao = 'confirmar' then
    if exists (select 1 from pioneiros where turma_id = p_turma and base = p_base and status = 'confirmado' and aluno_id <> p_aluno) then
      return json_build_object('ok', false, 'erro', 'Esta turma já tem pioneiro nessa insígnia. Desfaça antes.');
    end if;
    insert into pioneiros (owner_id, turma_id, base, aluno_id, status, feito_em) values (dono, p_turma, p_base, p_aluno, 'confirmado', quando)
    on conflict (turma_id, base, aluno_id) do update set status = 'confirmado', decidido_em = now();
    select 'Primeiro da turma' || coalesce(' em ' || to_char(quando at time zone 'America/Recife', 'DD/MM'), '')
           || coalesce(' · ' || dado, '') into motivo
      from insignias where aluno_id = p_aluno and chave = p_base;
    insert into insignias (owner_id, aluno_id, chave, dado, origem) values (dono, p_aluno, 'pioneiro_' || p_base, motivo, 'professora')
    on conflict (aluno_id, chave) do nothing;
    return json_build_object('ok', true);
  end if;
  return json_build_object('ok', false, 'erro', 'Ação inválida.');
end $$;

revoke all on function public.pioneiros_da_turma(uuid) from public, anon;
revoke all on function public.decidir_pioneiro(uuid, text, uuid, text) from public, anon;
revoke all on function public._momento_insignia(uuid, text) from public, anon, authenticated;
grant execute on function public.pioneiros_da_turma(uuid) to authenticated;
grant execute on function public.decidir_pioneiro(uuid, text, uuid, text) to authenticated;

-- Depois, no Supabase: pioneiro_por_funcao (18 funções, _pioneiro_feito), pioneiro_automatico
-- (_conferir_pioneiros, _rodada_insignias; desfazer = passar ao próximo) e pioneiro_aguarda_arte_oficial
-- (desligado até ela liberar a arte: religar cron orbe-insignias-pioneiros */5 e o conferir).
