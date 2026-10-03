/**
 * _shared/motor-pagamento.ts
 *
 * Motor de pagamento determinístico do contrato. Função PURA: recebe os itens
 * do carrinho (cada um com o recurso de pagamento do SEU produto) + a política
 * de parcelamento do pacote, e devolve o plano completo (à vista + parcelado
 * com cronograma).
 *
 * Princípio inviolável: o valor da parcela é SEMPRE calculado aqui, nunca lido
 * de um campo que pode faltar. Foi um `valor_parcela = null` (molde sem o campo)
 * que escondeu a opção parcelada e travou a liberação dos contratos (~30/05).
 *
 * Sem I/O, sem efeito colateral, sem dependência externa → 100% testável.
 */

/** Recurso de pagamento de UM produto (vive no produto, não no molde). */
export type RecursoPagamento = {
  /** Preço à vista do produto (obrigatório, > 0). */
  preco_avista: number;
  /** Até quantas parcelas este produto aceita (default 1 = só à vista). */
  parcelas_max?: number;
  /** Entrada fixa em R$ (default 0 = sem entrada). */
  entrada?: number;
  /** Juros ao mês em fração (0.02 = 2% a.m.). default 0 = sem juros. */
  juros_mensal?: number;
  /** Acréscimo no parcelado em fração (0.10 = +10% sobre o total). default 0. */
  acrescimo_parcelado?: number;
  /** Valor da parcela cravado pelo dono. Prioridade sobre o cálculo, mas há fallback (nunca null). */
  valor_parcela_cravado?: number;
};

export type ItemPlano = {
  produto_id: string;
  nome: string;
  quantidade: number;
  recurso: RecursoPagamento;
};

/** Como combinar o teto de parcelas quando há vários produtos no carrinho. */
export type PoliticaPacote = "maior" | "menor" | "primeiro";

export type ParcelaCronograma = {
  numero: number;
  valor: number;
  /** Dias a partir da assinatura: 0 = no ato, 30 = +1 mês, ... */
  vencimento_offset_dias: number;
};

export type PlanoPagamento = {
  total_avista: number;
  itens: Array<{ produto_id: string; nome: string; quantidade: number; subtotal: number }>;
  /** null quando o pacote só aceita à vista (nenhum produto parcela). */
  parcelado:
    | null
    | {
        parcelas: number;
        entrada: number;
        valor_parcela: number;
        total_parcelado: number;
        juros_mensal: number;
        cronograma: ParcelaCronograma[];
      };
};

/** Arredonda para 2 casas (centavos), evitando ruído de ponto flutuante. */
function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Valor de cada parcela.
 * - Sem juros: divisão simples (total − entrada) / parcelas.
 * - Com juros: tabela Price (PMT) sobre o valor financiado.
 */
export function calcularValorParcela(base: number, parcelas: number, jurosMensal: number): number {
  if (parcelas <= 0 || base <= 0) return 0;
  if (jurosMensal <= 0) return r2(base / parcelas);
  const i = jurosMensal;
  const pmt = (base * (i * Math.pow(1 + i, parcelas))) / (Math.pow(1 + i, parcelas) - 1);
  return r2(pmt);
}

