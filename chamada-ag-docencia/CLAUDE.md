# Orbe — decisões que valem para o próximo trabalho

Anotações de rumo. Não é documentação do código: é o que já foi decidido e não
deve ser redecidido a cada conversa.

## Material de aula: o formato é cartão, não documento

**Decisão (22/09/2026).** Quando o material de aula entrar no app, ele entra
como *dado estruturado no banco*, em cartões — não como arquivo.

Um cartão = um conceito. Três a seis linhas, uma imagem ou uma fórmula, sem
zoom e sem rolar para o lado. Cinco a nove cartões dão uma aula.

A analogia que fecha a questão: **PDF é a prancha plotada; cartão é a caderneta
de campo.** Prancha é para a mesa e para o cartório. Ninguém abre prancha em pé,
no sol, com o tripé na outra mão. O app é campo.

### Por que dado e não arquivo

Material como arquivo transforma o app em gaveta — e gaveta o Drive e o
Classroom fazem melhor. Como dado, sai de graça o que um PDF nunca dá:

- onde o aluno parou ("cartão 4 de 7");
- busca no semestre inteiro ("onde ela falou de azimute?");
- link do cartão certo dentro da missão ("travou na etapa 3? o cartão é este");
- insígnia por leitura, que é a moeda que o app já usa;
- offline sem depender de visualizador nenhum.

### As quatro camadas de uma aula

Do mais rápido ao mais fundo; o aluno escolhe até onde vai.

1. **HQ** — a entrada, ~1 min. Rolagem vertical, um quadro por vez.
2. **Cartões do assunto** — ~5 min. Mesma gramática visual da HQ: um quadro,
   uma ideia. Sem degrau entre as duas.
3. **Ficha de campo** — **um cartão só**, e este é o "à mão" de verdade: passo a
   passo, tolerâncias, os números daquela aula. Fixável na home, sempre offline.
   É a única peça que o aluno abre com a mão suja.
4. **Aprofundamento** — aí sim o PDF, para quem quer imprimir e estudar na mesa.
   Última camada, nunca a principal.

O exercício não é uma quinta camada: é **missão**, que o app já faz com etapas,
bronze/prata/ouro e entrega. Material e exercício não devem ser duas coisas —
`missao_lancamentos` ganha `aula_id`.

### Peso: separar texto de imagem

É o que faz isso caber.

- **Texto vai tudo junto, sempre.** Cartão de texto pesa ~300 bytes; uma aula de
  oito cartões, ~2,5 KB; o semestre inteiro, menos de 50 KB — menos que duas
  insígnias da vitrine (28 KB cada). O semestre fica no celular o tempo todo.
  O aluno nunca ouve "sem conexão" ao querer consultar alguma coisa.
- **Imagem e HQ vêm sob demanda** e ficam em cache — o mesmo tratamento que as
  insígnias já têm (`vite.config.js`: `globIgnores: ['**/insignias/**']`).
- **A aula do dia baixa sozinha** no momento da chamada, em segundo plano. A
  turma sai para o campo com o material no bolso sem ter pensado nisso.

### Acesso: a porta Aulas é acervo, não vitrine do dia

**Decisão (24/09/2026).** Lançou e publicou, a turma vê — e continua vendo o
semestre inteiro. Sem trava de data: `minhas_aulas` filtra por turma,
`publicada` e `arquivada`, e nada mais.

O QR da chamada é **atalho**, não permissão: ele abre a aula do dia no momento
em que o aluno já está com o celular na mão. Quem governa o acesso é o
lançamento publicado. O campo `data` do lançamento é informação no cartão, não
gatilho — se um dia virar "abre na data", é uma linha no filtro, e é mudança de
regra, não ajuste.

É por essa porta que o aluno volta na aula 4 na véspera da prova.

### Ficha de campo: nem toda aula tem

Ficha responde o que aparece **com o instrumento montado e a mão ocupada**:
o que conferir antes de sair, a sequência de operação, as tolerâncias da
prática, o que não pode faltar ao voltar, e o que fazer quando não fecha.

O teste: frase que começa com "é importante entender que" é cartão; frase que
começa com número ou verbo no imperativo é ficha. E o teste prático — o aluno
abriria isso em pé, com o tripé montado? Se só abriria sentado, é cartão.

Aula conceitual não tem ficha, e forçar uma faz ela virar resumo dos cartões.
A tela já se comporta assim: sem peça do tipo `ficha`, a porta não aparece.

### Cuidados concretos, já levantados no código

- Material **nunca** em `public/`: `globPatterns` varre `**/*.png` e tudo que
  estiver lá vira download obrigatório na instalação.
- Cache próprio (`materiais-aula`), **antes** da regra de `/storage/v1/object/`.
  Hoje ela usa o pote `fotos-alunos` com `maxEntries: 400`; dividir o pote faz
  um material expulsar a foto de um aluno.
- Leitura pelo aluno por **RPC anônima** (`minha_aula`), como todo o resto.
  O aluno não lê tabela nenhuma hoje, e isso não muda.
- Imagem sempre WebP, largura 1280. Original `.docx`/`.pptx` fica como anexo só
  da professora — ela continua editando na fonte.

### O custo real, para não haver surpresa

Não é técnico, é de autoria: quatro páginas corridas viram sete cartões, e essa
quebra não se automatiza bem. É trabalho de uma vez por aula — e que melhora o
material fora do app também: o que cabe em sete cartões é o que se sabe explicar
em sete ideias.
