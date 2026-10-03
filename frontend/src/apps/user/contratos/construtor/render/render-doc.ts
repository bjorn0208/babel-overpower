/**
 * render-doc.ts — render client-side do preview do contrato.
 *
 * Recebe texto-com-tokens + dados de exemplo + carrinho exemplo →
 * retorna string HTML com tokens resolvidos, espelhando o que a RPC v1
 * faz em plpgsql (substituição de string robusta).
 *
 * Determinístico e testável: zero side-effects, zero imports de React/Supabase.
 * Usado pelo PainelPreview; a RPC v1 segue intacta (DEC-037 Ajuste A).
 *
 * Tokens resolvidos:
 *   {{campo}}              → dado do cliente (exemplo ou placeholder)
 *   {TOTAL_AVISTA}         → total à vista formatado BRL
 *   {TOTAL_PARCELADO}      → total parcelado formatado BRL
 *   {NUMERO_PARCELAS}      → número de parcelas
 *   {VALOR_PARCELA}        → valor por parcela BRL
 *   {PRODUTO_NOME}         → nome do primeiro produto do carrinho
 *   {PRODUTO_QTD}          → qtd do primeiro produto
 *   {PRODUTO_PRECO_AVISTA} → subtotal à vista do primeiro produto
 *   {PRODUTO_PRECO_PARCELADO} → subtotal parcelado do primeiro produto
 *   {PRODUTO_NOME_<i>}     → nome do produto i (0-based)
 *   {ITENS_CONTRATADOS}    → tabela HTML dos itens do carrinho
 *   {CLAUSULAS_POR_PRODUTO}→ bloco de cláusulas de cada produto
 *   {COND_PAGAMENTO}       → bloco de condição de pagamento (à vista ou parcelado)
 *   {ASSINATURAS}          → bloco de assinaturas
 *
 * Tokens não resolvidos ficam literais no HTML (comportamento seguro).
 */

import type { TemplateV2 } from "../tipos";

// ---------------------------------------------------------------------------
// Tipos de entrada
// ---------------------------------------------------------------------------

export interface ItemCarrinho {
  produto_id: string;
  nome: string;
  quantidade: number;
  subtotal_avista: number;
  subtotal_parcelado: number;
  max_parcelas: number;
}