export function montarPlanoPagamento(
  itens: ItemPlano[],
  politica: PoliticaPacote = "maior",
): PlanoPagamento {
  const linhas = (itens ?? []).map((it) => {
    const qtd = Math.max(1, Math.floor(it.quantidade || 1));
    return {
      produto_id: it.produto_id,
      nome: it.nome,
      quantidade: qtd,
      subtotal: r2(Math.max(0, it.recurso?.preco_avista || 0) * qtd),
    };
  });
  const total = r2(linhas.reduce((s, l) => s + l.subtotal, 0));

  // Teto de parcelas do pacote — o recurso é POR PRODUTO; a política decide
  // como combinar quando há mais de um (default: maior teto, cliente entende).
  const tetos = (itens ?? []).map((it) => Math.max(1, Math.floor(it.recurso?.parcelas_max ?? 1)));
  let parcelasMax = 1;
  if (tetos.length > 0) {
    parcelasMax =
      politica === "menor"
        ? Math.min(...tetos)
        : politica === "primeiro"
          ? tetos[0]
          : Math.max(...tetos);
  }

  // Entrada do pacote = soma das entradas. Juros/acréscimo = maior (conservador).
  const entrada = r2((itens ?? []).reduce((s, it) => s + Math.max(0, it.recurso?.entrada ?? 0), 0));
  const juros = (itens ?? []).reduce((m, it) => Math.max(m, it.recurso?.juros_mensal ?? 0), 0);
  const acrescimo = (itens ?? []).reduce((m, it) => Math.max(m, it.recurso?.acrescimo_parcelado ?? 0), 0);
  // Valor cravado pelo dono (primeiro produto que definir) — tem prioridade sobre o cálculo.
  const valorCravado = (itens ?? [])
    .map((it) => it.recurso?.valor_parcela_cravado)
    .find((v) => typeof v === "number" && (v as number) > 0) as number | undefined;

  let parcelado: PlanoPagamento["parcelado"] = null;
  if (parcelasMax > 1 && total > 0) {
    const entradaEfetiva = Math.min(entrada, total);
    const base = r2(Math.max(0, total - entradaEfetiva) * (1 + Math.max(0, acrescimo)));
    // Regra de ouro: valor cravado existe → usa; não existe → calcula. Nunca null.
    const vp =
      typeof valorCravado === "number" && valorCravado > 0
        ? r2(valorCravado)
        : calcularValorParcela(base, parcelasMax, juros);
    const cronograma: ParcelaCronograma[] = [];
    for (let n = 1; n <= parcelasMax; n++) {
      cronograma.push({ numero: n, valor: vp, vencimento_offset_dias: (n - 1) * 30 });
    }
    parcelado = {
      parcelas: parcelasMax,
      entrada: entradaEfetiva,
      valor_parcela: vp,
      total_parcelado: r2(entradaEfetiva + vp * parcelasMax),
      juros_mensal: juros,
      cronograma,
    };
  }

  return { total_avista: total, itens: linhas, parcelado };
}


/** Uma forma de pagamento do produto (PIX, boleto, cartão...). */
export type FormaPagamento = {
  tipo: "pix" | "boleto" | "cartao" | "outro";
  rotulo?: string;
  /** Desconto à vista em fração (0.05 = 5%). default 0. */
  desconto_avista?: number;
  /** Parcelas máximas (1 ou ausente = só à vista). */
  parcelas_max?: number;
  entrada?: number;
  acrescimo_parcelado?: number;
  juros_mensal?: number;
  valor_parcela_cravado?: number;
};

export type OpcaoForma = {
  tipo: FormaPagamento["tipo"];
  rotulo: string;
  total: number;
  /** Valor à vista já com desconto, se houver. */
  avista: number;
  parcelado: PlanoPagamento["parcelado"];
};

/**
 * Calcula as opções de pagamento de um pacote (total já somado) para uma lista
 * de formas (PIX/boleto/cartão). Cada forma vira uma OpcaoForma com seu à vista
 * (com desconto) e seu parcelado calculado. Pura, determinística, nunca null.
 */
export function montarOpcoesPorForma(total: number, formas: FormaPagamento[]): OpcaoForma[] {
  const t = r2(Math.max(0, total || 0));
  return (formas ?? []).map((f) => {
    const desconto = Math.min(0.99, Math.max(0, f.desconto_avista ?? 0));
    const avista = r2(t * (1 - desconto));
    const parcelasMax = Math.max(1, Math.floor(f.parcelas_max ?? 1));
    let parcelado: PlanoPagamento["parcelado"] = null;
    if (parcelasMax > 1 && t > 0) {
      const entrada = Math.min(Math.max(0, f.entrada ?? 0), t);
      const base = r2(Math.max(0, t - entrada) * (1 + Math.max(0, f.acrescimo_parcelado ?? 0)));
      const vp =
        typeof f.valor_parcela_cravado === "number" && f.valor_parcela_cravado > 0
          ? r2(f.valor_parcela_cravado)
          : calcularValorParcela(base, parcelasMax, Math.max(0, f.juros_mensal ?? 0));
      const cronograma: ParcelaCronograma[] = [];
      for (let n = 1; n <= parcelasMax; n++) {
        cronograma.push({ numero: n, valor: vp, vencimento_offset_dias: (n - 1) * 30 });
      }
      parcelado = {
        parcelas: parcelasMax,
        entrada,
        valor_parcela: vp,
        total_parcelado: r2(entrada + vp * parcelasMax),
        juros_mensal: Math.max(0, f.juros_mensal ?? 0),
        cronograma,
      };
    }
    return { tipo: f.tipo, rotulo: f.rotulo ?? f.tipo.toUpperCase(), total: t, avista, parcelado };
  });
}
