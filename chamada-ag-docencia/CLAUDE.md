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

É por essa porta que o aluno volta ao assunto na véspera da prova.

### Organização: por assunto, não por número de aula

**Decisão (24/09/2026).** Não existe "Aula 4" em lugar nenhum — nem na tela do
aluno, nem na da professora, nem no banco: `aula_lancamentos` não tem coluna de
número. Quem nomeia a aula é o **título**; a frente é etiqueta.

O motivo é como a memória do aluno funciona: ele não lembra que foi a aula 4,
lembra que era sobre azimute. Numerar obriga a lembrar da ordem para achar o
conteúdo, que é a única coisa que ele não guarda.

**As duas telas se organizam diferente, e isso é de propósito:**

- **Cardápio e turma (ela)** — agrupados por frente, na ordem do curso:
  Planimetria, Altimetria, Planialtimetria, Geral. O acervo dela cresce a cada
  semestre e precisa de gaveta.
- **Aluno** — lista corrida, **na ordem em que ela lançou**. Foi assim que a
  turma viu o semestre acontecer, e é assim que ele procura. São poucas aulas:
  seção ali só somaria clique. O assunto aparece como etiqueta no cartão.

### HQ: leitor em tela cheia, um quadro por vez

**Decisão (24/09/2026), confirmada em teste no celular.** A HQ abre num leitor
que ocupa a tela inteira, um quadro por vez, com `object-fit: contain`.

A primeira versão era uma tira vertical **dentro do painel**, e não funcionou:
o quadro ficava com a largura do painel menos as margens — uns 320 px num
celular, para uma arte de 503. Ilegível. Se alguém devolver a imagem para
dentro do painel achando que tela cheia é exagero, o balão some de novo.

`contain` é o que faz o mesmo leitor servir arte vertical e horizontal sem
mexer em código: **quem decide o formato é o arquivo**. O quadro usa o que
couber e nunca é cortado.

Navegação por toque nas metades da tela (esquerda volta, direita avança, a
última fecha); os dois quadros seguintes vão baixando adiante.

### A porta se chama "Notas de aula", e cada tela é uma nota

**Decisão (25/09/2026).** A segunda porta do aluno chamava-se "O assunto" e foi
trocada por **Notas de aula**; cada tela, antes "cartão", é uma **nota**.

O motivo dela: "HQ se chama HQ" — HQ é gênero, o aluno sabe o contrato antes de
tocar. "O assunto" é etiqueta de gaveta, não promete nada. E cartão numerado com
pontinhos lia-se como **cartão de memorização**, que ela não quer como moldura
didática.

Os critérios que sobreviveram à escolha, e valem para o próximo nome:

1. O nome diz o que o aluno **recebe**, não o que a professora depositou.
2. Promete um **formato que ele já reconhece** — é o que faz "HQ" funcionar.
3. Não enquadra o material como treino de memória.
4. **Não empresta termo técnico que ele ainda não aprendeu.** Foi por isto que
   "Caminhamento", "Poligonal" e "Levantamento" caíram: dar sentido figurado a
   um termo antes de ensinar a técnica gasta o termo e cria concepção errada.

"Notas de aula" ganhou por atender os quatro e por um quinto: **credita o texto a
ela**. Quem escreve notas de aula é a professora, e isso muda como o aluno lê.
Também considerados: Verbetes, Guia de bolso, Almanaque, Croqui, A caderneta,
O fio, A explicação. Descartados por puxarem para decoreba ou para PowerPoint:
Fichário, Resumo, Tópicos.

**O banco não mudou.** `aula_pecas.tipo` continua `'cartao'`, e não há migração
nisso: a palavra parou de aparecer na tela, é só isso. Se um dia o nome mudar de
novo, é uma linha em cada tela — de propósito.

**Os pontinhos com marca de lido ficam.** Ela decidiu: retomar de onde parou na
véspera da prova vale mais que a estética de não parecer baralho. O que ela
rejeitou foi a moldura de memorização, não o formato de cartão — e essa
distinção é dela, não minha.

### Ficha de campo: nem toda aula tem

Ficha responde o que aparece **com o instrumento montado e a mão ocupada**:
o que conferir antes de sair, a sequência de operação, as tolerâncias da
prática, o que não pode faltar ao voltar, e o que fazer quando não fecha.

O teste: frase que começa com "é importante entender que" é cartão; frase que
começa com número ou verbo no imperativo é ficha. E o teste prático — o aluno
abriria isso em pé, com o tripé montado? Se só abriria sentado, é cartão.

Aula conceitual não tem ficha, e forçar uma faz ela virar resumo dos cartões.
A tela já se comporta assim: sem peça do tipo `ficha`, a porta não aparece.

### Editor de aulas: o arquivo é público, e isso foi escolhido

**Decisão (25/09/2026).** O material sobe pelo app, para o bucket `materiais`,
que é **público**. Duas razões, e a segunda vale mesmo se um dia houver login:

- o aluno entra sem conta, então não há sessão para assinar URL;
- URL assinada **expira e muda**, e o service worker guarda arquivo *por URL*.
  Se a URL trocasse, a HQ sumiria sem rede — exatamente o que o cache
  `materiais-aula` existe para evitar.

O preço, dito em claro: quem tiver o link abre o arquivo sem entrar no app. Vale
para HQ e PDF — material didático dela, que a turma veria de qualquer jeito. O
caminho tem dois uuid e um nome sorteado, então não se chega nele por tentativa,
mas **não é segredo**. Material que não pode circular não sobe aqui. E nada de
dado de aluno neste bucket: foto e selfie continuam em `fotos`, privado e
assinado.

**Arquivo novo, nome novo.** Cada upload sorteia o nome e o antigo é apagado
depois. Se o caminho fosse fixo (`quadro-3.webp`), quem já tivesse aberto a aula
veria o quadro velho por 180 dias — é o prazo do CacheFirst — sem jeito de
forçar a troca.

**Peça que fica conserva o id.** `aula_leituras.peca_id` tem cascade: apagar e
recriar as peças a cada salvamento zeraria o "quem leu". Então o editor atualiza
quem tem id, insere quem não tem, e apaga só o que ela tirou da lista.

**Armadilha de vocabulário, já sentida na pele.** `store.js` tem
`apagarAula(chamadaId)`, do **calendário**, e `apagarAulaDoCardapio(id)`, do
**material**. São duas coisas com o mesmo nome na boca dela: a aula do dia e a
aula do acervo. O build quebrou por causa disso. Ao criar função nova nessa
vizinhança, diga no nome de qual das duas se trata.

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
