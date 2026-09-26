-- Um celular, uma presença por dia — aplicado no projeto chamada-ag-docencia.
--
-- Caso de 26/09: o celular da Marinalva ficou com a identidade da Maria Luisa
-- (trocada numa atividade em dupla em 19/09) e marcou presença para ela, que
-- não estava na aula. A chamada sem QR confere ONDE o celular está, não DE
-- QUEM ele é.
--
-- Agora o app guarda um identificador próprio do aparelho (extra.aparelho_id,
-- sorteado uma vez e mantido mesmo quando o aluno troca de identidade). Se o
-- mesmo aparelho registra chamada para um segundo aluno da turma no mesmo dia,
-- as duas presenças automáticas saem e ficam "a conferir": quem decide é a
-- professora. Presença marcada à mão (manual, auxiliar) não é tocada.

-- ---------- a regra ----------
-- Devolve os outros alunos que já registraram chamada neste aparelho hoje
-- (e rebaixa as presenças automáticas deles), ou null se não há conflito.
-- Fica FORA da API: só enviar_leitura chama.
create or replace function public._presenca_mesmo_aparelho(p_aparelho text, p_aluno uuid, p_turma uuid, p_chamada uuid)
returns uuid[]
language plpgsql volatile security definer
set search_path to 'public'
as $$
declare outros uuid[];
begin
  if p_aparelho is null or btrim(p_aparelho) = '' then return null; end if;

  select array_agg(distinct l.aluno_id) into outros
    from leituras_gps l join alunos a2 on a2.id = l.aluno_id
   where l.extra->>'aparelho_id' = p_aparelho
     and l.extra ? 'chamada'
     and l.aluno_id <> p_aluno
     and a2.turma_id = p_turma
     and (l.criado_em at time zone 'America/Recife')::date = hoje_recife();

  if outros is null then return null; end if;

  if p_chamada is not null then
    delete from presencas
     where chamada_id = p_chamada and aluno_id = any(outros) and origem = 'chamada_aluno';
  end if;

  update leituras_gps
     set presenca_marcada = false,
         extra = coalesce(extra, '{}'::jsonb) || jsonb_build_object('motivo', 'mesmo_aparelho')
   where extra->>'aparelho_id' = p_aparelho
     and extra ? 'chamada'
     and aluno_id = any(outros)
     and (criado_em at time zone 'America/Recife')::date = hoje_recife();

  return outros;
end $$;

revoke all on function public._presenca_mesmo_aparelho(text, uuid, uuid, uuid) from public, anon, authenticated;

