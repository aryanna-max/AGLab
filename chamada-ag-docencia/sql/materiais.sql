-- Material de aula no Storage: o bucket que o editor de aulas usa.
--
-- Rode depois de sql/aulas.sql, uma vez.
--
-- POR QUE O BUCKET É PÚBLICO. O aluno entra no app sem conta — não há sessão
-- para assinar URL. As fotos dos alunos usam URL assinada porque quem as lê é
-- a professora, logada; aqui é o contrário. E há um segundo motivo, que vale
-- mesmo com login: URL assinada expira e muda, e o service worker guarda o
-- arquivo POR URL. Se a URL trocasse, a HQ sumiria sem rede — exatamente o que
-- o cache 'materiais-aula' existe para evitar.
--
-- O que isso significa, em claro: quem tiver o link do arquivo abre o arquivo,
-- sem entrar no app. Vale para a HQ e para o PDF de aprofundamento — material
-- didático dela, que a turma veria de qualquer jeito. O caminho tem dois uuid
-- (dono e aula) e um nome sorteado, então não se chega nele por tentativa; mas
-- não é segredo, e material que não pode circular não sobe aqui.
--
-- NADA de dado de aluno neste bucket. Foto e selfie continuam em 'fotos', que
-- é privado e assinado.

-- 25 MB: o quadro de HQ sai daqui com 60-120 KB, mas o PDF de aprofundamento
-- vem de PowerPoint e passa de 5 MB sem esforço. Teto que recusa o arquivo dela
-- no meio da edição é pior que arquivo grande.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('materiais', 'materiais', true, 26214400,
        array['image/webp', 'image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Escrever é só da professora, e só na pasta dela: o primeiro nível do caminho
-- é o uid. Ler não precisa de política — o bucket é público.
drop policy if exists materiais_dono_grava on storage.objects;
create policy materiais_dono_grava on storage.objects
  for insert to authenticated
  with check (bucket_id = 'materiais' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists materiais_dono_troca on storage.objects;
create policy materiais_dono_troca on storage.objects
  for update to authenticated
  using (bucket_id = 'materiais' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists materiais_dono_apaga on storage.objects;
create policy materiais_dono_apaga on storage.objects
  for delete to authenticated
  using (bucket_id = 'materiais' and (storage.foldername(name))[1] = auth.uid()::text);

-- Ela também precisa LISTAR o que subiu (o editor apaga o arquivo antigo ao
-- trocar um quadro), e listar passa por select em storage.objects.
drop policy if exists materiais_dono_lista on storage.objects;
create policy materiais_dono_lista on storage.objects
  for select to authenticated
  using (bucket_id = 'materiais' and (storage.foldername(name))[1] = auth.uid()::text);
