// Painel de configuração do WhatsApp: estado da conexão, QR Code para parear e
// o endereço do webhook.
//
// Só admin. O segredo do webhook vive aqui (variável de ambiente) e é devolvido
// apenas para quem pode configurar — assim ele não precisa ser guardado no
// banco, onde a equipe inteira leria.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });

// Cada provedor responde o estado de um jeito; aqui vira sempre
// { conectado, estado, qr }.
async function estadoDoProvedor(provedor: string, chave: string, extra: any) {
  try {
    if (provedor === "zapi") {
      const base = `https://api.z-api.io/instances/${extra.instancia}/token/${extra.token}`;
      const r = await fetch(`${base}/status`, { headers: { "Client-Token": chave } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return { conectado: false, estado: d?.error || `HTTP ${r.status}` };
      if (d?.connected) return { conectado: true, estado: "conectado" };
      // não conectado: busca o QR para parear
      const q = await fetch(`${base}/qr-code/image`, { headers: { "Client-Token": chave } });
      const qd = await q.json().catch(() => ({}));
      return {
        conectado: false,
        estado: d?.smartphoneConnected === false ? "celular desconectado" : "aguardando pareamento",
        qr: qd?.value || null,
      };
    }

    if (provedor === "evolution") {
      const base = String(extra.url || "").replace(/\/+$/, "");
      const r = await fetch(`${base}/instance/connectionState/${extra.instancia}`,
        { headers: { apikey: chave } });
      const d = await r.json().catch(() => ({}));
      const estado = d?.instance?.state || d?.state || "desconhecido";
      if (estado === "open") return { conectado: true, estado: "conectado" };
      const q = await fetch(`${base}/instance/connect/${extra.instancia}`,
        { headers: { apikey: chave } });
      const qd = await q.json().catch(() => ({}));
      return { conectado: false, estado, qr: qd?.base64 || qd?.qrcode?.base64 || null };
    }

    return { conectado: false, estado: `provedor desconhecido: ${provedor}` };
  } catch (e) {
    return { conectado: false, estado: `não respondeu: ${(e as Error).message}` };
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
    .from("profiles").select("papel, ativo").eq("user_id", quem.user.id).single();
  if (!perfil?.ativo || perfil.papel !== "admin") {
    return json({ erro: "só o administrador configura o WhatsApp" }, 403);
  }

  const segredo = Deno.env.get("WHATSAPP_WEBHOOK_TOKEN") ?? "";
  const webhook = `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-webhook?t=${segredo}`;

  const { data: chaves } = await admin.from("chaves_api")
    .select("id, provedor, chave, config, ativa").like("provedor", "whatsapp%")
    .eq("ativa", true).limit(1);
  const linha = chaves?.[0];

  if (!linha) {
    return json({
      webhook, configurado: false, conectado: false,
      estado: "nenhum provedor cadastrado",
    });
  }

  const provedor = linha.provedor.replace(/^whatsapp-?/, "") || "zapi";
  const r = await estadoDoProvedor(provedor, linha.chave, linha.config || {});

  return json({
    webhook,
    configurado: true,
    provedor,
    // nunca devolve a chave inteira: só o suficiente para conferir qual é
    chave_final: String(linha.chave).slice(-6),
    ...r,
  });
});
