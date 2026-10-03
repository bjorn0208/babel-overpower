/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// categorias-financeiro.ts — árvore de categorias do caixa (2 níveis) usada pelo
// cargo Financeiro: catálogo no prompt, resolução determinística texto→categoria
// e a tool gerenciar_categoria (sub sozinho com anti-duplicata; raiz só confirmada).

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any
type AnyClient = SupabaseClient<any, "public", any>;

export type CategoriaFin = { id: string; nome: string; categoria_pai_id: string | null };

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Carrega a árvore viva do tenant (garante o kit básico no primeiro uso). */
export async function carregarArvoreCategorias(sb: AnyClient, tenantId: string): Promise<CategoriaFin[]> {
  try {
    await sb.rpc("garantir_categorias_padrao", { p_tenant_id: tenantId });
  } catch { /* kit é conveniência — falha não bloqueia */ }
  const { data } = await sb
    .from("categorias_financeiras")
    .select("id, nome, categoria_pai_id")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("criado_em", { ascending: true });
  return (data ?? []) as CategoriaFin[];
}

/** Profundidade máxima da árvore (pasta dentro de pasta) — anti-labirinto. */
export const PROFUNDIDADE_MAX = 5;

/** Rótulo pelo caminho completo ("Empresa > Babel > APIs") gravado no campo texto do movimento. */
export function rotuloCategoria(arvore: CategoriaFin[], cat: CategoriaFin): string {
  const partes = [cat.nome];
  let atual = cat;
  for (let i = 0; i < PROFUNDIDADE_MAX && atual.categoria_pai_id; i++) {
    const pai = arvore.find((c) => c.id === atual.categoria_pai_id);
    if (!pai) break;
    partes.unshift(pai.nome);
    atual = pai;
  }
  return partes.join(" > ");
}

/** Profundidade de uma categoria (raiz = 1). */
export function profundidadeCategoria(arvore: CategoriaFin[], cat: CategoriaFin): number {
  let n = 1;
  let atual = cat;
  while (atual.categoria_pai_id && n <= PROFUNDIDADE_MAX + 1) {
    const pai = arvore.find((c) => c.id === atual.categoria_pai_id);
    if (!pai) break;
    n++;
    atual = pai;
  }
  return n;
}

/** Texto compacto da árvore pro prompt do cargo — todos os caminhos completos. */
export function catalogoCategoriasTexto(arvore: CategoriaFin[]): string {
  if (arvore.length === 0) return "";
  return arvore.map((c) => rotuloCategoria(arvore, c)).sort().join(" | ");
}

/**
 * Resolve texto livre → categoria da árvore (determinístico). Aceita nome de
 * qualquer nível ("gasolina") ou caminho ("empresa > babel > apis") — caminho
 * completo vence; depois folha mais profunda; depois contains.
 */
export function resolverCategoria(arvore: CategoriaFin[], texto: string | null | undefined): CategoriaFin | null {
  const alvoCru = normalizar(String(texto ?? ""));
  if (!alvoCru) return null;
  // 1) Caminho completo exato
  const porCaminho = arvore.find((c) => normalizar(rotuloCategoria(arvore, c)) === alvoCru);
  if (porCaminho) return porCaminho;
  // 2) Nome exato — mais profundo primeiro (subpasta vence a pasta homônima)
  const alvo = alvoCru.includes(">") ? alvoCru.split(">").pop()!.trim() : alvoCru;
  const ordenadas = [...arvore].sort((a, b) => profundidadeCategoria(arvore, b) - profundidadeCategoria(arvore, a));
  const exata = ordenadas.find((c) => normalizar(c.nome) === alvo);
  if (exata) return exata;
  // 3) Contains (nos dois sentidos)
  return ordenadas.find((c) => normalizar(c.nome).includes(alvo) || alvo.includes(normalizar(c.nome))) ?? null;
}

// ── Tool gerenciar_categoria ────────────────────────────────────────────────

export const TOOL_GERENCIAR_CATEGORIA = {
  type: "function" as const,
  function: {
    name: "gerenciar_categoria",
    description:
      "Gerencia a árvore de categorias do caixa. acao='criar_sub' cria uma SUBCATEGORIA dentro de uma categoria " +
      "existente (use quando um lançamento não encaixa em nenhuma subcategoria atual — pode criar sem perguntar). " +
      "acao='criar_raiz' cria categoria RAIZ nova — SÓ com confirmacao_dono=true (pergunte antes). " +
      "acao='listar' mostra a árvore atual.",
    parameters: {
      type: "object",
      properties: {
        acao: { type: "string", enum: ["criar_sub", "criar_raiz", "listar"] },
        nome: { type: "string", description: "Nome da nova (sub)categoria, curto e em pt-BR." },
        categoria_pai: { type: "string", description: "Pasta onde a subpasta entra (qualquer nível — nome ou caminho 'Empresa > Babel'; obrigatório em criar_sub)." },
        confirmacao_dono: { type: "boolean", description: "true SOMENTE se o dono confirmou criar a categoria raiz." },
      },
      required: ["acao"],
    },
  },
};

export async function handlerGerenciarCategoria(
  sb: AnyClient,
  tenantId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const arvore = await carregarArvoreCategorias(sb, tenantId);
  const acao = String(args.acao ?? "listar");

  if (acao === "listar") {
    return `Categorias atuais: ${catalogoCategoriasTexto(arvore) || "(nenhuma)"}`;
  }

  const nome = String(args.nome ?? "").trim().slice(0, 60);
  if (!nome) return "Faltou o nome da categoria.";

  // Anti-duplicata: já existe algo com esse nome/parecido → usa a existente.
  const existente = resolverCategoria(arvore, nome);
  if (existente && normalizar(existente.nome) === normalizar(nome)) {
    return `Já existe "${rotuloCategoria(arvore, existente)}" — use ela, não crie duplicada.`;
  }

  if (acao === "criar_sub") {
    // Pasta dentro de pasta: o pai pode ser QUALQUER pasta existente (até 5 níveis).
    const pai = resolverCategoria(arvore, String(args.categoria_pai ?? ""));
    if (!pai) {
      return `Não achei a pasta "${args.categoria_pai}". Pastas atuais: ${catalogoCategoriasTexto(arvore) || "(nenhuma)"}.`;
    }
    if (profundidadeCategoria(arvore, pai) >= PROFUNDIDADE_MAX) {
      return `"${rotuloCategoria(arvore, pai)}" já está no nível máximo (${PROFUNDIDADE_MAX}) — crie a subpasta num nível acima.`;
    }
    const { error } = await sb.from("categorias_financeiras")
      .insert({ tenant_id: tenantId, nome, categoria_pai_id: pai.id });
    if (error) return `Falha ao criar: ${error.message.slice(0, 100)}`;
    return `Pasta "${rotuloCategoria(arvore, pai)} > ${nome}" criada. Use-a no lançamento.`;
  }

  if (acao === "criar_raiz") {
    if (args.confirmacao_dono !== true) {
      return `Criar categoria RAIZ precisa da confirmação do dono. Pergunte: "não achei onde encaixar — crio a categoria ${nome}?" e chame de novo com confirmacao_dono=true.`;
    }
    const { error } = await sb.from("categorias_financeiras").insert({ tenant_id: tenantId, nome });
    if (error) return `Falha ao criar: ${error.message.slice(0, 100)}`;
    return `Categoria "${nome}" criada.`;
  }

  return `Ação desconhecida: ${acao}`;
}
