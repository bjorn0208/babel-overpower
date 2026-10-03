// Edge Function: dossiê de prospecção — levanta tudo que é público sobre a
// empresa e organiza PARA QUEM VAI LIGAR, em 5 blocos: quem é · como atendem
// hoje · reputação · presença digital · gancho da ligação.
//
// Fontes: Google Maps (nota, avaliações, fotos) · pesquisa Google (perfil do
// Instagram, sócios, Reclame Aqui, JusBrasil) · posts do Instagram · Casa dos
// Dados (CNPJ) · leitura do site do lead (detecta WhatsApp e sistema atual).
// Trava anti-invenção: campo factual sem citação literal nos dados é descartado.
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

// Dois provedores de busca com o MESMO formato de resposta (results[]):
// o 116 tem cota gratuita 10× maior, então vai primeiro; o 74 é a reserva.
const HOST_PESQUISA = "google-search116.p.rapidapi.com";
const HOST_PESQUISA_2 = "google-search74.p.rapidapi.com";
const HOST_INSTAGRAM = "instagram120.p.rapidapi.com";
const HOST_MAPS = "google-map-places-new-v2.p.rapidapi.com";
// maps-data pagina as avaliações (o Places oficial só entrega 5): é dela que
// saem as 5 MELHORES e as 5 PIORES de verdade.
const HOST_MAPSDATA = "maps-data.p.rapidapi.com";
// Perfil do Instagram com contador exato (o instagram120 não expõe seguidores)
const HOST_IGPERFIL = "instagram-scraper-stable-api.p.rapidapi.com";

// Sistemas de terceiros que aparecem no HTML de quem já usa alguma ferramenta.
// Serve para o mentor saber COM O QUE a Babel vai concorrer/integrar.
const SISTEMAS = [
  ["wa.me", "WhatsApp (link direto)"], ["api.whatsapp.com", "WhatsApp (link direto)"],
  ["web.whatsapp.com", "WhatsApp"], ["doctoralia", "Doctoralia"], ["boaconsulta", "BoaConsulta"],
  ["zenklub", "Zenklub"], ["calendly", "Calendly"], ["agendor", "Agendor"],
  ["rdstation", "RD Station"], ["hubspot", "HubSpot"], ["pipedrive", "Pipedrive"],
  ["zendesk", "Zendesk"], ["jivochat", "JivoChat"], ["tawk.to", "Tawk.to"],
  ["blip.ai", "Blip"], ["take.net", "Take Blip"], ["zenvia", "Zenvia"],
  ["ifood", "iFood"], ["goomer", "Goomer"], ["anota.ai", "Anota AI"],
  ["cardapioweb", "Cardápio Web"], ["sympla", "Sympla"], ["shopify", "Shopify"],
  ["vtex", "VTEX"], ["woocommerce", "WooCommerce"], ["wix", "Wix"],
  ["mercadolivre", "Mercado Livre"], ["booking.com", "Booking"], ["omnibees", "Omnibees"],
  ["hsystem", "HSystem"], ["tuotempo", "TuoTempo"], ["shosp", "Shosp"],
  ["feegow", "Feegow"], ["iclinic", "iClinic"], ["amplimed", "Amplimed"],
  ["ninsaude", "Ninsaúde"], ["clinicorp", "Clinicorp"], ["dentaloffice", "Dental Office"],
  ["typebot", "Typebot"], ["manychat", "ManyChat"], ["botconversa", "BotConversa"],
];

async function comTempo(promessa: Promise<Response>, ms: number) {
  const ctl = setTimeout(() => {}, 0);
  clearTimeout(ctl);
  return await Promise.race([
    promessa,
    new Promise<Response>((_, rej) => setTimeout(() => rej(new Error("tempo esgotado")), ms)),
  ]);
}

async function rapid(
  host: string, caminho: string, chave: string,
  metodo = "GET", corpo?: unknown, extra?: Record<string, string>,
) {
  try {
    const r = await comTempo(fetch(`https://${host}${caminho}`, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        "x-rapidapi-host": host, "x-rapidapi-key": chave, ...(extra ?? {}),
      },
      body: metodo === "POST" ? JSON.stringify(corpo ?? {}) : undefined,
    }), 20000);
    const txt = await r.text();
    if (!r.ok) return { ok: false, erro: `${r.status}`, dados: undefined as unknown };
    try {
      return { ok: true, dados: JSON.parse(txt) as unknown, erro: "" };
    } catch {
      return { ok: true, dados: txt as unknown, erro: "" };
    }
  } catch (e) {
    return { ok: false, erro: (e as Error).message.slice(0, 60), dados: undefined as unknown };
  }
}

type Resultado = { title?: string; url?: string; description?: string };

