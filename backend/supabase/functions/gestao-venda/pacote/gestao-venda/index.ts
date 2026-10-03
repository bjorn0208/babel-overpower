// Borda do formulário público de VENDA REALIZADA da babel-os (Supabase Edge Function, Deno).
//
// Recebe o POST JSON da página de venda, valida de novo, descarta robô pelo honeypot, limita por IP e
// chama `gestao_publico_registrar_venda(jsonb)` com a chave de serviço. A página não fala com o banco.
//
// SEM COMPROVANTE (decisão do Theus, 2026-09-24): o app não guarda comprovante. A página não pede
// arquivo, esta função não aceita arquivo nem mexe em storage, e o payload ao banco não leva `arquivo`
// — a função do banco trata `arquivo` como opcional (sem ele, `gestao_vendas.comprovante` fica nulo e
// nada entra em `gestao_arquivos`; MIGRACAO-RASCUNHO.sql:573-580; coluna `comprovante jsonb` sem NOT NULL, :179).
//
// Contrato da página (conferido em 2026-09-24 no artefato preparado):
//   POST application/json
//   { sellerName, saleDate (yyyy-mm-dd), setupCentavos (inteiro, em texto), plan (vip|profissional|basico),
//     clientName, companyName, niche, whatsapp, email, website (honeypot), createdAt (ignorado),
//     submissionId (dedupe), consentText }
//   sucesso = 2xx. Erro 5xx/429/rede: a página repete com o MESMO submissionId. Erro 4xx: não repete.
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

// Limite por IP na memória da instância (mesmo da indicação): some no cold start, por instância.
const JANELA_MS = 10 * 60 * 1000;
const MAX_POR_JANELA = 20;
const MAX_CORPO = 16 * 1024; // o formulário inteiro cabe em ~2 KB; um arquivo embutido não passa
const visitas = new Map<string, number[]>();

function passouDoLimite(ip: string): boolean {
  const agora = Date.now();
  const anteriores = (visitas.get(ip) ?? []).filter((t) => agora - t < JANELA_MS);
  anteriores.push(agora);
  visitas.set(ip, anteriores);
  if (visitas.size > 5000) visitas.clear();
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
  if (typeof v === "number" && Number.isFinite(v)) v = String(v);
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

const PLANOS = ["vip", "profissional", "basico"];

/** yyyy-mm-dd de calendário real, de 2020 até hoje em São Paulo (a página aceita o mesmo intervalo). */
function dataValida(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return false;
  // "Hoje" é no fuso de quem vende, não em UTC (aviso F do Serjão): das 21h à meia-noite o UTC já
  // virou o dia seguinte.
  const hojeBR = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return +m[1] >= 2020 && v <= hojeBR;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "metodo" }, 405);

  if (!URL_SUPABASE || !CHAVE_SERVICO) {
    console.error("[venda] configuracao ausente (url ou chave)"); // nunca o valor
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

  // Honeypot: responde sucesso e não grava nada (não avisa o robô).
  if ((texto(corpo.website, 500) ?? "x") !== "") return resposta({ ok: true }, 200);

  // Só estas chaves seguem para o banco. Qualquer outra (inclusive `arquivo` ou `receipt`) é ignorada.
  const dados = {
    sellerName: texto(corpo.sellerName, 200),
    saleDate: texto(corpo.saleDate, 10),
    setupCentavos: texto(corpo.setupCentavos, 10),
    plan: (texto(corpo.plan, 60) ?? "").toLowerCase(),
    clientName: texto(corpo.clientName, 200),
    companyName: texto(corpo.companyName, 200),
    niche: texto(corpo.niche, 120),
    whatsapp: texto(corpo.whatsapp, 40),
    email: texto(corpo.email, 200),
    submissionId: texto(corpo.submissionId, 100),
    consentText: texto(corpo.consentText, 4000),
  };

  const invalidos: string[] = [];
  for (const k of ["sellerName", "clientName", "companyName", "niche"] as const) {
    const v = dados[k];
    if (v === null || v.length < 2) invalidos.push(k);
  }
  if (dados.saleDate === null || !dataValida(dados.saleDate)) invalidos.push("saleDate");
  if (dados.setupCentavos === null || !/^\d{1,10}$/.test(dados.setupCentavos) || Number(dados.setupCentavos) <= 0) {
    invalidos.push("setupCentavos");
  }
  if (!PLANOS.includes(dados.plan)) invalidos.push("plan");
  const zap = (dados.whatsapp ?? "").replace(/\D/g, "");
  if (dados.whatsapp === null || zap.length < 10 || zap.length > 13) invalidos.push("whatsapp");
  if (dados.email === null || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(dados.email)) invalidos.push("email");
  if (!dados.submissionId) invalidos.push("submissionId");
  if (!dados.consentText) invalidos.push("consentText");
  if (invalidos.length > 0) return resposta({ erro: "campos invalidos", campos: invalidos }, 400);

  let r: Response;
  try {
    r = await fetch(`${URL_SUPABASE}/rest/v1/rpc/gestao_publico_registrar_venda`, {
      method: "POST",
      headers: cabecalhosBanco(),
      body: JSON.stringify({ p: dados }),
    });
  } catch {
    console.error("[venda] banco inalcancavel");
    return resposta({ erro: "nao foi possivel registrar" }, 502);
  }

  if (!r.ok) {
    // Só o status, nunca o corpo: o corpo pode ecoar o valor dos campos enviados (dado pessoal).
    await r.body?.cancel();
    console.error("[venda] banco recusou", r.status);
    return resposta({ erro: "nao foi possivel registrar" }, 502);
  }
  await r.body?.cancel();

  // Reenvio do mesmo submissionId devolve 200 também: para a página, "já está registrada" é sucesso.
  // Sem arquivo, não há órfão a limpar (o bloqueante 3 de 22/09 deixa de existir).
  return resposta({ ok: true }, 200);
});
