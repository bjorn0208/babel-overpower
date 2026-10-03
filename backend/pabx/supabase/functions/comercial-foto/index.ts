// comercial-foto — acha a ficha da empresa no Google e guarda a foto dela.
//
// A trava de semelhança é o coração desta função, e ela existe por um motivo
// medido: buscando as empresas reais da planilha, o Google devolveu
// "Hub Serviços Promoções Criação Publicidade" para "Partner HUB" e
// "Solução Financeira" para "Ilumicred Soluções". Foto da empresa ERRADA é
// pior que foto nenhuma — o mentor entra na call olhando outro negócio e
// perde a credibilidade nos primeiros trinta segundos.
//
// Por isso só aceita quando pelo menos 60% das palavras que IDENTIFICAM a
// empresa (tirando "soluções", "financeira", "ltda"…) aparecem no nome que o
// Google devolveu. Testada contra 6 casos reais: rejeita as 2 erradas,
// aceita as 4 certas.
//
// A foto do WhatsApp não entra aqui: a instância da Z-API do PABX responde
// "Instance not found" desde 29/08. Quando ela voltar, é só somar a fonte.

import { createClient } from "jsr:@supabase/supabase-js@2";

const HOST = "google-map-places-new-v2.p.rapidapi.com";
const CORTE = 0.6;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Palavras que quase toda empresa do ramo tem — não servem para identificar
// ninguém, e é por elas que uma busca casa com a empresa errada.
const GENERICOS = new Set([
  "solucoes", "solucao", "financeira", "financeiras", "servicos", "servico",
  "ltda", "me", "eireli", "consultoria", "negocios", "inteligentes", "empresa",
  "grupo", "cia", "sa", "emprestimo", "emprestimos", "credito", "imoveis",
  "assessoria", "de", "da", "do", "e", "comercio", "digital",
]);

function palavras(s: string): string[] {
  const semAcento = s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return (semAcento.match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 1);
}

