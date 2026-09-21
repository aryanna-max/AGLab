-- Primeira foto (e o Pioneiro dela) — 21/09/2026
--
-- Duas insígnias novas para a foto do ponto:
--   primeira_foto           o primeiro pin do aluno com foto (verde, Primeiros passos)
--   pioneiro_primeira_foto  o primeiro da turma a conseguir (roxo, Especiais)
--
-- A segunda NÃO é escrita aqui: basta somar 'primeira_foto' às bases de _bases_pioneiro()
-- e o maquinário que já existe (_conferir_pioneiros) concede pioneiro_primeira_foto
-- sozinho, grava a linha em pioneiros e deixa a professora desfazer por decidir_pioneiro.
--
-- Idempotente: as três funções são CREATE OR REPLACE e as regras só leem o passado
-- (min(criado_em)), então reconferir não muda quem ganhou.

begin;

-- 1) A base entra na lista do Pioneiro, junto das outras 18.
create or replace function public._bases_pioneiro()
 returns text[]
 language sql
 immutable
as $function$
  select array['no_ar','presente','rosto','avatar','avisos','primeiro_pin','primeira_foto','parado','tres_amb','no_marco','na_mosca',
               'poligonal','cadastrador','caderneta','missao','equipe','envio_oficial','primeiro_ouro','tres_frentes']
$function$;

-- 2) Quando o aluno fez, para _conferir_pioneiros saber quem chegou primeiro.
--    Sem isto, _pioneiro_feito cairia em concedida_em — a hora em que a regra rodou,
--    não a hora da foto, e o pioneiro sairia errado.
create or replace function public._momento_insignia(p_aluno uuid, p_chave text)
 returns timestamp with time zone
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare t timestamptz;
begin
  if p_chave = 'primeiro_pin' then
    select min(criado_em) into t from pins where aluno_id = p_aluno;
  elsif p_chave = 'primeira_foto' then
    select min(criado_em) into t from pins where aluno_id = p_aluno and tem_foto;
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
end $function$;

-- 3) A regra em si, no mesmo lugar das outras.
create or replace function public._avaliar_insignias(p_aluno uuid, p_instalado boolean default false)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare a alunos; novas int := 0; d text; v double precision; v2 double precision; t text;
  procedure_dummy int;
