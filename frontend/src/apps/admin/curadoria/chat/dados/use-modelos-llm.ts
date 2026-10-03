/**
 * Hook: carrega lista de modelos LLM ativos (tabela `modelos_llm` + `provedores_llm`).
 *
 * 30 modelos ativos após Onda 1 (`seed_modelos_openrouter_top`). Agrupados por
 * provedor pra UI do seletor.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ModeloLlm } from "../../dados/tipos";

type EstadoCarregar =
  | { status: "carregando" }
  | { status: "ok"; modelos: ModeloLlm[] }
  | { status: "erro"; mensagem: string };

interface SupabaseModeloRow {
  id: string;
  provider_id: string;
  nome: string;
  slug: string;
  custo_input_1m: number | string;
  custo_output_1m: number | string;
  context_window: number;
  is_active: boolean;
  is_default: boolean;
  provedores_llm?: { slug: string } | null;
}

export function useModelosLlm() {
  const [estado, setEstado] = useState<EstadoCarregar>({ status: "carregando" });

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      try {
        const sb = supabase as unknown as {
          from: (t: string) => {
            select: (s: string) => {
              eq: (
                c: string,
                v: boolean,
              ) => {
                order: (
                  c: string,
                  opts: { ascending: boolean },
                ) => Promise<{ data: SupabaseModeloRow[] | null; error: unknown }>;
              };
            };
          };
        };
        const { data, error } = await sb
          .from("modelos_llm")
          .select(
            "id, provider_id, nome, slug, custo_input_1m, custo_output_1m, context_window, is_active, is_default, provedores_llm(slug)",
          )
          .eq("is_active", true)
          .order("slug", { ascending: true });

        if (cancelado) return;
        if (error) {
          setEstado({ status: "erro", mensagem: String(error) });
          return;
        }
        const modelos: ModeloLlm[] = (data ?? []).map((r) => ({
          id: r.id,
          provider_id: r.provider_id,
          provider_slug: r.provedores_llm?.slug,
          nome: r.nome,
          slug: r.slug,
          custo_input_1m: Number(r.custo_input_1m),
          custo_output_1m: Number(r.custo_output_1m),
          context_window: r.context_window,
          is_active: r.is_active,
          is_default: r.is_default,
        }));
        setEstado({ status: "ok", modelos });
      } catch (e) {
        if (cancelado) return;
        setEstado({ status: "erro", mensagem: e instanceof Error ? e.message : String(e) });
      }
    }

    void carregar();
    return () => {
      cancelado = true;
    };
  }, []);

  return estado;
}

export function agruparModelosPorProvedor(modelos: ModeloLlm[]): Record<string, ModeloLlm[]> {
  const grupos: Record<string, ModeloLlm[]> = {};
  for (const m of modelos) {
    const slug = m.slug;
    const provedor = slug.includes("/") ? slug.split("/")[0] : "outros";
    grupos[provedor] = grupos[provedor] ?? [];
    grupos[provedor].push(m);
  }
  return grupos;
}

export function formatarPreco(custo: number): string {
  if (custo < 1) return `$${custo.toFixed(2)}`;
  return `$${custo.toFixed(2)}`;
}
