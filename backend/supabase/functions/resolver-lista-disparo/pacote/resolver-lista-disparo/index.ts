/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// resolver-lista-disparo — preview/resolução de público pro Mentor de
// Disparo. Chamado pelo frontend (tela de busca) pra contar/listar leads
// que batem no critério antes de salvar uma lista ou disparar. Mesmo
// resolvedor (`_shared/resolver-criterios-lead.ts`) usado por
// `processar-disparos-lead` na hora do envio real — sem drift entre
// preview e execução.

import { corsHeaders } from "../_shared/cors.ts";
import { criarClienteAdmin } from "../_shared/supabase.ts";
import { resolverLeadsDisparo, type ParametrosResolucaoLead } from "../_shared/resolver-criterios-lead.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = criarClienteAdmin();

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await supabase.from("profiles").select("parent_user_id").eq("id", user.id).single();
    const tenantId = callerProfile?.parent_user_id || user.id;

    const corpo = (await req.json().catch(() => ({}))) as Partial<ParametrosResolucaoLead>;
    const params: ParametrosResolucaoLead = {
      tenantId,
      modo: corpo.modo ?? "todos",
      operadorGlobal: corpo.operadorGlobal ?? "AND",
      criterios: corpo.criterios ?? [],
      leadIds: corpo.leadIds,
      publico: corpo.publico,
    };

    const ids = await resolverLeadsDisparo(supabase, params);

    return new Response(JSON.stringify({ ok: true, total: ids.length, lead_ids: ids }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
    });
  }
});
