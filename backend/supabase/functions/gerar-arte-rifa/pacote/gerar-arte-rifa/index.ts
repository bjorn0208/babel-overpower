/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// gerar-arte-rifa — Estúdio IA do app Rifas. Gera (ou ajusta) o flyer
// profissional da rifa via modelo de imagem (google/gemini-2.5-flash-image no
// OpenRouter — mesma conta/caixa do motor, chave em provedores_llm).
//
// Modos (body):
//   { rifa_id, foto_url?, instrucoes? }            → GERAR do zero no estilo
//     flyer de rifa (título grunge, produto em destaque, cards de benefício,
//     cupom de preço, selos, rodapé). foto_url = foto do produto/arte já
//     existente entra como referência principal.
//   { rifa_id, imagem_base_url, instrucoes }       → AJUSTAR: edita a arte
//     gerada anterior com a instrução ("troca o fundo pra azul") — é o modo
//     iterativo "estilo Canva" por conversa.
//
// A edge SÓ gera e sobe o PNG no bucket (rifas-anexos/{tenant}/artes/ia-*.png)
// e devolve {url}. Salvar na galeria (rifa_imagens) é decisão do usuário na UI.
//
// Segurança: verify_jwt=true + auth.getUser → a rifa precisa ser do tenant.

import { createClient } from "jsr:@supabase/supabase-js@2";

const MODELOS_IMAGEM = [
  "google/gemini-2.5-flash-image",
  "google/gemini-2.5-flash-image-preview",
];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const fmtBRL = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface DadosRifa {
  titulo: string;
  premio_principal: string;
  /** O que APARECE na imagem (campo "o que mostrar" do Estúdio) — sem isso o
   *  modelo ilustra o premio_principal e, se ele for vago, inventa eletrônicos. */
  premio_visual: string;
  preco_numero_centavos: number;
  hora_sorteio: string | null;
}

