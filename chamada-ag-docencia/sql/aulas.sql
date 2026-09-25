-- Aulas: o material que o aluno tem à mão, em cartões.
--
-- O desenho é o mesmo das missões, e de propósito: a professora mantém um
-- CARDÁPIO de aulas (sem turma) e LANÇA a aula na turma quando ela acontece.
-- Assim a HQ de planimetria é escrita uma vez e serve 2026.1, 2026.2 e a turma
-- da noite — como a missão "Poços do trecho" já faz hoje.
--
--   aulas             cardápio dela, sem turma        (≅ missoes)
--   aula_pecas        as peças de uma aula            (cartão, ficha, HQ, PDF)
--   aula_lancamentos  aula × turma                    (≅ missao_lancamentos)
--   aula_leituras     quem abriu qual peça, e quando
--
-- Não há número de aula: o aluno não lembra que foi a aula 4, lembra que era
-- sobre azimute. Quem nomeia é o título; a frente é etiqueta.
--
-- Para o ALUNO a lista é corrida, na ordem em que ela lançou — foi assim que a
-- turma viu o semestre acontecer. A divisão por frente é a organização DELA,
-- no cardápio, onde o acervo cresce e precisa de gaveta.

-- ---------- o cardápio ----------
create table if not exists public.aulas (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  titulo      text not null,
  frente      text not null default 'geral',
  resumo      text,
  arquivada   boolean not null default false,
  criada_em   timestamptz not null default now()
);

-- ---------- as peças ----------
-- texto_md  → 'cartao' e 'ficha': o conteúdo mora aqui, na linha. É o que faz o
--             semestre inteiro caber no celular e a busca funcionar.
-- url       → 'hq' e 'pdf' servidos pelo próprio app (/aulas/...), fora do
--             pacote offline: ver globIgnores em vite.config.js.
-- storage_path → o mesmo, quando o arquivo vier do Storage (fase 2, com editor).
create table if not exists public.aula_pecas (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  aula_id      uuid not null references public.aulas(id) on delete cascade,
  tipo         text not null check (tipo in ('cartao', 'ficha', 'hq', 'pdf')),
  ordem        integer not null default 0,
  titulo       text,
  texto_md     text,
  url          text,
  storage_path text,
  largura      integer,
  altura       integer,
  -- cartão e ficha precisam de texto; hq e pdf precisam de arquivo
  constraint aula_pecas_conteudo check (
    (tipo in ('cartao', 'ficha') and texto_md is not null)
    or (tipo in ('hq', 'pdf') and (url is not null or storage_path is not null))
  )
);

create index if not exists aula_pecas_da_aula on public.aula_pecas (aula_id, ordem);

-- ---------- o lançamento na turma ----------
create table if not exists public.aula_lancamentos (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  aula_id     uuid not null references public.aulas(id) on delete cascade,
  turma_id    uuid not null references public.turmas(id) on delete cascade,
  data        date,
  publicada   boolean not null default true,
  criado_em   timestamptz not null default now(),
  unique (aula_id, turma_id)
);

create index if not exists aula_lancamentos_da_turma on public.aula_lancamentos (turma_id, data);

-- ---------- quem leu ----------
-- Uma linha por peça aberta. Por peça, e não por aula, porque é isso que
-- responde as duas perguntas: "quem leu a aula?" e "onde o aluno parou?".
create table if not exists public.aula_leituras (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  lancamento_id  uuid not null references public.aula_lancamentos(id) on delete cascade,
  aluno_id       uuid not null references public.alunos(id) on delete cascade,
  peca_id        uuid not null references public.aula_pecas(id) on delete cascade,
  primeira_em    timestamptz not null default now(),
  ultima_em      timestamptz not null default now(),
  vezes          integer not null default 1,
  unique (lancamento_id, aluno_id, peca_id)
);

create index if not exists aula_leituras_do_lancamento on public.aula_leituras (lancamento_id, aluno_id);

