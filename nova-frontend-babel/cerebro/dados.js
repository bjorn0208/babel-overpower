// Cérebro Babel — dados mocados extraídos do babel-os.html (somente leitura).
// Gerado por /tmp/voicetest/extract_dados.py — não editar à mão; regenere do app.
'use strict';

const NAV = [['inicio','Início'],['conversas','Conversas'],['notas','Notas'],['contatos','Contatos'],['clientes','Clientes'],['contratos','Contratos'],['financeiro','Financeiro'],['agenda','Agenda'],['agente','Agente'],['loja','Loja'],['equipe','Equipe'],['meudia','Meu dia'],['qualidade','Qualidade'],['ajustes','Ajustes']];

const TITLE = {inicio:'Início',conversas:'Conversas',notas:'Notas',contatos:'Contatos',clientes:'Clientes',contratos:'Contratos',financeiro:'Financeiro',agenda:'Agenda',agente:'Agente',loja:'Loja',equipe:'Equipe',meudia:'Meu dia',qualidade:'Como a Aurora atendeu',ajustes:'Leitura e uso'};

const LIGHTS = [
 {id:'l1',area:'Vender',tok:'ciano',word:'pede você',who:'Carla · #0417',what:'pediu 10% de desconto em 40 peças',why:'A política permite 5%. Rascunho: "Consigo 5% à vista. Gero o Pix?"',valor:7680,ago:'há 12 h',acts:['Faço','Não dá','Aguarda'],conv:'c1'},
 {id:'l2',area:'Cobrar',tok:'ciano',word:'pede sua assinatura',who:'3 cobranças',what:'vencem hoje · R$ 1.180,00',why:'Ensaio: 3 mensagens com o Pix · R$ 0,11 · desfazer até 10 min depois',valor:1180,ago:'hoje',acts:['Faço','Não dá','Aguarda'],go:'financeiro'},
 {id:'l3',area:'Vender',tok:'ciano',word:'pede sua validação',who:'Contrato de Rafael · #0588',what:'R$ 2.400,00 em 3 parcelas',why:'identificado · degrau 4 de 5 · selfie, documento e assinatura conferidos',valor:2400,ago:'assinado ontem 19:12',acts:['Faço','Não dá','Aguarda'],go:'contratos'},
 {id:'l4',area:'Cobrar',tok:'ouro',word:'dinheiro entrou',who:'3 pagamentos de ontem',what:'R$ 2.340,00 confirmados pelo banco',why:'Joana · Lojinha Sol · Marina',valor:2340,ago:'ontem',acts:['Visto'],go:'financeiro'},
 {id:'l5',area:'Entregar',tok:'lua',word:'passou do horário',who:'2 compromissos de ontem',what:'entrega da Joana e prova da Marina',why:'a Aurora avisou os dois; nenhum confirmou novo horário',valor:0,ago:'ontem',acts:['Remarcar','Visto'],go:'agenda'},
];

const AREAS = ['Rede','Vender','Atender','Entregar','Cobrar','Fiscal','Pessoas','Mídias'];

