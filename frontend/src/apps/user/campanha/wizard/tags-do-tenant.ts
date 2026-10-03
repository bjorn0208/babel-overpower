/**
 * Carrega as tags vivas de `leads.tags[]` do tenant, agrupadas por prefixo
 * `chave:valor`. Essas tags são populadas automaticamente pelo trigger
 * `trg_derive_tags_on_dados_ficha` a partir de `fichas_lead.dados_capturados`,
 * então filtrar por dados capturados = filtrar pelas tags prefixadas.
 *
 * Convenção do banco:
 *   - `objetivo:limpar_o_nome` → chave="objetivo", valor="limpar o nome"
 *   - `produto_identificado:<uuid>` → chave="produto_identificado", valor=<uuid>
 *   - `has_cumprimentou` (sem `:`) → flag booleana — agrupa em chave="_flags"
 *
 * Tudo lido client-side via supabase-js (RLS já filtra pelo tenant).
 */

import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

import type { SupabaseBruto } from "../tipos";

export interface ValorChave {
  /** Valor cru gravado em tags[] (ex: `limpar_o_nome`, UUID, número). */
  valor: string;
  /** Versão humanizada pra UI (underscore → espaço). */
  rotulo: string;
  /** Quantos leads têm essa tag. */
  contagem: number;
}

export interface ChaveAgrupada {
  chave: string;
  /** Rótulo humanizado (sem espaço final, com palavras separadas). */
  rotulo: string;
  origem: "lead" | "ficha" | "flag";
  valores: ValorChave[];
  total: number;
}

/**
 * Campos fixos do lead que existem como coluna E geralmente viram tag também.
 * Lista canônica em pt-BR — não dependem do que está no banco do tenant.
 *
 * NOTA: o backend só lê via `tags[]` (`chave:valor`). Pra esses campos
 * fixos o trigger derivador também aplica, então funcionam.
 */
export const CAMPOS_FIXOS_LEAD: Array<{ chave: string; rotulo: string }> = [
  { chave: "produto_identificado", rotulo: "Produto identificado" },
  { chave: "objetivo", rotulo: "Objetivo" },
  { chave: "sentimento", rotulo: "Sentimento" },
  { chave: "prioridade", rotulo: "Prioridade" },
  { chave: "perfil", rotulo: "Perfil" },
  { chave: "fase", rotulo: "Fase" },
];

/**
 * Humaniza `produto_identificado` → "Produto identificado", `pix_valor` → "Pix valor".
 */
function humanizar(s: string): string {
  if (!s) return "";
  const semUnder = s.replace(/_/g, " ").trim();
  return semUnder.charAt(0).toUpperCase() + semUnder.slice(1);
}

/**
 * Hook React: carrega tags distintas do tenant e devolve agrupadas por chave.
 *
 * Estratégia: pega todas as tags de leads ativos do tenant (limit defensivo),
 * agrupa client-side. Custo: 1 query, retorna ~10k linhas no pior caso —
 * aceitável pra UI de wizard (não roda no hot path do motor).
 */
export function useChavesDisponiveis(tenantId: string | null) {
  const [tagsRaw, setTagsRaw] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!tenantId) {
      setCarregando(false);
      return;
    }
    (async () => {
      const sb = supabase as SupabaseBruto;
      // Lê tags só de leads vivos do tenant. RLS já protege.
      const { data, error } = await sb
        .from("leads")
        .select("tags")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .not("tags", "is", null)
        .limit(5000);
      if (error) {
        console.warn("[chaves-disponiveis]:", error.message);
        setCarregando(false);
        return;
      }
      const todas: string[] = [];
      for (const row of (data ?? []) as Array<{ tags: string[] | null }>) {
        if (Array.isArray(row.tags)) todas.push(...row.tags);
      }
      setTagsRaw(todas);
      setCarregando(false);
    })();
  }, [tenantId]);

  const grupos = useMemo(() => agrupar(tagsRaw), [tagsRaw]);

  return { grupos, carregando };
}

/**
 * Agrupa tags `chave:valor` em estrutura indexada por chave.
 * Flags sem `:` (ex: `has_contrato_enviado`) entram em "_flags".
 */
function agrupar(tags: string[]): ChaveAgrupada[] {
  const mapa = new Map<string, Map<string, number>>();
  const flags = new Map<string, number>();

  for (const tag of tags) {
    if (!tag || typeof tag !== "string") continue;
    const idx = tag.indexOf(":");
    if (idx === -1) {
      flags.set(tag, (flags.get(tag) ?? 0) + 1);
      continue;
    }
    const chave = tag.slice(0, idx);
    const valor = tag.slice(idx + 1);
    if (!chave) continue;
    let valores = mapa.get(chave);
    if (!valores) {
      valores = new Map();
      mapa.set(chave, valores);
    }
    valores.set(valor, (valores.get(valor) ?? 0) + 1);
  }

  const resultado: ChaveAgrupada[] = [];
  for (const [chave, valores] of mapa.entries()) {
    const lista: ValorChave[] = [...valores.entries()]
      .map(([valor, contagem]) => ({ valor, rotulo: humanizar(valor), contagem }))
      .sort((a, b) => b.contagem - a.contagem);
    const total = lista.reduce((s, v) => s + v.contagem, 0);
    const ehFixo = CAMPOS_FIXOS_LEAD.some((c) => c.chave === chave);
    resultado.push({
      chave,
      rotulo: humanizar(chave),
      origem: ehFixo ? "lead" : "ficha",
      valores: lista,
      total,
    });
  }

  if (flags.size > 0) {
    const lista: ValorChave[] = [...flags.entries()]
      .map(([valor, contagem]) => ({ valor, rotulo: humanizar(valor), contagem }))
      .sort((a, b) => b.contagem - a.contagem);
    resultado.push({
      chave: "_flags",
      rotulo: "Flags",
      origem: "flag",
      valores: lista,
      total: lista.reduce((s, v) => s + v.contagem, 0),
    });
  }

  // Ordena: lead canônico primeiro, depois ficha por volume, flags por último
  return resultado.sort((a, b) => {
    if (a.origem !== b.origem) {
      const ord = { lead: 0, ficha: 1, flag: 2 };
      return ord[a.origem] - ord[b.origem];
    }
    return b.total - a.total;
  });
}
