// Edge Function: gera token de acesso ao Meet próprio (LiveKit em reuniao.babel-os.com).
// Vendedor logado entra com o nome do perfil; convidado entra só com o nome
// (por isso esta função é deployada com --no-verify-jwt e valida o JWT por conta própria).
import { createClient } from "npm:@supabase/supabase-js@2";
import { SignJWT } from "npm:jose@5";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const { sala, nome } = await req.json();
  if (!sala || !/^[a-zA-Z0-9-]{4,40}$/.test(sala)) {
    return json({ erro: "sala inválida" }, 400);
  }

  // Se veio JWT válido, usa o nome do perfil; senão é convidado (precisa de nome)
  let identidade = "";
  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  if (jwt) {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: quem } = await admin.auth.getUser(jwt);
    if (quem?.user) {
      const { data: perfil } = await admin
        .from("profiles").select("nome, ativo").eq("user_id", quem.user.id).single();
      if (perfil?.ativo) identidade = perfil.nome;
    }
  }
  if (!identidade) {
    const nomeLimpo = String(nome || "").trim().slice(0, 40);
    if (nomeLimpo.length < 2) return json({ erro: "informe seu nome" }, 400);
    identidade = `${nomeLimpo} (convidado)`;
  }

  const chaveApi = Deno.env.get("LIVEKIT_API_KEY")!;
  const segredo = new TextEncoder().encode(Deno.env.get("LIVEKIT_API_SECRET")!);

  const token = await new SignJWT({
    video: {
      room: sala,
      roomJoin: true,
      roomCreate: true,
      canPublish: true,
      canSubscribe: true,
    },
    name: identidade,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(chaveApi)
    .setSubject(identidade + "-" + crypto.randomUUID().slice(0, 6))
    .setIssuedAt()
    .setNotBefore("0s")
    .setExpirationTime("6h")
    .sign(segredo);

  return json({ token, url: Deno.env.get("LIVEKIT_URL") });
});
