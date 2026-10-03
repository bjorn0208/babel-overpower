// Edge Function: puxa da ligação os dados de contato que a pessoa ditou —
// nome de quem atendeu, telefone/WhatsApp e e-mail.
//
// Ordem de preferência (da mais barata para a mais cara):
//   1) o dossiê que o transcritor já extraiu quando gravou a chamada;
//   2) a transcrição completa, passada por uma IA aqui;
//   3) as legendas ao vivo que o navegador capturou — o caminho de quem
//      aperta o botão logo depois de desligar, antes de a gravação virar
//      transcrição (leva ~1 minuto no servidor).
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

// Telefone brasileiro ditado vira o formato de discagem (DDD + número),
// com o 9 na frente quando é celular antigo de 8 dígitos.
function normalizarFone(bruto: string): string {
  let d = String(bruto || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if ((d.length === 11 || d.length === 12) && d[0] === "0") d = d.slice(1);
  if (d.length === 10 && "6789".includes(d[2])) d = d.slice(0, 2) + "9" + d.slice(2);
  return d.length === 10 || d.length === 11 ? d : "";
}

const ehEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim());

async function extrairComIa(chave: string, dialogo: string) {
  const prompt =
    "Você lê a transcrição de uma ligação comercial e extrai APENAS os dados de " +
    "contato que a pessoa do outro lado DITOU em voz alta.\n" +
    "No diálogo, 'Mentor' é a nossa equipe e 'Lead' é quem atendeu.\n\n" +
    "Devolva SOMENTE um JSON:\n" +
    '- nome_atendente: nome de quem atendeu, só se a pessoa disse o nome dela\n' +
    "- telefone_contato: telefone/WhatsApp ditado para contato (só dígitos, com DDD)\n" +
    "- email_contato: e-mail ditado\n" +
    '- evidencia: objeto com o trecho LITERAL da conversa que justifica cada campo\n\n' +
    "REGRAS DE FERRO:\n" +
    "1. NUNCA invente. Sem certeza absoluta = string vazia.\n" +
    "2. Número ditado por extenso ('onze nove oito...') vira dígitos.\n" +
    "3. Não devolva o número que NÓS ligamos, só o que a pessoa ditou.\n" +
    "4. E-mail dito como 'arroba' e 'ponto' vira @ e .\n\n" +
    "DIÁLOGO:\n" + dialogo.slice(0, 12000);

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.1,
    }),
  });
  if (!resp.ok) throw new Error(`IA respondeu ${resp.status}`);
  const dados = await resp.json();
  const texto = (dados?.choices?.[0]?.message?.content ?? "")
    .trim().replace(/^```json/, "").replace(/^```/, "").replace(/```$/, "");
  return JSON.parse(texto);
}

// Trava anti-invenção: só passa o campo cuja evidência aparece de fato na
// conversa — a mesma regra que o transcritor usa no servidor.
function comEvidencia(bruto: Record<string, unknown>, dialogo: string) {
  const evid = (bruto.evidencia ?? {}) as Record<string, string>;
  const conversa = dialogo.toLowerCase().split(/\s+/).join(" ");
  const ok = (chave: string) => {
    const trecho = String(evid[chave] ?? "").toLowerCase().split(/\s+/).join(" ");
    return trecho.length >= 3 && conversa.includes(trecho);
  };
  const nome = String(bruto.nome_atendente ?? "").trim();
  const fone = normalizarFone(String(bruto.telefone_contato ?? ""));
  const email = String(bruto.email_contato ?? "").trim();
  return {
    nome_atendente: nome && ok("nome_atendente") ? nome : "",
    telefone_contato: fone && ok("telefone_contato") ? fone : "",
    email_contato: email && ehEmail(email) && ok("email_contato") ? email : "",
  };
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
    .from("profiles").select("ativo").eq("user_id", quem.user.id).single();
  if (!perfil?.ativo) return json({ erro: "acesso desativado" }, 403);

  const { numero = null, texto_ao_vivo = "" } = await req.json().catch(() => ({}));

  // A ligação que acabou: a última do próprio usuário nos últimos 30 minutos.
  const desde = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data: chamadas } = await admin
    .from("calls")
    .select("id, numero_externo, transcricao, transcricao_status, dossie, lead_id")
    .eq("user_id", quem.user.id)
    .gte("iniciada_em", desde)
    .order("iniciada_em", { ascending: false })
    .limit(5);

  const sufixo = String(numero || "").replace(/\D/g, "").slice(-8);
  const chamada = (chamadas ?? []).find((c) =>
    !sufixo || String(c.numero_externo || "").replace(/\D/g, "").endsWith(sufixo)
  ) ?? (chamadas ?? [])[0];

  // 1) o transcritor já extraiu na gravação?
  const dossie = (chamada?.dossie ?? {}) as Record<string, string>;
  const doDossie = {
    nome_atendente: String(dossie.nome_atendente ?? "").trim(),
    telefone_contato: normalizarFone(String(dossie.telefone_contato ?? "")),
    email_contato: String(dossie.email_contato ?? "").trim(),
  };
  if (doDossie.nome_atendente || doDossie.telefone_contato || doDossie.email_contato) {
    return json({ ok: true, fonte: "transcricao", ...doDossie });
  }

  // 2) transcrição pronta, ou 3) legendas do navegador
  const dialogo = (chamada?.transcricao ?? "").trim() || String(texto_ao_vivo || "").trim();
  if (dialogo.length < 40) {
    return json({
      ok: true,
      fonte: "vazio",
      nome_atendente: "", telefone_contato: "", email_contato: "",
      aviso: chamada?.transcricao_status === "pendente"
        ? "A gravação ainda está sendo transcrita (leva cerca de 1 minuto). Tente de novo em instantes."
        : "Não há conversa suficiente nesta ligação para extrair contato.",
    });
  }

  const { data: chaves } = await admin
    .from("chaves_api").select("chave").eq("provedor", "openrouter")
    .eq("ativa", true).limit(1);
  if (!chaves?.length) {
    return json({ erro: "cadastre a chave OpenRouter em Gestão → Chaves" }, 409);
  }

  try {
    const bruto = await extrairComIa(chaves[0].chave, dialogo);
    const limpo = comEvidencia(bruto, dialogo);
    return json({
      ok: true,
      fonte: chamada?.transcricao ? "transcricao" : "ao_vivo",
      ...limpo,
      aviso: (!limpo.nome_atendente && !limpo.telefone_contato && !limpo.email_contato)
        ? "Ninguém ditou telefone, e-mail ou nome nesta ligação."
        : undefined,
    });
  } catch (erro) {
    return json({ erro: `não consegui ler a ligação: ${(erro as Error).message}` }, 502);
  }
});
