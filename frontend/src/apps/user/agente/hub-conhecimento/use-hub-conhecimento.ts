/**
 * Hooks de dados do hub Conhecimento.
 *  - useNichoId: nicho do tenant (profiles.nicho_id) — base da herança de nicho.
 *  - useContagensMapa: contagem por escopo de cada gaveta (alimenta o Mapa).
 *  - useGaveta: lista da gaveta aberta + quais blocos de nicho estão desligados.
 *
 * Visibilidade de um bloco pro tenant: global (sempre) + nicho do tenant +
 * próprio (escopo tenant via tenant_id, ou agente_id no Conhecimento).
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GAVETAS, type EscopoBloco, type Gaveta } from "./gavetas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type CtxHub = { tenantId: string; agenteId: string | null };
export type BlocoHub = {
  id: string;
  escopo: EscopoBloco;
  titulo: string;
  corpo: string;
  ativo: boolean;
  aprovado: boolean;
  /** Só em blocos_conhecimento. 'conversa_padrao' = bloco do Chat Treino (abre a conversa). */
  categoria?: string | null;
};
export type ContagemEscopo = { global: number; nicho: number; tenant: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filtrarVisivel(q: any, g: Gaveta, ctx: CtxHub, nichoId: string | null) {
  // O filtro de `ativo` mora DENTRO de cada ramo, não no fim: bloco global e de nicho só
  // aparece se estiver ligado, mas o tenant vê os PRÓPRIOS blocos mesmo desligados.
  // Antes havia um `.eq("ativo", true)` global e, com ele, desmarcar um bloco fazia ele
  // sumir da tela sem volta — foi o que deixou o incidente do Otmar (2026-09-03) com cara
  // de "o conhecimento evaporou". Agora o desligado fica na lista, apagado, com o botão de
  // religar.
  const ors = ["and(escopo.eq.global,ativo.eq.true)"];
  if (nichoId) ors.push(`and(escopo.eq.nicho,nicho_id.eq.${nichoId},ativo.eq.true)`);
  if (g.tenancy === "tenant_id") ors.push(`and(escopo.eq.tenant,tenant_id.eq.${ctx.tenantId})`);
  else if (ctx.agenteId) ors.push(`and(escopo.eq.tenant,agente_id.eq.${ctx.agenteId})`);
  let query = q.or(ors.join(","));
  if (g.temDeletedAt) query = query.is("deleted_at", null);
  return query;
}

export function useNichoId(tenantId: string): string | null {
  const [nichoId, setNichoId] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    sb.from("profiles")
      .select("nicho_id")
      .eq("id", tenantId)
      .maybeSingle()
      .then(({ data }: { data: { nicho_id: string | null } | null }) => {
        if (vivo) setNichoId(data?.nicho_id ?? null);
      });
    return () => {
      vivo = false;
    };
  }, [tenantId]);
  return nichoId;
}

export function useContagensMapa(ctx: CtxHub, nichoId: string | null, nonce: number) {
  const [contagens, setContagens] = useState<Record<string, ContagemEscopo>>({});
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    Promise.all(
      GAVETAS.map(async (g) => {
        const { data, error } = await filtrarVisivel(sb.from(g.tabela).select("escopo"), g, ctx, nichoId);
        // Checa erro pra diferenciar "sem dados" (conta 0) de falha real (RLS/rede),
        // que o destructure só de `data` engolia mostrando 0 silenciosamente.
        if (error) console.warn(`[hub-conhecimento] contagem ${g.id} falhou:`, error.message);
        const c: ContagemEscopo = { global: 0, nicho: 0, tenant: 0 };
        for (const row of (data ?? []) as { escopo: EscopoBloco }[]) {
          if (row.escopo === "global") c.global += 1;
          else if (row.escopo === "nicho") c.nicho += 1;
          else if (row.escopo === "tenant") c.tenant += 1;
        }
        return [g.id, c] as const;
      }),
    ).then((pares) => {
      if (!vivo) return;
      setContagens(Object.fromEntries(pares));
      setCarregando(false);
    });
    return () => {
      vivo = false;
    };
  }, [ctx.tenantId, ctx.agenteId, nichoId, nonce]);

  return { contagens, carregando };
}

export function useGaveta(g: Gaveta, ctx: CtxHub, nichoId: string | null) {
  const [blocos, setBlocos] = useState<BlocoHub[]>([]);
  const [desligados, setDesligados] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    // `aprovado` só existe em blocos_conhecimento; as outras gavetas não têm a coluna.
    const temAprovado = g.tabela === "blocos_conhecimento";
    const cols = ["id", "escopo", "ativo", ...(temAprovado ? ["aprovado", "category"] : []), g.campoTitulo, g.campoCorpo].join(", ");
    const { data, error } = await filtrarVisivel(sb.from(g.tabela).select(cols), g, ctx, nichoId);
    // Checa erro pra não tratar falha (RLS/rede) como gaveta vazia silenciosa.
    if (error) console.warn(`[hub-conhecimento] gaveta ${g.id} falhou:`, error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lista: BlocoHub[] = ((data ?? []) as any[]).map((row) => {
      const bruto = row[g.campoCorpo];
      const corpo = g.corpoJson
        ? String(bruto?.instrucao ?? "")
        : String(bruto ?? "");
      return {
        id: row.id,
        escopo: row.escopo as EscopoBloco,
        titulo: String(row[g.campoTitulo] ?? ""),
        corpo,
        ativo: row.ativo !== false,
        categoria: temAprovado ? ((row.category as string | null) ?? null) : null,
        aprovado: temAprovado ? row.aprovado !== false : true,
      };
    });
    let off = new Set<string>();
    if (g.tabelaOverride) {
      const { data: ov } = await sb
        .from(g.tabelaOverride)
        .select("bloco_id")
        .eq("tenant_id", ctx.tenantId)
        .eq("ativo", false);
      off = new Set(((ov ?? []) as { bloco_id: string }[]).map((o) => o.bloco_id));
    }
    setBlocos(lista);
    setDesligados(off);
    setCarregando(false);
  }, [g, ctx, nichoId]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return { blocos, desligados, carregando, recarregar };
}
