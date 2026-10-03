/**
 * proposta.ts — Tipos + validação pura da proposta de estrutura da IA (F3c).
 *
 * A edge `contratos-propor-estrutura` devolve 4 baldes (moldura/miolo/campos/
 * exigências). Antes de aprovar, o front valida placeholder ↔ campo:
 *   - placeholder {{slug}} sem campo  → ERRO (lacuna órfã, bloqueia salvar)
 *   - campo sem placeholder no texto  → AVISO (vai só pro formulário — ok)
 *
 * Funções puras, sem side-effects. Testadas em proposta.test.ts.
 */

import type { CampoCliente } from "../tipos";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface ExigenciasProduto {
  selfie: boolean;
  num_testemunhas: number;
  instrucao_selfie: string;
  /** F3c: exigir foto do documento na assinatura. */
  documento: boolean;
  /** F3c: exigir assinatura desenhada no canvas (padrão histórico da plataforma). */
  assinatura_manuscrita: boolean;
}

export interface PropostaEstrutura {
  moldura: string;
  miolo: string;
  campos: CampoCliente[];
  exigencias: ExigenciasProduto;
  nome_produto_detectado: string | null;
}

export interface ValidacaoProposta {
  erros: string[];
  avisos: string[];
}

/** Tokens preenchidos automaticamente pelo sistema — nunca viram campo. */
const TOKENS_AUTOMATICOS = new Set(["data_assinatura"]);

// ---------------------------------------------------------------------------
// validarProposta
// ---------------------------------------------------------------------------

/** Extrai os placeholders {{slug}} (minúsculos) de um texto. */
export function extrairPlaceholders(texto: string): string[] {
  const achados = new Set<string>();
  for (const m of texto.matchAll(/\{\{([a-z0-9_]+)\}\}/g)) {
    if (!TOKENS_AUTOMATICOS.has(m[1])) achados.add(m[1]);
  }
  return [...achados];
}

/**
 * Valida a proposta antes da aprovação.
 * Erro bloqueia o botão salvar; aviso só informa.
 */
export function validarProposta(proposta: PropostaEstrutura): ValidacaoProposta {
  const erros: string[] = [];
  const avisos: string[] = [];

  if (!proposta.moldura.trim()) erros.push("A moldura está vazia — sem ela não existe contrato.");
  if (!proposta.miolo.trim()) avisos.push("Miolo vazio: nenhuma cláusula específica do produto foi separada.");

  const slugs = new Set(proposta.campos.map((c) => c.slug));

  // Slug duplicado = erro (formulário quebraria)
  if (slugs.size !== proposta.campos.length) {
    erros.push("Há campos com identificador (slug) repetido — remova o duplicado.");
  }

  // Placeholder órfão = erro
  const placeholders = extrairPlaceholders(`${proposta.moldura}\n${proposta.miolo}`);
  for (const ph of placeholders) {
    if (!slugs.has(ph)) {
      erros.push(`O texto usa {{${ph}}} mas não existe campo correspondente no formulário.`);
    }
  }

  // Campo sem placeholder = aviso
  for (const campo of proposta.campos) {
    if (!placeholders.includes(campo.slug)) {
      avisos.push(`O campo "${campo.rotulo}" não aparece no texto — vai só pro formulário do cliente.`);
    }
  }

  if (!proposta.moldura.includes("{CLAUSULAS_POR_PRODUTO}")) {
    avisos.push(
      "A moldura não tem o token {CLAUSULAS_POR_PRODUTO} — as cláusulas do produto serão anexadas ao fim do contrato.",
    );
  }

  return { erros, avisos };
}

// ---------------------------------------------------------------------------
// preSelecionarProduto
// ---------------------------------------------------------------------------

/**
 * Tenta casar o nome detectado pela IA com um produto do catálogo
 * (match por inclusão, sem acento, ambas as direções). Null se ambíguo.
 */
export function preSelecionarProduto(
  nomeDetectado: string | null,
  produtos: Array<{ id: string; nome: string }>,
): string | null {
  if (!nomeDetectado) return null;
  const normalizar = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const alvo = normalizar(nomeDetectado);
  if (!alvo) return null;

  const casados = produtos.filter((p) => {
    const nome = normalizar(p.nome);
    return nome.includes(alvo) || alvo.includes(nome);
  });
  return casados.length === 1 ? casados[0].id : null;
}
