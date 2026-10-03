/**
 * Os campos do levantamento.
 *
 * DUAS ORDENS, de propósito (desde 2026-09-15):
 *  - a ordem deste array CAMPOS é a ordem das COLUNAS na aba "Dados" da
 *    planilha (cabeçalho = rótulos). Campo novo vai SEMPRE no fim do array,
 *    senão as colunas dos envios antigos saem do lugar;
 *  - a ordem da TELA vem de ORDEM_TELA, que é o roteiro do formulário.
 * Os 38 primeiros continuam sendo as chaves do SCHEMA_DESCRICAO da edge
 * `extrair-tenant-pdf`, na mesma ordem.
 *
 * Mudar a chave de um campo quebra os rascunhos salvos no navegador — só a
 * seção e o rótulo podem mudar.
 */

export type TipoCampo = "texto" | "texto_longo" | "email" | "telefone" | "select" | "multi" | "sim_nao";

export type Campo = {
  chave: string;
  rotulo: string;
  tipo: TipoCampo;
  secao: string;
  obrigatorio?: boolean;
  opcoes?: string[];
  ajuda?: string;
  placeholder?: string;
  /** Máscara enquanto digita. Campo `telefone` já usa a de telefone sozinho. */
  mascara?: "telefone" | "documento";
  /** Só aparece quando outro campo tem certo valor (em `multi`, quando contém). */
  dependeDe?: { chave: string; valor: string };
  /** Ocupa a linha inteira no grid de 2 colunas. */
  largo?: boolean;
};

export type Secao = { id: string; titulo: string; nota?: string; aviso?: string };

export const SECOES: Secao[] = [
  { id: "responsavel", titulo: "Responsável", nota: "quem responde por esta conta" },
  { id: "empresa", titulo: "Empresa" },
  { id: "presenca", titulo: "Presença digital" },
  {
    id: "whatsapp", titulo: "WhatsApp do agente", nota: "o número que o agente vai usar",
    aviso: "Este é o número em que o agente vai atender. Ele pode ser diferente do WhatsApp que você conecta no final do formulário.",
  },
  { id: "horario", titulo: "Horário" },
  { id: "agente", titulo: "Agente", nota: "a pessoa virtual que atende" },
  { id: "produtos", titulo: "Produtos e serviços" },
  { id: "pagamento", titulo: "Pagamento e políticas" },
  { id: "funil", titulo: "Funil e passagem para humano" },
  { id: "observacoes", titulo: "Observações e envio" },
];

