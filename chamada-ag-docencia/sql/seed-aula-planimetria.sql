-- Aula de exemplo da fase 1: Topografia planimétrica, HQ 1.
--
-- Aula conceitual: HQ e cartões, SEM ficha de campo. Ficha responde o que
-- aparece com o instrumento na mão; forçar uma aqui viraria resumo dos cartões.
--
-- Cria a aula no CARDÁPIO. Não lança em turma nenhuma — isso se faz no app,
-- na aba Aulas da professora, escolhendo a turma. É de propósito: o cardápio é
-- dela, o lançamento é por turma.
--
-- Rode uma vez no SQL editor do Supabase. O dono sai de quem tem turmas, não
-- do usuário mais antigo: num projeto com mais de uma conta, a mais antiga pode
-- ser uma conta de teste sem nada — e aí a aula nasceria invisível para ela.

do $$
declare
  prof uuid;
  au   uuid;
  base text := '/aulas/planimetria-01/';
  i    int;
begin
  select t.owner_id into prof from turmas t group by t.owner_id order by count(*) desc limit 1;
  if prof is null then
    raise exception 'Nenhuma turma no banco — crie a turma antes, para saber de quem é a aula.';
  end if;

  insert into aulas (owner_id, titulo, frente, resumo)
  values (prof, 'Topografia planimétrica', 'planimetria',
          'Antes do projeto, existe o terreno. Do ponto medido à planta que sustenta uma decisão.')
  returning id into au;

  -- ---------- a HQ: um quadro por vez, rolagem vertical ----------
  for i in 1..8 loop
    insert into aula_pecas (owner_id, aula_id, tipo, ordem, url, largura, altura)
    values (prof, au, 'hq', i, base || lpad(i::text, 2, '0') || '.webp',
            case when i % 2 = 1 then 503 else 512 end,
            case when i <= 2 then 339 when i <= 4 then 345 when i <= 6 then 341 else 488 end);
  end loop;

  -- ---------- os cartões: um conceito por tela ----------
  insert into aula_pecas (owner_id, aula_id, tipo, ordem, titulo, texto_md) values
  (prof, au, 'cartao', 10, 'O que a topografia faz',
   'Topografia **mede, descreve e representa**, com precisão adequada à finalidade, uma parte limitada da superfície terrestre e seus detalhes naturais e artificiais.

Não é só medir o terreno: é transformar a realidade em informação confiável.'),

  (prof, au, 'cartao', 11, 'Ponto topográfico',
   'Ponto topográfico é uma **posição escolhida, identificada ou materializada**.

Cada ponto registra a posição de um limite ou de um detalhe importante: o canto da edificação, a árvore, o bueiro, a quebra do meio-fio.

Escolher o ponto já é uma decisão técnica.'),

  (prof, au, 'cartao', 12, 'Alinhamento: DH e ângulo',
   'Dois pontos formam um **alinhamento**: P1 + P2.

- **DH** — distância horizontal entre eles
- **α** — ângulo horizontal no vértice

Distâncias e ângulos relacionam os pontos **no plano horizontal**. O desnível do terreno não entra aqui.'),

  (prof, au, 'cartao', 13, 'Croqui de campo',
   'O croqui **ainda não é a planta**.

Ele organiza o que foi visto e medido, no campo, sem inventar informação: onde está cada ponto, o que é edificação, muro, árvore, meio-fio, acesso.

Croqui feito depois, de memória, é croqui inventado.'),

  (prof, au, 'cartao', 14, 'Ver de cima',
   'A **planimetria** representa onde cada elemento está no plano horizontal.

É a passagem da perspectiva do terreno — como o olho vê — para a **vista superior**, que é como a planta mostra.

Tudo projetado para baixo, no mesmo plano.'),

  (prof, au, 'cartao', 15, 'Planta topográfica',
   'A planta reúne **posições, formas, dimensões e detalhes existentes**.

Três coisas que nenhuma planta dispensa:

- **legenda** — o que é natural e o que é artificial
- **norte** — a orientação
- **escala gráfica** — que sobrevive à fotocópia e ao PDF'),

  (prof, au, 'cartao', 16, 'Do dado à decisão de projeto',
   'O projeto começa no dado que **você** produz.

Observe, registre, confira e represente com responsabilidade: a laje que sobe naquele terreno está apoiada nas suas medidas.

Topografia planimétrica = conhecer o terreno para projetar com segurança.');

  raise notice 'Aula criada: % — lance na turma pela aba Material.', au;
end $$;