function listaDe(dados: unknown): Resultado[] {
  const r = (dados as { results?: unknown })?.results;
  return Array.isArray(r) ? r as Resultado[] : [];
}

function emTexto(dados: unknown, max = 5): string {
  return listaDe(dados).slice(0, max)
    .map((r) => `${r.title ?? ""}\n${r.url ?? ""}\n${r.description ?? ""}`)
    .join("\n---\n");
}

function acharInstagram(texto: string): string | null {
  const proibidos = new Set(["p", "reel", "reels", "explore", "stories", "accounts", "tv"]);
  for (const m of texto.matchAll(/instagram\.com\/([A-Za-z0-9_.]{2,30})/g)) {
    const user = m[1].replace(/\.$/, "");
    if (!proibidos.has(user.toLowerCase())) return user;
  }
  return null;
}

// Varre as avaliações do Google paginando pelo cursor e separa as melhores
// e as piores. Sem isso só se enxerga a "vitrine" das 5 mais relevantes.
async function avaliacoesExtremas(nome: string, cidade: string, chave: string, paginas = 3) {
  const busca = await rapid(
    HOST_MAPSDATA,
    `/searchmaps.php?query=${encodeURIComponent(`${nome} ${cidade}`)}&country=br&lang=pt&limit=1`,
    chave,
  );
  const primeiro = ((busca.dados as { data?: Record<string, string>[] })?.data ?? [])[0];
  const bid = primeiro?.business_id;
  if (!bid) return { melhores: [], piores: [], total: 0 };

  // owner_answer às vezes vem como objeto {text}, às vezes string — normalizado no fmt
  type Aval = { review_rate?: number; review_text?: string; iso_date?: string; owner_answer?: unknown; review_cursor?: string };
  const todas: Aval[] = [];
  let cursor = "";
  for (let i = 0; i < paginas; i++) {
    const r = await rapid(
      HOST_MAPSDATA,
      `/reviews.php?business_id=${encodeURIComponent(bid)}&country=br&lang=pt` +
        (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""),
      chave,
    );
    const lista = ((r.dados as { data?: { reviews?: Aval[] } })?.data?.reviews) ?? [];
    if (lista.length === 0) break;
    todas.push(...lista);
    const proximo = lista[lista.length - 1]?.review_cursor;
    if (!proximo || proximo === cursor) break;
    cursor = proximo;
  }

  const comTexto = todas.filter((r) => String(r.review_text ?? "").trim().length > 15);
  // o fornecedor manda owner_answer ora como string, ora como objeto/array —
  // texto() aceita qualquer forma sem derrubar o levantamento inteiro
  const texto = (v: unknown): string => {
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v.map(texto).filter(Boolean).join(" ");
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      return texto(o.text ?? o.answer ?? o.owner_answer ?? "");
    }
    return "";
  };
  const fmt = (r: Aval) => {
    const resp = texto(r.owner_answer);
    return `★${r.review_rate ?? "?"} (${texto(r.iso_date).slice(0, 10)}) "${texto(r.review_text).slice(0, 320)}"` +
      (resp ? ` [resposta da empresa: "${resp.slice(0, 120)}"]` : "");
  };
  const ordenadas = [...comTexto].sort((a, b) => (a.review_rate ?? 0) - (b.review_rate ?? 0));
  return {
    piores: ordenadas.filter((r) => (r.review_rate ?? 5) <= 3).slice(0, 5).map(fmt),
    melhores: ordenadas.filter((r) => (r.review_rate ?? 0) >= 4).slice(-5).reverse().map(fmt),
    total: todas.length,
  };
}