const CONVS = [
 {id:'c1',tok:'ciano',word:'pede você',who:'Carla Mendes · #0417',sub:'desconto de 10% · há 12 h',canal:'WhatsApp',ficha:{ini:'CM',nome:'Carla Mendes',tags:['lojista','Rio Claro','desde mar/2025'],comprou:'R$ 21.400',compras:'6',paga:'em dia',mem:['Compra a cada 45 dias, sempre no fim do mês · identificado · degrau 3 de 5','Prefere Pix; não gosta de boleto · fonte: seu áudio','Gosta de ser chamada pelo primeiro nome · conversa 12/ago']},
  msgs:[{k:'day',t:'ontem · segunda, 28 de setembro'},['cl','Oi Aurora! Tudo bem? Quero repor o estoque pra outubro.','19:38'],{k:'ag',kind:'prod',prod:['Conjunto Flora','40 peças · R$ 192 cada · pronta entrega','#7dffc4','#ffc861'],t:'Que bom, Carla! O Conjunto Flora está com 40 peças prontas. Separo pra você?',at:'19:39',st:'lida'},['cl','Oi Aurora! Consegue 10% nas 40 peças do pedido?','19:40'],{k:'cl',kind:'audio',dur:'0:14',t:'é pra fechar hoje ainda, se der 10% eu já mando o pix',at:'19:40'},{k:'ag',t:'Oi, Carla! Vou conferir com a Carolina e te respondo em até 1 h, tá?',at:'19:40',st:'lida'},{k:'me',t:'a Aurora parou aqui e acendeu a luz. Política: até 5%. Tom da Carla: animada, quer fechar hoje.',at:'19:41'},{k:'day',t:'hoje · terça, 29'},['cl','Bom dia! Conseguiu ver?','07:58'],{k:'sys',t:'a Aurora avisou: "o Dominic responde até as 9h" · 07:58'}],
  plan:['Esperar seu Faço, Não dá ou Aguarda','Mandar o rascunho com 5% à vista','Gerar o Pix de R$ 7.296,00 e mandar o código','Avisar o Diego: 40 peças entram na fila'],
  draft:'Consigo 5% à vista nas 40 peças. Fecha por R$ 7.296,00. Gero o Pix?'},
 {id:'c2',tok:'ciano',word:'pede sua validação',who:'Rafael Souza · #0588',sub:'contrato assinado · R$ 2.400',canal:'WhatsApp',ficha:{ini:'RS',nome:'Rafael Souza',tags:['cliente final','Campinas'],comprou:'R$ 2.400',compras:'1',paga:'em 3×',mem:['Primeira compra · vestido Íris sob medida']},msgs:[['cl','Assinei o contrato, chegou aí?','19:12'],['ag','Chegou! Selfie, documento e assinatura conferidos. O Dominic valida hoje e eu te aviso.','19:13']]},
 {id:'c3',tok:'ouro',word:'dinheiro entrou',who:'Joana Alves · #0231',sub:'R$ 612,00 · confirmado pelo banco',canal:'WhatsApp',ficha:{ini:'JA',nome:'Joana Alves',tags:['lojista','Limeira'],comprou:'R$ 6.100',compras:'9',paga:'sem cobrança',mem:['Paga sem precisar de cobrança · vale até ela atrasar uma vez']},msgs:[['cl','Pix feito!','09:12'],['ag','Recebido, Joana. Obrigada! As 6 peças saem quinta.','09:14']]},
 {id:'c4',tok:'lua',word:'cadê?',who:'Bruno Lima · #0114',sub:'comprava todo mês e não comprou',canal:'Instagram',ficha:{ini:'BL',nome:'Bruno Lima',tags:['lojista','Piracicaba'],comprou:'R$ 9.800',compras:'11',paga:'atrasou 8 dias',mem:['Comprava a cada 30 dias · última em 02/jul']},msgs:[['ag','Oi, Bruno! Chegou a coleção de primavera. Quer que eu separe os tamanhos de sempre?','ontem'],['me','SÓ EU · sem resposta há 3 dias. A Aurora não insiste mais de 2 vezes.','ontem']]},
 {id:'c5',tok:'mute',word:'a Aurora respondeu',who:'Marina Freitas · #0602',sub:'tabela de preços · Instagram',canal:'Instagram',ficha:{ini:'MF',nome:'Marina Freitas',tags:['cliente final'],comprou:'R$ 620',compras:'1',paga:'cartão',mem:[]},msgs:[['cl','Quanto custa a saia Dália?','13:02'],['ag','R$ 240,00 à vista ou 3× de R$ 80. Tenho do 36 ao 44. Qual o seu?','13:02']]},
 {id:'c6',tok:'mute',word:'a Aurora respondeu',who:'Lojinha Sol · #0290',sub:'prazo 15 dias · WhatsApp',canal:'WhatsApp',ficha:{ini:'LS',nome:'Lojinha Sol',tags:['lojista','Americana'],comprou:'R$ 4.300',compras:'3',paga:'em dia',mem:[]},msgs:[['cl','Sob medida demora quanto?','11:20'],['ag','15 dias a partir da prova. Quer marcar? Tenho quinta 14:30.','11:20']]},
];

const CLIENTES = [['Bruno Lima · #0114','02/jul','a cada 30 dias','R$ 9.800','cadê?','lua','cade'],['Carla Mendes · #0417','12/ago','a cada 45 dias','R$ 21.400','pede você','ciano',''],['Joana Alves · #0231','ontem','a cada 30 dias','R$ 6.100','dinheiro entrou','ouro',''],['Lojinha Sol · #0290','20/set','a cada 60 dias','R$ 4.300','','','novo'],['Marina Freitas · #0602','21/set','primeira compra','R$ 620','','','novo'],['Paula Reis · #0355','15/jun','a cada 30 dias','R$ 7.200','cadê?','lua','cade'],['Rafael Souza · #0588','ontem','primeira compra','R$ 2.400','pede sua validação','ciano','novo']];