-- ---------- RLS: a professora vê e mexe no que é dela ----------
alter table public.aulas            enable row level security;
alter table public.aula_pecas       enable row level security;
alter table public.aula_lancamentos enable row level security;
alter table public.aula_leituras    enable row level security;

drop policy if exists aulas_owner_all on public.aulas;
create policy aulas_owner_all on public.aulas
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists aula_pecas_owner_all on public.aula_pecas;
create policy aula_pecas_owner_all on public.aula_pecas
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists aula_lancamentos_owner_all on public.aula_lancamentos;
create policy aula_lancamentos_owner_all on public.aula_lancamentos
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- leitura do aluno entra por RPC (security definer); a professora só lê
drop policy if exists aula_leituras_owner_read on public.aula_leituras;
create policy aula_leituras_owner_read on public.aula_leituras
  for select to authenticated using (owner_id = auth.uid());

-- ---------- quem é o aluno que está pedindo ----------
-- Mesma dupla que as outras RPCs do aluno usam: matrícula OU id.
create or replace function public._aula_aluno(p_matricula text, p_aluno_id uuid)
returns public.alunos
language sql stable security definer
set search_path to 'public'
as $$
  select a.* from alunos a
   where (p_aluno_id is not null and a.id = p_aluno_id)
      or (p_aluno_id is null
          and upper(replace(btrim(a.matricula), ' ', '')) = upper(replace(btrim(coalesce(p_matricula, '')), ' ', '')))
   limit 1
$$;

-- ---------- a lista de aulas da turma do aluno ----------
create or replace function public.minhas_aulas(p_matricula text, p_aluno_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  al alunos;
  lista jsonb;
begin
  al := _aula_aluno(p_matricula, p_aluno_id);
  if al.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Não achei essa matrícula.');
  end if;

  select coalesce(jsonb_agg(x order by quando, criada), '[]'::jsonb) into lista from (
    select jsonb_build_object(
             'lancamento_id', l.id,
             'aula_id',       a.id,
             'titulo',        a.titulo,
             'frente',        a.frente,
             'resumo',        a.resumo,
             'data',          l.data,
             'tem_hq',        exists (select 1 from aula_pecas p where p.aula_id = a.id and p.tipo = 'hq'),
             'pecas',         (select count(*) from aula_pecas p where p.aula_id = a.id),
             'li',            (select count(*) from aula_leituras r
                                where r.lancamento_id = l.id and r.aluno_id = al.id)
           ) as x,
           -- na ordem em que ela lançou: é assim que a turma viu o semestre
           -- acontecer, e é o que o aluno tem na cabeça ao procurar.
           coalesce(l.data, l.criado_em::date) as quando,
           l.criado_em as criada
      from aula_lancamentos l
      join aulas a on a.id = l.aula_id
     where l.turma_id = al.turma_id and l.publicada and not a.arquivada
  ) s;

  return jsonb_build_object('ok', true, 'aulas', lista);
end $$;

-- ---------- uma aula inteira, com as peças ----------
create or replace function public.minha_aula(p_matricula text, p_aluno_id uuid, p_lancamento_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  al alunos;
  lan aula_lancamentos;
  au aulas;
  pecas jsonb;
begin
  al := _aula_aluno(p_matricula, p_aluno_id);
  if al.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Não achei essa matrícula.');
  end if;

  select l.* into lan from aula_lancamentos l
   where l.id = p_lancamento_id and l.turma_id = al.turma_id and l.publicada;
  if lan.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Essa aula não é da sua turma.');
  end if;

  select a.* into au from aulas a where a.id = lan.aula_id and not a.arquivada;
  if au.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Essa aula saiu do ar.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'tipo', p.tipo, 'ordem', p.ordem, 'titulo', p.titulo,
           'texto_md', p.texto_md, 'url', p.url, 'storage_path', p.storage_path,
           'largura', p.largura, 'altura', p.altura,
           'lida', exists (select 1 from aula_leituras r
                            where r.lancamento_id = lan.id and r.aluno_id = al.id and r.peca_id = p.id)
         ) order by p.ordem, p.id), '[]'::jsonb) into pecas
    from aula_pecas p where p.aula_id = au.id;

  return jsonb_build_object('ok', true,
    'lancamento_id', lan.id, 'data', lan.data,
    'titulo', au.titulo, 'frente', au.frente, 'resumo', au.resumo,
    'pecas', pecas);
