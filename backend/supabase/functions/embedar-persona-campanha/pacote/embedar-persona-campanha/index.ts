/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// embedar-persona-campanha — Wizard Campanha Semântica Modo C
// Recebe descrição em pt-BR ("mulheres 30+ que falaram de estética e não fecharam"),
// embeda via Voyage voyage-4 (query, halfvec 1024) e chama RPC
// buscar_leads_por_descricao com p_tenant_id = user.id (JWT, zero cross-tenant).
//
// POST body: { descricao: string, match_count?: number, min_similarity?: number }
// Resposta: { lead_ids: string[], total: number, sample: Array<{ lead_id, similarity, fatos_resumo }> }

import { criarClienteAdmin, criarClienteUsuario } from "../_shared/supabase.ts";
import { corsHeaders as CORS } from "../_shared/cors.ts";
import { embedarLoteVoyage, getVoyageCreds } from "../_shared/voyage-embed.ts";

const SAMPLE_SIZE = 8;

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return jsonResp({ error: "method_not_allowed" }, 405);

  // 1) Extrai user.id do JWT — defesa em profundidade (não confiamos em tenant_id do body)
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResp({ error: "missing_authorization" }, 401);
  }

  const supabaseAuth = criarClienteUsuario(authHeader);
  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
  if (userErr || !userData?.user?.id) {
    return jsonResp({ error: "invalid_jwt" }, 401);
  }
  const tenantId = userData.user.id;

  // 2) Body
  const body = await req.json().catch(() => ({}));
  const descricao = (body?.descricao as string | undefined)?.trim();
  const matchCount = Math.max(1, Math.min(300, Number(body?.match_count) || 100));
  const minSimilarity = Math.max(0, Math.min(1, Number(body?.min_similarity ?? 0.3)));

  if (!descricao || descricao.length < 5) {
    return jsonResp({ error: "descricao_obrigatoria_min_5_chars" }, 400);
  }

  // 3) Voyage embed (query)
  const supabase = criarClienteAdmin();
  const { apiKey, baseUrl } = await getVoyageCreds(supabase);
  if (!apiKey) {
    return jsonResp({ error: "voyage_api_key_nao_configurada" }, 500);
  }

  const vetores = await embedarLoteVoyage(supabase, [descricao], "query", "embed_persona", apiKey, baseUrl);
  const embedding = vetores?.[0] ?? null;
  if (!embedding) {
    return jsonResp({ error: "embedding_falhou" }, 502);
  }

  // 4) RPC (tenant scoped via p_tenant_id = user.id do JWT)
  const embeddingStr = `[${embedding.join(",")}]`;
  const { data: leads, error: rpcErr } = await supabase.rpc("buscar_leads_por_descricao", {
    p_tenant_id: tenantId,
    p_query_embedding: embeddingStr,
    p_match_count: matchCount,
    p_min_similarity: minSimilarity,
  });

  if (rpcErr) {
    console.warn(`[embedar-persona-campanha] RPC erro: ${rpcErr.message}`);
    return jsonResp({ error: "rpc_falhou", detalhe: rpcErr.message }, 500);
  }

  type LeadRow = { lead_id: string; similarity: number; num_fatos: number; fatos_resumo: string };
  const rows = (leads ?? []) as LeadRow[];

  return jsonResp({
    lead_ids: rows.map((r) => r.lead_id),
    total: rows.length,
    sample: rows.slice(0, SAMPLE_SIZE).map((r) => ({
      lead_id: r.lead_id,
      similarity: Number(r.similarity.toFixed(3)),
      num_fatos: r.num_fatos,
      fatos_resumo: r.fatos_resumo,
    })),
  });
});
