// Envia e-mail pela caixa comercial@babel-os.com (Hostinger), com as travas
// antes do disparo.
//
// O transporte é a ponte do B-Mail na VPS (bmail.babel-os.com): é ela que
// guarda a credencial SMTP da caixa e arquiva a cópia em Enviados — o que o
// vendedor lê depois no B-Mail é exatamente o que saiu. Esta função continua
// sendo o portão: autentica, aplica as travas (pode_enviar_email) e grava a
// auditoria em email_enviados. Antes o transporte era o Resend; a decisão de
// 18/08 foi tudo pela Hostinger, remetente comercial@babel-os.com.
import { createClient } from "npm:@supabase/supabase-js@2";

const PONTE = Deno.env.get("BMAIL_URL") || "https://bmail.babel-os.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });

const ehEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim());

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const { data: quem } = await admin.auth.getUser(jwt);
  if (!quem?.user) return json({ erro: "não autenticado" }, 401);
  const { data: perfil } = await admin
    .from("profiles").select("ativo, nome").eq("user_id", quem.user.id).single();
  if (!perfil?.ativo) return json({ erro: "acesso desativado" }, 403);

  const { para, assunto, html, texto, lead_id = null, responder_para = null } =
    await req.json().catch(() => ({}));

  if (!ehEmail(para)) return json({ erro: "endereço de e-mail inválido" }, 422);
  if (!assunto || !(html || texto)) return json({ erro: "faltou assunto ou conteúdo" }, 422);

  // ── as travas, na ordem: bloqueio geral → supressão → limites ──────────
  // Rodam como o próprio usuário para que a contagem por vendedor valha.
  const comoUsuario = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } },
  );
  const { data: trava, error: erroTrava } = await comoUsuario
    .rpc("pode_enviar_email", { _para: para });
  if (erroTrava) return json({ erro: erroTrava.message }, 500);
  if (!trava?.ok) return json({ erro: trava?.motivo ?? "envio barrado" }, 429);

  let idProvedor: string | null = null;
  let falha: string | null = null;

  try {
    // A ponte valida o MESMO login (o JWT segue junto) e envia pelo SMTP da
    // Hostinger como "Grupo Babel <comercial@babel-os.com>", arquivando a
    // cópia em Enviados.
    const r = await fetch(`${PONTE}/api/mail/enviar`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        para,
        assunto,
        ...(html ? { html } : {}),
        ...(texto ? { texto } : {}),
        // a resposta do lead volta para o vendedor, não para a caixa geral
        ...(responder_para && ehEmail(responder_para) ? { responder_para } : {}),
        // Saída fácil, em cabeçalho. O Gmail dá peso grande a isto: remetente
        // que não oferece descadastro é tratado como suspeito, e quem não acha
        // como sair marca como spam — que é o pior sinal que existe.
        cabecalhos: {
          "List-Unsubscribe": `<mailto:${trava.remetente}?subject=descadastrar>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok || !corpo?.ok) falha = corpo?.erro ?? `ponte respondeu ${r.status}`;
    else idProvedor = corpo?.id ?? null;
  } catch (e) {
    falha = `sem resposta da ponte: ${(e as Error).message}`;
  }

  // O registro entra sempre — inclusive quando falha. É o log de auditoria
  // que a spec pede, e é ele que alimenta a contagem dos limites.
  await admin.from("email_enviados").insert({
    user_id: quem.user.id,
    lead_id,
    para: String(para).toLowerCase().trim(),
    assunto,
    provedor_id: idProvedor,
    situacao: falha ? "falhou" : "enviado",
    erro: falha,
  });

  if (falha) return json({ erro: falha }, 502);
  return json({ ok: true, id: idProvedor, de: `${trava.nome_remetente} <${trava.remetente}>` });
});
