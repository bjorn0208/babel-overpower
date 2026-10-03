/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

/**
 * Tools externas do canal interno — pesquisa Google + coleta Instagram.
 *
 * Tijolo 2 do CommandBar "ChatGPT da empresa": o Mentor/Admin pesquisa na
 * internet (RapidAPI google-search74) e coleta dados públicos de perfis do
 * Instagram (RapidAPI instagram120) pra enriquecer respostas com contexto de
 * fora do sistema. Resultado bom pode virar base: o fluxo é mostrar → dono
 * aprova → `cadastrar_bloco_conhecimento` grava (embedding automático → RAG).
 *
 * Chave: secret de edge `RAPIDAPI_KEY` (supabase secrets) — nunca no código,
 * nunca no banco, nunca no cliente.
 *
 * Compartilhado por `tools-mentor.ts` e `tools-admin.ts` (mesmo padrão do
 * `tools-consulta-dados.ts`).
 */

const HOST_GOOGLE = "google-search74.p.rapidapi.com";
const HOST_INSTAGRAM = "instagram120.p.rapidapi.com";

/** Ações do Instagram confirmadas na API (zero-chute): endpoint por ação. */
const ACOES_INSTAGRAM: Record<string, string> = {
  perfil: "/api/instagram/profile",
  seguindo: "/api/instagram/followings",
};

export const SCHEMA_PESQUISAR_GOOGLE = {
  type: "function" as const,
  function: {
    name: "pesquisar_google",
    description:
      "Pesquisa no Google e retorna os melhores resultados (título, link, descrição). " +
      "Use quando a resposta precisar de informação de FORA do sistema: tendências, concorrentes, " +
      "ideias de campanha pra um nicho, notícias, referências de mercado. Combine o que achar com os " +
      "dados internos (consultar_dados) pra responder personalizado. Se o usuário aprovar o achado, " +
      "ofereça salvar na base com cadastrar_bloco_conhecimento.",
    parameters: {
      type: "object" as const,
      properties: {
        consulta: {
          type: "string",
          description: "Termos da pesquisa (como você digitaria no Google).",
        },
        limite: {
          type: "number",
          description: "Quantos resultados trazer (padrão 5, máx 10).",
        },
      },
      required: ["consulta"],
    },
  },
};

export const SCHEMA_CONSULTAR_INSTAGRAM = {
  type: "function" as const,
  function: {
    name: "consultar_instagram",
    description:
      "Coleta dados públicos de um perfil do Instagram pelo username (sem @). " +
      "Ações: 'perfil' (bio, nome, foto, privado ou não) e 'seguindo' (quem o perfil segue). " +
      "Use pra estudar um lead, cliente ou concorrente antes de campanha/abordagem. " +
      "Perfil privado retorna só o básico. Se o usuário aprovar o achado, ofereça salvar " +
      "na base com cadastrar_bloco_conhecimento.",
    parameters: {
      type: "object" as const,
      properties: {
        username: {
          type: "string",
          description: "Username do Instagram, sem @ (ex: 'nike').",
        },
        acao: {
          type: "string",
          enum: ["perfil", "seguindo"],
          description: "O que coletar (padrão: perfil).",
        },
      },
      required: ["username"],
    },
  },
};

/** fetch com timeout + chave RapidAPI; devolve texto de erro legível pra LLM. */
async function chamarRapidApi(
  host: string,
  caminho: string,
  metodo: "GET" | "POST",
  corpo?: Record<string, unknown>,
): Promise<{ ok: boolean; dados?: unknown; erro?: string }> {
  const chave = Deno.env.get("RAPIDAPI_KEY") ?? "";
  if (!chave) return { ok: false, erro: "RAPIDAPI_KEY não configurada no servidor" };
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15_000);
    const r = await fetch(`https://${host}${caminho}`, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        "x-rapidapi-host": host,
        "x-rapidapi-key": chave,
      },
      body: metodo === "POST" ? JSON.stringify(corpo ?? {}) : undefined,
      signal: ctl.signal,
    });
    clearTimeout(timer);
    const txt = await r.text();
    if (!r.ok) return { ok: false, erro: `API respondeu ${r.status}: ${txt.slice(0, 200)}` };
    try {
      return { ok: true, dados: JSON.parse(txt) };
    } catch {
      return { ok: true, dados: txt };
    }
  } catch (e) {
    return { ok: false, erro: (e as Error).name === "AbortError" ? "tempo esgotado (15s)" : (e as Error).message };
  }
}

export async function handlerPesquisarGoogle(
  args: Record<string, unknown>,
): Promise<string> {
  const consulta = String(args.consulta ?? "").trim();
  if (!consulta) return "✗ Informe o campo consulta com os termos da pesquisa.";
  const limite = Math.min(Math.max(Number(args.limite ?? 5) || 5, 1), 10);

  const r = await chamarRapidApi(
    HOST_GOOGLE,
    `/?query=${encodeURIComponent(consulta)}&limit=${limite}&related_keywords=true`,
    "GET",
  );
  if (!r.ok) return `✗ Pesquisa falhou: ${r.erro}`;

  // deno-lint-ignore no-explicit-any
  const dados: any = r.dados ?? {};
  const resultados = Array.isArray(dados.results) ? dados.results : [];
  if (resultados.length === 0) return `Pesquisa "${consulta}" não retornou resultados.`;

  // deno-lint-ignore no-explicit-any
  const linhas = resultados.slice(0, limite).map((item: any, i: number) =>
    `${i + 1}. ${item.title ?? "(sem título)"}\n   ${item.url ?? ""}\n   ${item.description ?? ""}`
  );
  const relacionadas = Array.isArray(dados.related_keywords?.keywords)
    // deno-lint-ignore no-explicit-any
    ? dados.related_keywords.keywords.slice(0, 5).map((k: any) => k.keyword ?? k).join(" · ")
    : "";
  return [
    `Resultados da pesquisa "${consulta}":`,
    ...linhas,
    relacionadas ? `Buscas relacionadas: ${relacionadas}` : "",
    "Combine com os dados internos e responda personalizado. Se for útil de verdade, ofereça salvar na base de conhecimento.",
  ].filter(Boolean).join("\n");
}

export async function handlerConsultarInstagram(
  args: Record<string, unknown>,
): Promise<string> {
  const username = String(args.username ?? "").trim().replace(/^@/, "");
  if (!username) return "✗ Informe o username do perfil (sem @).";
  const acao = String(args.acao ?? "perfil");
  const caminho = ACOES_INSTAGRAM[acao];
  if (!caminho) {
    return `✗ Ação '${acao}' indisponível. Use: ${Object.keys(ACOES_INSTAGRAM).join(", ")}.`;
  }

  const r = await chamarRapidApi(HOST_INSTAGRAM, caminho, "POST", { username });
  if (!r.ok) return `✗ Consulta ao Instagram falhou: ${r.erro}`;

  // Devolve o JSON cru compactado — a LLM extrai o que interessa. Corta pra
  // não estourar o contexto (perfis grandes trazem listas enormes).
  const texto = JSON.stringify(r.dados ?? {});
  const cortado = texto.length > 8000;
  return [
    `Dados públicos do Instagram @${username} (ação: ${acao})${cortado ? " — TRUNCADO" : ""}:`,
    cortado ? texto.slice(0, 8000) + "…" : texto,
    "Resuma só o que interessa pro objetivo do usuário. Se for útil de verdade, ofereça salvar na base de conhecimento.",
  ].join("\n");
}
