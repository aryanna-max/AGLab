-- Professor(a) auxiliar do dia — já aplicado no projeto chamada-ag-docencia.
-- Guardado aqui para haver registro do que existe no banco: até então o schema
-- só vivia no Supabase, e quem lesse o repositório não teria como saber.
--
-- A ideia: a titular empresta a caderneta de UM dia para alguém que já está no
-- cadastro da turma. O acesso é um PIN de 6 dígitos que morre à meia-noite de
-- Recife — a chave da sala emprestada, não uma cópia do molho. Quem recebe abre
-- /auxiliar com a própria matrícula + o PIN e vê apenas: o QR da aula de hoje e
-- a lista de presença daquela turma. Sem fotos, sem missões, sem outras turmas,
-- sem outros dias.

-- ---------- o acesso ----------
create table if not exists public.auxiliar_acessos (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  turma_id    uuid not null references public.turmas(id) on delete cascade,
  aluno_id    uuid not null references public.alunos(id) on delete cascade,
  data        date not null,
  pin         text not null check (pin ~ '^[0-9]{6}$'),
  criado_em   timestamptz not null default now(),
  expira_em   timestamptz not null,
  revogado    boolean not null default false,
  tentativas  integer not null default 0,
  usado_em    timestamptz,
  unique (turma_id, data)
);

create index if not exists auxiliar_acessos_busca on public.auxiliar_acessos (data, pin);

alter table public.auxiliar_acessos enable row level security;

drop policy if exists auxiliar_acessos_owner_all on public.auxiliar_acessos;
create policy auxiliar_acessos_owner_all on public.auxiliar_acessos
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ---------- hoje, pelo relógio daqui ----------
-- A aula é em Recife, não em UTC: perto da meia-noite os dois discordam.
create or replace function public.hoje_recife() returns date
language sql stable
set search_path to 'public'
as $$ select (now() at time zone 'America/Recife')::date $$;

-- ---------- o que a professora faz ----------
-- Sem SECURITY DEFINER de propósito: roda como ela, e o RLS é quem garante
-- que ninguém libera caderneta de turma alheia.
create or replace function public.liberar_auxiliar(p_turma_id uuid, p_aluno_id uuid)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  d date := hoje_recife();
  novo_pin text;
  nome_aux text;
  fim timestamptz;
