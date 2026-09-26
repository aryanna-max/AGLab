-- Selfie substituível — aplicado no projeto chamada-ag-docencia (26/09/2026).
--
-- Regra dela, no lugar da de 16/09: o aluno troca a própria selfie quando quiser, e
-- trocar é sempre SUBSTITUIR. Antes, a selfie travava depois de enviada e só a
-- professora "liberava" uma nova — apagando a atual e deixando o aluno sem foto até
-- ele mandar outra. O botão da professora saiu do app; aqui sai a trava do servidor.

create or replace function public.salvar_selfie(p_matricula text, p_aluno_id uuid, p_foto text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare a alunos;
begin
  a := _aluno_por(p_matricula, p_aluno_id);
  if a.id is null then return json_build_object('ok', false, 'erro', 'Aluno não encontrado.'); end if;
  if p_foto is null or left(p_foto, 23) <> 'data:image/jpeg;base64,' then return json_build_object('ok', false, 'erro', 'Formato de foto inválido.'); end if;
  if length(p_foto) > 60000 then return json_build_object('ok', false, 'erro', 'Foto grande demais.'); end if;
  -- substitui: a foto só muda quando chega uma nova válida, nunca fica vazia.
  -- foto_em guarda a PRIMEIRA selfie: é ela que conta para a insígnia de pioneiro
  -- ("rosto", em _pioneiro_feito) — trocar a foto não tira ninguém da fila.
  update alunos set foto_data = p_foto, foto_em = coalesce(foto_em, now()) where id = a.id;
  return json_build_object('ok', true);
end $function$;
