/**
 * logica.ts — funções puras do painel direito (2c).
 *
 * Exportadas para uso nos painéis e para teste Vitest.
 * Zero dependências de React ou Supabase.
 */

import type { TemplateV2, PassoJornada } from "../tipos";

// ---------------------------------------------------------------------------
// Produto mock pra preview (injeta externamente na produção)
// ---------------------------------------------------------------------------

export interface ProdutoRef {
  id: string;
  nome: string;
}

// ---------------------------------------------------------------------------
// slugify — deriva slug de rótulo (sem acento, sem espaço, snake_case)
// ---------------------------------------------------------------------------

export function slugify(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// ---------------------------------------------------------------------------
// brl — formata número como moeda BRL
// ---------------------------------------------------------------------------

export function brl(n: number): string {
  return (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ---------------------------------------------------------------------------
// CarrinhoItem + ResultadoCarrinho
// ---------------------------------------------------------------------------

export interface CarrinhoItem {
  produto_id: string;
  quantidade: number;
}

export interface ItemCalculado {
  produto_id: string;
  nome: string;
  quantidade: number;
  preco_unitario_avista: number;
  preco_unitario_parcelado: number;
  subtotal_avista: number;
  subtotal_parcelado: number;
  max_parcelas: number;
}

export interface ResultadoCarrinho {
  itens: ItemCalculado[];
  totalAvista: number;
  totalParcelado: number;
  /** Menor max_parcelas entre os produtos (limitante para parcelamento único) */
  maxParcelas: number;
  /** Soma das entradas (TAP) do carrinho. Já está embutida em `totalParcelado`. */
  entrada: number;
  /**
   * Valor de CADA parcela, já descontada a entrada:
   * `(totalParcelado − entrada) / maxParcelas`.
   *
   * Espelha a conta da RPC de contrato (`total := entrada + parcelas × valor_parcela`,
   * migration `20260726210600`). Antes o preview dividia `totalParcelado` cru pelo
   * número de parcelas e mostrava 852 ÷ 5 = 170,40 num contrato cuja regra é
   * entrada de 117 + 5× de 147.
   */
  valorParcela: number;
}

/**
 * Calcula totais do carrinho de exemplo a partir do template.
 * Ignora silenciosamente itens cujo produto não está em produtos_aceitos.
 */
export function calcularCarrinho(
  template: TemplateV2,
  carrinho: CarrinhoItem[],
  produtosRef: ProdutoRef[]
): ResultadoCarrinho {
  let totalAvista = 0;
  let totalParcelado = 0;
  let entrada = 0;
  const itens: ItemCalculado[] = [];

  for (const ci of carrinho) {
    const prodCfg = template.produtos_aceitos.find(
      (p) => p.produto_id === ci.produto_id
    );
    const prod = produtosRef.find((p) => p.id === ci.produto_id);
    if (!prodCfg || !prod) continue;

    const parc = prodCfg.parcelamento ?? {
      entrada: 0,
      max_parcelas: 1,
      valor_parcelado_total: prodCfg.preco_avista,
    };

    const subAvista = prodCfg.preco_avista * ci.quantidade;
    const subParcelado = parc.valor_parcelado_total * ci.quantidade;

    totalAvista += subAvista;
    totalParcelado += subParcelado;
    entrada += (parc.entrada ?? 0) * ci.quantidade;

    itens.push({
      produto_id: ci.produto_id,
      nome: prod.nome,
      quantidade: ci.quantidade,
      preco_unitario_avista: prodCfg.preco_avista,
      preco_unitario_parcelado: parc.valor_parcelado_total,
      subtotal_avista: subAvista,
      subtotal_parcelado: subParcelado,
      max_parcelas: parc.max_parcelas,
    });
  }

  const maxParcelas =
    itens.length > 0
      ? itens.reduce((min, it) => Math.min(min, it.max_parcelas), 99)
      : 1;

  const parcelasEfetivas = maxParcelas === 99 ? 1 : maxParcelas;

  return {
    itens,
    totalAvista,
    totalParcelado,
    maxParcelas: parcelasEfetivas,
    entrada,
    valorParcela:
      parcelasEfetivas > 0
        ? Math.max(0, totalParcelado - entrada) / parcelasEfetivas
        : 0,
  };
}

// ---------------------------------------------------------------------------
// stepAtivo — determina se um passo da jornada está habilitado
// ---------------------------------------------------------------------------

/**
 * Retorna true se o passo deve aparecer na jornada (tem config suficiente).
 */
export function stepAtivo(step: PassoJornada, template: TemplateV2): boolean {
  const pagto = template.pagamento;
  const provas = template.provas;

  switch (step) {
    case "dados":
    case "contrato":
      return true;

    case "pagamento":
      return template.produtos_aceitos.some((p) => p.preco_avista > 0);

    case "comprovante":
      return !!(pagto?.chave_pix || pagto?.link_parcelamento);

    case "selfie":
      return !!provas?.selfie;

    case "documento":
      return !!provas?.documento;

    case "assinatura":
      return !!provas?.assinatura_manuscrita;

    case "testemunha":
      return !!provas?.testemunha;

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// passoNumero — número sequencial do passo (só ativos contam)
// Retorna 0 se o passo estiver inativo.
// ---------------------------------------------------------------------------

export function passoNumero(
  step: PassoJornada,
  ordem: PassoJornada[],
  template: TemplateV2
): number {
  if (!stepAtivo(step, template)) return 0;

  let n = 0;
  for (const k of ordem) {
    if (stepAtivo(k, template)) n++;
    if (k === step) return n;
  }
  return n;
}

// ---------------------------------------------------------------------------
// instrucaoSelfieLabel — label legível pra instrução de selfie
// ---------------------------------------------------------------------------

export function instrucaoSelfieLabel(v: string): string {
  if (v === "mostrar_2_dedos") return "com 2 dedos à mostra";
  if (v === "segurar_documento") return "segurando o documento";
  if (v === "documento_e_2_dedos") return "documento + 2 dedos";
  return "";
}

// ---------------------------------------------------------------------------
// ORDEM_JORNADA_PADRAO
// ---------------------------------------------------------------------------

export const ORDEM_JORNADA_PADRAO: PassoJornada[] = [
  "dados",
  "pagamento",
  "contrato",
  "comprovante",
  "selfie",
  "documento",
  "assinatura",
  "testemunha",
];