export const CAMPOS: Campo[] = [
  // Responsável
  { chave: "responsavel_nome", rotulo: "Nome completo", tipo: "texto", secao: "responsavel", obrigatorio: true },
  { chave: "responsavel_email", rotulo: "E-mail", tipo: "email", secao: "responsavel" },
  { chave: "responsavel_whatsapp", rotulo: "WhatsApp do responsável", tipo: "telefone", secao: "responsavel", obrigatorio: true, ajuda: "Não é o número do agente — é o seu, pra gente falar com você.", placeholder: "(84) 99999-0000" },

  // Empresa
  { chave: "razao_social", rotulo: "Razão social", tipo: "texto", secao: "empresa" },
  { chave: "nome_comercial", rotulo: "Nome comercial", tipo: "texto", secao: "empresa", obrigatorio: true, ajuda: "É como sua empresa vai aparecer na planilha da Babel." },
  { chave: "documento", rotulo: "CNPJ ou CPF", tipo: "texto", secao: "empresa", mascara: "documento", placeholder: "00.000.000/0000-00" },
  { chave: "segmento", rotulo: "Segmento", tipo: "select", secao: "empresa", opcoes: ["Varejo", "Saúde", "Estética e beleza", "Serviços", "Educação", "Imobiliário", "Jurídico", "Alimentação", "Automotivo", "Financeiro", "Crédito e limpa nome", "Outro"] },
  { chave: "segmento_outro", rotulo: "Qual segmento?", tipo: "texto", secao: "empresa", dependeDe: { chave: "segmento", valor: "Outro" } },
  { chave: "descricao_negocio", rotulo: "Descreva o negócio em poucas linhas", tipo: "texto_longo", secao: "empresa", largo: true, placeholder: "O que vende, pra quem, há quanto tempo, o que te diferencia." },
  { chave: "modo_atendimento", rotulo: "Como você atende hoje?", tipo: "select", secao: "empresa", opcoes: ["Presencial", "Só online", "Os dois"] },
  { chave: "endereco", rotulo: "Endereço", tipo: "texto", secao: "empresa", placeholder: "Rua, número, bairro, cidade/UF" },
  { chave: "tem_mais_unidades", rotulo: "Tem mais de uma unidade?", tipo: "sim_nao", secao: "empresa" },
  { chave: "unidades_endereco", rotulo: "Endereços das outras unidades", tipo: "texto_longo", secao: "empresa", largo: true, placeholder: "Ex.: Unidade Centro — Rua X, 100, Centro, Natal/RN", ajuda: "Uma por linha.", dependeDe: { chave: "tem_mais_unidades", valor: "Sim" } },

  // Presença digital
  { chave: "site", rotulo: "Site", tipo: "texto", secao: "presenca", placeholder: "www.suaempresa.com.br" },
  { chave: "instagram", rotulo: "Instagram", tipo: "texto", secao: "presenca", placeholder: "@suaempresa" },
  { chave: "outros_links", rotulo: "Outros links", tipo: "texto", secao: "presenca", placeholder: "Facebook, Google Maps, catálogo…" },
  // Pix nasceu em "Presença digital"; desde 2026-09-15 aparece em "Pagamento e
  // políticas" (a coluna da planilha continua onde sempre esteve).
  { chave: "chave_pix", rotulo: "Chave Pix da empresa", tipo: "texto", secao: "pagamento", ajuda: "A chave que o agente vai passar pro cliente pagar.", dependeDe: { chave: "formas_pagamento", valor: "Pix" } },

  // WhatsApp do agente
  { chave: "whatsapp_agente", rotulo: "Número do WhatsApp do agente", tipo: "telefone", secao: "whatsapp", placeholder: "(84) 3000-0000" },
  { chave: "tipo_numero_whatsapp", rotulo: "Tipo de número", tipo: "select", secao: "whatsapp", opcoes: ["WhatsApp Business", "WhatsApp comum", "Chip novo, ainda sem uso"] },
  { chave: "tempo_numero", rotulo: "Há quanto tempo esse número existe?", tipo: "select", secao: "whatsapp", opcoes: ["Menos de 1 mês", "1 a 6 meses", "Mais de 6 meses", "Mais de 2 anos"], ajuda: "Número novo ou com pouco histórico passa por um período de aquecimento antes de atender em volume. É o que protege o seu número nas primeiras semanas." },
  { chave: "historico_conversas", rotulo: "Tem histórico de conversas nesse número? Como está guardado?", tipo: "texto_longo", secao: "whatsapp", largo: true, placeholder: "Ex.: sim, tudo no próprio WhatsApp desde 2022" },
  { chave: "volume_semanal", rotulo: "Quantas conversas por semana?", tipo: "select", secao: "whatsapp", opcoes: ["Até 20", "20 a 100", "100 a 500", "Mais de 500"] },

  // Horário
  { chave: "horario_atendimento", rotulo: "Horário de atendimento", tipo: "texto", secao: "horario", placeholder: "Ex.: seg–sex 8h–18h, sáb 8h–12h" },
  { chave: "periodos_fechamento", rotulo: "Períodos em que fecha", tipo: "texto", secao: "horario", placeholder: "Ex.: feriados, férias coletivas em janeiro" },

  // Agente
  { chave: "nome_agente", rotulo: "Nome do agente", tipo: "texto", secao: "agente", placeholder: "Ex.: Clara" },
  { chave: "tom_de_voz", rotulo: "Tom de voz", tipo: "select", secao: "agente", opcoes: ["Formal", "Informal", "Espelha o cliente"] },
  { chave: "saudacao", rotulo: "Saudação (a primeira frase que o cliente recebe)", tipo: "texto_longo", secao: "agente", largo: true },
  { chave: "mensagem_exemplo", rotulo: "Uma mensagem de exemplo, do jeito que você responderia", tipo: "texto_longo", secao: "agente", largo: true, placeholder: "Ex.: Oi, Maria! Tudo bem? Vi que você perguntou sobre o nosso serviço. Me conta rapidinho o que está precisando que eu já te explico como funciona." },

  // Produtos e pagamento
  { chave: "quantidade_produtos_texto", rotulo: "Quantos produtos ou serviços o agente precisa conhecer?", tipo: "texto", secao: "produtos", largo: true, placeholder: "Ex.: uns 30 modelos + 3 serviços", ajuda: "Só a quantidade total. Os principais você detalha nos cartões abaixo." },
  { chave: "parcelamento", rotulo: "Condições gerais de parcelamento (valem para todos os itens)", tipo: "texto", secao: "pagamento", placeholder: "Ex.: até 6x sem juros no cartão" },
  { chave: "formas_pagamento", rotulo: "Formas de pagamento", tipo: "multi", secao: "pagamento", largo: true, opcoes: ["Pix", "Cartão de crédito", "Cartão de débito", "Boleto", "Dinheiro", "Crediário próprio", "Transferência", "Outro"] },

  // Funil e passagem para humano
  { chave: "informacoes_necessarias", rotulo: "Que informações o agente precisa pegar do cliente?", tipo: "texto_longo", secao: "funil", largo: true },
  { chave: "informacao_indispensavel", rotulo: "Qual dessas é indispensável (sem ela não avança)?", tipo: "texto", secao: "funil", largo: true },
  { chave: "etapas_funil", rotulo: "Etapas do seu funil, do primeiro contato ao fechamento", tipo: "texto_longo", secao: "funil", largo: true },
  { chave: "ate_onde_vai_funil", rotulo: "Até onde o agente vai sozinho? Quando passa pra um humano?", tipo: "texto_longo", secao: "funil", largo: true, placeholder: "Ex.: tira dúvidas e passa o valor sozinho; quando o cliente quer fechar ou pede desconto maior, passa pra um humano" },

  // Políticas gerais (a seção "Políticas" foi absorvida por "Pagamento e
  // políticas" em 2026-09-15; as colunas continuam nesta posição)
  { chave: "politica_garantia", rotulo: "Garantia (política geral)", tipo: "texto_longo", secao: "pagamento", largo: true },
  { chave: "politica_cancelamento", rotulo: "Cancelamento e troca (política geral)", tipo: "texto_longo", secao: "pagamento", largo: true },

  // Observações
  { chave: "observacao_extra", rotulo: "Alguma coisa que a Babel precisa saber e não perguntou?", tipo: "texto_longo", secao: "observacoes", largo: true },

  // ---- Campos acrescentados em 2026-09-11 (ficam no FIM do array de propósito:
  // a aba "Dados" já tinha cabeçalho com os 38 originais; assim as colunas antigas
  // não mudam de lugar. Na tela cada um aparece no lugar que ORDEM_TELA manda.) ----

  // Empresa
  { chave: "missao_valores", rotulo: "Missão e valores da empresa (se tiver)", tipo: "texto_longo", secao: "empresa", largo: true },
  { chave: "diferenciais", rotulo: "Seus maiores diferenciais frente à concorrência", tipo: "texto_longo", secao: "empresa", largo: true },
  { chave: "perfil_cliente_ideal", rotulo: "Quem é o seu cliente ideal?", tipo: "texto_longo", secao: "empresa", largo: true },

  // Agente
  { chave: "cargo_agente", rotulo: "Cargo ou função do agente", tipo: "texto", secao: "agente", placeholder: "Ex.: consultor de vendas, recepcionista, suporte" },
  { chave: "personalidade_agente", rotulo: "Personalidade do agente (1 a 3 frases)", tipo: "texto_longo", secao: "agente", largo: true, placeholder: "Ex.: direta e calorosa, fala pouco e vai ao ponto, nunca pressiona" },
  { chave: "regras_agente", rotulo: "O que o agente deve SEMPRE fazer", tipo: "texto_longo", secao: "agente", largo: true, ajuda: "Essas viram as diretrizes do agente na Babel. Uma por linha." },
  { chave: "proibicoes_agente", rotulo: "O que o agente NUNCA pode dizer ou fazer", tipo: "texto_longo", secao: "agente", largo: true, ajuda: "Palavras proibidas, promessas que não pode fazer, assuntos que não entra. Uma por linha." },
  { chave: "mensagem_fora_horario", rotulo: "O que o agente responde fora do horário?", tipo: "texto_longo", secao: "horario", largo: true, placeholder: "Ex.: Oi! Nosso horário é seg–sex 8h–18h. Já te respondo assim que abrirmos." },
  { chave: "humano_responsavel", rotulo: "Quando precisar de um humano, pra quem o agente passa? (nome e WhatsApp)", tipo: "texto", secao: "funil", largo: true, placeholder: "Ex.: Ana, (84) 99999-0000" },

  // Produtos e pagamento
  { chave: "ticket_medio", rotulo: "Valor médio de uma venda", tipo: "select", secao: "pagamento", opcoes: ["Até R$ 300", "R$ 300 a R$ 1.000", "R$ 1.000 a R$ 5.000", "Acima de R$ 5.000"] },
  { chave: "usa_contrato", rotulo: "O agente envia contrato pra assinatura?", tipo: "sim_nao", secao: "pagamento" },
  { chave: "contrato_como_funciona", rotulo: "Como funciona o contrato hoje? (modelo, assinatura, prazo)", tipo: "texto_longo", secao: "pagamento", largo: true, dependeDe: { chave: "usa_contrato", valor: "Sim" }, placeholder: "Ex.: PDF padrão, assina pelo WhatsApp, vale 12 meses" },

  // Funil e passagem para humano
  { chave: "objecoes_comuns", rotulo: "Objeções mais comuns dos clientes e como você responde hoje", tipo: "texto_longo", secao: "funil", largo: true, placeholder: "Ex.: \"tá caro\" → mostro o parcelamento; \"vou pensar\" → pergunto o que falta pra decidir" },
  { chave: "prazo_decisao", rotulo: "Quanto tempo o cliente costuma levar pra decidir?", tipo: "select", secao: "funil", opcoes: ["No mesmo dia", "Até 3 dias", "Até 1 semana", "Mais de 1 semana"] },
  { chave: "insistencia", rotulo: "Se o cliente some, quantas vezes e com que intervalo o agente deve retomar?", tipo: "texto", secao: "funil", placeholder: "Ex.: 3 vezes, a cada 2 dias, depois desiste" },
  { chave: "faz_agendamento", rotulo: "O atendimento marca horário ou reunião?", tipo: "sim_nao", secao: "funil" },
  { chave: "agendamento_como", rotulo: "Como é o agendamento hoje? (agenda, duração, quem atende)", tipo: "texto_longo", secao: "funil", largo: true, dependeDe: { chave: "faz_agendamento", valor: "Sim" }, placeholder: "Ex.: Google Agenda, 30 min, atende a Ana" },

  // ---- Campos acrescentados em 2026-09-15 (mesma regra: no FIM do array) ----

  // Empresa
  { chave: "onde_atende", rotulo: "Onde você atende?", tipo: "select", secao: "empresa", opcoes: ["Só na minha cidade", "Na minha região ou estado", "Todo o Brasil (online)"] },
  { chave: "regiao_detalhe", rotulo: "Detalhe da região atendida", tipo: "texto", secao: "empresa", placeholder: "Ex.: Natal, Parnamirim e São Gonçalo do Amarante" },

  // Agente
  { chave: "objetivo_agente", rotulo: "Qual o principal objetivo do agente?", tipo: "select", secao: "agente", largo: true, opcoes: ["Vender e passar o pagamento", "Agendar horário ou reunião", "Qualificar o cliente e passar para um vendedor", "Tirar dúvidas e dar suporte"] },
  { chave: "transparencia_agente", rotulo: "Como o agente se apresenta?", tipo: "select", secao: "agente", largo: true, opcoes: ["Diz que é assistente virtual já na saudação", "Diz que é assistente virtual se o cliente perguntar"], ajuda: "O agente nunca nega ser um assistente virtual quando o cliente pergunta." },
  { chave: "agente_audio", rotulo: "Quando o cliente manda áudio, o que o agente faz?", tipo: "select", secao: "agente", largo: true, opcoes: ["Entende o áudio e responde normalmente", "Pede com gentileza para o cliente escrever", "Passa para um humano"] },
  { chave: "agente_midia", rotulo: "Quando o cliente manda foto ou documento, o que o agente faz?", tipo: "texto_longo", secao: "agente", largo: true, placeholder: "Ex.: comprovante de pagamento → agradece e avisa o financeiro; foto de documento → confirma o recebimento e segue o atendimento" },

  // Pagamento e políticas
  { chave: "pix_titular", rotulo: "Nome do titular da chave Pix", tipo: "texto", secao: "pagamento", placeholder: "Ex.: Ótica Vista Clara Ltda", ajuda: "O agente informa esse nome pro cliente conferir antes de pagar. Ele nunca passa outra chave além desta.", dependeDe: { chave: "formas_pagamento", valor: "Pix" } },

  // Funil e passagem para humano
  { chave: "capacidade_humano", rotulo: "Quantos atendimentos passados pelo agente essa pessoa consegue assumir por dia?", tipo: "select", secao: "funil", largo: true, opcoes: ["Até 5", "De 6 a 15", "De 16 a 30", "Mais de 30"] },
  { chave: "cliente_irritado", rotulo: "Se o cliente reclamar, estiver irritado ou falar em Procon, o que o agente faz?", tipo: "texto_longo", secao: "funil", largo: true, placeholder: "Ex.: pede desculpas, não discute e passa na hora para a Ana, (84) 99999-0000" },
];

