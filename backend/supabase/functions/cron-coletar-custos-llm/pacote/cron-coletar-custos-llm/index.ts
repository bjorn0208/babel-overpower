/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
import { corsHeaders } from "../_shared/cors.ts";
import { criarClienteAdmin } from "../_shared/supabase.ts";

// cron-coletar-custos-llm — puxa o gasto diário da conta OpenRouter
// (GET /api/v1/activity, management key no vault) e faz UPSERT em
// custos_llm_dia. O OpenRouter só guarda 30 dias; persistindo aqui o
// histórico cresce sem limite. Roda 1×/dia via pg_cron (01:00 UTC) e
// aceita chamada manual do app Controle (admin) pra sincronizar na hora.

type LinhaAtividade = {
  date: string;
  model: string;
  model_permaslug: string;
  endpoint_id: string;
  provider_name: string;
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens: number;
  usage: number;
  byok_usage_inference: number;
};

function jsonResp(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Autoriza: pg_cron via header x-cron-token (env CRON_CUSTOS_TOKEN == vault
 * `cron_custos_token`, mesmo padrão do cron-lembretes-financeiro), service_role
 * exato, ou admin da plataforma (JWT do app Controle no botão sincronizar).
 */
async function autorizado(req: Request): Promise<boolean> {
  const tokenCron = req.headers.get("x-cron-token") ?? "";
  const esperado = Deno.env.get("CRON_CUSTOS_TOKEN") ?? "";
  if (esperado.length >= 32 && tokenCron === esperado) return true;

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;

  const supabase = criarClienteAdmin();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return false;
  const { data: perfil } = await supabase
    .from("profiles").select("system_role").eq("id", user.id).single();
  return perfil?.system_role === "platform_admin";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!(await autorizado(req))) return jsonResp({ ok: false, erro: "unauthorized" }, 401);

    const supabase = criarClienteAdmin();

    const { data: chave, error: erroChave } = await supabase.rpc("ler_chave_gestao_openrouter");
    if (erroChave || !chave) {
      console.error(`[coletar-custos-llm] chave ausente no vault: ${erroChave?.message ?? "vazia"}`);
      return jsonResp({ ok: false, erro: "management key não configurada no vault" }, 500);
    }

    const res = await fetch("https://openrouter.ai/api/v1/activity", {
      headers: { Authorization: `Bearer ${chave}` },
    });
    if (!res.ok) {
      console.error(`[coletar-custos-llm] OpenRouter respondeu ${res.status}`);
      return jsonResp({ ok: false, erro: `OpenRouter recusou a consulta (${res.status})` }, 502);
    }

    const corpo = await res.json();
    const linhas: LinhaAtividade[] = Array.isArray(corpo?.data) ? corpo.data : [];
    if (linhas.length === 0) return jsonResp({ ok: true, linhas: 0, dias: 0 });

    const registros = linhas.map((l) => ({
      dia: l.date,
      modelo: l.model ?? "",
      modelo_permaslug: l.model_permaslug ?? "",
      endpoint_id: l.endpoint_id ?? "",
      provedor: l.provider_name ?? "",
      requisicoes: l.requests ?? 0,
      tokens_entrada: l.prompt_tokens ?? 0,
      tokens_saida: l.completion_tokens ?? 0,
      tokens_raciocinio: l.reasoning_tokens ?? 0,
      custo_usd: l.usage ?? 0,
      custo_byok_usd: l.byok_usage_inference ?? 0,
      atualizado_em: new Date().toISOString(),
    }));

    const { error: erroUpsert } = await supabase
      .from("custos_llm_dia")
      .upsert(registros, { onConflict: "dia,endpoint_id" });
    if (erroUpsert) {
      console.error(`[coletar-custos-llm] upsert falhou: ${erroUpsert.message}`);
      return jsonResp({ ok: false, erro: "falha ao gravar custos no banco" }, 500);
    }

    const dias = new Set(registros.map((r) => r.dia)).size;
    console.log(`[coletar-custos-llm] sincronizado: ${registros.length} linhas em ${dias} dias`);
    return jsonResp({ ok: true, linhas: registros.length, dias });
  } catch (e) {
    console.error(`[coletar-custos-llm] erro inesperado: ${e instanceof Error ? e.message : String(e)}`);
    return jsonResp({ ok: false, erro: "erro interno na coleta de custos" }, 500);
  }
});
