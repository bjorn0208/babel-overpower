import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { criarClienteAdmin } from "../_shared/supabase.ts";

// saldo-openrouter — devolve o crédito da conta OpenRouter da plataforma pro
// app Controle do admin. A chave vive em provedores_llm e NUNCA sai pro browser.
// Nasceu do incidente 2026-07-14: crédito zerou às 16:55 BRT e a plataforma
// inteira ficou muda sem nenhum aviso.

function jsonResp(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = criarClienteAdmin();

    // Guard: só platform_admin enxerga o saldo da plataforma
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResp({ ok: false, erro: "unauthorized" }, 401);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return jsonResp({ ok: false, erro: "unauthorized" }, 401);

    const { data: perfil } = await supabase
      .from("profiles").select("system_role").eq("id", user.id).single();
    if (perfil?.system_role !== "platform_admin") {
      return jsonResp({ ok: false, erro: "forbidden" }, 403);
    }

    const { data: provedor } = await supabase
      .from("provedores_llm").select("api_key").eq("slug", "openrouter").maybeSingle();
    if (!provedor?.api_key) {
      return jsonResp({ ok: false, erro: "chave OpenRouter não configurada em provedores_llm" });
    }

    const cabecalho = { Authorization: `Bearer ${provedor.api_key}` };
    const [resCreditos, resChave] = await Promise.all([
      fetch("https://openrouter.ai/api/v1/credits", { headers: cabecalho }),
      fetch("https://openrouter.ai/api/v1/auth/key", { headers: cabecalho }),
    ]);

    if (!resCreditos.ok) {
      console.error(`[saldo-openrouter] credits status=${resCreditos.status}`);
      return jsonResp({ ok: false, erro: "OpenRouter recusou a consulta (chave inválida?)" });
    }

    const creditos = await resCreditos.json();
    const chave = resChave.ok ? await resChave.json() : { data: {} };

    const totalCreditos = Number(creditos?.data?.total_credits ?? 0);
    const usoTotal = Number(creditos?.data?.total_usage ?? 0);

    return jsonResp({
      ok: true,
      total_creditos: totalCreditos,
      uso_total: usoTotal,
      saldo: Number((totalCreditos - usoTotal).toFixed(2)),
      uso_hoje: Number(chave?.data?.usage_daily ?? 0),
      uso_semana: Number(chave?.data?.usage_weekly ?? 0),
      consultado_em: new Date().toISOString(),
    });
  } catch (e) {
    console.error(`[saldo-openrouter] erro inesperado: ${e instanceof Error ? e.message : String(e)}`);
    return jsonResp({ ok: false, erro: "erro interno ao consultar o saldo" }, 500);
  }
});
