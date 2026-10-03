// comercial-dossie — o raio-x da empresa, montado das fontes que existem de
// verdade. Cada uma foi testada antes de entrar aqui.
//
// O QUE ENTROU E POR QUÊ:
//   · Instagram (RapidAPI mediacrawlers) — perfil + feed. Do feed sai a
//     CADÊNCIA e o ENGAJAMENTO, que é onde mora o diagnóstico: a @popcashoficial
//     posta a cada 3 dias e tem 6 curtidas em 5.785 seguidores (0,11%). Publica
//     sem parar e ninguém responde — isso não aparece em número de seguidores.
//   · Receita (BrasilAPI) — grátis, sem chave: Simples, MEI, porte, CNAE, sócios.
//   · PGFN (tabela local pgfn_devedores) — a API ao vivo da PGFN exige
//     reCAPTCHA e não serve para servidor; a base aberta trimestral, sim.
//
// O QUE FICOU DE FORA, e não por esquecimento:
//   · Meta Ad Library — a API só devolve anúncio comercial para UE/Reino Unido.
//   · TikTok Commercial Content — só Europa, sem data para o Brasil.
//
// REGRA: campo sem fonte é null. Nada aqui é inferido pela IA.

import { createClient } from "jsr:@supabase/supabase-js@2";

const HOST_IG = "instagram-api-fast-reliable-data-scraper.p.rapidapi.com";
const HOST_BUSCA = "real-time-web-search.p.rapidapi.com";
const DIA = 86400;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// As mesmas palavras vazias da busca de foto: elas fazem qualquer resultado
// casar com qualquer empresa. "Cliente Numero 4" trouxe "Cartões Itaú" no
// Reclame Aqui porque nada no nome identificava ninguém.
const GENERICOS = new Set([
  "solucoes", "solucao", "financeira", "financeiras", "servicos", "servico",
  "ltda", "me", "eireli", "consultoria", "negocios", "empresa", "grupo",
  "cia", "sa", "emprestimo", "credito", "imoveis", "assessoria", "cliente",
  "numero", "de", "da", "do", "e", "comercio", "digital", "oficial",
]);

const palavras = (s: string) => {
  const limpo = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return (limpo.match(/[a-z0-9]+/g) ?? []).filter((x) => x.length > 1);
};

// Um achado só entra no dossiê se o nome da empresa aparecer nele — e por uma
// palavra que identifique de fato, não por "soluções" ou "crédito".
function bate(nomeEmpresa: string, texto: string): boolean {
  const chaves = palavras(nomeEmpresa).filter((x) => !GENERICOS.has(x) && x.length >= 4);
  if (!chaves.length) return false;
  const alvo = new Set(palavras(texto));
  return chaves.some((k) => alvo.has(k));
}

