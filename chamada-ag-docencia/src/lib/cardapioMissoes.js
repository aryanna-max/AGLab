/* Cardápio sugerido de missões — ponto de partida que a professora importa, edita e amplia.
   Agrupado por frente só para orientar: qualquer missão pode ir para qualquer turma.
   equipe: true → a professora forma as equipes ao lançar. funcoes são só sugestões mostradas
   aos alunos: ela não atribui função, cada aluno escolhe a sua no app. */

export const FRENTES = [
  ['planimetria', 'Planimetria'],
  ['altimetria', 'Altimetria'],
  ['planialtimetria', 'Planialtimetria'],
  ['geral', 'Geral'],
]

export const CARDAPIO_SUGERIDO = [
  {
    frente: 'geral', titulo: 'Posição do celular',
    descricao: 'Ocupe o marco M0452 com o celular em quatro posições e descubra qual mede melhor. Mesmo marco, mesmo aparelho: só muda o jeito de segurar.',
    etapas: ['Pin "POS-DEITADO": celular deitado, tela para cima, braço afastado do corpo', 'Pin "POS-EMPE": celular em pé, braço afastado', 'Pin "POS-PEITO": celular em pé, colado ao peito', 'Pin "POS-BOLSO": celular no bolso', 'Compare espalhamento e distância ao marco das quatro ocupações'],
    entrega: 'Qual posição teve o menor espalhamento e qual ficou mais perto do M0452? Explique por quê.',
    niveis: { bronze: 'Quatro ocupações feitas', prata: 'Comparação correta entre as quatro', ouro: 'Explicação física: antena, corpo e céu visível' },
  },
  {
    frente: 'planimetria', titulo: 'Caça ao azimute',
    descricao: 'A partir do marco indicado pela professora, ande até o ponto definido por azimute e distância. Use o Ir até só para conferir no final.',
    etapas: ['Anote o azimute e a distância dados pela professora', 'Oriente-se e caminhe até o ponto', 'Faça um pin no ponto em que parou', 'Compare o pin com a coordenada certa'],
    entrega: 'Distância entre o seu pin e o ponto certo, e o que causou a diferença.',
    niveis: { bronze: 'Chegou e fez o pin', prata: 'Pin a menos de 10 m do ponto', ouro: 'Pin a menos de 5 m e causa do erro explicada' },
  },
  {
    frente: 'planimetria', titulo: 'Rumo à mão',
    descricao: 'Levante quatro pins em volta de um marco, um em cada quadrante. Escreva o rumo de cada direção antes de o app mostrar.',
    etapas: ['Pins nos quadrantes NE, SE, SO e NO do marco', 'Escreva os quatro rumos à mão', 'Confira com o app'],
    entrega: 'Os quatro rumos escritos e os do app, lado a lado.',
    niveis: { bronze: 'Quatro pins e quatro rumos', prata: 'Três rumos certos', ouro: 'Quatro rumos certos, com a conversão azimute → rumo explicada' },
  },
  {
    frente: 'planimetria', titulo: 'Sentido da poligonal',
    descricao: 'Feche a mesma poligonal nos dois sentidos com o botão "Inverter sentido". Observe o que muda e o que se mantém.',
    etapas: ['Levante pelo menos quatro pins', 'Feche a poligonal no sentido horário', 'Inverta o sentido', 'Compare azimutes e ângulos internos'],
    entrega: 'O que mudou nos azimutes e o que se manteve nos ângulos internos. Por quê?',
    niveis: { bronze: 'Poligonal fechada nos dois sentidos, sem cruzar', prata: 'Diferença de 180° nos azimutes explicada', ouro: 'Relação entre sentido, ângulos internos e externos explicada' },
  },
  {
    frente: 'planimetria', titulo: 'Cadastro de rede · caso BRK Ambiental', equipe: true, funcoes: ['Localizador', 'Operador do celular', 'Fotógrafo', 'Anotador'],
    descricao: 'Cadastre os poços de visita de um trecho de rede do campus, como uma empresa de topografia faz para a concessionária.',
    etapas: ['Localize os poços do trecho indicado', 'Ocupe cada tampa e faça um pin com foto', 'Nomeie os pins na ordem do escoamento (PV1, PV2…)', 'Anote material, estado e poço a jusante de cada um'],
    entrega: 'Lista dos poços: nome, material, estado, poço a jusante. Os pins com foto ficam no app.',
    niveis: { bronze: 'Todos os poços com pin e foto', prata: 'Ficha completa de cada poço', ouro: 'Croqui da ligação entre os poços e observações de campo' },
  },
  {
    frente: 'planimetria', titulo: 'Trena contra celular', equipe: true, funcoes: ['Operador da trena', 'Auxiliar da trena', 'Operador do celular', 'Anotador'],
    descricao: 'Meça os lados de um lote à trena e compare com os lados que o celular calculou pela poligonal.',
    etapas: ['Levante os vértices do lote com pins', 'Feche a poligonal', 'Meça cada lado à trena', 'Compare trena × celular'],
    entrega: 'Tabela lado a lado e a diferença de área em m² e em porcentagem.',
    niveis: { bronze: 'Poligonal fechada e lados medidos', prata: 'Tabela de comparação correta', ouro: 'Conclusão: por que obra não se loca com GPS de celular' },
  },
  {
    frente: 'altimetria', titulo: 'Caderneta de nivelamento', equipe: true, funcoes: ['Operador do nível', 'Porta-mira', 'Anotador', 'Calculista'],
    descricao: 'Nivelamento geométrico entre os pontos indicados, com caderneta e fechamento. Cota nova = cota conhecida + ré − vante.',
    etapas: ['Monte e nivele o instrumento', 'Faça as leituras de ré e vante em cada lance', 'Calcule as cotas', 'Feche o circuito e calcule o erro de fechamento'],
    entrega: 'Caderneta completa, erro de fechamento e comparação com a tolerância da NBR 13.133:2021.',
    niveis: { bronze: 'Caderneta completa e fechada', prata: 'Erro dentro da tolerância', ouro: 'Erro na metade da tolerância ou circuito refeito no sentido contrário' },
  },
  {
    frente: 'altimetria', titulo: 'Transporte de RN', equipe: true, funcoes: ['Operador do nível', 'Porta-mira', 'Anotador', 'Calculista'],
    descricao: 'Leve a cota de um marco de referência até um ponto do Bloco F e volte, fechando o circuito.',
    etapas: ['Leitura de ré no marco de partida', 'Lances até o ponto de chegada', 'Volta até o marco', 'Cálculo do fechamento'],
    entrega: 'Cota transportada e erro de fechamento.',
    niveis: { bronze: 'Circuito completo', prata: 'Fechamento dentro da tolerância', ouro: 'Fechamento na metade da tolerância' },
  },
  {
    frente: 'altimetria', titulo: 'Declividade do trecho',
    descricao: 'Com a cota de fundo de dois poços e a distância entre eles, calcule a declividade do trecho de rede.',
    etapas: ['Cota de fundo do poço a montante', 'Cota de fundo do poço a jusante', 'Distância entre os poços', 'Cálculo da declividade'],
    entrega: 'Declividade em % e em m/m. O trecho está em contrapendente?',
    niveis: { bronze: 'Declividade calculada', prata: 'Unidades e sentido do escoamento corretos', ouro: 'Consequência para a rede explicada (entupimento, refluxo)' },
  },
  {
    frente: 'altimetria', titulo: 'O celular erra a cota',
    descricao: 'Compare a altitude do celular com a cota nivelada no mesmo ponto.',
    etapas: ['Ocupe o ponto com o celular e anote a altitude', 'Anote a cota nivelada do mesmo ponto', 'Calcule a diferença'],
    entrega: 'Diferença encontrada e a explicação: altitude elipsoidal, geoide e erro vertical.',
    niveis: { bronze: 'Diferença calculada', prata: 'Ondulação geoidal citada', ouro: 'Separou o efeito do geoide do erro do aparelho' },
  },
  {
    frente: 'altimetria', titulo: 'Rampa acessível', equipe: true, funcoes: ['Operador do nível', 'Porta-mira', 'Anotador'],
    descricao: 'Nivele uma rampa ou calçada do campus e compare a inclinação com o limite da NBR 9050.',
    etapas: ['Cota do início e do fim da rampa', 'Comprimento da rampa', 'Cálculo da inclinação', 'Comparação com a norma'],
    entrega: 'Inclinação em % e se a rampa atende à norma.',
    niveis: { bronze: 'Inclinação calculada', prata: 'Comparação correta com a norma', ouro: 'Proposta de correção quando não atende' },
  },
  {
    frente: 'planialtimetria', titulo: 'Celular contra RTK', equipe: true, funcoes: ['Operador do RTK', 'Operador do celular', 'Anotador'],
    descricao: 'Relevante com o RTK os pontos que você levantou com o celular e compare ponto a ponto.',
    etapas: ['Ocupe cada ponto com o RTK', 'Registre as coordenadas do RTK', 'Compare com os pins do celular'],
    entrega: 'Erro de cada ponto e o RMSE do seu levantamento a celular.',
    niveis: { bronze: 'Todos os pontos relevantados', prata: 'Erros e RMSE calculados', ouro: 'Viés e desvio separados e interpretados' },
  },
  {
    frente: 'planialtimetria', titulo: 'Marco da entrada',
    descricao: 'Ocupe o marco da entrada do Bloco F no início da aula. A série da turma ao longo do semestre mede a repetibilidade dos celulares.',
    etapas: ['Celular deitado, tela para cima, afastado do corpo', 'Pin "ENTRADA" com 20 s parado'],
    entrega: 'Nada a escrever: o pin é a entrega.',
    niveis: { bronze: 'Pin feito', prata: 'Espalhamento abaixo de 3 m', ouro: 'Espalhamento abaixo de 1,5 m' },
  },
]