/**
 * Ordem de exibição na tela, seção por seção (a da planilha é a do CAMPOS).
 * Chave que ficar de fora daqui cai no fim da sua seção.
 */
const ORDEM_TELA: string[] = [
  // 01 Responsável
  "responsavel_nome", "responsavel_email", "responsavel_whatsapp",
  // 02 Empresa
  "razao_social", "nome_comercial", "documento", "segmento", "segmento_outro", "descricao_negocio",
  "modo_atendimento", "endereco", "tem_mais_unidades", "unidades_endereco", "onde_atende", "regiao_detalhe",
  "missao_valores", "diferenciais", "perfil_cliente_ideal",
  // 03 Presença digital
  "site", "instagram", "outros_links",
  // 04 WhatsApp do agente
  "whatsapp_agente", "tipo_numero_whatsapp", "tempo_numero", "historico_conversas", "volume_semanal",
  // 05 Horário
  "horario_atendimento", "periodos_fechamento", "mensagem_fora_horario",
  // 06 Agente
  "nome_agente", "tom_de_voz", "objetivo_agente", "transparencia_agente", "saudacao", "mensagem_exemplo",
  "cargo_agente", "personalidade_agente", "regras_agente", "proibicoes_agente", "agente_audio", "agente_midia",
  // 07 Produtos e serviços (o resto da seção são os cartões)
  "quantidade_produtos_texto",
  // 08 Pagamento e políticas
  "formas_pagamento", "parcelamento", "chave_pix", "pix_titular", "ticket_medio", "usa_contrato",
  "contrato_como_funciona", "politica_garantia", "politica_cancelamento",
  // 09 Funil e passagem para humano
  "informacoes_necessarias", "informacao_indispensavel", "etapas_funil", "objecoes_comuns", "prazo_decisao",
  "insistencia", "faz_agendamento", "agendamento_como", "ate_onde_vai_funil", "humano_responsavel",
  "capacidade_humano", "cliente_irritado",
  // 10 Observações e envio
  "observacao_extra",
];

