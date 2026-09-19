-- Orbe da professora: faltava a porta de escrita em pins e poligonais.
--
-- O aluno salva pin e poligonal pelas RPC salvar_pin/salvar_poligonal, que são
-- SECURITY DEFINER: elas entram no banco pela porta dos fundos e a RLS nem é
-- consultada. A professora usa o MESMO Orbe, mas com a conta dela — e o
-- apiProfessora (src/lib/store.js) escreve direto na tabela, pela porta da
-- frente. Só que pins e poligonais tinham apenas política de SELECT:
-- ela conseguia ler tudo e não conseguia gravar nada. Daí o
-- "new row violates row-level security policy for table pins"
-- ao tocar em "Ocupar e marcar".
--
-- A permissão é a mínima que resolve: ela grava apenas as linhas do campo dela
-- (aluno_id nulo). Os pins dos alunos continuam entrando só pela RPC, que é
-- quem confere matrícula, sessão, limite diário e o tamanho da foto — o
-- registro da turma não fica ao alcance de uma chamada solta do navegador.
-- A leitura não muda: as políticas de SELECT que já existiam continuam valendo,
-- e é por elas que a tela de Análise enxerga a turma inteira.

drop policy if exists pins_minhas_ocupacoes_ins on public.pins;
create policy pins_minhas_ocupacoes_ins on public.pins
  for insert to authenticated
  with check (owner_id = auth.uid() and aluno_id is null);

drop policy if exists poligonais_minhas_ins on public.poligonais;
create policy poligonais_minhas_ins on public.poligonais
  for insert to authenticated
  with check (owner_id = auth.uid() and aluno_id is null);