export interface DadosRender {
  /** Dados do cliente: chave = slug sem {{ }}, valor = string */
  dadosCliente: Record<string, string>;
  /** Itens calculados do carrinho */
  itens: ItemCarrinho[];
  /** Total à vista (soma dos subtotais) */
  totalAvista: number;
  /** Total parcelado (soma dos subtotais parcelados) */
  totalParcelado: number;
  /** Menor max_parcelas entre os itens */
  numeroParcelas: number;
  /** "avista" | "parcelado" — controla bloco {COND_PAGAMENTO} */
  modoPagamento: "avista" | "parcelado";
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

/** Formata número como BRL (sem importar intl externo — determinístico) */
export function formatarBrl(n: number): string {
  return (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Escapa HTML básico para inserção segura no preview */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Mapa de tokens simples (não-blocos)
// ---------------------------------------------------------------------------

/**
 * Monta o mapa de substituição de tokens simples (inline e de valor).
 * Tokens de bloco ({ITENS_CONTRATADOS}, {COND_PAGAMENTO}, etc.) são resolvidos
 * separadamente porque precisam de render multi-linha.
 */
function montarMapaTokens(
  dados: DadosRender,
  clausulasPorProduto?: Record<string, string>
): Record<string, string> {
  const { dadosCliente, itens, totalAvista, totalParcelado, numeroParcelas } = dados;
  const valorParcela = numeroParcelas > 0 ? totalParcelado / numeroParcelas : 0;

  const primeiroProduto = itens[0];

  const mapa: Record<string, string> = {
    "{TOTAL_AVISTA}":    formatarBrl(totalAvista),
    "{TOTAL_PARCELADO}": formatarBrl(totalParcelado),
    "{NUMERO_PARCELAS}": String(numeroParcelas),
    "{VALOR_PARCELA}":   formatarBrl(valorParcela),
    // Produto "genérico" (primeiro do carrinho) para tokens fora de cláusula de produto
    "{PRODUTO_NOME}":              primeiroProduto?.nome ?? "[produto]",
    "{PRODUTO_QTD}":               String(primeiroProduto?.quantidade ?? 1),
    "{PRODUTO_PRECO_AVISTA}":      formatarBrl(primeiroProduto?.subtotal_avista ?? 0),
    "{PRODUTO_PRECO_PARCELADO}":   formatarBrl(primeiroProduto?.subtotal_parcelado ?? 0),
  };

  // Tokens de cliente: {{slug}} → valor
  for (const [slug, valor] of Object.entries(dadosCliente)) {
    mapa[`{{${slug}}}`] = esc(valor);
  }

  // Tokens de produto indexados: {PRODUTO_NOME_0}, {PRODUTO_NOME_1} etc.
  itens.forEach((it, i) => {
    mapa[`{PRODUTO_NOME_${i}}`] = esc(it.nome);
    mapa[`{PRODUTO_QTD_${i}}`] = String(it.quantidade);
    mapa[`{PRODUTO_PRECO_AVISTA_${i}}`] = formatarBrl(it.subtotal_avista);
    mapa[`{PRODUTO_PRECO_PARCELADO_${i}}`] = formatarBrl(it.subtotal_parcelado);
  });

  void clausulasPorProduto; // resolvido no bloco {CLAUSULAS_POR_PRODUTO}
  return mapa;
}

// ---------------------------------------------------------------------------
// Render de blocos especiais
// ---------------------------------------------------------------------------

/** Tabela HTML de itens contratados (espelha o que a RPC v1 gera em texto) */
function renderItensContratados(itens: ItemCarrinho[], modo: "avista" | "parcelado"): string {
  if (itens.length === 0) {
    return "<p><em>(nenhum produto no carrinho)</em></p>";
  }

  const linhas = itens.map((it) => {
    const subtotal = modo === "avista" ? it.subtotal_avista : it.subtotal_parcelado;
    return (
      `<tr>` +
      `<td style="padding:4px 8px;border:1px solid #ccc;">${esc(it.nome)}</td>` +
      `<td style="padding:4px 8px;border:1px solid #ccc;text-align:center;">${it.quantidade}</td>` +
      `<td style="padding:4px 8px;border:1px solid #ccc;text-align:right;">${formatarBrl(subtotal)}</td>` +
      `</tr>`
    );
  });

  const total = itens.reduce(
    (acc, it) => acc + (modo === "avista" ? it.subtotal_avista : it.subtotal_parcelado),
    0
  );

  const totalLinha =
    `<tr>` +
    `<td colspan="2" style="padding:4px 8px;border:1px solid #ccc;font-weight:bold;">Total</td>` +
    `<td style="padding:4px 8px;border:1px solid #ccc;text-align:right;font-weight:bold;">${formatarBrl(total)}</td>` +
    `</tr>`;

  return (
    `<table style="border-collapse:collapse;width:100%;font-size:inherit;">` +
    `<thead><tr>` +
    `<th style="padding:4px 8px;border:1px solid #ccc;text-align:left;">Produto</th>` +
    `<th style="padding:4px 8px;border:1px solid #ccc;text-align:center;">Qtd</th>` +
    `<th style="padding:4px 8px;border:1px solid #ccc;text-align:right;">Subtotal</th>` +
    `</tr></thead>` +
    `<tbody>${linhas.join("")}${totalLinha}</tbody>` +
    `</table>`
  );
}

/** Bloco de condição de pagamento */
function renderCondPagamento(dados: DadosRender, template: TemplateV2): string {
  const { totalAvista, totalParcelado, numeroParcelas, modoPagamento } = dados;
  const valorParcela = numeroParcelas > 0 ? totalParcelado / numeroParcelas : 0;
  const chave = template.pagamento?.chave_pix ?? null;
  const linkParcelado = template.pagamento?.link_parcelamento ?? null;

  if (modoPagamento === "avista") {
    const sufixo = chave ? ` via PIX (${esc(chave)})` : "";
    return `<p>O(a) CONTRATANTE pagará ${formatarBrl(totalAvista)} à vista${sufixo}.</p>`;
  }

  const sufixo = linkParcelado
    ? ` Link de pagamento: <a href="${esc(linkParcelado)}">${esc(linkParcelado)}</a>`
    : "";
  return (
    `<p>O(a) CONTRATANTE pagará ${formatarBrl(totalParcelado)} ` +
    `em até ${numeroParcelas}× de ${formatarBrl(valorParcela)}.${sufixo}</p>`
  );
}

/** Cláusulas específicas de cada produto comprado */
function renderClausulasPorProduto(
  itens: ItemCarrinho[],
  clausulasPorProduto: Record<string, string>
): string {
  const blocos = itens
    .map((it) => {
      const clausula = clausulasPorProduto[it.produto_id];
      if (!clausula?.trim()) return null;
      return (
        `<div>` +
        `<h3 style="margin:8px 0 4px;font-size:inherit;font-weight:bold;">` +
        `Cláusulas — ${esc(it.nome)}` +
        `</h3>` +
        `<div>${clausula}</div>` +
        `</div>`
      );
    })
    .filter((b): b is string => b !== null);

  return blocos.length > 0
    ? blocos.join("\n")
    : "<p><em>(nenhuma cláusula de produto configurada)</em></p>";
}

/** Bloco de assinaturas */
function renderAssinaturas(dadosCliente: Record<string, string>, numTestemunhas: number): string {
  const nomeContratante = dadosCliente["nome_completo"] ?? "CONTRATANTE";
  const linhas: string[] = [
    `<div style="margin-top:32px;">`,
    `<div style="margin-bottom:24px;">`,
    `<div style="border-top:1px solid #333;width:280px;margin-bottom:4px;"></div>`,
    `<div>${esc(nomeContratante)}</div>`,
    `</div>`,
  ];

  for (let i = 1; i <= numTestemunhas; i++) {
    linhas.push(
      `<div style="margin-bottom:24px;">`,
      `<div style="border-top:1px solid #333;width:280px;margin-bottom:4px;"></div>`,
      `<div>Testemunha ${i}</div>`,
      `</div>`
    );
  }

  linhas.push(`</div>`);
  return linhas.join("\n");
}

// ---------------------------------------------------------------------------
// Render de parágrafo com tokens resolvidos
// ---------------------------------------------------------------------------

/** Substitui tokens simples numa linha de texto */
function substituirTokens(linha: string, mapa: Record<string, string>): string {
  return linha.replace(/({{[^}]+}}|\{[A-Z_][A-Z0-9_]*(?:_\d+)?\})/g, (m) => mapa[m] ?? m);
}

// ---------------------------------------------------------------------------
// renderDoc — função principal exportada
// ---------------------------------------------------------------------------

/**
 * Converte texto-com-tokens em HTML do preview, resolvendo todos os tokens.
 *
 * @param texto         - Texto serializado pelo serializa.docParaTexto (colunas legadas ou conteudo_comum)
 * @param dados         - Dados de exemplo (cliente, carrinho calculado, modo de pagamento)
 * @param template      - TemplateV2 (para chave PIX, link parcelado, cláusulas por produto, num_testemunhas)
 * @param clausulasTxt  - Mapa produto_id → texto HTML das cláusulas por produto
 * @returns             - String HTML pronta pra injetar em dangerouslySetInnerHTML
 */
export function renderDoc(
  texto: string,
  dados: DadosRender,
  template: TemplateV2,
  clausulasTxt: Record<string, string> = {}
): string {
  const mapa = montarMapaTokens(dados, clausulasTxt);

  // Divide em blocos por parágrafo
  const blocos = texto
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n\n+/);

  const partes: string[] = [];

  for (const bloco of blocos) {
    const trimado = bloco.trim();
    if (!trimado) continue;

    // Tokens de bloco — resolvem para HTML multi-linha
    if (trimado === "{ITENS_CONTRATADOS}") {
      partes.push(renderItensContratados(dados.itens, dados.modoPagamento));
      continue;
    }

    if (trimado === "{COND_PAGAMENTO}") {
      partes.push(renderCondPagamento(dados, template));
      continue;
    }

    if (trimado === "{CLAUSULAS_POR_PRODUTO}") {
      partes.push(renderClausulasPorProduto(dados.itens, clausulasTxt));
      continue;
    }

    if (trimado === "{ASSINATURAS}") {
      partes.push(
        renderAssinaturas(dados.dadosCliente, template.provas?.num_testemunhas ?? 0)
      );
      continue;
    }

    // Verifica headings (# Título / ## Subtítulo / ### Sub-subtítulo)
    if (trimado.startsWith("### ")) {
      const conteudo = substituirTokens(esc(trimado.slice(4)), mapa);
      partes.push(`<h3 style="margin:12px 0 4px;">${conteudo}</h3>`);
      continue;
    }
    if (trimado.startsWith("## ")) {
      const conteudo = substituirTokens(esc(trimado.slice(3)), mapa);
      partes.push(`<h2 style="margin:16px 0 6px;">${conteudo}</h2>`);
      continue;
    }
    if (trimado.startsWith("# ")) {
      const conteudo = substituirTokens(esc(trimado.slice(2)), mapa);
      partes.push(`<h1 style="margin:0 0 12px;text-align:center;">${conteudo}</h1>`);
      continue;
    }

    // Parágrafo normal: separa quebras simples em <br>
    const linhas = trimado.split("\n");
    const nosHtml = linhas
      .map((l) => substituirTokens(esc(l), mapa))
      .join("<br>");
    partes.push(`<p style="margin:0 0 10px;">${nosHtml}</p>`);
  }

  return partes.join("\n");
}

// ---------------------------------------------------------------------------
// dadosExemplo — factory de dados fictícios pra preview
// ---------------------------------------------------------------------------

/**
 * Gera dados de cliente fictícios baseados nos campos do template.
 * Espelha o que a página pública vai receber do lead real.
 */
export function dadosExemplo(template: TemplateV2): Record<string, string> {
  const EXEMPLOS: Record<string, string> = {
    nome_completo:  "Maria Aparecida da Silva",
    cpf:            "123.456.789-00",
    email:          "maria.silva@exemplo.com",
    telefone:       "(11) 99876-5432",
    endereco:       "Rua das Acácias, 120 — Pinheiros, SP",
    data_nascimento:"03/02/1992",
    cnpj:           "12.345.678/0001-90",
    cidade:         "São Paulo",
    estado:         "SP",
    cep:            "01311-000",
  };

  const dados: Record<string, string> = {};
  for (const campo of template.campos_cliente ?? []) {
    dados[campo.slug] = EXEMPLOS[campo.slug] ?? `[${campo.rotulo}]`;
  }
  return dados;
}
