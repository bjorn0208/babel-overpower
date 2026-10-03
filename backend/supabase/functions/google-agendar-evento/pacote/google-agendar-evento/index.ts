/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// google-agendar-evento — cria evento na agenda certa do tenant conectado.
// REGRA DO PRODUTO (Theus, 2026-08-24): compromisso de ROBÔ vs compromisso de GENTE.
//   tipo "retorno"  → calendário "Babel OS" (follow-up que a Babel executa sozinha)
//   tipo "reuniao"  → agenda principal do dono (reunião/call com humano presente)
// Chamada pelo motor (service_role, tenant_id no corpo) ou pelo app (JWT do dono).
// verify_jwt=true — service key e JWT de usuário passam no gateway.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { criarEvento, renovarAccessToken } from "../_shared/google-agenda.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, erro: "metodo_invalido" }, 405);

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");

    const corpo = (await req.json().catch(() => ({}))) as {
      tenant_id?: string;
      tipo?: string;
      titulo?: string;
      descricao?: string;
      inicio?: string;
      duracao_min?: number;
      convidado_email?: string;
    };

    // Quem chama: service_role manda o tenant no corpo; usuário logado é o próprio tenant.
    let tenantId: string | null = null;
    if (jwt === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      tenantId = corpo.tenant_id ?? null;
    } else {
      const { data: auth } = await admin.auth.getUser(jwt);
      tenantId = auth?.user?.id ?? null;
    }
    if (!tenantId) return json({ ok: false, erro: "nao_autenticado" }, 401);

    if (!corpo.titulo || !corpo.inicio || !["retorno", "reuniao"].includes(corpo.tipo ?? "")) {
      return json({ ok: false, erro: "tipo (retorno|reuniao), titulo e inicio são obrigatórios" }, 400);
    }

    const { data: conexao } = await admin
      .from("conexoes_google")
      .select("refresh_token, calendario_babel_id, google_email")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!conexao) return json({ ok: false, erro: "google_nao_conectado" }, 422);

    const accessToken = await renovarAccessToken(conexao.refresh_token);
    const calendarioId = corpo.tipo === "retorno" ? (conexao.calendario_babel_id ?? "primary") : "primary";

    const evento = await criarEvento(accessToken, calendarioId, {
      titulo: corpo.titulo,
      descricao: corpo.descricao ?? null,
      inicioIso: corpo.inicio,
      duracaoMin: corpo.duracao_min,
      convidadoEmail: corpo.convidado_email ?? null,
    });

    return json({
      ok: true,
      tipo: corpo.tipo,
      agenda: corpo.tipo === "retorno" ? "Babel OS" : `principal (${conexao.google_email ?? "primary"})`,
      evento_id: evento.id,
      link: evento.htmlLink,
    });
  } catch (e) {
    console.error("[google-agendar-evento] erro:", e);
    return json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