const POSICAO_TELA = new Map(ORDEM_TELA.map((chave, i) => [chave, i]));

/** CAMPOS na ordem da tela (a da planilha continua sendo a do array CAMPOS). */
export const CAMPOS_TELA: Campo[] = [...CAMPOS].sort(
  (a, b) => (POSICAO_TELA.get(a.chave) ?? Number.MAX_SAFE_INTEGER) - (POSICAO_TELA.get(b.chave) ?? Number.MAX_SAFE_INTEGER),
);

/**
 * Campos de CADA produto/serviço (seção "Produtos e serviços", lista que a
 * pessoa vai aumentando com "Adicionar"). Cada item vira uma linha na aba
 * "Produtos" da planilha, ligada à aba "Dados" pelo ID do envio. Mesma regra
 * dos CAMPOS: a ordem aqui é a ordem das colunas, campo novo vai no fim.
 */
export const CAMPOS_PRODUTO: Campo[] = [
  { chave: "nome", rotulo: "Nome do produto ou serviço", tipo: "texto", secao: "produtos", obrigatorio: true },
  { chave: "tipo", rotulo: "É um…", tipo: "select", secao: "produtos", opcoes: ["Produto", "Serviço", "Plano ou assinatura", "Pacote (produto + serviço)"] },
  { chave: "descricao", rotulo: "Como funciona", tipo: "texto_longo", secao: "produtos", largo: true },
  { chave: "publico", rotulo: "Pra quem é indicado", tipo: "texto", secao: "produtos" },
  { chave: "valor", rotulo: "Valor", tipo: "texto", secao: "produtos" },
  { chave: "condicoes_pagamento", rotulo: "Parcelamento e condições deste item (só se for diferente das condições gerais)", tipo: "texto", secao: "produtos" },
  { chave: "desconto", rotulo: "O agente pode dar desconto? Até quanto?", tipo: "texto", secao: "produtos" },
  { chave: "prazo", rotulo: "Prazos", tipo: "texto_longo", secao: "produtos" },
  { chave: "entrega", rotulo: "Como funciona a entrega", tipo: "texto_longo", secao: "produtos" },
  { chave: "garantia", rotulo: "Garantia deste item (só se for diferente da política geral)", tipo: "texto_longo", secao: "produtos" },
  { chave: "cancelamento", rotulo: "Cancelamento, troca ou reembolso deste item (só se for diferente da política geral)", tipo: "texto_longo", secao: "produtos" },
  { chave: "tem_contrato", rotulo: "Tem contrato?", tipo: "sim_nao", secao: "produtos", largo: true },
  { chave: "contrato_detalhes", rotulo: "Como é o contrato deste item?", tipo: "texto_longo", secao: "produtos", largo: true, dependeDe: { chave: "tem_contrato", valor: "Sim" }, placeholder: "Ex.: modelo em PDF, assinatura digital pelo link, vigência de 12 meses" },
  { chave: "nao_inclui", rotulo: "O que NÃO está incluso (o agente não pode prometer)", tipo: "texto_longo", secao: "produtos", largo: true },
  { chave: "documentos_cliente", rotulo: "O que o cliente precisa enviar ou ter", tipo: "texto_longo", secao: "produtos", largo: true },
  { chave: "perguntas_frequentes", rotulo: "Perguntas que os clientes mais fazem sobre este item (e a resposta)", tipo: "texto_longo", secao: "produtos", largo: true },
  { chave: "links_material", rotulo: "Link de fotos, vídeo, catálogo ou página de venda", tipo: "texto", secao: "produtos", largo: true, placeholder: "https://…" },
];