// Devolve o quanto casou E se o que casou tem peso.
// Sigla curta não identifica empresa: "HS Consultoria" casou 100% com
// "HS Habilitação Suspensa" (serviço de CNH cassada), e "Cm soluções" com
// "CM Soluções em Tecnologias". Por isso exige pelo menos UMA palavra de
// 4 letras ou mais em comum — "karmo", "easy", "macedo" passam; "hs" não.
function semelhanca(busca: string, achado: string) {
  const distintivas = palavras(busca).filter((t) => !GENERICOS.has(t));
  if (!distintivas.length) return { taxa: 0, forte: false };
  const noAchado = new Set(palavras(achado));
  const casadas = distintivas.filter((t) => noAchado.has(t));
  return {
    taxa: casadas.length / distintivas.length,
    forte: casadas.some((t) => t.length >= 4),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const responder = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const { inscricao_id } = await req.json();
    if (!inscricao_id) return responder({ erro: "inscricao_id é obrigatório" }, 400);

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: insc } = await db.from("comercial_inscricoes")
      .select("id, empresa, nome").eq("id", inscricao_id).single();
    if (!insc) return responder({ erro: "inscrição não encontrada" }, 404);
    if (!insc.empresa) return responder({ erro: "sem nome de empresa para procurar" }, 422);

    const { data: chave } = await db.from("chaves_api").select("chave")
      .in("provedor", ["rapidapi_maps", "rapidapi"]).eq("ativa", true).limit(1).single();
    if (!chave?.chave) return responder({ erro: "chave RapidAPI não cadastrada" }, 500);

    const cabec = {
      "x-rapidapi-host": HOST,
      "x-rapidapi-key": chave.chave,
      "Content-Type": "application/json",
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.photos,places.rating,places.userRatingCount,places.websiteUri",
    };

    const busca = await fetch(`https://${HOST}/v1/places:searchText`, {
      method: "POST", headers: cabec,
      body: JSON.stringify({ textQuery: `${insc.empresa} Brasil`, languageCode: "pt-BR" }),
    });
    if (!busca.ok) return responder({ erro: `Google Places ${busca.status}` }, 502);

    const lugares = (await busca.json())?.places ?? [];
    if (!lugares.length) {
      await db.from("comercial_inscricoes")
        .update({ foto_origem: "sem ficha no google", foto_conf: { achou: false } })
        .eq("id", inscricao_id);
      return responder({ achou: false, motivo: "nenhuma ficha encontrada" });
    }

    // Entre os resultados, o que mais parece com a empresa — não o primeiro.
    const pontuados = lugares.map((p: any) => {
      const s = semelhanca(insc.empresa, p?.displayName?.text ?? "");
      return { lugar: p, nome: p?.displayName?.text ?? "", sem: s.taxa, forte: s.forte };
    }).sort((a: any, b: any) =>
      (b.forte ? 1 : 0) - (a.forte ? 1 : 0) || b.sem - a.sem);

    const melhor = pontuados[0];
    if (melhor.sem < CORTE || !melhor.forte) {
      await db.from("comercial_inscricoes").update({
        foto_origem: "recusada por não bater o nome",
        foto_conf: {
          achou: true, aceita: false, melhor: melhor.nome,
          semelhanca: melhor.sem, palavra_forte: melhor.forte,
        },
      }).eq("id", inscricao_id);
      return responder({
        achou: true, aceita: false, melhor: melhor.nome, semelhanca: melhor.sem,
        motivo: melhor.forte
          ? "o nome do lugar não bate com o da empresa"
          : "só casou por sigla curta — não dá para confiar",
      });
    }

    const fotos = melhor.lugar?.photos ?? [];
    if (!fotos.length) {
      await db.from("comercial_inscricoes").update({
        foto_origem: "ficha sem foto",
        foto_conf: { achou: true, aceita: true, melhor: melhor.nome, semelhanca: melhor.sem, fotos: 0 },
      }).eq("id", inscricao_id);
      return responder({ achou: true, aceita: true, foto: false, melhor: melhor.nome });
    }

    // A API devolve o endereço da imagem; o arquivo em si vem depois.
    const media = await fetch(
      `https://${HOST}/v1/${fotos[0].name}/media?maxWidthPx=640&skipHttpRedirect=true`,
      { headers: { "x-rapidapi-host": HOST, "x-rapidapi-key": chave.chave } },
    );
    const uri = (await media.json())?.photoUri;
    if (!uri) return responder({ erro: "não vieram os bytes da foto" }, 502);

    const img = await fetch(uri);
    const bytes = new Uint8Array(await img.arrayBuffer());
    const caminho = `lead-${inscricao_id}.jpg`;

    const { error: eUp } = await db.storage.from("comercial-fotos")
      .upload(caminho, bytes, { contentType: "image/jpeg", upsert: true });
    if (eUp) return responder({ erro: `storage: ${eUp.message}` }, 500);

    const foto_url = db.storage.from("comercial-fotos").getPublicUrl(caminho).data.publicUrl;

    await db.from("comercial_inscricoes").update({
      foto_url,
      foto_origem: "google meu negócio",
      foto_conf: {
        achou: true, aceita: true, melhor: melhor.nome, semelhanca: melhor.sem,
        endereco: melhor.lugar?.formattedAddress ?? null,
        nota: melhor.lugar?.rating ?? null,
        avaliacoes: melhor.lugar?.userRatingCount ?? null,
        site: melhor.lugar?.websiteUri ?? null,
      },
    }).eq("id", inscricao_id);

    return responder({
      achou: true, aceita: true, foto_url, empresa_no_google: melhor.nome,
      semelhanca: melhor.sem, nota: melhor.lugar?.rating ?? null,
    });
  } catch (e) {
    return responder({ erro: String(e) }, 500);
  }
});
