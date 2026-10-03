import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { criarClienteAdmin } from "../_shared/supabase.ts";

// enviar-mensagem — envia mensagem do painel humano para WhatsApp do lead
// Prepend *Nome — Cargo* no topo da mensagem.
// v11: ramo documento corrigido (rota send-document/{extensão} + phone no body,
// conforme doc oficial Z-API) e fim da falha silenciosa — toda chamada Z-API
// checa res.ok + error e devolve ok:false com motivo pro frontend.
// 2026-09-17 (Otmar): Z-API aceita e devolve messageId até pra número SEM
// WhatsApp — o painel mostrava "enviada" e nada saía (14 de 62 abordagens).
// Agora consulta /phone-exists antes: exists=false → ok:false
// reason "numero_sem_whatsapp". Modo `verificar_telefone` serve a tela de
// "Nova conversa" antes de criar lead/conversa. Falha da consulta não bloqueia.

function jsonResp(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Chama a Z-API e devolve { id } no sucesso ou { erro } na falha (nunca lança).
async function chamarZapi(
  url: string,
  corpo: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<{ id: string | null; erro: string | null }> {
  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(corpo) });
    const texto = await res.text();
    let dados: Record<string, unknown> = {};
    try { dados = JSON.parse(texto); } catch { /* corpo não-JSON */ }
    if (!res.ok || dados.error) {
      const rota = url.split("/token/")[1]?.split("/").slice(1).join("/") || url;
      console.error(`[enviar-mensagem] Z-API falhou rota=${rota} status=${res.status} corpo=${texto.slice(0, 300)}`);
      const motivo = typeof dados.error === "string" ? dados.error : `Z-API respondeu status ${res.status}`;
      return { id: null, erro: motivo };
    }
    return { id: (dados.zapiMessageId as string) || (dados.messageId as string) || null, erro: null };
  } catch (e) {
    console.error(`[enviar-mensagem] Z-API erro de rede: ${(e as Error).message}`);
    return { id: null, erro: `falha de rede ao chamar Z-API: ${(e as Error).message}` };
  }
}

type CanalZapi = {
  zapi_instance_id: string | null;
  zapi_token: string | null;
  zapi_security_token: string | null;
  zapi_api_url: string | null;
};

// Credenciais Z-API do canal WhatsApp ativo do tenant (null = não configurado).
async function buscarCanalZapi(
  supabase: ReturnType<typeof criarClienteAdmin>,
  tenantId: string,
): Promise<{ base: string; headers: Record<string, string> } | null> {
  const { data } = await supabase
    .from("canais")
    .select("zapi_instance_id, zapi_token, zapi_security_token, zapi_api_url")
    .eq("user_id", tenantId)
    .eq("type", "whatsapp") // blindagem: tenant pode ter canal instagram ativo na mesma tabela
    .eq("is_active", true)
    .maybeSingle();
  const ch = data as CanalZapi | null;
  if (!ch?.zapi_instance_id || !ch?.zapi_token) return null;
  return {
    base: `${ch.zapi_api_url || "https://api.z-api.io"}/instances/${ch.zapi_instance_id}/token/${ch.zapi_token}`,
    headers: { "Content-Type": "application/json", "Client-Token": ch.zapi_security_token || "" },
  };
}

