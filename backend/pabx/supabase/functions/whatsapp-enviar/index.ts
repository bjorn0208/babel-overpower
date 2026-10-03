// Enviar mensagem pelo WhatsApp da empresa.
//
// O vendedor escreve na tela; aqui a mensagem é gravada e empurrada para o
// provedor. A chave nunca chega ao navegador: fica em chaves_api, lida só aqui.
//
// Enquanto não houver provedor configurado, o envio entra em MODO ENSAIO: a
// mensagem é gravada como falha explicada, e a tela mostra o motivo. Isso deixa
// a equipe testar a tela inteira antes de o número estar pareado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });

function normalizar(tel: string): string {
  const d = String(tel || "").replace(/\D/g, "").replace(/^0+/, "");
  if (!d) return "";
  return d.startsWith("55") ? d : `55${d}`;
}

// Cada provedor tem seu endereço e seu formato; o resto do sistema não sabe
// disso. Para trocar de provedor basta mudar a linha em chaves_api.
async function enviarNoProvedor(
  provedor: string, chave: string, extra: any, telefone: string, texto: string,
): Promise<{ ok: boolean; id?: string; erro?: string }> {
  try {
    if (provedor === "zapi") {
      // extra: { instancia, token, clientToken }
      const url = `https://api.z-api.io/instances/${extra.instancia}/token/${extra.token}/send-text`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Client-Token": chave },
        body: JSON.stringify({ phone: telefone, message: texto }),
      });
      const d = await r.json().catch(() => ({}));
      // A Z-API às vezes devolve 200 com {"error": "..."} — confiar só no
      // código HTTP marcaria como enviada uma mensagem que não saiu, e o
      // vendedor ficaria esperando resposta de quem nunca recebeu nada.
      if (!r.ok || d?.error) return { ok: false, erro: d?.error || `HTTP ${r.status}` };
      if (!d?.messageId && !d?.id) return { ok: false, erro: "provedor não confirmou o envio" };
      return { ok: true, id: d?.messageId || d?.id };
    }

    if (provedor === "evolution") {
      // extra: { url, instancia }
      const base = String(extra.url || "").replace(/\/+$/, "");
      const r = await fetch(`${base}/message/sendText/${extra.instancia}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: chave },
        body: JSON.stringify({ number: telefone, text: texto }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d?.error) return { ok: false, erro: d?.message || d?.error || `HTTP ${r.status}` };
      return { ok: true, id: d?.key?.id };
    }

    return { ok: false, erro: `provedor desconhecido: ${provedor}` };
  } catch (e) {
    return { ok: false, erro: String((e as Error).message || e) };
  }
}

Deno.serve(async (req) => {
  // o navegador pergunta antes de chamar; sem esta resposta ele desiste
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!jwt) return json({ erro: "não autenticado" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: quem } = await admin.auth.getUser(jwt);
  if (!quem?.user) return json({ erro: "não autenticado" }, 401);
  const { data: perfil } = await admin
    .from("profiles").select("ativo").eq("user_id", quem.user.id).single();
  if (!perfil?.ativo) return json({ erro: "acesso desativado" }, 403);

  const { conversa_id, telefone, texto } = await req.json().catch(() => ({}));
  if (!texto?.trim()) return json({ erro: "mensagem vazia" }, 422);

  // acha ou cria a conversa do número
  let conversaId = conversa_id as string | undefined;
  let numero = normalizar(telefone || "");
  if (conversaId) {
    const { data: c } = await admin
      .from("wa_conversas").select("telefone").eq("id", conversaId).single();
    numero = c?.telefone || numero;
  } else {
    if (!numero) return json({ erro: "telefone inválido" }, 422);
    const { data: existente } = await admin
      .from("wa_conversas").select("id").eq("telefone", numero).maybeSingle();
    if (existente) conversaId = existente.id;
    else {
      const { data: nova, error } = await admin.from("wa_conversas")
        .insert({ telefone: numero }).select("id").single();
      if (error) return json({ erro: error.message }, 500);
      conversaId = nova.id;
      await admin.rpc("wa_ligar_lead", { _conversa: conversaId });
    }
  }

  // provedor configurado? (linha em chaves_api com provedor whatsapp-*)
  const { data: chaves } = await admin.from("chaves_api")
    .select("provedor, chave, config").like("provedor", "whatsapp%")
    .eq("ativa", true).limit(1);
  const linha = chaves?.[0];

  if (!linha) {
    // MODO ENSAIO: grava a tentativa explicando o que falta
    await admin.from("wa_mensagens").insert({
      conversa_id: conversaId, de_mim: true, autor: quem.user.id, tipo: "texto",
      texto, status: "falhou",
      erro: "Nenhum WhatsApp conectado ainda — cadastre o provedor em Gestão → Chaves de API.",
    });
    return json({
      erro: "Nenhum WhatsApp conectado. A mensagem ficou registrada na conversa, "
        + "mas não saiu: falta parear o número.",
    }, 409);
  }

  const provedor = linha.provedor.replace(/^whatsapp-?/, "") || "zapi";
  const extra = linha.config || {};

  const r = await enviarNoProvedor(provedor, linha.chave, extra, numero, texto.trim());

  const { data: gravada } = await admin.from("wa_mensagens").insert({
    conversa_id: conversaId,
    externo_id: r.id ?? null,
    de_mim: true,
    autor: quem.user.id,
    tipo: "texto",
    texto,
    status: r.ok ? "enviada" : "falhou",
    erro: r.ok ? null : r.erro,
  }).select("id").single();

  if (!r.ok) return json({ erro: r.erro, mensagem_id: gravada?.id }, 502);
  return json({ ok: true, conversa: conversaId, mensagem_id: gravada?.id });
});
