// Edge Function: lê as transcrições das chamadas ligadas a leads e extrai
// o MOTIVADOR principal (por que o cliente se interessou/recusou) e o nível
// de interesse. Alimenta o Raio-X de perfil de cliente. Só admin dispara.
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

  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const { data: quem } = await admin.auth.getUser(jwt);
  if (!quem?.user) return json({ erro: "não autenticado" }, 401);
  const { data: perfil } = await admin
    .from("profiles").select("papel, ativo").eq("user_id", quem.user.id).single();
  if (perfil?.papel !== "admin" || !perfil?.ativo) {
    return json({ erro: "apenas o administrador" }, 403);
  }

  const { data: chaves } = await admin
    .from("chaves_api").select("chave").eq("provedor", "openrouter")
    .eq("ativa", true).limit(1);
  if (!chaves?.length) return json({ erro: "cadastre a chave OpenRouter em Gestão → Chaves" }, 409);
  const chaveLlm = chaves[0].chave;

  // Chamadas transcritas de leads ainda sem motivador (até 10 por rodada)
  const { data: pendentes } = await admin
    .from("calls")
    .select("id, lead_id, transcricao, observacao, leads!inner(id, empresa, motivador)")
    .not("lead_id", "is", null)
    .not("transcricao", "is", null)
    .is("leads.motivador", null)
    .order("iniciada_em", { ascending: false })
    .limit(10);

  let processados = 0;
  const resultados: Record<string, unknown>[] = [];
  for (const c of pendentes ?? []) {
    const texto = [
      c.transcricao?.slice(0, 3000),
      c.observacao ? `Observação do vendedor: ${c.observacao}` : "",
    ].join("\n");
    if (!texto.trim() || texto.length < 40) continue;

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + chaveLlm,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        max_tokens: 150,
        messages: [{
          role: "user",
          content:
            "Desta transcrição de ligação comercial, responda JSON puro:\n" +
            '{"motivador":"em até 12 palavras, o principal motivo de interesse OU de recusa do cliente","interesse":"alto|medio|baixo|nenhum"}\n' +
            "Se a transcrição não tiver conteúdo comercial útil, use motivador \"sem conteúdo\" e interesse \"nenhum\".\n\n" +
            texto,
        }],
      }),
    });
    if (!resp.ok) continue;
    const dados = await resp.json();
    let saida = (dados.choices?.[0]?.message?.content ?? "").trim();
    if (saida.startsWith("```")) saida = saida.replace(/```(json)?/g, "").trim();
    try {
      const j = JSON.parse(saida.replace(/\n/g, " "));
      if (j.motivador) {
        await admin.from("leads")
          .update({ motivador: String(j.motivador).slice(0, 120), interesse: j.interesse ?? null })
          .eq("id", c.lead_id);
        processados++;
        resultados.push({ lead: (c as any).leads?.empresa, motivador: j.motivador, interesse: j.interesse });
      }
    } catch { /* pula esta */ }
  }

  return json({ processados, pendentes: (pendentes ?? []).length, resultados });
});