// true/false quando o Z-API responde; null quando a consulta falha (aí não bloqueia o envio).
async function telefoneTemWhatsapp(base: string, headers: Record<string, string>, phone: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${base}/phone-exists/${phone}`, { headers });
    if (!res.ok) {
      console.error(`[enviar-mensagem] phone-exists status=${res.status}`);
      return null;
    }
    const dados = await res.json() as { exists?: boolean };
    return typeof dados.exists === "boolean" ? dados.exists : null;
  } catch (e) {
    console.error(`[enviar-mensagem] phone-exists erro de rede: ${(e as Error).message}`);
    return null;
  }
}

// Envia texto pra DM do Instagram (fase 1: só texto) — Graph API com token do canal.
// Erros viram reasons fixos que o app Conversas traduz em toast claro.
async function enviarInstagram(
  igAccountId: string,
  igToken: string,
  igsidLead: string,
  texto: string,
): Promise<{ id: string | null; reason: string | null }> {
  try {
    const res = await fetch(`https://graph.instagram.com/v24.0/${igAccountId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${igToken}` },
      body: JSON.stringify({ recipient: { id: igsidLead }, message: { text: texto } }),
    });
    const corpo = await res.text();
    let dados: { message_id?: string; error?: { code?: number; error_subcode?: number; message?: string } } = {};
    try { dados = JSON.parse(corpo); } catch { /* corpo não-JSON */ }

    if (!res.ok || dados.error) {
      const erro = dados.error;
      console.error(`[enviar-mensagem] Instagram falhou status=${res.status} corpo=${corpo.slice(0, 300)}`);
      // code 10 / subcode 2534022 = fora da janela de 24h da última mensagem do lead
      if (erro?.code === 10 || erro?.error_subcode === 2534022) return { id: null, reason: "janela_24h" };
      // 401 / code 190 = token expirado ou revogado (OAuthException)
      if (res.status === 401 || erro?.code === 190) return { id: null, reason: "token_instagram_invalido" };
      return { id: null, reason: erro?.message || `Instagram respondeu status ${res.status}` };
    }
    return { id: dados.message_id || null, reason: null };
  } catch (e) {
    console.error(`[enviar-mensagem] Instagram erro de rede: ${(e as Error).message}`);
    return { id: null, reason: `falha de rede ao chamar o Instagram: ${(e as Error).message}` };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = criarClienteAdmin();

    // Auth: verificar identidade do caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResp({ error: "unauthorized" }, 401);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return jsonResp({ error: "unauthorized" }, 401);

    const body = await req.json();

    // Modo consulta: a tela de "Nova conversa" pergunta antes de criar lead/conversa.
    if (typeof body?.verificar_telefone === "string") {
      const phone = body.verificar_telefone.replace(/\D/g, "");
      const { data: caller } = await supabase.from("profiles").select("parent_user_id, system_role").eq("id", user.id).single();
      const callerTenant = caller?.parent_user_id || user.id;
      const tenantId = typeof body.tenant_id === "string" ? body.tenant_id : callerTenant;
      if (caller?.system_role !== "platform_admin" && tenantId !== callerTenant) {
        return jsonResp({ error: "forbidden" }, 403);
      }
      const canal = await buscarCanalZapi(supabase, tenantId);
      if (!canal) return jsonResp({ ok: false, reason: "canal zapi nao configurado" });
      return jsonResp({ ok: true, existe: await telefoneTemWhatsapp(canal.base, canal.headers, phone) });
    }

    const { lead_id, message, message_id, file_url, file_name, file_type, sender_name, sender_cargo } = body as {
      lead_id: string;
      message?: string;
      message_id?: string;
      file_url?: string;
      file_name?: string;
      file_type?: string;
      sender_name?: string;
      sender_cargo?: string;
    };

    if (!lead_id) return jsonResp({ error: "lead_id obrigatorio" }, 400);

    // Buscar conversa ativa do lead
    const { data: conv } = await supabase
      .from("conversas")
      .select("id, phone, tenant_id, channel")
      .eq("lead_id", lead_id)
      .in("status", ["ativa", "humano"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conv?.phone || !conv.tenant_id) {
      return jsonResp({ ok: false, reason: "conversa nao encontrada" });
    }

    // Assinatura *Nome — Cargo* é padrão; tenant desliga com
    // profiles.metadata.assinatura_humana = false (Verifik pediu em 2026-09-15).
    const { data: tenantProfile } = await supabase.from("profiles").select("metadata").eq("id", conv.tenant_id).maybeSingle();
    const assinar = (tenantProfile?.metadata as Record<string, unknown> | null)?.assinatura_humana !== false;
    const nomeAssinatura = assinar ? sender_name : undefined;

    // Ramo Instagram (fase 1: só texto) — WhatsApp segue o fluxo Z-API intocado
    if (conv.channel === "instagram") {
      // Verificar que caller pertence ao tenant da conversa (admin impersonando libera)
      const { data: callerIg } = await supabase.from("profiles").select("parent_user_id, system_role").eq("id", user.id).single();
      const igAdmin = callerIg?.system_role === "platform_admin";
      const igCallerTenant = callerIg?.parent_user_id || user.id;
      if (!igAdmin && igCallerTenant !== conv.tenant_id) {
        return jsonResp({ error: "forbidden" }, 403);
      }
      if (file_url) {
        return jsonResp({ ok: false, reason: "midia_instagram_fase2" });
      }
      if (!message) {
        return jsonResp({ ok: false, reason: "mensagem vazia" });
      }
      const { data: canalIg } = await supabase
        .from("canais")
        .select("ig_account_id, ig_token")
        .eq("user_id", conv.tenant_id)
        .eq("type", "instagram")
        .eq("is_active", true)
        .maybeSingle();
      if (!canalIg?.ig_account_id || !canalIg?.ig_token) {
        return jsonResp({ ok: false, reason: "canal instagram nao configurado" });
      }
      // Identidade fase 1: conversa IG tem phone sintético 'ig:<IGSID>'
      const igsidLead = conv.phone.startsWith("ig:") ? conv.phone.slice(3) : conv.phone;
      const prefixoIg = nomeAssinatura
        ? (sender_cargo ? `*${nomeAssinatura} — ${sender_cargo}*\n\n` : `*${nomeAssinatura}*\n\n`)
        : "";
      const envioIg = await enviarInstagram(canalIg.ig_account_id, canalIg.ig_token, igsidLead, prefixoIg + message);
      if (envioIg.reason) {
        return jsonResp({ ok: false, reason: envioIg.reason });
      }
      return jsonResp({ ok: true, ig_mid: envioIg.id });
    }

    if (conv.channel !== "whatsapp") {
      return jsonResp({ ok: false, reason: "canal nao suportado" });
    }

    // Verificar que caller pertence ao tenant da conversa (admin impersonando libera)
    const { data: callerProfile } = await supabase.from("profiles").select("parent_user_id, system_role").eq("id", user.id).single();
    const isAdmin = callerProfile?.system_role === "platform_admin";
    const callerTenant = callerProfile?.parent_user_id || user.id;
    if (!isAdmin && callerTenant !== conv.tenant_id) {
      return jsonResp({ error: "forbidden" }, 403);
    }

    // Buscar credenciais Z-API do tenant
    const canal = await buscarCanalZapi(supabase, conv.tenant_id);
    if (!canal) {
      return jsonResp({ ok: false, reason: "canal zapi nao configurado" });
    }
    const base = canal.base;
    const zapiHeaders = canal.headers;

    // Z-API "aceita" mensagem pra número sem WhatsApp — barra antes de enviar.
    // Só número puro: grupo ("...-group") e broadcast não passam pelo phone-exists.
    if (/^\d+$/.test(conv.phone) && await telefoneTemWhatsapp(base, zapiHeaders, conv.phone) === false) {
      return jsonResp({ ok: false, reason: "numero_sem_whatsapp" });
    }

    // Montar prefixo com nome do remetente
    let senderPrefix = "";
    if (nomeAssinatura) {
      senderPrefix = sender_cargo
        ? `*${nomeAssinatura} — ${sender_cargo}*\n\n`
        : `*${nomeAssinatura}*\n\n`;
    }
    const caption = senderPrefix ? senderPrefix.trim() : undefined;

    let envio: { id: string | null; erro: string | null } = { id: null, erro: null };

    if (file_url) {
      const isImage = file_type?.startsWith("image/");
      const isAudio = file_type?.startsWith("audio/");
      const isVideo = file_type?.startsWith("video/");

      if (isImage) {
        envio = await chamarZapi(`${base}/send-image`, { phone: conv.phone, image: file_url, caption }, zapiHeaders);
      } else if (isAudio) {
        // Áudio não suporta caption na Z-API — assinatura vai como texto antes
        if (senderPrefix) {
          await chamarZapi(`${base}/send-text`, { phone: conv.phone, message: senderPrefix.trim() }, zapiHeaders);
          await new Promise((r) => setTimeout(r, 500));
        }
        envio = await chamarZapi(`${base}/send-audio`, { phone: conv.phone, audio: file_url }, zapiHeaders);
      } else if (isVideo) {
        envio = await chamarZapi(`${base}/send-video`, { phone: conv.phone, video: file_url, caption }, zapiHeaders);
      } else {
        // Documento: extensão na ROTA, phone no BODY (doc oficial Z-API).
        // Mesmo padrão do sendZApiDocument do webhook/helpers.ts.
        const ext = (file_name || file_url).split("?")[0].split(".").pop()?.toLowerCase() || "pdf";
        envio = await chamarZapi(
          `${base}/send-document/${ext}`,
          { phone: conv.phone, document: file_url, fileName: file_name || "arquivo", caption },
          zapiHeaders,
        );
      }
    } else if (message) {
      // Enviar texto com nome do remetente no topo
      envio = await chamarZapi(`${base}/send-text`, { phone: conv.phone, message: senderPrefix + message }, zapiHeaders);
    }

    if (envio.erro) {
      return jsonResp({ ok: false, reason: envio.erro });
    }

    if (envio.id && message_id) {
      await supabase.from("mensagens").update({ zapi_message_id: envio.id }).eq("id", message_id);
    }

    return jsonResp({ ok: true, zapi_message_id: envio.id });
  } catch (e) {
    console.error("enviar-mensagem error:", e);
    return jsonResp({ error: (e as Error).message }, 500);
  }
});