/** Prompt do flyer — descreve o layout da referência do Theus, com os dados reais. */
function promptFlyer(r: DadosRifa, instrucoes: string, temFoto: boolean): string {
  return [
    `Crie um flyer QUADRADO (1:1, 1080x1080) de RIFA, estilo design profissional de social media, altíssima qualidade.`,
    `LAYOUT obrigatório (inspirado em flyer de rifa premium):`,
    `- Fundo escuro dramático com textura e vinheta, iluminação de holofote.`,
    `- Topo esquerdo: a palavra "RIFA" GIGANTE em tipografia estilo pincelada grunge branca, com o nome do prêmio logo abaixo em destaque: "${r.premio_principal}".`,
    temFoto
      ? `- Lado direito: a foto anexada é O PRODUTO/PRÊMIO — recorte e destaque como herói da arte, grande, com brilho e profundidade.`
      : `- Lado direito: ilustração realista e atraente de: ${r.premio_visual}.`,
    `- Meio esquerdo: 3 pequenos cards com ícones listando: "Concorra: ${r.premio_principal}", "Produto original", "Sorteio transparente e ao vivo".`,
    `- Base esquerda: um cupom/ticket destacado com "CADA NÚMERO" e o preço "${fmtBRL(r.preco_numero_centavos)}".`,
    r.hora_sorteio
      ? `- Base direita: selo com "Sorteio às ${r.hora_sorteio}" + selo "Garanta seu número!".`
      : `- Base direita: selos "Garanta seu número!" e "Boa sorte!".`,
    `- Rodapé: faixa com EXATAMENTE a frase "Participe e boa sorte!" (nenhuma outra frase).`,
    `REGRAS DE TEXTO (crítico): use SOMENTE os textos entre aspas especificados acima, letra por letra — releia cada palavra antes de desenhar; NENHUM texto inventado, NENHUM texto decorativo extra; menos texto = melhor.`,
    `REGRAS VISUAIS: sem logotipos de marcas reais; sem marca d'água; cores harmônicas que combinem com o produto.`,
    instrucoes ? `PREFERÊNCIAS DO DONO (prioridade máxima): ${instrucoes}` : "",
  ].filter(Boolean).join("\n");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

async function chaveOpenRouter(admin: Sb): Promise<string> {
  const { data, error } = await admin
    .from("provedores_llm")
    .select("api_key")
    .eq("slug", "openrouter")
    .eq("is_active", true)
    .limit(1)
    .single();
  if (error || !data?.api_key) throw new Error("chave OpenRouter não encontrada em provedores_llm");
  return data.api_key as string;
}

/** Extrai a imagem (data URL base64) da resposta do OpenRouter. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extrairImagem(resposta: any): string | null {
  const msg = resposta?.choices?.[0]?.message;
  const daLista = msg?.images?.[0]?.image_url?.url;
  if (typeof daLista === "string" && daLista.startsWith("data:image")) return daLista;
  if (Array.isArray(msg?.content)) {
    for (const parte of msg.content) {
      const u = parte?.image_url?.url;
      if (typeof u === "string" && u.startsWith("data:image")) return u;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, erro: "metodo_invalido" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Dono logado — a rifa tem que ser dele.
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: auth } = await admin.auth.getUser(jwt);
    const uid = auth?.user?.id;
    if (!uid) return json({ ok: false, erro: "nao_autenticado" }, 401);

    const corpo = (await req.json().catch(() => ({}))) as {
      rifa_id?: string;
      foto_url?: string;
      imagem_base_url?: string;
      instrucoes?: string;
      /** true = gera só o FUNDO (produto/clima, ZERO texto) — os textos entram
       *  depois como camadas editáveis no editor do Estúdio. */
      sem_textos?: boolean;
      /** O que deve aparecer na imagem (prêmio/cena) — controla o visual do herói. */
      descricao_premio?: string;
    };
    if (!corpo.rifa_id) return json({ ok: false, erro: "rifa_id_obrigatorio" }, 400);

    const { data: rifa } = await admin
      .from("rifas")
      .select("id, titulo, premio_principal, preco_numero_centavos, tenant_id")
      .eq("id", corpo.rifa_id)
      .eq("tenant_id", uid)
      .is("deleted_at", null)
      .maybeSingle();
    if (!rifa) return json({ ok: false, erro: "rifa_nao_encontrada" }, 404);

    const { data: arteHora } = await admin
      .from("rifa_imagens")
      .select("hora_sorteio")
      .eq("rifa_id", rifa.id)
      .is("deleted_at", null)
      .not("hora_sorteio", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const instrucoes = (corpo.instrucoes ?? "").slice(0, 600);
    const modoAjuste = !!corpo.imagem_base_url;
    const promptFundo = [
      `Crie um FUNDO quadrado (1:1, 1080x1080) para flyer de rifa, estilo design profissional: fundo escuro dramático com textura e vinheta, iluminação de holofote.`,
      corpo.foto_url
        ? `A foto anexada é O PRODUTO/PRÊMIO — recorte e posicione como herói no lado DIREITO, grande, com brilho e reflexo.`
        : `Ilustração realista no lado DIREITO de: ${(corpo.descricao_premio ?? "").trim() || rifa.premio_principal}.`,
      `Deixe ESPAÇO NEGATIVO limpo no lado esquerdo e na base (os textos entram depois).`,
      `PROIBIDO: qualquer texto, letra, número, logotipo ou marca d'água na imagem.`,
      instrucoes ? `PREFERÊNCIAS DO DONO: ${instrucoes}` : "",
    ].filter(Boolean).join("\n");
    // MODO LIVRE (pedido do Dominic 2026-08-21): quando o dono escreve
    // instruções, ELAS mandam — nada de layout imposto. O template de flyer
    // só entra quando o campo de instruções está vazio.
    const promptLivre = instrucoes
      ? [
          instrucoes,
          corpo.foto_url ? `A foto anexada é o produto/prêmio — use como elemento principal.` : "",
          corpo.sem_textos
            ? `PROIBIDO qualquer texto, letra, número ou logotipo na imagem.`
            : `Se houver texto, em português do Brasil com ortografia perfeita. Contexto disponível (use só se fizer sentido): rifa "${rifa.titulo}", prêmio ${rifa.premio_principal}, ${fmtBRL(rifa.preco_numero_centavos)} por número${arteHora?.hora_sorteio ? `, sorteio às ${arteHora.hora_sorteio}` : ""}.`,
          `Formato quadrado 1:1 (1080x1080), alta qualidade, sem marca d'água.`,
        ].filter(Boolean).join("\n")
      : null;

    const prompt = modoAjuste
      ? `Edite a imagem anexada aplicando SOMENTE esta mudança, mantendo todo o resto idêntico — layout, textos e qualidade: ${instrucoes || "melhore o acabamento geral"}. Textos em português do Brasil com ortografia perfeita.`
      : promptLivre
      ? promptLivre
      : corpo.sem_textos
      ? promptFundo
      : promptFlyer(
          {
            titulo: rifa.titulo,
            premio_principal: rifa.premio_principal,
            premio_visual: (corpo.descricao_premio ?? "").trim() || rifa.premio_principal,
            preco_numero_centavos: rifa.preco_numero_centavos,
            hora_sorteio: arteHora?.hora_sorteio ?? null,
          },
          instrucoes,
          !!corpo.foto_url,
        );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conteudo: any[] = [{ type: "text", text: prompt }];
    const imagemEntrada = modoAjuste ? corpo.imagem_base_url : corpo.foto_url;
    if (imagemEntrada) conteudo.push({ type: "image_url", image_url: { url: imagemEntrada } });

    const chave = await chaveOpenRouter(admin);
    let dataUrl: string | null = null;
    let ultimoErro = "";
    for (const modelo of MODELOS_IMAGEM) {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${chave}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://www.babel-os.com",
          "X-Title": "estudio-ia-rifas",
        },
        body: JSON.stringify({
          model: modelo,
          messages: [{ role: "user", content: conteudo }],
          modalities: ["image", "text"],
        }),
      });
      const bruto = await res.json().catch(() => ({}));
      if (!res.ok) {
        ultimoErro = `modelo ${modelo}: http ${res.status} ${JSON.stringify(bruto?.error ?? "").slice(0, 160)}`;
        continue;
      }
      dataUrl = extrairImagem(bruto);
      if (dataUrl) break;
      ultimoErro = `modelo ${modelo}: resposta sem imagem`;
    }
    if (!dataUrl) {
      console.error("[gerar-arte-rifa]", ultimoErro);
      return json({ ok: false, erro: `geração falhou — ${ultimoErro}` }, 502);
    }

    // data URL → bytes → bucket público.
    const base64 = dataUrl.split(",")[1] ?? "";
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const caminho = `${uid}/artes/ia-${Date.now()}.png`;
    const { error: erroUp } = await admin.storage
      .from("rifas-anexos")
      .upload(caminho, bytes, { contentType: "image/png" });
    if (erroUp) return json({ ok: false, erro: `upload falhou: ${erroUp.message}` }, 500);

    return json({ ok: true, url: `${supabaseUrl}/storage/v1/object/public/rifas-anexos/${caminho}` });
  } catch (e) {
    console.error("[gerar-arte-rifa] erro:", e);
    return json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
