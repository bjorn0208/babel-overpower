/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
/**
 * Categoria de bloco de conhecimento — vocabulário único e inferência determinística.
 *
 * Por que existe (2026-09-08): o motor tem uma catraca comercial — quando o Porteiro decide que o
 * turno não é de dinheiro, `ragentic-processar-inline` bloqueia as categorias `preco`,
 * `parcelamento` e `pagamento` no recall. Só que o filtro compara a ETIQUETA do bloco, e 835 blocos
 * ativos (37,5% da base) estavam sem etiqueta nenhuma — passavam direto. Medido em 30 dias: 2.752
 * turnos com o comercial fechado receberam bloco sem etiqueta contendo valor em reais.
 *
 * A regra aqui é DETERMINÍSTICA de propósito. O classificador por LLM (`cron-recategorizar-blocos`)
 * continua sendo a passada fina, mas a trava de segurança não pode depender de chamada externa:
 * ela roda no meio do turno e precisa valer mesmo com a API fora do ar.
 */

/** Vocabulário canônico. Quem classifica e quem filtra falam esta mesma língua. */
export const CATEGORIAS = [
  "preco",
  "parcelamento",
  "pagamento",
  "garantia",
  "prazo",
  "produto",
  "consulta",
  "faq",
  "objecao_lead",
  "contrato",
  "fluxo",
  "empresa",
  "atendimento",
  "identidade",
  "processo",
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

/** As que a catraca comercial bloqueia quando o turno não está liberado pra dinheiro. */
export const CATEGORIAS_COMERCIAIS: Categoria[] = ["preco", "parcelamento", "pagamento"];

/**
 * Sinônimos que a base acumulou antes do vocabulário fechar. Mapeia pro canônico; o que não estiver
 * aqui e não for canônico é tratado como etiqueta livre (não confiável pra catraca).
 */
const SINONIMOS: Record<string, Categoria> = {
  objecao: "objecao_lead",
  objeção: "objecao_lead",
  objecoes: "objecao_lead",
  preço: "preco",
  precos: "preco",
  valores: "preco",
  valor: "preco",
  parcelas: "parcelamento",
  parcelado: "parcelamento",
  formas_de_pagamento: "pagamento",
  forma_pagamento: "pagamento",
  pagamentos: "pagamento",
  prazos: "prazo",
  garantias: "garantia",
  produtos: "produto",
  servico: "produto",
  serviço: "produto",
  duvida: "faq",
  dúvida: "faq",
  perguntas_frequentes: "faq",
  contratos: "contrato",
  juridico: "processo",
  jurídico: "processo",
  institucional: "empresa",
  persona: "identidade",
};

/** Números que parecem valor mas não são: CNPJ, CPF, telefone, CEP, data, lei. */
const NAO_MONETARIO = [
  /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/, // CNPJ
  /\d{3}\.\d{3}\.\d{3}-\d{2}/, // CPF
  /\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/, // telefone
  /\d{5}-\d{3}/, // CEP 06010-020
  /\d{2}\.\d{3}-\d{3}/, // CEP escrito 06.010-020 (aparece assim em bloco de endereço)
  /cep:?\s*[\d.\-]+/i, // qualquer CEP rotulado
  /\d{1,2}\/\d{1,2}\/\d{2,4}/, // data
  /lei\s+n?º?\s*[\d.]+/i, // lei
];

/**
 * Valor em dinheiro no texto. Cobre "R$ 117", "117,00", "597 reais", "5x de 147" e "5 parcelas de
 * 147" — a base tem valor escrito de todo jeito, inclusive sem o "R$" (medido: um bloco dizia só
 * "117,00, referente a TCP" e escapava de qualquer filtro que exigisse o cifrão).
 */
export function temValorMonetario(texto: string): boolean {
  if (!texto) return false;
  let limpo = texto;
  for (const ruido of NAO_MONETARIO) limpo = limpo.replace(new RegExp(ruido, "g"), " ");

  const padroes = [
    /r\$\s*\d/i, // R$ 117
    /\d+[.,]\d{2}(?!\d)/, // 117,00 · 1.500,00 (duas casas = dinheiro)
    /\d+\s*(mil|milh[õoã]\S*|bilh[õoã]\S*)?\s*(de\s+)?reais/i, // 597 reais · 1 bilhão de reais
    /\d+\s*x\s*(de\s*)?\d/i, // 5x de 147
    /\d+\s*parcelas?\s*(de\s*)?\d/i, // 5 parcelas de 147
    /(custa|custo de|valor de|sai por|fica em|entrada de)\s*\d/i,
  ];
  return padroes.some((p) => p.test(limpo));
}

type Regra = { categoria: Categoria; peso: number; padrao: RegExp };

/**
 * Regras em ordem de força. A primeira que bate com peso maior vence — dinheiro explícito ganha de
 * menção solta ao tema, porque errar pra menos aqui é vazar preço fora de hora.
 */
const REGRAS: Regra[] = [
  { categoria: "parcelamento", peso: 5, padrao: /\d+\s*x\s*(de\s*)?\d|\d+\s*parcelas?\s*(de\s*)?\d|parcelar|parcelamento|entrada\s*(de|\+)/i },
  // `\ba\s+vista\b` e não `a vista` solto: sem o boundary, "Boa Vista" (o birô de crédito, que
  // aparece em dezenas de blocos da base) era lido como "à vista" e virava bloco de preço.
  { categoria: "preco", peso: 4, padrao: /r\$\s*\d|\d+[.,]\d{2}(?!\d)|\d+\s*(mil|milh[õoã]\S*|bilh[õoã]\S*)?\s*(de\s+)?reais|cust[ao]s?\b|quanto custa|pre[çc]o|or[çc]amento|tabela de (pre[çc]o|valor)|valor (do servi[çc]o|da entrada|total)|à\s+vista|\ba\s+vista\b/i },
  { categoria: "pagamento", peso: 3, padrao: /\bpix\b|boleto|cart[ãa]o de cr[ée]dito|forma de pagamento|chave pix|link de pagamento|comprovante de pagamento/i },
  { categoria: "garantia", peso: 3, padrao: /garantia|ressarci|devolu[çc][ãa]o do valor|se n[ãa]o funcionar/i },
  { categoria: "prazo", peso: 3, padrao: /\d+\s*(a\s*\d+\s*)?dias?\s*([úu]teis)?|prazo|quanto tempo|cronograma/i },
  { categoria: "contrato", peso: 3, padrao: /cl[áa]usula|contrato assinado|assinatura do contrato|§|disposi[çc][õo]es gerais/i },
  { categoria: "consulta", peso: 3, padrao: /consulta de cpf|consultar o cpf|resultado da consulta|bir[ôo]s? de cr[ée]dito/i },
  { categoria: "processo", peso: 2, padrao: /liminar|processo judicial|a[çc][ãa]o judicial|protocolo|tr[âa]mite|peti[çc][ãa]o/i },
  { categoria: "empresa", peso: 2, padrao: /cnpj|raz[ãa]o social|nossa empresa|endere[çc]o da empresa|hist[óo]rico da empresa/i },
  { categoria: "objecao_lead", peso: 2, padrao: /objec|est[áa] caro|t[oô] na d[úu]vida|n[ãa]o confio|golpe|desconfia/i },
  { categoria: "fluxo", peso: 1, padrao: /passo a passo|primeiro.*depois|etapas?|como funciona o processo/i },
  { categoria: "identidade", peso: 1, padrao: /me apresento|minha personalidade|sou a |sou o /i },
  { categoria: "atendimento", peso: 1, padrao: /sauda[çc][ãa]o|tom de voz|como conversar|atendimento humanizado/i },
  { categoria: "faq", peso: 1, padrao: /pergunta frequente|d[úu]vida comum/i },
];

/**
 * Infere a categoria a partir do texto. Devolve `null` quando nada bate — melhor sem etiqueta do que
 * com etiqueta errada, porque a errada engana a catraca tanto quanto a ausência.
 */
export function inferirCategoria(titulo: string | null, conteudo: string | null): Categoria | null {
  const tit = (titulo ?? "").trim();
  const corpo = (conteudo ?? "").trim();
  if (!tit && !corpo) return null;

  // O título pesa o dobro: "Garantia contratual — como funciona" é bloco de garantia mesmo que o
  // corpo cite "forma de pagamento" numa lista de cláusulas do contrato (caso real da base).
  let melhor: { categoria: Categoria; ponto: number } | null = null;
  for (const regra of REGRAS) {
    let ponto = 0;
    if (regra.padrao.test(tit)) ponto += regra.peso * 2;
    if (regra.padrao.test(corpo)) ponto += regra.peso;
    if (ponto === 0) continue;
    if (!melhor || ponto > melhor.ponto) melhor = { categoria: regra.categoria, ponto };
  }
  return melhor?.categoria ?? null;
}

/** Normaliza etiqueta que já existe: canônica passa direto, sinônimo conhecido é traduzido. */
export function normalizarCategoria(bruta: string | null | undefined): Categoria | null {
  if (!bruta) return null;
  const chave = bruta.trim().toLowerCase().replace(/\s+/g, "_");
  if ((CATEGORIAS as readonly string[]).includes(chave)) return chave as Categoria;
  return SINONIMOS[chave] ?? null;
}

/**
 * A etiqueta que a catraca deve usar. Ordem: etiqueta canônica do bloco → sinônimo traduzido →
 * inferência pelo texto. Bloco sem etiqueta que fala de dinheiro vira `preco` aqui, e é isso que
 * fecha o buraco: a trava passa a valer mesmo pro bloco que nasceu cru.
 */
export function categoriaEfetiva(
  bloco: { category?: string | null; title?: string | null; content?: string | null },
): Categoria | null {
  const declarada = normalizarCategoria(bloco.category);
  if (declarada) return declarada;
  return inferirCategoria(bloco.title ?? null, bloco.content ?? null);
}

/** O bloco é comercial pra efeito de catraca? Usado pelo filtro de fase do recall. */
export function ehBlocoComercial(
  bloco: { category?: string | null; title?: string | null; content?: string | null },
): boolean {
  const declarada = normalizarCategoria(bloco.category);
  if (declarada) return CATEGORIAS_COMERCIAIS.includes(declarada);

  // Sem etiqueta confiável, a pergunta NÃO é "qual a melhor categoria" — é "tem sinal de dinheiro
  // aqui?". Usar a categoria vencedora deixava passar bloco assim: título "ESSE VALOR É PARA O CPF
  // QUANTO O CNPJ" (CNPJ pesa como `empresa` no título) com "é o mesmo preço" no corpo — vencia
  // `empresa` e o preço escapava. Aqui cada padrão comercial é testado por conta própria.
  const texto = `${bloco.title ?? ""}\n${bloco.content ?? ""}`;
  const comerciais = REGRAS.filter((r) => CATEGORIAS_COMERCIAIS.includes(r.categoria));
  if (comerciais.some((r) => r.padrao.test(texto))) return true;

  // Rede final: valor em dinheiro escrito de qualquer jeito, mesmo sem palavra-chave.
  return temValorMonetario(texto);
}