/**
 * Exemplos (placeholders) por conjunto. O formulário é genérico: `generico` é o
 * padrão pra qualquer segmento e também quando ninguém escolheu segmento;
 * `credito` entra só quando o segmento fala de crédito/financeiro/limpa nome.
 * Pra abrir um conjunto novo (imobiliária, clínica…), basta acrescentar uma
 * entrada aqui e uma regra em `conjuntoExemplos`.
 *
 * Regra dos exemplos, em qualquer conjunto: nada de promessa de resultado, de
 * "via judicial"/"advogado" como argumento de venda, nem "garantido" ligado a
 * resultado.
 */
type ConjuntoExemplos = { campos: Record<string, string>; produto: Record<string, string> };

export const PLACEHOLDERS: Record<string, ConjuntoExemplos> = {
  generico: {
    campos: {
      missao_valores: "Ex.: atender bem quem confia na gente; honestidade, agilidade, cuidado",
      diferenciais: "Ex.: resposta em 24h, sem taxa de adesão, 10 anos de mercado",
      perfil_cliente_ideal: "Ex.: moradores da região, 25 a 50 anos, que buscam qualidade e bom atendimento",
      regras_agente: "Ex.: se apresentar com nome e empresa; chamar o cliente pelo nome; confirmar o pedido antes de passar o valor",
      proibicoes_agente: "Ex.: nunca prometer prazo que não depende da gente; nunca dar desconto sem autorização; nunca falar mal de concorrente",
      informacoes_necessarias: "Ex.: nome, o que procura, cidade, melhor horário pra contato",
      etapas_funil: "Ex.: 1) dúvida → 2) orçamento → 3) escolha → 4) pagamento → 5) entrega",
      politica_garantia: "Ex.: 90 dias em defeito de fabricação",
      politica_cancelamento: "Ex.: troca em 7 dias com nota fiscal",
    },
    produto: {
      nome: "Ex.: Consulta inicial",
      descricao: "Explique como explicaria pra um cliente: o que é, o passo a passo e o resultado que entrega.",
      publico: "Ex.: quem está procurando esse serviço pela primeira vez",
      valor: "Ex.: R$ 350",
      condicoes_pagamento: "Ex.: até 6x sem juros no cartão",
      desconto: "Ex.: até 10% no Pix; mais que isso, só o gerente",
      prazo: "Ex.: entrega em até 5 dias úteis",
      entrega: "Ex.: retira na loja, envio pelos Correios ou atendimento online",
      garantia: "Ex.: 90 dias para defeitos de fabricação",
      cancelamento: "Ex.: troca em até 7 dias com nota fiscal",
      nao_inclui: "Ex.: instalação não inclusa",
      documentos_cliente: "Ex.: endereço de entrega e nome completo",
      perguntas_frequentes: "Ex.: \"faz entrega?\" → sim, na cidade toda, em até 2 dias",
    },
  },
  credito: {
    campos: {
      missao_valores: "Ex.: devolver o crédito a quem foi esquecido pelo banco; transparência, rapidez, respeito",
      diferenciais: "Ex.: atendimento humano do início ao fim, contrato claro, 10 anos de mercado",
      perfil_cliente_ideal: "Ex.: pessoa com nome negativado, 30 a 55 anos, que precisa voltar a ter crédito",
      regras_agente: "Ex.: se apresentar com nome e empresa; chamar o cliente pelo nome; explicar que cada caso passa por análise",
      proibicoes_agente: "Ex.: nunca garantir aprovação de crédito ou aumento de score; nunca prometer prazo de resultado; nunca dar desconto sem autorização",
      informacoes_necessarias: "Ex.: nome, CPF, se sabe quais dívidas tem, renda aproximada",
      etapas_funil: "Ex.: 1) dúvida → 2) diagnóstico → 3) proposta → 4) contrato → 5) pagamento",
      politica_garantia: "Ex.: execução do serviço conforme contrato; valor devolvido se não for executado",
      politica_cancelamento: "Ex.: 7 dias sem custo após a assinatura; depois, conforme contrato",
    },
    produto: {
      nome: "Ex.: Diagnóstico de Crédito",
      descricao: "Ex.: analisamos seu CPF, mostramos o que está pesando e montamos um plano de ação com as próximas etapas",
      publico: "Ex.: quem está negativado e quer entender por onde começar",
      valor: "Ex.: R$ 297 à vista",
      condicoes_pagamento: "Ex.: 3x de R$ 99 no cartão",
      desconto: "Ex.: até 10% no Pix; mais que isso, só o gerente",
      prazo: "Ex.: início em até 2 dias úteis após a assinatura; etapas e prazos de execução descritos em contrato",
      entrega: "Ex.: tudo online, com acompanhamento pelo WhatsApp",
      garantia: "Ex.: se o serviço não for executado como descrito no contrato, devolvemos o valor pago",
      cancelamento: "Ex.: cancela em até 7 dias sem custo; depois, conforme o contrato",
      nao_inclui: "Ex.: não garantimos aumento de score nem aprovação de crédito",
      documentos_cliente: "Ex.: documento com foto, CPF e comprovante de residência",
      perguntas_frequentes: "Ex.: \"é seguro?\" → sim, tudo é feito com contrato assinado e você acompanha cada etapa",
    },
  },
};

