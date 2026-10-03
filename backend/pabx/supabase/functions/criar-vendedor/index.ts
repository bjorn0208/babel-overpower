// Edge Function: cadastro de vendedor pelo admin.
// Cria o usuário no Auth, calcula o próximo ramal livre e insere o profile.
import { createClient } from "npm:@supabase/supabase-js@2";

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

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Quem chama precisa estar logado e ser admin
  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const { data: quem } = await admin.auth.getUser(jwt);
  if (!quem?.user) return json({ erro: "não autenticado" }, 401);

  const { data: perfil } = await admin
    .from("profiles")
    .select("papel, ativo")
    .eq("user_id", quem.user.id)
    .single();
  if (perfil?.papel !== "admin" || !perfil?.ativo) {
    return json({ erro: "apenas o administrador pode cadastrar" }, 403);
  }

  const { nome, email, senha } = await req.json();
  if (!nome || !email || !senha || String(senha).length < 8) {
    return json({ erro: "dados inválidos" }, 400);
  }

  // Próximo ramal livre (começa em 1001)
  const { data: ramais } = await admin
    .from("profiles")
    .select("ramal")
    .not("ramal", "is", null);
  const maior = Math.max(1000, ...(ramais ?? []).map((r) => parseInt(r.ramal)));
  const ramal = String(maior + 1);
  const sipSenha = crypto.randomUUID().replace(/-/g, "").slice(0, 20);

  const { data: novo, error: erroAuth } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (erroAuth) return json({ erro: erroAuth.message }, 400);

  const { error: erroPerfil } = await admin.from("profiles").insert({
    user_id: novo.user.id,
    nome,
    papel: "vendedor",
    ramal,
    sip_password: sipSenha,
  });
  if (erroPerfil) {
    await admin.auth.admin.deleteUser(novo.user.id);
    return json({ erro: erroPerfil.message }, 400);
  }

  return json({ ramal });
});