end $$;

-- ---------- o aluno abriu uma peça ----------
-- Idempotente: a primeira vez grava, as seguintes só contam.
create or replace function public.marcar_leitura(p_matricula text, p_aluno_id uuid, p_lancamento_id uuid, p_peca_id uuid)
returns jsonb
language plpgsql volatile security definer
set search_path to 'public'
as $$
declare
  al alunos;
  lan aula_lancamentos;
begin
  al := _aula_aluno(p_matricula, p_aluno_id);
  if al.id is null then return jsonb_build_object('ok', false); end if;

  select l.* into lan from aula_lancamentos l
   where l.id = p_lancamento_id and l.turma_id = al.turma_id and l.publicada;
  if lan.id is null then return jsonb_build_object('ok', false); end if;

  -- a peça tem que ser da aula lançada: sem isso, um id solto marcaria leitura alheia
  if not exists (select 1 from aula_pecas p where p.id = p_peca_id and p.aula_id = lan.aula_id) then
    return jsonb_build_object('ok', false);
  end if;

  insert into aula_leituras (owner_id, lancamento_id, aluno_id, peca_id)
  values (lan.owner_id, lan.id, al.id, p_peca_id)
  on conflict (lancamento_id, aluno_id, peca_id) do update
    set ultima_em = now(), vezes = aula_leituras.vezes + 1;

  return jsonb_build_object('ok', true);
end $$;

-- ---------- quem leu, para a professora ----------
-- Uma linha por aluno da turma, inclusive quem não abriu: é isso que ela quer
-- ver. 'pecas_texto' são os cartões e a ficha — a HQ não conta como leitura
-- concluída porque abrir a HQ é um toque só.
create or replace function public.leitores_da_aula(p_lancamento_id uuid)
returns jsonb
language plpgsql stable
set search_path to 'public'
as $$
declare
  lan aula_lancamentos;
  total_texto int;
  lista jsonb;
begin
  -- sem security definer: roda como a professora e o RLS garante que é aula dela
  select l.* into lan from aula_lancamentos l where l.id = p_lancamento_id;
  if lan.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Lançamento não encontrado.');
  end if;

  select count(*) into total_texto from aula_pecas p
   where p.aula_id = lan.aula_id and p.tipo in ('cartao', 'ficha');

  select coalesce(jsonb_agg(x order by x->>'nome'), '[]'::jsonb) into lista from (
    select jsonb_build_object(
             'aluno_id', a.id, 'nome', a.nome, 'matricula', a.matricula,
             'lidas', (select count(*) from aula_leituras r
                        join aula_pecas p on p.id = r.peca_id and p.tipo in ('cartao', 'ficha')
                       where r.lancamento_id = lan.id and r.aluno_id = a.id),
             'ultima_em', (select max(r.ultima_em) from aula_leituras r
                            where r.lancamento_id = lan.id and r.aluno_id = a.id)
           ) as x
      from alunos a where a.turma_id = lan.turma_id
  ) s;

  return jsonb_build_object('ok', true, 'total_texto', total_texto, 'alunos', lista);
end $$;

-- ---------- quem pode chamar o quê ----------
revoke execute on function public._aula_aluno(text, uuid) from public, anon, authenticated;

grant execute on function public.minhas_aulas(text, uuid) to anon, authenticated;
grant execute on function public.minha_aula(text, uuid, uuid) to anon, authenticated;
grant execute on function public.marcar_leitura(text, uuid, uuid, uuid) to anon, authenticated;

revoke execute on function public.leitores_da_aula(uuid) from public, anon;
grant  execute on function public.leitores_da_aula(uuid) to authenticated;