export function conjuntoExemplos(valores: Valores): string {
  const segmento = `${valores.segmento ?? ""} ${valores.segmento_outro ?? ""}`.toLowerCase();
  if (/cr[ée]dito|financeir|limpa\s*nome/.test(segmento)) return "credito";
  return "generico";
}

/** Exemplo que o campo mostra agora, já considerando segmento e nomes digitados. */
export function placeholderDe(campo: Campo, valores: Valores, deProduto = false): string | undefined {
  if (!deProduto && campo.chave === "saudacao") {
    const agente = String(valores.nome_agente ?? "").trim() || "Clara";
    const empresa = String(valores.nome_comercial ?? "").trim() || "sua empresa";
    return `Ex.: Oi! Aqui é a ${agente}, da ${empresa}. Como posso te ajudar?`;
  }
  const conjunto = PLACEHOLDERS[conjuntoExemplos(valores)] ?? PLACEHOLDERS.generico;
  return (deProduto ? conjunto.produto : conjunto.campos)[campo.chave] ?? campo.placeholder;
}

export type Valores = Record<string, string | string[]>;

export const VALORES_VAZIOS: Valores = Object.fromEntries(
  CAMPOS.map((c) => [c.chave, c.tipo === "multi" ? [] : ""]),
);

export type Produto = { id: string; valores: Valores };