const BAIXAS = [['ouro','Joana · #0231 · Pix','hoje 09:14 · R$ 612,00','dinheiro entrou'],['ouro','Lojinha Sol · #0290 · Pix','ontem · R$ 1.430,00','dinheiro entrou'],['ouro','Marina · #0602 · cartão','ontem · R$ 620,00','dinheiro entrou'],['mute','Rafael · #0588 · 1/3','vence 05/out · R$ 800,00','aguardando'],['lua','Bruno · #0114 · 2/2','venceu 20/set · R$ 950,00','atrasou 8 dias']];

const FITA = [420,0,610,1430,0,0,980,2340,612,0,1180,760,0,0,1900,430,0,2100,0,0,640,1430,0,0,3900,0,812,0,0,0];

const EVENTS = [{h:9,d:60,t:'Prova · Carla Mendes · 40 peças',s:'agência'},{h:10.5,d:30,t:'Entrega · Rafael Souza · vestido Íris',s:'Campinas',lua:true},{h:13,d:45,t:'Medidas · Paula Reis',s:'agência'},{h:14.5,d:30,t:'Retirada · Lojinha Sol · 12 peças',s:'loja'},{h:16,d:30,t:'Ligação · Bruno Lima · sumiu',s:'a Aurora lembra você',lua:true}];

const DUVIDAS = [['14×','"Vocês cuidam do Instagram?"','ela respondeu "vou confirmar" e passou para você · 6 pessoas não voltaram a falar'],['9×','"Dá para parcelar em mais de 3 vezes?"','regra da casa não fala de parcelas acima de 3'],['5×','"Atendem em Sorocaba?"','abrangência cadastrada só cobre Campinas e região'],['3×','"Quanto custa o tráfego pago?"','proposta sob consulta · sem preço na Loja']];

const PRODS = [['Vestido Íris','R$ 620','sem tecido na ficha','#7dffc4','#4de3ff'],['Blusa Lótus','R$ 180','','#ffc861','#ff7b72'],['Saia Dália','R$ 240','','#c9a3ff','#4de3ff'],['Conjunto Flora','R$ 890','sob medida · 15 dias','#7dffc4','#ffc861'],['Calça Hera','R$ 320','','#4de3ff','#0b8a5a'],['Vestido Jasmim','R$ 540','sem tamanhos','#ff7b72','#c9a3ff'],['Blazer Sálvia','R$ 780','','#0b8a5a','#7dffc4'],['Camisa Lírio','R$ 210','','#ffffff','#4de3ff']];

const TEAM = [['DO','Dominic','Dono','vê tudo · assina tudo'],['CS','Carolina Silva','Atendimento','conversas e contatos · não vê dinheiro'],['DM','Diego Martins','Costura','só Meu dia e Agenda'],['LP','Lúcia Prado','Financeiro','baixa e cobranças · não vê treino']];

const FILA = [['Vestido Íris · Rafael Souza','entrega amanhã 10:30'],['40 peças · Carla Mendes','prova hoje 09:00 · 12 de 40 prontas'],['Conjunto Flora · Paula Reis','medidas hoje 13:00'],['Blazer Sálvia · Lojinha Sol','retirada 14:30']];

const CONTRACTS = [
 {id:'k1',who:'Rafael Souza · #0588',val:2400,parc:3,when:'assinado ontem 19:12',st:'pede sua validação',tok:'ciano',provas:['selfie','documento','assinatura'],light:'l3',conv:'c2',modelo:'Venda parcelada'},
 {id:'k2',who:'Carla Mendes · #0417',val:3900,parc:1,when:'12/ago',st:'assinado',tok:'mute',provas:['selfie','documento','assinatura'],conv:'c1',modelo:'Lojista'},
 {id:'k3',who:'Lojinha Sol · #0290',val:4300,parc:2,when:'20/set',st:'assinado',tok:'mute',provas:['selfie','documento','assinatura'],conv:'c6',modelo:'Lojista'},
 {id:'k4',who:'Bruno Lima · #0114',val:1900,parc:2,when:'há 6 dias',st:'enviado · não abriu',tok:'lua',provas:[],conv:'c4',modelo:'Venda parcelada'},
 {id:'k5',who:'Joana Alves · #0231',val:1800,parc:1,when:'01/set',st:'assinado',tok:'mute',provas:['selfie','documento','assinatura'],conv:'c3',modelo:'Venda simples'}];

const VENDAS = {n:128,total:61320,mes:34,mesTotal:19544,ult:{who:'Joana Alves · #0231',what:'6 peças · Pix',val:612,when:'hoje 09:14'},top:{n:'Conjunto Flora',q:23,c:['#7dffc4','#ffc861']}};

