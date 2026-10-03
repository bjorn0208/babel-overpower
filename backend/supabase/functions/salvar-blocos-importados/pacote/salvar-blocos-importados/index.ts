/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
    });
  }

  try {
    const { tenantId, agenteId, blocos } = await req.json();

    if (!tenantId || !agenteId || !blocos || !Array.isArray(blocos)) {
      return new Response(JSON.stringify({ error: "Dados inválidos" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Auth (2026-09-17): a função não checava NADA — quem tivesse um agente_id
    // gravava bloco de conhecimento no RAG de qualquer tenant (o agente passava
    // a falar aquilo com os leads). O `tenantId` era exigido e nunca usado.
    // Agora: JWT de usuário cujo tenant é dono do agente, e o agente tem que
    // bater com o tenantId informado.
    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    const naoAutorizado = (msg: string, status: number) =>
      new Response(JSON.stringify({ error: msg }), {
        status,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    if (!bearer) return naoAutorizado("nao_autorizado", 401);

    let tenantDoCaller: string | null = null;
    if (bearer === SERVICE_KEY) {
      tenantDoCaller = String(tenantId);
    } else {
      const { data: auth } = await supabase.auth.getUser(bearer);
      const uid = auth?.user?.id as string | undefined;
      if (!uid) return naoAutorizado("nao_autorizado", 401);
      const { data: perfil } = await supabase
        .from("profiles").select("parent_user_id, system_role").eq("id", uid).maybeSingle();
      tenantDoCaller = perfil?.system_role === "platform_admin"
        ? String(tenantId)
        : ((perfil?.parent_user_id as string | null) ?? uid);
    }

    const { data: agente } = await supabase
      .from("agentes_usuario").select("user_id").eq("id", agenteId).maybeSingle();
    if (!agente) return naoAutorizado("Agente não encontrado", 404);
    if (agente.user_id !== tenantDoCaller || agente.user_id !== String(tenantId)) {
      return naoAutorizado("forbidden", 403);
    }

    // Inserir blocos em blocos_conhecimento
    const agora = new Date().toISOString();
    const blocosParaInserir = blocos.map((b: any) => ({
      agente_id: agenteId,
      title: b.titulo,
      content: b.conteudo,
      category: b.fonte || "Importado",
      escopo: "tenant", // Sempre tenant (não universo/nicho)
      tipo: "resposta",
      embedding_status: "pendente",
      ativo: true,
      created_at: agora,
      updated_at: agora,
    }));

    const { data, error } = await supabase
      .from("blocos_conhecimento")
      .insert(blocosParaInserir)
      .select("id, title");

    if (error) {
      throw new Error(`Erro ao salvar: ${error.message}`);
    }

    return new Response(JSON.stringify({
      sucesso: true,
      blocosSalvos: data?.length || 0,
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro ao salvar blocos:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
