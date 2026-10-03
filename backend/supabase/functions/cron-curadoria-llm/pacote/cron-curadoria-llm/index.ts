/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

// cron-curadoria-llm
// Roteador de tarefas LLM da Sprint C: consolidar episódios + destilar insights cross-conversa
// Modos:
//   ?modo=consolidar  → varre conversas elegíveis, gera memoria_episodica entries
//   ?modo=destilar    → batch de conversas → candidatos_bloco
//   ?modo=sweep       → roda os 2 (default)
// Auth: service_role via header Authorization Bearer

import { getServiceClient, selecionarConversasParaConsolidar } from "./amostra.ts";
import { consolidarConversa } from "./consolidar.ts";
import { destilarInsightsCrossConversa } from "./destilar.ts";

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders() });

  const url = new URL(req.url);
  const modo = (url.searchParams.get("modo") ?? "sweep").toLowerCase();
  const limite = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limite") ?? "20", 10)));

  const supabase = getServiceClient();

  const resultado: Record<string, unknown> = { modo, limite, started_at: new Date().toISOString() };

  try {
    if (modo === "consolidar" || modo === "sweep") {
      const conversas = await selecionarConversasParaConsolidar(supabase, limite);
      let consolidados = 0;
      const motivos: string[] = [];
      for (const c of conversas) {
        const r = await consolidarConversa(supabase, c);
        consolidados += r.inseridos;
        if (r.motivo && r.inseridos === 0) motivos.push(`${c.conversation_id.slice(0, 8)}:${r.motivo}`);
      }
      resultado.consolidar = { conversas: conversas.length, episodios_inseridos: consolidados, motivos: motivos.slice(0, 10) };
    }

    if (modo === "destilar" || modo === "sweep") {
      // Pega conversas amostra agrupadas por tenant pra destilar cross-conversa
      const conversas = await selecionarConversasParaConsolidar(supabase, limite);
      const porTenant = new Map<string, string[]>();
      for (const c of conversas) {
        if (!porTenant.has(c.tenant_id)) porTenant.set(c.tenant_id, []);
        porTenant.get(c.tenant_id)!.push(c.conversation_id);
      }
      let totalInseridos = 0;
      const detalhes: Array<{ tenant: string; inseridos: number; motivo?: string }> = [];
      for (const [tenantId, cids] of porTenant.entries()) {
        const r = await destilarInsightsCrossConversa(supabase, tenantId, cids);
        totalInseridos += r.inseridos;
        detalhes.push({ tenant: tenantId.slice(0, 8), inseridos: r.inseridos, motivo: r.motivo });
      }
      resultado.destilar = { tenants: porTenant.size, candidatos_bloco_inseridos: totalInseridos, detalhes: detalhes.slice(0, 10) };
    }

    resultado.finished_at = new Date().toISOString();
    resultado.ok = true;
    return jsonResponse(resultado);
  } catch (e) {
    return jsonResponse({ ok: false, motivo: (e as Error).message, modo }, 500);
  }
});