begin
  select * into a from alunos where id = p_aluno;
  if a.id is null then return 0; end if;

  create temp table if not exists _novas (chave text, dado text) on commit drop;
  truncate _novas;

  -- No ar: o app está instalado na tela de início (o próprio app avisa)
  if p_instalado then insert into _novas values ('no_ar', 'App instalado na tela de início'); end if;

  -- Presente: primeira presença registrada pelo app
  select to_char(min(p.created_at) at time zone 'America/Recife', 'DD/MM') into d
    from presencas p where p.aluno_id = a.id and p.origem = 'chamada_aluno';
  if d is not null then insert into _novas values ('presente', 'Primeira presença pelo app em ' || d); end if;

  -- Rosto no radar: selfie enviada
  if a.foto_data is not null or a.foto_path is not null then insert into _novas values ('rosto', 'Selfie enviada'); end if;

  -- Primeiro pin
  select 'Pin "' || nome || '" em ' || to_char(criado_em at time zone 'America/Recife', 'DD/MM') into d
    from pins where aluno_id = a.id order by criado_em limit 1;
  if d is not null then insert into _novas values ('primeiro_pin', d); end if;

  -- Primeira foto: o primeiro pin com foto do ponto. Até aqui a primeira foto não valia
  -- nada sozinha: só contava ao juntar cinco, na Cadastrador.
  select 'Pin "' || nome || '" com foto em ' || to_char(criado_em at time zone 'America/Recife', 'DD/MM') into d
    from pins where aluno_id = a.id and tem_foto order by criado_em limit 1;
  if d is not null then insert into _novas values ('primeira_foto', d); end if;

  -- Parado de verdade: ocupação com 10+ leituras e espalhamento baixo
  select min(sqrt(coalesce(desvio_n_m, 0) ^ 2 + coalesce(desvio_e_m, 0) ^ 2)) into v
    from pins where aluno_id = a.id and n_leituras >= 10 and desvio_n_m is not null
      and sqrt(coalesce(desvio_n_m, 0) ^ 2 + coalesce(desvio_e_m, 0) ^ 2) between 0.05 and 1.0;
  if v is not null then insert into _novas values ('parado', 'Espalhamento de ' || replace(to_char(v, 'FM0.00'), '.', ',') || ' m numa ocupação'); end if;

  -- Três ambientes no mesmo dia
  select to_char(dia, 'DD/MM') into d from (
    select date_trunc('day', coalesce(l.capturado_em, l.criado_em) at time zone 'America/Recife') dia
      from leituras_gps l where l.aluno_id = a.id and l.rotulo in ('sala', 'corredor', 'patio')
     group by 1 having count(distinct l.rotulo) = 3 order by 1 limit 1) x;
  if d is not null then insert into _novas values ('tres_amb', 'Sala, corredor e pátio em ' || d); end if;

  -- No marco / Na mosca: pin perto de um marco oficial (classificado pelo lugar)
  select x.dist, x.nome into v, t from (
    select p.id, min(sqrt((p.utm_n - m.n) ^ 2 + (p.utm_e - m.e) ^ 2)) dist,
           (array_agg(m.nome order by sqrt((p.utm_n - m.n) ^ 2 + (p.utm_e - m.e) ^ 2)))[1] nome
      from pins p cross join _marcos_oficiais() m
     where p.aluno_id = a.id and p.utm_n is not null group by p.id) x
   order by x.dist limit 1;
  if v is not null and v <= 5 then insert into _novas values ('no_marco', 'Pin a ' || replace(to_char(v, 'FM0.0'), '.', ',') || ' m do ' || t); end if;
  if v is not null and v <= 3 then insert into _novas values ('na_mosca', 'Pin a ' || replace(to_char(v, 'FM0.0'), '.', ',') || ' m do ' || t); end if;

  -- Poligonal fechada, sem cruzamento
  select 'Poligonal "' || nome || '" com ' || jsonb_array_length(to_jsonb(pin_ids)) || ' vértices' into d
    from poligonais where aluno_id = a.id and coalesce(array_length(pin_ids, 1), 0) >= 3
      and coalesce((resultado->>'cruzada')::boolean, false) = false
    order by criado_em limit 1;
  if d is not null then insert into _novas values ('poligonal', d); end if;

  -- Cadastrador: cinco pins com foto do ponto
  select count(*) into v from pins where aluno_id = a.id and tem_foto;
  if v >= 5 then insert into _novas values ('cadastrador', v::int || ' pins com foto do ponto'); end if;

  -- Missões
  select 'Ouro em "' || m.titulo || '"' into d
    from missao_entregas e join missao_lancamentos l on l.id = e.lancamento_id join missoes m on m.id = l.missao_id
   where e.aluno_id = a.id and e.nivel = 'ouro' order by e.atualizado_em limit 1;
  if d is not null then insert into _novas values ('primeiro_ouro', d); end if;

  select count(distinct m.frente) into v
    from missao_entregas e join missao_lancamentos l on l.id = e.lancamento_id join missoes m on m.id = l.missao_id
   where e.aluno_id = a.id and e.nivel is not null and m.frente in ('planimetria', 'altimetria', 'planialtimetria');
  if v >= 3 then insert into _novas values ('tres_frentes', 'Nível nas três frentes'); end if;

  -- Pontual: três missões seguidas entregues dentro do prazo
  select 1 into v from (
    select (e.enviada_em is not null and not coalesce(e.fora_do_prazo, false)) ok,
           lag((e.enviada_em is not null and not coalesce(e.fora_do_prazo, false))) over w a1,
           lag((e.enviada_em is not null and not coalesce(e.fora_do_prazo, false)), 2) over w a2
      from missao_lancamentos l left join missao_entregas e on e.lancamento_id = l.id and e.aluno_id = a.id
     where l.turma_id = a.turma_id window w as (order by l.prazo_em)) s
   where s.ok and s.a1 and s.a2 limit 1;
  if v = 1 then insert into _novas values ('pontual', 'Três missões seguidas no prazo'); end if;

  select 'Refez e foi aceita: "' || m.titulo || '"' into d
    from missao_entregas e join missao_lancamentos l on l.id = e.lancamento_id join missoes m on m.id = l.missao_id
   where e.aluno_id = a.id and e.status = 'aceita' and e.refez_em is not null order by e.atualizado_em limit 1;
  if d is not null then insert into _novas values ('volta', d); end if;

  select 'Equipe na missão "' || m.titulo || '"' into d
    from missao_entregas e join missao_lancamentos l on l.id = e.lancamento_id join missoes m on m.id = l.missao_id
   where e.aluno_id = a.id and e.status = 'aceita' and l.em_equipe order by e.atualizado_em limit 1;
  if d is not null then insert into _novas values ('equipe', d); end if;

  select 'Enviou pela equipe: "' || m.titulo || '"' into d
    from missao_entregas e join missao_lancamentos l on l.id = e.lancamento_id join missoes m on m.id = l.missao_id
   where e.aluno_id = a.id and e.status = 'aceita' and l.em_equipe and e.enviada_por = a.id order by e.atualizado_em limit 1;
  if d is not null then insert into _novas values ('envio_oficial', d); end if;

  insert into insignias (owner_id, aluno_id, chave, dado, origem)
  select a.owner_id, a.id, n.chave, n.dado, 'automatica' from _novas n
  on conflict (aluno_id, chave) do nothing;
  get diagnostics novas = row_count;
  return novas;
end $function$;

commit;
