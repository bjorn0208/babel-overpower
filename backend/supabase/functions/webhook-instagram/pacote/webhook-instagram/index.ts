import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { criarClienteAdmin } from "../_shared/supabase.ts";

// webhook-instagram — recebe DM do Instagram (Meta Graph API) · fase 1 do canal IG
// GET  = handshake de subscrição (hub.challenge)
// POST = mensagens; valida assinatura HMAC, resolve canal por ig_account_id,
//        cria lead/conversa (phone sintético 'ig:<IGSID>') e grava a mensagem.
// NÃO chama o motor — fase 1 é só receber; resposta é manual pelo app Conversas.
// Spec: docs/superpowers/specs/2026-07-11-instagram-dm-fase1-design.md

type MensagemInstagram = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: Array<{ type?: string; payload?: { url?: string } }>;
  };
  reply_to?: { mid?: string; story?: { url?: string; id?: string } };
};

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

function paraHex(buf: ArrayBuffer): string {
  let saida = "";
  for (const b of new Uint8Array(buf)) saida += HEX[b];
  return saida;
}

// Comparação em tempo constante — não vaza tamanho do prefixo igual
function igualConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function assinaturaValida(corpoBruto: string, header: string | null, segredo: string): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const chave = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpoBruto));
  return igualConstante(`sha256=${paraHex(mac)}`, header);
}

// Nome real do lead via Graph API (best effort — falhou, segue com fallback)
async function buscarNomeInstagram(igsid: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(`https://graph.instagram.com/v24.0/${igsid}?fields=name,username`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const dados = await res.json() as { name?: string; username?: string };
    return dados.name || (dados.username ? `@${dados.username}` : null);
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // Handshake de subscrição do painel da Meta
  if (req.method === "GET") {
    const modo = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") || "";
    if (modo === "subscribe" && token === Deno.env.get("INSTAGRAM_VERIFY_TOKEN")) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("verify_token inválido", { status: 403 });
  }

  if (req.method !== "POST") return new Response("ok", { status: 200 });

  try {
    const corpoBruto = await req.text();

    const segredo = Deno.env.get("INSTAGRAM_APP_SECRET") || "";
    if (!segredo) {
      console.error("[webhook-instagram] INSTAGRAM_APP_SECRET ausente — rejeitando");
      return new Response("configuração ausente", { status: 401 });
    }
    const okAssinatura = await assinaturaValida(corpoBruto, req.headers.get("X-Hub-Signature-256"), segredo);
    if (!okAssinatura) {
      console.error("[webhook-instagram] assinatura HMAC inválida");
      return new Response("assinatura inválida", { status: 401 });
    }

    const payload = JSON.parse(corpoBruto) as {
      object?: string;
      entry?: Array<{ id?: string; messaging?: MensagemInstagram[] }>;
    };
    if (payload.object !== "instagram" || !Array.isArray(payload.entry)) {
      return new Response("ok", { status: 200 });
    }

    const supabase = criarClienteAdmin();

    for (const entry of payload.entry) {
      for (const msg of entry.messaging ?? []) {
        // Echo da própria conta (resposta manual persiste via enviar-mensagem) e
        // eventos sem message (read/delivery/postback) ficam fora da fase 1.
        if (!msg.message || msg.message.is_echo) continue;

        const igsidLead = msg.sender?.id;
        const igidConta = msg.recipient?.id || entry.id;
        const mid = msg.message.mid;
        if (!igsidLead || !igidConta) continue;

        // Canal do tenant pela conta Instagram que recebeu
        const { data: canal } = await supabase
          .from("canais")
          .select("id, user_id, ig_token")
          .eq("type", "instagram")
          .eq("ig_account_id", igidConta)
          .eq("is_active", true)
          .maybeSingle();
        if (!canal) {
          console.warn(`[webhook-instagram] conta ${igidConta} sem canal ativo — ignorando`);
          continue;
        }

        // Dedup por mid (retry da Meta) — reusa o trilho do webhook Z-API
        if (mid) {
          const { data: duplicado } = await supabase.rpc("verificar_dedup_webhook", {
            p_zapi_message_id: `ig:${mid}`,
          });
          if (duplicado === true) continue;
        }

        const { data: agentRow } = await supabase
          .from("agentes_usuario").select("id").eq("user_id", canal.user_id).limit(1).maybeSingle();
        if (!agentRow) {
          console.warn(`[webhook-instagram] tenant ${canal.user_id} sem agente — ignorando`);
          continue;
        }

        // Identidade fase 1: phone sintético 'ig:<IGSID>' reusa o trilho inteiro
        // (lock, reativação 30d, ficha, pausa da IA) sem RPC nova.
        const marcador = `ig:${igsidLead}`;
        const { data: convData, error: convErr } = await supabase.rpc("buscar_ou_criar_conversa", {
          p_phone: marcador,
          p_tenant_id: canal.user_id,
          p_agent_id: agentRow.id,
          p_channel: "instagram",
          p_first_fase: "saudacao",
        });
        if (convErr || !convData?.conversation?.id) {
          console.error(`[webhook-instagram] buscar_ou_criar_conversa falhou: ${convErr?.message}`);
          continue;
        }
        const convId = convData.conversation.id as string;
        const leadId = convData.conversation.lead_id as string | null;

        if (leadId) {
          // Identidade limpa no lead + nome real (só enquanto name é o marcador)
          const { data: leadRow } = await supabase
            .from("leads").select("name, id_externo").eq("id", leadId).maybeSingle();
          const patch: Record<string, unknown> = {};
          if (!leadRow?.id_externo) {
            patch.id_externo = igsidLead;
            patch.canal_externo = "instagram";
          }
          if (!leadRow?.name || leadRow.name === marcador) {
            const nome = canal.ig_token ? await buscarNomeInstagram(igsidLead, canal.ig_token) : null;
            patch.name = nome || `Instagram ${igsidLead.slice(-6)}`;
          }
          if (Object.keys(patch).length > 0) {
            await supabase.from("leads").update(patch).eq("id", leadId);
          }
          // Volta da Base: arquivado que manda DM reaparece no app Conversas
          await supabase.from("leads")
            .update({ location: "atendimento" })
            .eq("id", leadId)
            .eq("location", "base");
        }

        // Conteúdo: texto e/ou primeira mídia (URL CDN da Meta — expira; re-hospedagem = fase 2)
        const anexo = msg.message.attachments?.[0];
        const prefixoStory = msg.reply_to?.story ? "[resposta a story] " : "";
        const texto = (msg.message.text || "").trim();
        const conteudo = prefixoStory + (texto || "[MEDIA_RECEBIDA]");
        const carga = anexo?.payload?.url
          ? { media_url: anexo.payload.url, media_type: anexo.type || "file", ig_mid: mid ?? null }
          : (mid ? { ig_mid: mid } : null);

        const { error: insErr } = await supabase.from("mensagens").insert({
          conversation_id: convId,
          role: "user",
          content: conteudo,
          carga,
        });
        if (insErr) {
          console.error(`[webhook-instagram] insert mensagem falhou conv=${convId}: ${insErr.message}`);
        }
        // Fase 1: sem motor, sem buffer — resposta é manual pelo app Conversas.
      }
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error(`[webhook-instagram] erro: ${(e as Error).message}`);
    // 200 mesmo em erro interno — Meta re-tenta em não-2xx e o dedup já protege
    return new Response("ok", { status: 200 });
  }
});
