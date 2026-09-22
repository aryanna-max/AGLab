-- Últimos avisos da professora na tela inicial do aluno (18/09/2026, pedido dela:
-- "vamos deixar últimas notificações na tela inicial"). Quem não ativou o push também lê.
-- Só avisos já disparados (agendado_para <= agora), não cancelados, dos últimos 14 dias,
-- com o mesmo alvo do _push_lote (turma, alunos marcados, equipe). Aviso só-professora fica fora.
create or replace function public.meus_avisos(p_matricula text, p_aluno_id uuid)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare a alunos; r json;
begin
  a := _aluno_por(p_matricula, p_aluno_id);
  if a.id is null then return json_build_object('ok', false, 'erro', 'Aluno não encontrado.'); end if;
  select coalesce(json_agg(x order by x.em desc), '[]'::json) into r from (
    select v.id, v.titulo, v.texto, v.abrir, coalesce(v.enviado_em, v.agendado_para) as em
      from avisos v
     where v.owner_id = a.owner_id and v.status <> 'cancelado' and v.alvo_tipo <> 'professora'
       and v.agendado_para <= now() and v.agendado_para > now() - interval '14 days'
       and ((v.alvo_tipo = 'turma' and v.turma_id = a.turma_id)
         or (v.alvo_tipo = 'alunos' and a.id = any(v.alvo_ids))
         or (v.alvo_tipo = 'equipe' and exists (select 1 from missao_equipe_membros m where m.equipe_id = any(v.alvo_ids) and m.aluno_id = a.id)))
     order by v.agendado_para desc limit 5
  ) x;
  return json_build_object('ok', true, 'avisos', r);
end $$;
revoke all on function public.meus_avisos(text, uuid) from public;
grant execute on function public.meus_avisos(text, uuid) to anon, authenticated;

-- 18/09/2026 (migração avisos_automaticos no Supabase): avisos.origem/ref_id, _aviso_auto, gatilhos
-- missao_entregas_avisos (aceita/refazer → celular; equipe enviou → só quadro), missao_lancamentos_prazo
-- (prazo acabando, só quadro), sessoes_coleta_aviso (aula aberta → celular). meus_avisos: 8 últimos + 'auto'.
-- Vocabulário dela: notificação = chega no celular (e também vira aviso); aviso = aparece no quadro.