export function novoProduto(valores?: Valores): Produto {
  const vazio: Valores = Object.fromEntries(CAMPOS_PRODUTO.map((c) => [c.chave, c.tipo === "multi" ? [] : ""]));
  return { id: Math.random().toString(36).slice(2, 10), valores: { ...vazio, ...valores } };
}

/** Cartão sem nada escrito não conta nem é enviado. */
export function produtoVazio(p: Produto): boolean {
  return !CAMPOS_PRODUTO.some((c) => campoRespondido(c, p.valores));
}

/** Chave de erro/âncora de um campo dentro de um cartão de produto. */
export function chaveCampoProduto(idProduto: string, chave: string): string {
  return `produto-${idProduto}-${chave}`;
}

export function validarProdutos(produtos: Produto[]): Record<string, string> {
  const erros: Record<string, string> = {};
  for (const p of produtos) {
    if (produtoVazio(p)) continue;
    for (const c of CAMPOS_PRODUTO) {
      if (c.obrigatorio && campoVisivel(c, p.valores) && !campoRespondido(c, p.valores)) {
        erros[chaveCampoProduto(p.id, c.chave)] = "Dê um nome pra esse item.";
      }
    }
  }
  return erros;
}

export function campoVisivel(campo: Campo, valores: Valores): boolean {
  if (!campo.dependeDe) return true;
  const atual = valores[campo.dependeDe.chave];
  return Array.isArray(atual) ? atual.includes(campo.dependeDe.valor) : atual === campo.dependeDe.valor;
}