-- ---------- enviar_leitura com a regra ----------
-- Igual à versão anterior, mais: lê extra.aparelho_id antes do corte de 4 KB
-- (a chamada manda a lista de fixações e pode passar disso) e, nas duas
-- chamadas (com e sem QR), consulta _presenca_mesmo_aparelho antes de marcar.
create or replace function public.enviar_leitura(p_codigo text, p_matricula text, p_lat double precision, p_lon double precision, p_acuracia real, p_altitude double precision, p_alt_acuracia real, p_rotulo text, p_utm_n double precision, p_utm_e double precision, p_dist_perc real, p_capturado_em timestamp with time zone DEFAULT NULL::timestamp with time zone, p_online boolean DEFAULT NULL::boolean, p_fix_ts timestamp with time zone DEFAULT NULL::timestamp with time zone, p_extra jsonb DEFAULT NULL::jsonb, p_aluno_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a record; total int; meu real; turma_best real; turma_n int;
  marcou boolean := false; motivo text := null; agora timestamptz := now();
  cap timestamptz; fixts timestamptz; ex jsonb; rot text := p_rotulo;
  livre boolean := (p_codigo is null or btrim(p_codigo) = '');
  mat text := upper(replace(btrim(coalesce(p_matricula,'')), ' ', ''));
  sid uuid := null; chid uuid := null; tid uuid := null; jini timestamptz := null; jfim timestamptz := null; loc text := null;
  eh_chamada boolean := (p_rotulo in ('chamada','registro'));
  rlat double precision; rlon double precision; rraio real; dref double precision := null; ex_ref jsonb := null;
  ap text := left(nullif(btrim(coalesce(p_extra->>'aparelho_id', '')), ''), 64);
  outros uuid[] := null; ex_ap jsonb := null;
begin
  if mat = '' and p_aluno_id is null then return json_build_object('ok', false, 'erro', 'Identifique-se: matrícula ou o seu QR.'); end if;

  if livre then
    if p_aluno_id is not null then select * into a from alunos where id = p_aluno_id;
    else select * into a from alunos where upper(replace(btrim(matricula), ' ', '')) = mat order by created_at desc limit 1; end if;
    if not found then return json_build_object('ok', false, 'erro', 'Aluno não encontrado.'); end if;

    if eh_chamada then
      -- presença na sala, sem QR: com aula da turma aberta AGORA; referência da sessão ou, sem ela, M0452 / 50 m
      select s.id, s.chamada_id, s.turma_id, s.janela_inicio, s.janela_fim, s.local, s.ref_lat, s.ref_lon, s.raio_m
        into sid, chid, tid, jini, jfim, loc, rlat, rlon, rraio
        from sessoes_coleta s
       where s.turma_id = a.turma_id and s.aberta and s.expira_em > agora
         and s.janela_inicio is not null and agora between s.janela_inicio and s.janela_fim
       order by s.janela_inicio desc limit 1;
      rlat := coalesce(rlat, -8.058503622189722); rlon := coalesce(rlon, -34.95130776481575); rraio := coalesce(rraio, 50);
      if sid is null then
        motivo := 'sem_sessao'; rot := 'outro';   -- sem aula aberta com raio: chamada sem QR não existe
      else
        livre := false;
        select count(*) into total from leituras_gps where sessao_id = sid and aluno_id = a.id;
        if total >= 60 then return json_build_object('ok', false, 'erro', 'Limite de leituras atingido nesta aula.'); end if;
        rot := coalesce(loc, 'sala');
        if p_lat is not null and p_lon is not null then
          dref := 2 * 6371000 * asin(sqrt(power(sin(radians(p_lat - rlat) / 2), 2)
                  + cos(radians(rlat)) * cos(radians(p_lat)) * power(sin(radians(p_lon - rlon) / 2), 2)));
        end if;
        ex_ref := jsonb_build_object('sem_qr', true, 'dist_ref_m', round(dref::numeric, 1), 'raio_m', rraio, 'desconto_gps_m', round(least(greatest(coalesce(p_acuracia, 0), 0), 20)::numeric, 1),
                  'no_limite', (dref is not null and dref > rraio and dref - least(greatest(coalesce(p_acuracia, 0), 0), 20) <= rraio));
        -- mesmo celular já registrou chamada de outro aluno hoje: os dois ficam a conferir
        outros := _presenca_mesmo_aparelho(ap, a.id, a.turma_id, chid);
        if outros is not null then
          motivo := 'a_conferir';
        elsif chid is not null and dref is not null and dref <= rraio then
          insert into presencas (owner_id, chamada_id, aluno_id, origem)
            values (a.owner_id, chid, a.id, 'chamada_aluno')
            on conflict (chamada_id, aluno_id) do update set origem = coalesce(presencas.origem, 'chamada_aluno');
          marcou := true;
        else
          motivo := 'a_conferir';
        end if;
      end if;
    end if;

    if livre then
      select count(*) into total from leituras_gps where aluno_id = a.id and sessao_id is null and criado_em > agora - interval '1 day';
      if total >= 200 then return json_build_object('ok', false, 'erro', 'Limite diário de leituras atingido.'); end if;
    end if;
  else
    select id, chamada_id, turma_id, janela_inicio, janela_fim, local into sid, chid, tid, jini, jfim, loc
      from sessoes_coleta where upper(codigo) = upper(btrim(p_codigo)) and expira_em > agora;
    if sid is null then return json_build_object('ok', false, 'erro', 'Este QR não é de uma aula válida.'); end if;
    if p_aluno_id is not null then select * into a from alunos where id = p_aluno_id and turma_id = tid;
    else select * into a from alunos where turma_id = tid and upper(replace(btrim(matricula), ' ', '')) = mat; end if;
    if not found then return json_build_object('ok', false, 'erro', 'Você não está na turma desta aula.'); end if;
    select count(*) into total from leituras_gps where sessao_id = sid and aluno_id = a.id;
    if total >= 60 then return json_build_object('ok', false, 'erro', 'Limite de leituras atingido nesta aula.'); end if;

    if eh_chamada then
      rot := coalesce(loc, 'sala');   -- o local da chamada e o que a professora definiu no QR do dia
      if chid is not null and jini is not null and jfim is not null and agora between jini and jfim then
        outros := _presenca_mesmo_aparelho(ap, a.id, a.turma_id, chid);
        if outros is not null then
          motivo := 'a_conferir';
        else
          insert into presencas (owner_id, chamada_id, aluno_id, origem)
            values (a.owner_id, chid, a.id, 'chamada_aluno')
            on conflict (chamada_id, aluno_id) do update set origem = coalesce(presencas.origem, 'chamada_aluno');
          marcou := true;
        end if;
      else
        motivo := 'fora_da_janela';
      end if;
    end if;
  end if;

  cap := coalesce(p_capturado_em, agora);
  if cap > agora + interval '10 minutes' or cap < agora - interval '30 days' then cap := agora; end if;
  fixts := p_fix_ts;
  if fixts is not null and (fixts > agora + interval '10 minutes' or fixts < agora - interval '30 days') then fixts := null; end if;
  ex := case when p_extra is not null and length(p_extra::text) <= 4096 then p_extra else null end;
  if eh_chamada then ex := coalesce(ex, '{}'::jsonb) || jsonb_build_object('chamada', true); end if;
  if ex_ref is not null then ex := coalesce(ex, '{}'::jsonb) || ex_ref; end if;
  -- o aparelho fica guardado mesmo quando o extra passa de 4 KB: é ele que a regra compara
  if ap is not null then ex := coalesce(ex, '{}'::jsonb) || jsonb_build_object('aparelho_id', ap); end if;
  if outros is not null then
    select jsonb_build_object('motivo', 'mesmo_aparelho', 'aparelho_com', jsonb_agg(o.nome order by o.nome)) into ex_ap
      from alunos o where o.id = any(outros);
    ex := coalesce(ex, '{}'::jsonb) || ex_ap;
  end if;

  insert into leituras_gps (owner_id, sessao_id, aluno_id, rotulo, lat, lon,
                            acuracia_m, altitude_m, alt_acuracia_m, utm_n, utm_e, dist_perc_m,
                            capturado_em, presenca_marcada, online_na_captura, fix_timestamp, extra, ttff_ms)
  values (a.owner_id, sid, a.id, rot, p_lat, p_lon,
          p_acuracia, p_altitude, p_alt_acuracia, p_utm_n, p_utm_e, p_dist_perc,
          cap, marcou, p_online, fixts, ex, nullif((ex->>'ttff_ms'), '')::int);

  if livre then
    select min(acuracia_m) into meu from leituras_gps where aluno_id = a.id and sessao_id is null and criado_em > agora - interval '1 day';
    turma_best := meu; turma_n := 1;
  else
    select min(acuracia_m) into meu from leituras_gps where sessao_id = sid and aluno_id = a.id;
    select min(acuracia_m), count(distinct aluno_id) into turma_best, turma_n from leituras_gps where sessao_id = sid;
  end if;

  -- a distância e o raio não vão para o aluno (regra dela): só "presença" ou "a conferir"
  return json_build_object(
    'ok', true, 'nome', split_part(btrim(a.nome), ' ', 1), 'n', coalesce(total, 0) + 1,
    'modo', case when livre then 'livre' else 'aula' end,
    'presenca', marcou, 'motivo', motivo, 'local', rot, 'hora', to_char(agora at time zone 'America/Recife', 'HH24:MI'),
    'meu_melhor', meu, 'melhor_turma', turma_best, 'alunos', turma_n
  );
end $function$;