begin
  select a.nome into nome_aux
    from alunos a where a.id = p_aluno_id and a.turma_id = p_turma_id;
  if nome_aux is null then
    return jsonb_build_object('ok', false, 'erro', 'Essa pessoa não está na turma escolhida.');
  end if;

  -- 6 dígitos tirados de um uuid v4, não de random()
  novo_pin := lpad((abs(('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::int) % 1000000)::text, 6, '0');
  fim := ((d + 1)::timestamp at time zone 'America/Recife');   -- meia-noite de Recife

  insert into auxiliar_acessos (owner_id, turma_id, aluno_id, data, pin, expira_em)
  values (auth.uid(), p_turma_id, p_aluno_id, d, novo_pin, fim)
  on conflict (turma_id, data) do update
    set aluno_id = excluded.aluno_id, pin = excluded.pin, expira_em = excluded.expira_em,
        revogado = false, tentativas = 0, usado_em = null, criado_em = now();

  return jsonb_build_object('ok', true, 'pin', novo_pin, 'nome', nome_aux,
                            'data', d, 'expira_em', fim);
end $$;

create or replace function public.revogar_auxiliar(p_turma_id uuid)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
begin
  update auxiliar_acessos set revogado = true
   where turma_id = p_turma_id and data = hoje_recife();
  return jsonb_build_object('ok', found);
end $$;

-- ---------- a conferência ----------
-- Errou o PIN, conta a tentativa; 10 erros fecham o acesso até a professora
-- liberar de novo. Sem isso, 6 dígitos seriam força bruta fácil.
-- Devolve a linha inteira (com o PIN dentro), por isso fica FORA da API.
create or replace function public._auxiliar_acesso(p_matricula text, p_pin text)
returns public.auxiliar_acessos
language plpgsql volatile security definer
set search_path to 'public'
as $$
declare ac auxiliar_acessos;
begin
  select ax.* into ac
    from auxiliar_acessos ax
    join alunos a on a.id = ax.aluno_id
   where ax.data = hoje_recife()
     and ax.revogado = false
     and ax.expira_em > now()
     and ax.tentativas < 10
     and upper(replace(btrim(a.matricula), ' ', '')) = upper(replace(btrim(coalesce(p_matricula, '')), ' ', ''))
   limit 1;

  if ac.id is null then return null; end if;

  if ac.pin is distinct from coalesce(p_pin, '') then
    update auxiliar_acessos set tentativas = tentativas + 1 where id = ac.id;
    return null;
  end if;

  update auxiliar_acessos set usado_em = now(), tentativas = 0 where id = ac.id;
  return ac;
end $$;

-- ---------- a caderneta, como a auxiliar vê ----------
-- A sessão que vale é a amarrada à chamada de HOJE: sem isso, uma sessão
-- esquecida aberta na semana passada mostraria o QR com a janela errada.
create or replace function public.painel_auxiliar(p_matricula text, p_pin text)
returns jsonb
language plpgsql volatile security definer
set search_path to 'public'
as $$
declare
  ac auxiliar_acessos;
  ses sessoes_coleta;
  chid uuid;
  t record;
  lista jsonb;
begin
  ac := _auxiliar_acesso(p_matricula, p_pin);
  if ac.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Matrícula ou PIN não conferem, ou o acesso de hoje não está liberado.');
  end if;

  select tu.nome, tu.codigo into t from turmas tu where tu.id = ac.turma_id;

  select c.id into chid from chamadas c
   where c.turma_id = ac.turma_id and c.data = ac.data;

  if chid is not null then
    select s.* into ses from sessoes_coleta s
     where s.turma_id = ac.turma_id and s.aberta and s.chamada_id = chid
     order by s.criada_em desc limit 1;
  end if;

  -- só nome e matrícula: foto de aluno não sai daqui
  select coalesce(jsonb_agg(x order by x->>'nome'), '[]'::jsonb) into lista from (
    select jsonb_build_object(
             'id', a.id, 'nome', a.nome, 'matricula', a.matricula,
             'presente', p.id is not null,
             'origem', p.origem,
             'minha', p.origem = 'auxiliar'
           ) as x
      from alunos a
      left join presencas p on p.aluno_id = a.id and p.chamada_id = chid
     where a.turma_id = ac.turma_id
  ) s;

  return jsonb_build_object(
    'ok', true,
    'nome', (select a.nome from alunos a where a.id = ac.aluno_id),
    'turma', t.nome,
    'data', ac.data,
    'expira_em', ac.expira_em,
    'chamada_id', chid,
    'sessao', case when ses.id is null then null else jsonb_build_object(
        'codigo', ses.codigo, 'aberta', ses.aberta, 'local', ses.local,
        'janela_inicio', ses.janela_inicio, 'janela_fim', ses.janela_fim) end,
    'alunos', lista
  );
end $$;

-- ---------- marcar e desmarcar na mão ----------
-- Ela só desfaz o que ela mesma marcou: presença que veio do QR do aluno fica
-- para a professora resolver na aba Chamada.
create or replace function public.auxiliar_marcar(p_matricula text, p_pin text, p_aluno_id uuid, p_presente boolean)
returns jsonb
language plpgsql volatile security definer
set search_path to 'public'
as $$
declare
  ac auxiliar_acessos;
  chid uuid;
  alvo alunos;
  atual presencas;
begin
  ac := _auxiliar_acesso(p_matricula, p_pin);
  if ac.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Acesso não confere.');
  end if;

  select a.* into alvo from alunos a where a.id = p_aluno_id and a.turma_id = ac.turma_id;
  if alvo.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Esse aluno não é da turma liberada.');
  end if;

  select c.id into chid from chamadas c where c.turma_id = ac.turma_id and c.data = ac.data;
  if chid is null then
    insert into chamadas (owner_id, turma_id, data) values (ac.owner_id, ac.turma_id, ac.data)
    on conflict (turma_id, data) do update set data = excluded.data
    returning id into chid;
  end if;

  if p_presente then
    insert into presencas (owner_id, chamada_id, aluno_id, origem)
    values (ac.owner_id, chid, p_aluno_id, 'auxiliar')
    on conflict (chamada_id, aluno_id) do nothing;
    return jsonb_build_object('ok', true, 'presente', true);
  end if;

  select p.* into atual from presencas p where p.chamada_id = chid and p.aluno_id = p_aluno_id;
  if atual.id is null then
    return jsonb_build_object('ok', true, 'presente', false);
  end if;
  if atual.origem is distinct from 'auxiliar' then
    return jsonb_build_object('ok', false, 'presente', true,
      'erro', 'Essa presença veio do QR do aluno — só a professora pode desfazer.');
  end if;
  delete from presencas where id = atual.id;
  return jsonb_build_object('ok', true, 'presente', false);
end $$;

-- ---------- quem pode chamar o quê ----------
-- O EXECUTE nasce concedido a PUBLIC: revogar de anon/authenticated não basta,
-- é de PUBLIC que ele precisa sair.
revoke execute on function public._auxiliar_acesso(text, text) from public, anon, authenticated;

revoke execute on function public.liberar_auxiliar(uuid, uuid) from public, anon;
revoke execute on function public.revogar_auxiliar(uuid) from public, anon;
grant  execute on function public.liberar_auxiliar(uuid, uuid) to authenticated;
grant  execute on function public.revogar_auxiliar(uuid) to authenticated;

-- estas duas são a porta da auxiliar: entra sem conta, com matrícula + PIN
grant execute on function public.painel_auxiliar(text, text) to anon, authenticated;
grant execute on function public.auxiliar_marcar(text, text, uuid, boolean) to anon, authenticated;
grant execute on function public.hoje_recife() to anon, authenticated;