// HTML do site → texto limpo + sistemas detectados no código-fonte
async function lerSite(url: string) {
  try {
    const r = await comTempo(fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BabelBot/1.0)" },
      redirect: "follow",
    }), 15000);
    if (!r.ok) return { texto: "", sistemas: [] as string[], redes: "" };
    const html = (await r.text()).slice(0, 400000);
    const baixo = html.toLowerCase();
    const achados = new Set<string>();
    for (const [marca, nome] of SISTEMAS) if (baixo.includes(marca)) achados.add(nome);
    // links de redes ficam nos href — some ao limpar as tags, então guardo antes
    const redes = [...new Set(
      [...html.matchAll(/(?:instagram|facebook)\.com\/[A-Za-z0-9_.\/-]{2,40}/gi)].map((m) => m[0]),
    )].slice(0, 8).join(" ");
    const texto = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 3500);
    return { texto, sistemas: [...achados], redes };
  } catch {
    return { texto: "", sistemas: [] as string[], redes: "" };
  }
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

  const { lead_id } = await req.json().catch(() => ({}));
  if (!lead_id) return json({ erro: "informe lead_id" }, 400);

  const { data: lead } = await admin
    .from("leads")
    .select("id, empresa, cidade, estado, nicho, telefone, site, avaliacao, num_avaliacoes, endereco, dossie, maps_place_id, foto_url")
    .eq("id", lead_id).single();
  if (!lead) return json({ erro: "lead não encontrado" }, 404);

  const { data: chaves } = await admin
    .from("chaves_api").select("provedor, chave")
    .in("provedor", ["rapidapi", "rapidapi_maps", "openrouter", "dados_empresa"])
    .eq("ativa", true)
    .or(`esgotada_ate.is.null,esgotada_ate.lt.${new Date().toISOString()}`);
  const chaveDe = (p: string) => chaves?.find((c) => c.provedor === p)?.chave;
  const chaveRapid = chaveDe("rapidapi") || chaveDe("rapidapi_maps");
  const chaveLlm = chaveDe("openrouter");
  if (!chaveLlm) return json({ erro: "cadastre a chave OpenRouter em Gestão → Chaves" }, 409);
  if (!chaveRapid) return json({ erro: "cadastre uma chave RapidAPI em Gestão → Chaves" }, 409);

  const avisos: string[] = [];
  const onde = [lead.cidade, lead.estado].filter(Boolean).join(" ");
  const nomeLimpo = String(lead.empresa).split(/\s+[-–|]\s+/)[0].trim();
  // o provedor de busca limita chamadas por segundo — 429 vira uma nova
  // tentativa depois de um respiro, senão a rodada inteira volta vazia
  // tenta o provedor principal; se a cota estourar (429), cai no reserva —
  // sem isso, cota esgotada zerava Instagram, CNPJ e Reclame Aqui do dossiê
  const buscar = async (q: string, limite = 5) => {
    const caminho = `/?query=${encodeURIComponent(q)}&limit=${limite}`;
    for (const host of [HOST_PESQUISA, HOST_PESQUISA_2]) {
      for (let t = 0; t < 2; t++) {
        const r = await rapid(host, caminho, chaveRapid!);
        if (r.ok) return r;
        if (!/429|503/.test(r.erro)) break;
        await new Promise((ok) => setTimeout(ok, 900));
      }
    }
    return { ok: false, erro: "cota de busca esgotada nos dois provedores", dados: undefined as unknown };
  };

  // ── RODADA 1 — buscas EM SÉRIE (o provedor limita por segundo; em paralelo
  // as 5 batiam 429 e o dossiê voltava sem Instagram, CNPJ nem Reclame Aqui)
  // + Maps, site e AVALIAÇÕES em paralelo, que são de outros provedores.
  // As avaliações rodavam depois e sozinhas custavam ~15s do total (74s → 55s).
  const [buscas, detalhes, site, extremas] = await Promise.all([
    (async () => {
      const saida = [];
      for (const q of [
        `"${nomeLimpo}" ${onde} instagram`,
        `"${nomeLimpo}" ${onde} CNPJ`,
        `"${nomeLimpo}" ${onde} sócios quadro societário CNPJ`,
        `site:reclameaqui.com.br "${nomeLimpo}"`,
        `site:jusbrasil.com.br "${nomeLimpo}" ${onde}`,
      ]) {
        saida.push(await buscar(q, 5));
        await new Promise((ok) => setTimeout(ok, 350));
      }
      return saida;
    })(),
    lead.maps_place_id
      ? rapid(HOST_MAPS, `/v1/places/${lead.maps_place_id}`, chaveRapid!, "GET", undefined,
        { "X-Goog-FieldMask": "rating,userRatingCount,reviews,photos,websiteUri,googleMapsUri" })
      : Promise.resolve({ ok: false, erro: "lead sem place_id", dados: undefined as unknown }),
    lead.site ? lerSite(lead.site) : Promise.resolve({ texto: "", sistemas: [] as string[], redes: "" }),
    avaliacoesExtremas(nomeLimpo, onde, chaveRapid!),
  ]);
  const [pGeral, pCnpj, pSocios, pReclame, pJus] = buscas;
  if (!pGeral.ok) avisos.push(`pesquisa: ${pGeral.erro}`);

  const textoPesquisa = [emTexto(pGeral.dados), emTexto(pCnpj.dados)].filter(Boolean).join("\n---\n");
  const textoSocios = emTexto(pSocios.dados, 4);
  const textoReclame = emTexto(pReclame.dados, 4);
  const textoJus = emTexto(pJus.dados, 4);

  // avaliações do Google (a API entrega as 5 mais relevantes) + fotos
  let textoReviews = "";
  let fotos: string[] = [];
  if (detalhes.ok) {
    const d = detalhes.dados as Record<string, unknown>;
    const reviews = Array.isArray(d.reviews) ? d.reviews as Record<string, unknown>[] : [];
    textoReviews = reviews.slice(0, 5).map((r) => {
      const t = ((r.text as Record<string, string>)?.text ?? "").slice(0, 400);
      return `★${r.rating} — "${t}"`;
    }).join("\n");
    const nomes = ((d.photos as Record<string, string>[]) ?? []).slice(0, 4)
      .map((f) => f.name).filter(Boolean);
    fotos = (await Promise.all(nomes.map(async (nome) => {
      const m = await rapid(HOST_MAPS, `/v1/${nome}/media?maxWidthPx=640&skipHttpRedirect=true`, chaveRapid!);
      return m.ok ? ((m.dados as Record<string, string>).photoUri ?? null) : null;
    }))).filter(Boolean) as string[];
    if (fotos.length && !lead.foto_url) {
      await admin.from("leads").update({ foto_url: fotos[0] }).eq("id", lead.id);
    }
  } else if (lead.maps_place_id) {
    avisos.push(`Maps: ${detalhes.erro}`);
  }

  // ── RODADA 2 — depende do @ descoberto: perfil (snippet) + posts ────────
  // o @ pode vir da busca, dos links do site ou do que já sabíamos do lead —
  // se a busca falhar, o levantamento do perfil não pode parar junto
  const arrobaSalvo = String((lead.dossie as Record<string, string> | null)?.instagram ?? "")
    .replace(/^@/, "").trim();
  const arroba = acharInstagram([textoPesquisa, site.redes, site.texto].filter(Boolean).join(" "))
    ?? (arrobaSalvo || null);
  let textoPerfilIg = "";
  let textoInsta = "";
  if (arroba) {
    // Seguidores: o fornecedor do Instagram não expõe o contador (o /profile
    // dele está quebrado). Esta busca traz o dado no snippet, no formato
    // "41.3K followers. 9,272 following" — validado em 03/08. A busca do
    // perfil simples traz a bio. Picuki entra como reserva se faltar contador.
    // 1ª fonte: perfil oficial (contador exato, bio, categoria, link da bio)
    let perfilOk = false;
    try {
      const r = await comTempo(fetch(`https://${HOST_IGPERFIL}/ig_get_fb_profile.php`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "x-rapidapi-host": HOST_IGPERFIL, "x-rapidapi-key": chaveRapid!,
        },
        body: new URLSearchParams({ username_or_url: arroba }).toString(),
      }), 20000);
      if (!r.ok) avisos.push(`perfil IG: HTTP ${r.status}`);
      if (r.ok) {
        const p = await r.json().catch(() => null) as Record<string, unknown> | null;
        if (!p?.username) avisos.push(`perfil IG: resposta sem username (${JSON.stringify(p ?? {}).slice(0, 80)})`);
        if (p?.username) {
          perfilOk = true;
          textoPerfilIg = [
            `Perfil @${p.username} (${p.full_name ?? ""})`,
            `${p.follower_count ?? "?"} followers · ${p.following_count ?? "?"} following · ${p.media_count ?? "?"} posts`,
            p.biography ? `bio: ${p.biography}` : "",
            p.external_url ? `link da bio: ${p.external_url}` : "",
            p.category ? `categoria: ${p.category}` : "",
            p.is_business ? "conta comercial" : "",
            p.public_email ? `email público: ${p.public_email}` : "",
            p.public_phone_number ? `telefone público: ${p.public_phone_number}` : "",
          ].filter(Boolean).join("\n");
        }
      }
    } catch (e) {
      avisos.push(`perfil IG falhou: ${(e as Error).message.slice(0, 60)}`);
    }

    const vazio = { ok: true, dados: undefined as unknown, erro: "" };
    const ig = await rapid(HOST_INSTAGRAM, "/api/instagram/posts", chaveRapid!, "POST", { username: arroba });
    const pPerfil = perfilOk ? vazio : await buscar(`instagram.com/${arroba}`, 4);
    if (!perfilOk) await new Promise((ok) => setTimeout(ok, 350));
    const pSeguidores = perfilOk ? vazio : await buscar(`"${arroba}" instagram followers statistics`, 5);
    const doPerfil = (dados: unknown, exigirPerfil = true) =>
      listaDe(dados)
        .filter((r) => !exigirPerfil ||
          (r.url ?? "").toLowerCase().includes(`instagram.com/${arroba.toLowerCase()}`) ||
          /\d[\d.,]*\s*[KMk]?\s*followers/i.test(r.description ?? ""))
        .slice(0, 3)
        .map((r) => `${r.title ?? ""} — ${r.description ?? ""}`);
    // reservas (só quando o perfil oficial falhou): snippet de busca e Picuki
    if (!perfilOk) {
      textoPerfilIg = [...doPerfil(pPerfil.dados), ...doPerfil(pSeguidores.dados)]
        .filter((v, i, a) => a.indexOf(v) === i)
        .join("\n");
    }
    if (!perfilOk && !/[\d.,]\s*[KMkm]?\s*(followers|seguidores)/i.test(textoPerfilIg)) {
      try {
        const r = await comTempo(fetch(`https://www.picuki.com/profile/${arroba}`, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          },
        }), 15000);
        let achou = false;
        if (r.ok) {
          const html = await r.text();
          // a página lista "N Followers" e "N Following" — pega o de followers
          const m = html.match(/>\s*([\d.,]+\s*[KMkm]?)\s*Followers\s*</) ||
            html.match(/([\d.,]+\s*[KMkm]?)\s*Followers/);
          if (m) {
            textoPerfilIg += `\nPerfil @${arroba}: ${m[1].trim()} followers (fonte Picuki)`;
            achou = true;
          }
        }
        if (!achou) {
          avisos.push(`seguidores de @${arroba} indisponíveis (perfil não coberto pelas fontes públicas)`);
        }
      } catch {
        avisos.push(`seguidores de @${arroba} indisponíveis`);
      }
    }
    if (ig.ok) {
      const edges = ((ig.dados as Record<string, unknown>).result as Record<string, unknown>)?.edges;
      const posts = Array.isArray(edges) ? edges as Record<string, Record<string, unknown>>[] : [];
      textoInsta = posts.slice(0, 8).map((e) => {
        const n = e.node ?? {};
        const legenda = ((n.caption as Record<string, string>)?.text ?? "")
          .slice(0, 200).replace(/\s+/g, " ");
        const quando = n.taken_at
          ? new Date(Number(n.taken_at) * 1000).toLocaleDateString("pt-BR") : "?";
        return `[${quando}] ❤${n.like_count ?? 0} 💬${n.comment_count ?? 0} — "${legenda}"`;
      }).join("\n");
    } else {
      avisos.push(`posts do Instagram: ${ig.erro}`);
    }
  }

  // ── Casa dos Dados (CNPJ) ───────────────────────────────────────────────
  let textoEmpresa = "";
  const chaveCdd = chaveDe("dados_empresa");
  if (chaveCdd) {
    const cnpjAchado = (textoPesquisa.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/) || [])[0]
      ?.replace(/\D/g, "");
    const semAcento = (s: string) =>
      s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    const corpoCdd: Record<string, unknown> = cnpjAchado
      ? { cnpj: [cnpjAchado], limite: 1, pagina: 1 }
      : {
        busca_textual: [{
          texto: [nomeLimpo], tipo_busca: "radical",
          razao_social: true, nome_fantasia: true, nome_socio: false,
        }],
        ...(lead.estado ? { uf: [semAcento(String(lead.estado))] } : {}),
        ...(lead.cidade ? { municipio: [semAcento(String(lead.cidade))] } : {}),
        limite: 3, pagina: 1,
      };
    try {
      const r = await comTempo(fetch("https://api.casadosdados.com.br/v5/cnpj/pesquisa", {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": chaveCdd },
        body: JSON.stringify(corpoCdd),
      }), 20000);
      const j = await r.json().catch(() => null);
      if (r.ok && j?.total > 0) textoEmpresa = JSON.stringify(j.cnpjs).slice(0, 4000);
      else if (r.ok) avisos.push("Casa dos Dados: empresa não encontrada");
      else avisos.push(`Casa dos Dados: ${r.status}`);
    } catch {
      avisos.push("Casa dos Dados: sem resposta");
    }
  }

  // ── Receita Federal via BrasilAPI (quadro societário) ───────────────────
  // Gratuita e sem chave. É a única fonte que devolve o QSA — quem assina pela
  // empresa. Saber o nome do sócio antes de ligar muda a conversa: em vez de
  // "posso falar com o responsável?", o mentor pede a pessoa pelo nome.
  const oficial: Record<string, string> = {};
  const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
  const cnpjLead = [
    soDigitos((lead.dossie as Record<string, unknown>)?.cnpj),
    soDigitos((textoPesquisa.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/) || [])[0]),
    soDigitos((textoEmpresa.match(/"cnpj"\s*:\s*"?(\d{14})/) || [])[1]),
  ].find((c) => c.length === 14);

  if (cnpjLead) {
    // Três fontes públicas da mesma base da Receita, cada uma com formato e
    // limite próprios. Todas são gratuitas e todas estouram cota com facilidade
    // (o IP das Edge Functions é compartilhado), então tentamos em cadeia até
    // uma responder — é o que faz o quadro societário aparecer na prática.
    const dinheiro = (v: unknown) => {
      const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
      return n > 0
        ? n.toLocaleString("pt-BR", {
          style: "currency", currency: "BRL", maximumFractionDigits: 0,
        })
        : "";
    };
    const comIdade = (dia: string, mes: string, ano: string) => {
      const anos = new Date().getFullYear() - Number(ano);
      return `${dia}/${mes}/${ano}${anos > 0 ? ` (${anos} anos de casa)` : ""}`;
    };
    // até 6 nomes: além disso vira parede de texto no meio da ligação
    const juntarSocios = (nomes: string[]) => {
      const bons = nomes.filter((n) => n && !n.startsWith("undefined"));
      return bons.length
        ? bons.slice(0, 6).join(" · ") + (bons.length > 6 ? ` · +${bons.length - 6}` : "")
        : "";
    };

    // deno-lint-ignore no-explicit-any
    type Fonte = { nome: string; url: string; ler: (e: any) => Record<string, string> | null };
    const FONTES: Fonte[] = [
      {
        nome: "BrasilAPI",
        url: `https://brasilapi.com.br/api/cnpj/v1/${cnpjLead}`,
        ler: (e) => {
          if (!e?.cnpj) return null;
          const [a, m, d] = String(e.data_inicio_atividade ?? "").split("-");
          return {
            socios: juntarSocios((e.qsa ?? []).map((s: Record<string, string>) =>
              `${s.nome_socio}${s.qualificacao_socio ? ` (${s.qualificacao_socio})` : ""}`)),
            razao_social: e.razao_social ?? "",
            situacao_cadastral: e.descricao_situacao_cadastral ?? "",
            porte: e.porte ?? "",
            capital_social: dinheiro(e.capital_social),
            data_abertura: a ? comIdade(d, m, a) : "",
            atividade: e.cnae_fiscal_descricao ?? "",
          };
        },
      },
      {
        nome: "CNPJá",
        url: `https://open.cnpja.com/office/${cnpjLead}`,
        ler: (e) => {
          if (!e?.company?.name) return null;
          const [a, m, d] = String(e.founded ?? "").split("-");
          return {
            // deno-lint-ignore no-explicit-any
            socios: juntarSocios((e.company.members ?? []).map((s: any) =>
              `${s.person?.name}${s.role?.text ? ` (${s.role.text})` : ""}`)),
            razao_social: e.company.name ?? "",
            situacao_cadastral: e.status?.text ?? "",
            porte: e.company.size?.text ?? "",
            capital_social: dinheiro(e.company.equity),
            data_abertura: a ? comIdade(d, m, a) : "",
            atividade: e.mainActivity?.text ?? "",
          };
        },
      },
      {
        nome: "ReceitaWS",
        url: `https://receitaws.com.br/v1/cnpj/${cnpjLead}`,
        ler: (e) => {
          if (e?.status !== "OK") return null;
          const [d, m, a] = String(e.abertura ?? "").split("/");
          return {
            // aqui a qualificação vem como "49-Sócio-Administrador"
            socios: juntarSocios((e.qsa ?? []).map((s: Record<string, string>) =>
              `${s.nome}${s.qual ? ` (${String(s.qual).replace(/^\d+-/, "")})` : ""}`)),
            razao_social: e.nome ?? "",
            situacao_cadastral: e.situacao ?? "",
            porte: e.porte ?? "",
            capital_social: dinheiro(e.capital_social),
            data_abertura: a ? comIdade(d, m, a) : "",
            atividade: (e.atividade_principal ?? [{}])[0]?.text ?? "",
          };
        },
      },
    ];

    const falhas: string[] = [];
    for (const fonte of FONTES) {
      try {
        const r = await comTempo(fetch(fonte.url), 15000);
        const corpo = await r.json().catch(() => null);
        const lido = r.ok ? fonte.ler(corpo) : null;
        if (lido) {
          for (const [k, v] of Object.entries(lido)) if (v) oficial[k] = v;
          oficial.cnpj = cnpjLead.replace(
            /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
            "$1.$2.$3/$4-$5",
          );
          break;
        }
        falhas.push(`${fonte.nome} ${r.status}`);
      } catch {
        falhas.push(`${fonte.nome} sem resposta`);
      }
    }
    if (!oficial.cnpj) avisos.push(`Receita indisponível (${falhas.join(", ")})`);
  }

  const mapsUri = detalhes.ok
    ? ((detalhes.dados as Record<string, string>).googleMapsUri ?? "") : "";
  const siteMaps = detalhes.ok
    ? ((detalhes.dados as Record<string, string>).websiteUri ?? "") : "";

  const blob = [
    "DADOS DO GOOGLE MAPS (fonte confiável):",
    `empresa: ${lead.empresa} · cidade: ${onde} · nicho: ${lead.nicho ?? "?"}`,
    `telefone: ${lead.telefone ?? "?"} · endereço: ${lead.endereco ?? "?"}`,
    `site cadastrado no Google: ${siteMaps || lead.site || "NÃO TEM"}`,
    `ficha no Google Meu Negócio: ${mapsUri || "não confirmada"}`,
    `nota: ${lead.avaliacao ?? "?"} (${lead.num_avaliacoes ?? 0} avaliações)`,
    site.sistemas.length
      ? `\nFERRAMENTAS DETECTADAS NO CÓDIGO DO SITE: ${site.sistemas.join(", ")}`
      : (lead.site ? "\nFERRAMENTAS DETECTADAS NO SITE: nenhuma conhecida" : ""),
    site.texto ? `\nTEXTO DO SITE:\n${site.texto}` : "",
    textoPerfilIg ? `\nPERFIL DO INSTAGRAM (busca):\n${textoPerfilIg}` : "",
    textoInsta ? `\nPOSTS RECENTES DO INSTAGRAM (@${arroba}):\n${textoInsta}` : "",
    extremas.melhores.length
      ? `\nMELHORES AVALIAÇÕES DO GOOGLE (de ${extremas.total} lidas):\n${extremas.melhores.join("\n")}`
      : (textoReviews ? `\nAVALIAÇÕES DO GOOGLE:\n${textoReviews}` : ""),
    extremas.piores.length
      ? `\nPIORES AVALIAÇÕES DO GOOGLE (nota 3 ou menos, de ${extremas.total} lidas):\n${extremas.piores.join("\n")}`
      : (extremas.total > 0 ? `\nPIORES AVALIAÇÕES: nenhuma nota ≤3 entre as ${extremas.total} lidas` : ""),
    textoEmpresa ? `\nCADASTRO OFICIAL (Casa dos Dados):\n${textoEmpresa}` : "",
    textoSocios ? `\nBUSCA POR SÓCIOS:\n${textoSocios}` : "",
    textoReclame ? `\nBUSCA NO RECLAME AQUI:\n${textoReclame}` : "",
    textoJus ? `\nBUSCA NO JUSBRASIL:\n${textoJus}` : "",
    textoPesquisa ? `\nOUTROS RESULTADOS DE PESQUISA:\n${textoPesquisa}` : "",
  ].filter(Boolean).join("\n");

  // ── IA organiza para quem vai ligar ─────────────────────────────────────
  const prompt = [
    "Você monta o dossiê de prospecção de uma empresa para o MENTOR que vai ligar",
    "oferecendo a Babel OS — um sistema operacional para empresas que automatiza",
    "os processos (atendimento por IA no WhatsApp, agenda, CRM, contratos, base de",
    "conhecimento própria da empresa).",
    "",
    "REGRAS DE FERRO:",
    "1. Só afirme o que está NOS DADOS abaixo. Não invente, não deduza além do texto.",
    "2. Todo campo factual precisa de `evidencia`: o trecho LITERAL (copiado",
    "   caractere por caractere) que comprova. Sem isso o campo é descartado.",
    "3. Campos de interpretação (isentos de evidência): presenca, posts_recentes,",
    "   como_atendem, diagnostico, gancho.",
    "4. Nada encontrado sobre um tema = null. NUNCA invente reclamação, processo",
    "   ou sócio. Se a busca no Reclame Aqui/JusBrasil não achou a empresa, null.",
    "5. socios: nomes de pessoas identificados como sócios/proprietários DESTA",
    "   empresa. Nomes de médicos ou funcionários citados no site NÃO são sócios.",
    "6. instagram_seguidores: no bloco do perfil vem \"41392 followers · 9304",
    "   following · 5013 posts\" (ou, na fonte de reserva, \"41.3K followers\").",
    "   Devolva só o número de FOLLOWERS, formatado em pt-BR (41392 → \"41.392\").",
    "   NÃO confunda com 'following' (seguindo) nem com likes de um post.",
    "7. link_bio: o \"link da bio\" do perfil — para onde o Instagram manda o",
    "   cliente (site próprio, portal de agendamento, WhatsApp). Diz muito",
    "   sobre o sistema que a empresa usa.",
    "",
    "Responda APENAS com JSON válido:",
    "{",
    ' "razao_social": null, "cnpj": null, "situacao_cadastral": null,',
    ' "socios": "nomes separados por vírgula ou null",',
    ' "instagram": "@user ou null", "instagram_seguidores": "ex: 12,3 mil ou null",',
    ' "instagram_bio": null, "link_bio": "url do link da bio ou null",',
    ' "site": null, "google_meu_negocio": "url ou null",',
    ' "canal_contato": "como o cliente fala com a empresa hoje (WhatsApp direto/',
    '   formulário/telefone/agendamento online) ou null",',
    ' "sistema_atual": "sistema de terceiros detectado (nome) ou \'parece próprio\'',
    '   ou \'nenhum detectado\'",',
    ' "como_atendem": "1-2 frases sobre como o atendimento funciona hoje",',
    ' "elogios": null, "reclamacoes": null, "reclame_aqui": "o que foi achado ou null",',
    ' "processos_judiciais": "o que foi achado no JusBrasil ou null",',
    ' "posts_recentes": null, "presenca": "1-2 frases",',
    ' "diagnostico": "2-3 frases: onde a Babel OS automatiza ESTA empresa",',
    ' "gancho": "1 frase pronta para o mentor abrir a ligação, citando algo real',
    '   e específico desta empresa",',
    ' "evidencia": {"razao_social": "...", "cnpj": "...", "situacao_cadastral": "...",',
    '   "socios": "...", "instagram": "...", "instagram_seguidores": "...",',
    '   "instagram_bio": "...", "site": "...", "google_meu_negocio": "...",',
    '   "canal_contato": "...", "sistema_atual": "...", "elogios": "...",',
    '   "reclamacoes": "...", "reclame_aqui": "...", "processos_judiciais": "..."}',
    "}",
    "",
    "DADOS COLETADOS:",
    blob.slice(0, 20000),
  ].join("\n");

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${chaveLlm}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });
  if (!resp.ok) return json({ erro: `LLM respondeu ${resp.status}`, avisos }, 502);
  const bruto = (await resp.json())?.choices?.[0]?.message?.content ?? "{}";
  let extraido: Record<string, unknown>;
  try {
    extraido = JSON.parse(bruto);
  } catch {
    return json({ erro: "LLM devolveu JSON inválido", avisos }, 502);
  }

  // Trava anti-invenção (espaços normalizados: quebra de linha não invalida)
  const evidencias = (extraido.evidencia ?? {}) as Record<string, string>;
  delete extraido.evidencia;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const blobBusca = norm(blob);
  const COM_PROVA = [
    "razao_social", "cnpj", "situacao_cadastral", "socios", "instagram",
    "instagram_seguidores", "instagram_bio", "link_bio", "site", "google_meu_negocio",
    "canal_contato", "sistema_atual", "elogios", "reclamacoes",
    "reclame_aqui", "processos_judiciais",
  ];
  for (const campo of COM_PROVA) {
    const valor = extraido[campo];
    if (valor == null || valor === "") continue;
    const prova = norm(String(evidencias[campo] ?? ""));
    if (prova.length < 3 || !blobBusca.includes(prova)) extraido[campo] = null;
  }
  if (!extraido.instagram) {
    extraido.instagram_seguidores = null;
    extraido.instagram_bio = null;
    extraido.posts_recentes = null;
  }

  // Determinísticos (sem IA)
  if (lead.avaliacao) {
    extraido.avaliacao_google = `★ ${lead.avaliacao} (${lead.num_avaliacoes ?? 0} avaliações)`;
  }
  if (site.sistemas.length) extraido.sistema_atual = site.sistemas.join(" · ");
  // as avaliações extremas são texto real do Google — vão cruas, sem IA
  if (extremas.piores.length) extraido.piores_avaliacoes = extremas.piores.join("\n\n");
  if (extremas.melhores.length) extraido.melhores_avaliacoes = extremas.melhores.join("\n\n");
  if (extremas.total) extraido.avaliacoes_lidas = `${extremas.total} avaliações lidas`;
  if (mapsUri) extraido.google_meu_negocio = mapsUri;
  if (fotos.length) extraido.fotos = fotos;
  // A Receita é fonte oficial: o que vem dela vale mais do que a IA deduziu do
  // que leu por aí. Por isso sobrescreve, e é o último a falar.
  Object.assign(extraido, oficial);
  extraido.dados_levantados_em = new Date().toISOString();

  for (const k of Object.keys(extraido)) {
    if (extraido[k] == null || extraido[k] === "") delete extraido[k];
  }

  const { data: dossie, error: erroMerge } = await admin
    .rpc("consolidar_dossie", { _lead_id: lead.id, _novo: extraido });
  if (erroMerge) return json({ erro: erroMerge.message, avisos }, 500);

  return json({ ok: true, dossie, foto_url: fotos[0] ?? lead.foto_url ?? null, avisos });
});
