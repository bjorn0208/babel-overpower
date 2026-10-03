// Borda do formulário público de INDICAÇÃO da babel-os (Supabase Edge Function, Deno).
//
// Recebe o POST JSON da página de indicação, valida de novo, descarta robô pelo honeypot, limita por
// IP e chama a função do banco `gestao_publico_registrar_indicacao(jsonb)` com a chave de serviço.
// A página nunca fala com o banco e nunca carrega chave nenhuma.
//
// Contrato da página (conferido em 2026-09-24 no artefato preparado):
//   POST application/json
//   { referrerName, referrerCode, website (honeypot), leadName, leadWhatsapp, niche,
//     createdAt (relógio do cliente — ignorado), submissionId (dedupe), consentText }
//   obrigatórios: referrerName, leadName, leadWhatsapp, niche (+ submissionId e consentText)
//   sucesso = 2xx. Erro 5xx/429/rede: a página repete com o MESMO submissionId. Erro 4xx: não repete.
//
// Dedupe por submissionId, carimbo de tempo, resolução do referrerCode e guarda do consentimento são
// da função do banco (MIGRACAO-RASCUNHO.sql:589-610). Aqui não se grava nada à mão.
//
// Deploy: SEM verificação de JWT (a página é pública e anônima). Ver LEIA-ME.md.
// A chave vem só do ambiente: BABEL_CHAVE_SERVICO (se o Theus definir) ou SUPABASE_SERVICE_ROLE_KEY
// (o Supabase injeta sozinho). Nunca escreva chave neste arquivo.

const URL_SUPABASE = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const CHAVE_SERVICO = Deno.env.get("BABEL_CHAVE_SERVICO") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// CORS aberto: formulário público, sem cookie e sem credencial (aviso C do Serjão: decisão do Theus).
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

// Limite por IP na memória da instância: some no cold start e não é compartilhado entre instâncias.
// Segura duplo clique e repetição simples, não ataque distribuído (aviso B do Serjão).
const JANELA_MS = 10 * 60 * 1000;
const MAX_POR_JANELA = 20;
const MAX_CORPO = 16 * 1024; // o formulário inteiro cabe em ~2 KB
const visitas = new Map<string, number[]>();

function passouDoLimite(ip: string): boolean {
  const agora = Date.now();
  const anteriores = (visitas.get(ip) ?? []).filter((t) => agora - t < JANELA_MS);
  anteriores.push(agora);
  visitas.set(ip, anteriores);
  if (visitas.size > 5000) visitas.clear(); // não deixa a memória crescer sem fim
  return anteriores.length > MAX_POR_JANELA;
}

function resposta(corpo: unknown, status: number): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8" },
  });
}

/** Texto limpo: sem caracteres de controle, espaços colapsados. `null` quando passa do máximo. */
function texto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return "";
  const limpo = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return limpo.length > max ? null : limpo;
}

/** Cabeçalhos da chamada ao banco. Chave nova (sb_secret_…) vai só em `apikey`; a legada (JWT) vai nos dois. */
function cabecalhosBanco(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json", apikey: CHAVE_SERVICO };
  if (!CHAVE_SERVICO.startsWith("sb_")) h.authorization = `Bearer ${CHAVE_SERVICO}`;
  return h;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "metodo" }, 405);

  if (!URL_SUPABASE || !CHAVE_SERVICO) {
    console.error("[indicacao] configuracao ausente (url ou chave)"); // nunca o valor
    return resposta({ erro: "indisponivel" }, 503);
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "sem-ip";
  if (passouDoLimite(ip)) return resposta({ erro: "muitas tentativas" }, 429);

  if (!(req.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return resposta({ erro: "formato" }, 415);
  }
  if (Number(req.headers.get("content-length") ?? "0") > MAX_CORPO) return resposta({ erro: "grande demais" }, 413);

  let corpo: Record<string, unknown>;
  try {
    const bruto = await req.text();
    if (bruto.length > MAX_CORPO) return resposta({ erro: "grande demais" }, 413);
    const lido = JSON.parse(bruto);
    if (!lido || typeof lido !== "object" || Array.isArray(lido)) throw new Error("nao e objeto");
    corpo = lido as Record<string, unknown>;
  } catch {
    return resposta({ erro: "corpo invalido" }, 400);
  }

  // Honeypot: campo que só robô preenche. Responde sucesso e não grava nada (não avisa o robô).
  if ((texto(corpo.website, 500) ?? "x") !== "") return resposta({ ok: true }, 200);

  // Mesmos limites da página (maxlength) e da função do banco; passou do limite = recusa, nunca corta.
  const dados = {
    referrerName: texto(corpo.referrerName, 200),
    // Código de quem indicou: a página já manda só [A-Z0-9-] em maiúsculas; aqui se repete a regra.
    referrerCode: (texto(corpo.referrerCode, 60) ?? "").toUpperCase().replace(/[^A-Z0-9-]/g, ""),
    leadName: texto(corpo.leadName, 200),
    leadWhatsapp: texto(corpo.leadWhatsapp, 40),
    niche: texto(corpo.niche, 120),
    submissionId: texto(corpo.submissionId, 100),
    consentText: texto(corpo.consentText, 4000),
    // Dia da indicação no fuso da casa (aviso E do Serjão). O relógio do cliente não é autoridade.
    localDate: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
  };

  const invalidos: string[] = [];
  for (const k of ["referrerName", "leadName", "niche"] as const) {
    const v = dados[k];
    if (v === null || v.length < 2) invalidos.push(k);
  }
  const zap = (dados.leadWhatsapp ?? "").replace(/\D/g, "");
  if (dados.leadWhatsapp === null || zap.length < 10 || zap.length > 13) invalidos.push("leadWhatsapp");
  if (!dados.submissionId) invalidos.push("submissionId");
  if (!dados.consentText) invalidos.push("consentText");
  if (invalidos.length > 0) return resposta({ erro: "campos invalidos", campos: invalidos }, 400);

  let r: Response;
  try {
    r = await fetch(`${URL_SUPABASE}/rest/v1/rpc/gestao_publico_registrar_indicacao`, {
      method: "POST",
      headers: cabecalhosBanco(),
      body: JSON.stringify({ p: dados }),
    });
  } catch {
    console.error("[indicacao] banco inalcancavel");
    return resposta({ erro: "nao foi possivel registrar" }, 502);
  }

  if (!r.ok) {
    // Nem o detalhe do banco vai para a página (pode conter esquema), nem o corpo vai para o log
    // (pode ecoar o valor dos campos, que é dado pessoal). Só o status (aviso D do Serjão).
    await r.body?.cancel();
    console.error("[indicacao] banco recusou", r.status);
    return resposta({ erro: "nao foi possivel registrar" }, 502);
  }
  await r.body?.cancel();

  // Reenvio do mesmo submissionId devolve 200 também: para a página, "já está registrado" é sucesso.
  return resposta({ ok: true }, 200);
});