const COBR = [
 {id:'f1',who:'Paula Reis · #0355',what:'parcela 2/3 · Conjunto Flora',val:480,due:'hoje',tok:'ciano',st:'vence hoje',conv:null},
 {id:'f2',who:'Marina Freitas · #0602',what:'saldo · Saia Dália',val:300,due:'hoje',tok:'ciano',st:'vence hoje',conv:'c5'},
 {id:'f3',who:'Lojinha Sol · #0290',what:'parcela 1/2 · 12 peças',val:400,due:'hoje',tok:'ciano',st:'vence hoje',conv:'c6'},
 {id:'f4',who:'Bruno Lima · #0114',what:'parcela 2/2 · coleção de inverno',val:950,due:'20/set',tok:'lua',st:'atrasou 8 dias',conv:'c4'},
 {id:'f5',who:'Rafael Souza · #0588',what:'parcela 1/3 · vestido Íris',val:800,due:'05/out',tok:'mute',st:'aguardando',conv:'c2'},
 {id:'f6',who:'Rafael Souza · #0588',what:'parcela 2/3 · vestido Íris',val:800,due:'05/nov',tok:'mute',st:'aguardando',conv:'c2'},
 {id:'f8',who:'Joana Alves · #0231',what:'6 peças · saem quinta',val:1130,due:'02/out',tok:'mute',st:'aguardando',conv:'c3'},
 {id:'f7',who:'Carla Mendes · #0417',what:'Pix · 40 peças (se fechar hoje)',val:7296,due:'ao fechar',tok:'mute',st:'rascunho',conv:'c1'}];

const BX0 = [{id:'b1',who:'Joana · #0231 · Pix',when:'hoje 09:14',val:612,day:0},{id:'b2',who:'Lojinha Sol · #0290 · Pix',when:'ontem 16:40',val:1430,day:1},{id:'b3',who:'Marina · #0602 · cartão',when:'ontem 11:05',val:620,day:1},{id:'b4',who:'Carla Mendes · #0417 · Pix',when:'25/set',val:3900,day:4},{id:'b5',who:'Paula Reis · #0355 · parcela 1/3',when:'22/set',val:480,day:7}];

const LATE = [{id:'x1',t:'Entrega · Joana Alves',s:'ontem 15:00 · não confirmada',conv:'c3',ev:'e10'},{id:'x2',t:'Prova · Marina Freitas',s:'ontem 17:30 · cliente não veio',conv:'c5',ev:'e11'}];

const RULES = [['Desconto: até 5% à vista; acima disso pede você','seu áudio · 02/set'],['Projetos começam em até 7 dias','primeiro uso'],['Atendo empresas locais e da região','cadastro'],['Parcelamos em até 3× sem juros','seu texto · 10/set'],['Reclamação: nunca responde sozinha, chama você','primeiro uso']];

const RESP = [['Juliana · #0602','3','"Demorou pra dizer se tinha o tamanho, mas foi educada."','21/set'],['Carla · #0417','5','"Rápida e já mandou o Pix. Melhor que muita gente."','19/set'],['Bruno · #0114','4','"Boa, só não sabia de Sorocaba."','12/set'],['Lojinha Sol','5','"Marcou a prova na hora."','20/set'],['Paula · #0355','4','"Respondeu de madrugada, achei estranho mas resolveu."','08/set'],['Marina · #0602','5','"Amei, parecia gente."','21/set'],['Helena · #0077','2','"Não entendeu que eu queria trocar."','15/set'],['Rafael · #0588','5','"Contrato fácil, tudo pelo WhatsApp."','27/set']];

const MODELOS = [['Venda simples','à vista · entrega em até 2 dias · troca em 7 dias','1 página'],['Venda parcelada','até 3× sem juros · identificação em 5 degraus','2 páginas'],['Lojista','atacado · pedido mínimo · prazo 15 dias sob medida','3 páginas']];

const HINTS = ['O que pede você?','Quanto entrou ontem?','Agenda de hoje','Responder a Carla','Quem sumiu?','Que horas são?'];

const PERMS = [['Responder preço, prazo e tamanhos',0],['Gerar Pix até R$ 5.000',0],['Dar desconto até 5% à vista',0],['Marcar compromisso na agenda',0],['Desconto acima de 5%',1],['Prazo menor que 15 dias',1],['Responder reclamação',1],['Cancelar pedido',2]];

module.exports = { NAV, TITLE, LIGHTS, AREAS, CONVS, CLIENTES, BAIXAS, FITA, EVENTS, DUVIDAS, PRODS, TEAM, FILA, CONTRACTS, VENDAS, COBR, BX0, LATE, RULES, RESP, MODELOS, HINTS, PERMS };
