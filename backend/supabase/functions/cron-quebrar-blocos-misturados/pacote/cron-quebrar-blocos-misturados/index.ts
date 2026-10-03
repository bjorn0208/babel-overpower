/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// cron-quebrar-blocos-misturados · one-shot · MODO LISTA
// Identifica blocos grandes (> 800 bytes) em categorias produto/contrato/fluxo
// NÃO quebra automaticamente — retorna lista de candidatos para Theus aprovar
// Bloco 3.5 — auditoria de blocos misturados (quebra real deferida)

import { criarClienteAdmin } from "../_shared/supabase.ts";
import { autorizarCron } from "../_shared/auth-cron.ts";

type CandidatoChunk = {
  id: string;
  agente_id: string;
  category: string;
  bytes: number;
  preview: string;
};

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const { ok: _cronOk } = await autorizarCron(req);
  if (!_cronOk) {
    return new Response(JSON.stringify({ ok: false, erro: "nao_autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const supabase = criarClienteAdmin();

  const t0 = Date.now();
  const body = await req.json().catch(() => ({})) as {
    limite_bytes?: number;
    categorias?: string[];
    limite_resultados?: number;
  };

  const limiteBytes      = body.limite_bytes      ?? 800;
  const categorias       = body.categorias        ?? ["produto", "contrato", "fluxo", "empresa"];
  const limiteResultados = body.limite_resultados ?? 200;

  // Busca blocos ativos nas categorias de interesse
  const { data: candidatos, error } = await supabase
    .from("blocos_conhecimento")
    .select("id, agente_id, category, content")
    .eq("ativo", true)
    .in("category", categorias)
    .order("created_at", { ascending: false })
    .limit(limiteResultados);

  if (error) return jsonResp({ error: error.message }, 500);

  // Filtra só os que excedem o limite de bytes
  const grandes: CandidatoChunk[] = (candidatos ?? [])
    .filter((c) => (c.content?.length ?? 0) > limiteBytes)
    .map((c) => ({
      id:       c.id,
      agente_id: c.agente_id,
      category: c.category,
      bytes:    c.content.length,
      preview:  c.content.slice(0, 200),
    }))
    .sort((a, b) => b.bytes - a.bytes);

  // Agrupa por categoria para facilitar análise
  const porCategoria: Record<string, number> = {};
  for (const c of grandes) {
    porCategoria[c.category] = (porCategoria[c.category] ?? 0) + 1;
  }

  return jsonResp({
    ok: true,
    duration_ms: Date.now() - t0,
    total_grandes: grandes.length,
    limite_bytes_usado: limiteBytes,
    por_categoria: porCategoria,
    candidatos: grandes.slice(0, 50),
    nota: [
      "Quebra automática deferida — Theus revisa esta lista e decide caso a caso.",
      "Para quebrar um bloco específico: chamar cron-atomizar-empresa ou cron-atomizar-contrato",
      "com tenant_id filtrado, ou editar manualmente via painel de curadoria.",
      "Blocos com tag já são re-gerados automaticamente pelas edge fns atômicas.",
    ].join(" "),
  });
});
