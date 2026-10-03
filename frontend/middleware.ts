// Middleware de marca (Vercel Routing Middleware, edge) — injeta o branding
// ativo no HTML servido pras rotas de página.
//
// Por quê: preview de link (WhatsApp, Telegram, iMessage…) lê o HTML cru sem
// rodar JS — o que estiver no `index.html` estático é o que aparece. Aqui o
// título, a meta description e as og:tags saem do servidor já com o nome
// configurado no Admin (tabela `branding_sistema`, linha ativa, leitura anônima).
//
// Falhou qualquer etapa → retorna undefined e o fluxo estático normal segue
// (rewrite SPA do vercel.json serve o index.html de fallback).

declare const process: { env: Record<string, string | undefined> };

type Marca = {
  nome_produto: string;
  logo_url: string | null;
  mensagem_login_titulo: string | null;
  mensagem_login_sub: string | null;
};

const TTL_MARCA_MS = 60_000;
// Incidente 2026-08-25 (504 MIDDLEWARE_INVOCATION_TIMEOUT): os fetches não
// tinham timeout — qualquer engasgo de rede na edge segurava a resposta até a
// Vercel matar a função aos 25s, derrubando o site INTEIRO. Regra nova: cada
// fetch tem 3s pra responder; estourou/falhou → fluxo estático normal
// (fail-open). Branding é cosmético, nunca pode custar disponibilidade.
const TIMEOUT_FETCH_MS = 3_000;

let cacheMarca: { valor: Marca | null; em: number } = { valor: null, em: 0 };
let cacheHtml: string | null = null; // index.html é imutável por deploy

// Preview de link da rifa pública (/rifa/:chave): WhatsApp mostra título,
// prêmio, preço e a capa da rifa em vez do "babel-os" genérico.
type PreviewRifa = { titulo: string; descricao: string; imagem: string | null };
const TTL_RIFA_MS = 60_000;
const MAX_CACHE_RIFA = 200;
const cacheRifa = new Map<string, { valor: PreviewRifa | null; em: number }>();
const RE_ROTA_RIFA = /^\/rifa\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

// A env de produção já veio com "\n" no fim (achado 2026-09-12) — trim defensivo.
const envSupabase = () => ({
  url: process.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, ""),
  chave: (process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY)?.trim(),
});

async function fetchComTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_FETCH_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function buscarMarca(): Promise<Marca | null> {
  const agora = Date.now();
  if (cacheMarca.valor && agora - cacheMarca.em < TTL_MARCA_MS) {
    return cacheMarca.valor;
  }
  const { url, chave } = envSupabase();
  if (!url || !chave) return cacheMarca.valor;
  const res = await fetchComTimeout(
    `${url}/rest/v1/branding_sistema?ativo=eq.true&select=nome_produto,logo_url,mensagem_login_titulo,mensagem_login_sub&limit=1`,
    { headers: { apikey: chave } },
  );
  if (!res.ok) return cacheMarca.valor;
  const linhas = (await res.json()) as Marca[];
  const marca = linhas?.[0] ?? null;
  if (marca?.nome_produto) {
    cacheMarca = { valor: marca, em: agora };
    return marca;
  }
  return cacheMarca.valor;
}

const fmtReais = (centavos: number) =>
  `R$ ${(centavos / 100).toFixed(2).replace(".", ",").replace(/,00$/, "")}`;

const ehImagem = (u: unknown): u is string =>
  typeof u === "string" && u.startsWith("http") && !/\.(mp4|mov|webm|m4v)(\?|$)/i.test(u);

async function buscarPreviewRifa(chaveRifa: string): Promise<PreviewRifa | null> {
  const agora = Date.now();
  const emCache = cacheRifa.get(chaveRifa);
  if (emCache && agora - emCache.em < TTL_RIFA_MS) return emCache.valor;
  const { url, chave } = envSupabase();
  if (!url || !chave) return null;
  const res = await fetchComTimeout(`${url}/rest/v1/rpc/obter_rifa_por_token`, {
    method: "POST",
    headers: { apikey: chave, "content-type": "application/json" },
    body: JSON.stringify({ p_token: chaveRifa }),
  });
  if (!res.ok) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dados = (await res.json()) as any;
  let valor: PreviewRifa | null = null;
  const r = dados?.ok ? dados.rifa : null;
  if (r?.titulo) {
    const partes: string[] = [];
    if (r.premio_principal) partes.push(`Prêmio: ${r.premio_principal}`);
    if (r.status === "sorteada") {
      partes.push("Sorteio realizado — veja o resultado");
    } else {
      if (typeof r.preco_numero_centavos === "number") partes.push(`${fmtReais(r.preco_numero_centavos)} por número`);
      const disp = dados?.progresso?.disponiveis;
      if (typeof disp === "number" && disp > 0) partes.push(`${disp} números disponíveis`);
    }
    const imagem =
      [r.imagem_url, ...(Array.isArray(r.galeria_urls) ? r.galeria_urls : []), dados?.branding?.banner_url, dados?.branding?.logo_url]
        .find(ehImagem) ?? null;
    valor = { titulo: String(r.titulo), descricao: partes.join(" · "), imagem };
  }
  if (cacheRifa.size >= MAX_CACHE_RIFA) cacheRifa.clear();
  cacheRifa.set(chaveRifa, { valor, em: agora });
  return valor;
}