const mediana = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const desvio = (v: number[]) => {
  if (v.length < 2) return null;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const responder = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const { inscricao_id } = await req.json();
    if (!inscricao_id) return responder({ erro: "inscricao_id é obrigatório" }, 400);

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: insc } = await db.from("comercial_inscricoes")
      .select("id, empresa, respostas").eq("id", inscricao_id).single();
    if (!insc) return responder({ erro: "inscrição não encontrada" }, 404);

    const R = (insc.respostas ?? {}) as Record<string, string>;
    const { data: chave } = await db.from("chaves_api").select("chave")
      .in("provedor", ["rapidapi_maps", "rapidapi"]).eq("ativa", true).limit(1).single();

    const dossie: Record<string, unknown> = { gerado_em: new Date().toISOString() };
    const avisos: string[] = [];

    // ---- Receita Federal, de graça e sem chave --------------------------
    const cnpj = String(R.cnpj ?? "").replace(/\D/g, "");
    if (cnpj.length === 14) {
      try {
        const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
        if (r.ok) {
          const j = await r.json();
          dossie.receita = {
            razao_social: j.razao_social, nome_fantasia: j.nome_fantasia,
            situacao: j.descricao_situacao_cadastral, data_situacao: j.data_situacao_cadastral,
            abertura: j.data_inicio_atividade, porte: j.porte,
            simples: j.opcao_pelo_simples, mei: j.opcao_pelo_mei,
            capital_social: j.capital_social, cnae: j.cnae_fiscal_descricao,
            municipio: j.municipio, uf: j.uf,
            socios: (j.qsa ?? []).map((s: any) => s.nome_socio).slice(0, 8),
          };
        } else avisos.push(`Receita: HTTP ${r.status}`);
      } catch { avisos.push("Receita: sem resposta"); }

      // ---- dívida ativa da União, da base aberta que já está no banco ----
      const { data: dev } = await db.from("pgfn_devedores")
        .select("nome, uf, origens, inscricoes, ajuizado, desde")
        .eq("cnpj", cnpj).maybeSingle();
      dossie.divida_uniao = dev
        ? { na_lista: true, ...dev }
        : { na_lista: false, obs: "não consta na base de FGTS e previdenciário do trimestre" };
    } else if (R.cnpj) {
      avisos.push("CNPJ informado não tem 14 dígitos");
    }

    // ---- Instagram: perfil, ritmo e engajamento -------------------------
    const arroba = String(R.instagram ?? "").trim().replace(/^@/, "")
      .replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
    if (arroba && chave?.chave) {
      const cab = { "x-rapidapi-host": HOST_IG, "x-rapidapi-key": chave.chave };
      try {
        const r1 = await fetch(`https://${HOST_IG}/user_id_by_username?username=${encodeURIComponent(arroba)}`, { headers: cab });
        const j1 = await r1.json();
        const uid = j1?.UserID ?? j1?.user_id ?? j1?.id;
        if (uid) {
          // Sequencial, não em paralelo: o plano grátis limita o ritmo e a
          // segunda chamada simultânea voltava vazia — foi assim que o perfil
          // saiu todo null no primeiro teste.
          const r2 = await fetch(`https://${HOST_IG}/profile?user_id=${uid}`, { headers: cab });
          const p = await r2.json().catch(() => ({}));
          await new Promise((ok) => setTimeout(ok, 1200));
          const r3 = await fetch(`https://${HOST_IG}/feed?user_id=${uid}`, { headers: cab });
          const f = await r3.json().catch(() => ({}));
          if (p?.follower_count == null) avisos.push(`perfil veio sem seguidores (HTTP ${r2.status})`);

          const seguidores = p?.follower_count ?? null;

          // Post fixado aparece no topo do feed e destrói qualquer conta de
          // ritmo feita na ordem em que veio. Ordenar por data é obrigatório.
          const posts = ((f?.items ?? []) as any[])
            .filter((x) => x?.taken_at)
            .map((x) => ({
              ts: x.taken_at as number,
              curtidas: x.like_count ?? null,
              comentarios: x.comment_count ?? null,
              legenda: (typeof x.caption === "object" ? x.caption?.text : x.caption) ?? "",
            }))
            .sort((a, b) => b.ts - a.ts);

          let ritmo: Record<string, unknown> | null = null;
          if (posts.length >= 3) {
            const intervalos: number[] = [];
            for (let i = 0; i < posts.length - 1; i++) {
              intervalos.push(Math.round((posts[i].ts - posts[i + 1].ts) / DIA));
            }
            const desdeUltimo = Math.round((Date.now() / 1000 - posts[0].ts) / DIA);
            const curt = posts.map((x) => x.curtidas).filter((v): v is number => typeof v === "number");
            const com = posts.map((x) => x.comentarios).filter((v): v is number => typeof v === "number");
            const curtMed = mediana(curt);

            ritmo = {
              posts_lidos: posts.length,
              dias_desde_o_ultimo: desdeUltimo,
              intervalo_mediano_dias: mediana(intervalos),
              intervalo_maior_dias: Math.max(...intervalos),
              irregularidade_dias: desvio(intervalos) ? Math.round(desvio(intervalos)! * 10) / 10 : null,
              curtidas_medianas: curtMed,
              comentarios_medianos: mediana(com),
              // O número que denuncia: de que serve seguidor que não curte?
              engajamento_pct: seguidores && curtMed
                ? Math.round((curtMed / seguidores) * 10000) / 100 : null,
              // O silêncio se mede contra o ritmo DELE, não contra um número
              // fixo. Quem postava a cada 2 dias e sumiu há 29 parou — mesmo
              // que 29 dias fosse normal para outra empresa. A régua fixa de
              // 45 dias escondia justamente o caso mais revelador.
              leitura: (() => {
                const m = mediana(intervalos) ?? 99;
                if (desdeUltimo > Math.max(21, m * 5)) return "parou de postar";
                if (desdeUltimo > Math.max(10, m * 3)) return "esfriou — o ritmo caiu";
                if (m <= 7) return "posta com constância";
                return "posta, mas sem ritmo";
              })(),
              silencio_vs_ritmo: mediana(intervalos)
                ? Math.round((desdeUltimo / (mediana(intervalos) || 1)) * 10) / 10 : null,
            };
          }

          dossie.instagram = {
            arroba, seguidores, seguindo: p?.following_count ?? null,
            posts_total: p?.media_count ?? null, bio: p?.biography ?? null,
            categoria: p?.category ?? null, site: p?.external_url ?? null,
            verificado: p?.is_verified ?? null, empresa: p?.is_business ?? null,
            ritmo,
            ultimas_legendas: posts.slice(0, 6).map((x) => String(x.legenda).slice(0, 220)),
          };
        } else avisos.push("Instagram: perfil não encontrado");
      } catch { avisos.push("Instagram: sem resposta"); }
    }

    // ---- reputação e processos, por busca -------------------------------
    // O plano grátis da busca é 100/mês e cada dossiê gasta 2. Por isso só
    // roda quando há nome de empresa, e nunca "por garantia".
    const nome = String(insc.empresa ?? "").split(/\s+[-–|]\s+/)[0].trim();
    if (nome.length >= 3 && chave?.chave) {
      const buscar = async (q: string) => {
        const u = `https://${HOST_BUSCA}/search?q=${encodeURIComponent(q)}&limit=4`;
        const r = await fetch(u, { headers: { "x-rapidapi-host": HOST_BUSCA, "x-rapidapi-key": chave.chave } });
        if (!r.ok) { avisos.push(`busca: HTTP ${r.status}`); return []; }
        const j = await r.json().catch(() => ({}));
        const lista = Array.isArray(j?.data) ? j.data : (j?.data?.organic_results ?? []);
        return (lista as any[])
          .map((x) => ({
            titulo: x.title, url: x.url, trecho: String(x.snippet ?? "").slice(0, 300),
          }))
          // filtra o que não fala da empresa procurada
          .filter((x) => bate(nome, `${x.titulo} ${x.trecho}`));
      };
      const onde = String(R.cidade ?? "").split(",")[0].trim();
      try {
        const [ra, jb] = [
          await buscar(`site:reclameaqui.com.br "${nome}"`),
          await buscar(`site:jusbrasil.com.br "${nome}" ${onde}`),
        ];
        dossie.reclame_aqui = {
          achados: ra.length, itens: ra,
          leitura: ra.length ? "há reclamação pública em nome da empresa" : "nada encontrado",
        };
        dossie.processos = {
          achados: jb.length, itens: jb,
          leitura: jb.length ? "há processo público em nome da empresa" : "nada encontrado",
        };
      } catch { avisos.push("busca: sem resposta"); }
    }

    if (avisos.length) dossie.avisos = avisos;
    await db.from("comercial_inscricoes").update({ dossie }).eq("id", inscricao_id);
    return responder(dossie);
  } catch (e) {
    return responder({ erro: String(e) }, 500);
  }
});