export function campoRespondido(campo: Campo, valores: Valores): boolean {
  const v = valores[campo.chave];
  return Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim().length > 0;
}

export function somenteDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

/** (84) 99999-0000 — aceita 8 ou 9 dígitos no número, corta o que passar. */
export function mascararTelefone(bruto: string): string {
  const d = somenteDigitos(bruto).slice(0, 11);
  if (d.length <= 2) return d;
  const ddd = `(${d.slice(0, 2)})`;
  if (d.length <= 6) return `${ddd} ${d.slice(2)}`;
  const corte = d.length > 10 ? 7 : 6;
  return `${ddd} ${d.slice(2, corte)}-${d.slice(corte)}`;
}

/** CPF 000.000.000-00 até 11 dígitos; daí em diante CNPJ 00.000.000/0000-00. */
export function mascararDocumento(bruto: string): string {
  const d = somenteDigitos(bruto).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

export function aplicarMascara(campo: Campo, valor: string): string {
  const mascara = campo.mascara ?? (campo.tipo === "telefone" ? "telefone" : undefined);
  if (mascara === "telefone") return mascararTelefone(valor);
  if (mascara === "documento") return mascararDocumento(valor);
  return valor;
}

/** Devolve {chave: mensagem} só pros campos com problema. */
export function validar(valores: Valores): Record<string, string> {
  const erros: Record<string, string> = {};
  for (const c of CAMPOS) {
    if (!campoVisivel(c, valores)) continue;
    const v = valores[c.chave];
    const texto = Array.isArray(v) ? v.join(",") : v ?? "";
    if (c.obrigatorio && !texto.trim()) {
      erros[c.chave] = "Precisa preencher.";
      continue;
    }
    if (!texto.trim()) continue;
    if (c.tipo === "telefone" && somenteDigitos(texto).length < 10) erros[c.chave] = "Coloque o DDD junto — ex.: (84) 99999-0000.";
    if (c.tipo === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto.trim())) erros[c.chave] = "Esse e-mail não parece completo.";
  }
  return erros;
}