async function buscarIndexHtml(origem: string): Promise<string | null> {
  if (cacheHtml) return cacheHtml;
  // `/index.html` tem ponto no path → fora do matcher → serve estático direto.
  // O header `x-babel-mw` é cinto extra: se por qualquer motivo essa request
  // voltar pro middleware, ela é liberada na entrada (anti-recursão).
  const res = await fetchComTimeout(`${origem}/index.html`, {
    headers: { "x-babel-mw": "1" },
  });
  if (!res.ok) return null;
  const html = await res.text();
  if (html.includes("<title>")) cacheHtml = html;
  return html;
}

function injetarMarca(
  html: string,
  marca: Marca | null,
  urlPagina: string,
  rifa: PreviewRifa | null = null,
): string {
  const nomeMarca = escaparHtml(marca?.nome_produto || "babel-os");
  const nome = rifa ? escaparHtml(rifa.titulo) : nomeMarca;
  const descricao = escaparHtml(
    (rifa?.descricao ||
      [marca?.mensagem_login_titulo, marca?.mensagem_login_sub]
        .filter(Boolean)
        .join(" ")) || "Sistema operacional web para gestão de agentes de IA",
  );
  const imagem = rifa ? rifa.imagem : marca?.logo_url?.startsWith("http") ? marca.logo_url : null;
  const og = [
    `<meta property="og:title" content="${nome}" />`,
    `<meta property="og:site_name" content="${nomeMarca}" />`,
    `<meta property="og:description" content="${descricao}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${escaparHtml(urlPagina)}" />`,
  ];
  if (imagem) {
    og.push(`<meta property="og:image" content="${escaparHtml(imagem)}" />`);
    if (rifa) og.push(`<meta name="twitter:card" content="summary_large_image" />`);
  }
  // O index.html estático já traz og:* genéricas — tira antes de injetar as
  // novas, senão o crawler pega a primeira (a genérica).
  const semOgAntigas = html.replace(/\s*<meta\s+property="og:[^"]*"[^>]*>/g, "");
  return semOgAntigas
    .replace(/<title>[^<]*<\/title>/, `<title>${nome}</title>`)
    .replace(
      /<meta name="description" content="[^"]*"\s*\/>/,
      `<meta name="description" content="${descricao}" />`,
    )
    .replace("</head>", `    ${og.join("\n    ")}\n  </head>`);
}

export default async function middleware(req: Request): Promise<Response | undefined> {
  try {
    // Anti-recursão: request interna do próprio middleware → estático direto.
    if (req.headers.get("x-babel-mw")) return undefined;
    const url = new URL(req.url);
    const t0 = Date.now();
    let tMarca = 0;
    let tHtml = 0;
    let tRifa = 0;
    const chaveRifa = RE_ROTA_RIFA.exec(url.pathname)?.[1] ?? null;
    const [marca, htmlBase, rifa] = await Promise.all([
      buscarMarca().then((r) => { tMarca = Date.now() - t0; return r; }),
      buscarIndexHtml(url.origin).then((r) => { tHtml = Date.now() - t0; return r; }),
      chaveRifa
        ? buscarPreviewRifa(chaveRifa)
            .catch(() => null) // preview da rifa é cosmético — falhou, cai na marca
            .then((r) => { tRifa = Date.now() - t0; return r; })
        : Promise.resolve(null),
    ]);
    if ((!marca?.nome_produto && !rifa) || !htmlBase) return undefined;
    return new Response(injetarMarca(htmlBase, marca, url.href, rifa), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=0, must-revalidate",
        // diagnóstico do 504 de 2026-08-25 — quanto custou cada fetch interno
        "server-timing": `marca;dur=${tMarca}, html;dur=${tHtml}${chaveRifa ? `, rifa;dur=${tRifa}` : ""}`,
      },
    });
  } catch {
    return undefined; // qualquer erro → fluxo estático normal
  }
}

export const config = {
  // Só rotas de página: exclui api, assets e qualquer path com ponto (arquivos).
  matcher: ["/((?!api|assets|.*\\..*).*)"],
};
