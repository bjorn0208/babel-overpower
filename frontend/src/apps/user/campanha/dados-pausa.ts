/**
 * Freio de mão das campanhas e dos disparos do tenant.
 *
 * Pedido do Theus (2026-09-17): "um botão de pausa que pausa tudo". Segue o
 * desenho que as Rifas já usam (`rifas_config_tenant.disparos_pausados`), mas
 * gravando em `profiles.campaign_settings` — jsonb que já existe e já é do dono
 * da conta, sem migration.
 *
 * ESCOPO (decidido com o Theus): para as CAMPANHAS e os DISPAROS do Mentor.
 * NÃO cala a agente nas conversas — quem escrever continua sendo respondido.
 *
 * Quem respeita, no backend:
 *   - `processar-campanhas/index.ts` (não inscreve nem agenda);
 *   - `processar-acompanhamentos/index.ts` (ação de campanha já enfileirada é
 *     reagendada, não morre);
 *   - `processar-disparos-lead/index.ts` (disparo fixo/manual não sai).
 */

import { supabase } from "@/integrations/supabase/client";

import type { SupabaseBruto } from "./re-exports";

export interface EstadoPausa {
  pausado: boolean;
  pausadoEm: string | null;
}

export async function lerPausaDisparos(tenantId: string): Promise<EstadoPausa> {
  const sb = supabase as SupabaseBruto;
  const { data, error } = await sb
    .from("profiles")
    .select("campaign_settings")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw error;
  const cfg = (data?.campaign_settings ?? {}) as Record<string, unknown>;
  return {
    pausado: cfg.disparos_pausados === true,
    pausadoEm: typeof cfg.disparos_pausados_em === "string" ? cfg.disparos_pausados_em : null,
  };
}

/** Preserva o resto do jsonb (inatividade da elegibilidade vive aqui também). */
export async function definirPausaDisparos(tenantId: string, pausado: boolean): Promise<void> {
  const sb = supabase as SupabaseBruto;
  const { data, error: erroLeitura } = await sb
    .from("profiles")
    .select("campaign_settings")
    .eq("id", tenantId)
    .maybeSingle();
  if (erroLeitura) throw erroLeitura;
  const cfg = (data?.campaign_settings ?? {}) as Record<string, unknown>;
  const { error } = await sb
    .from("profiles")
    .update({
      campaign_settings: {
        ...cfg,
        disparos_pausados: pausado,
        disparos_pausados_em: pausado ? new Date().toISOString() : null,
      },
    })
    .eq("id", tenantId);
  if (error) throw error;
}
