/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// cron-status-rifa — a cada 30 min gera a CARTELA da rifa (grade de números com
// os vendidos preenchidos), atualiza a galeria (rifa_imagens tipo='cartela') e
// posta no Status do WhatsApp do tenant (send-image-status). Fallback: rifa com
// mais de 100 números ou falha de render → Status em texto puro.
//
// A arte de DIVULGAÇÃO (tipo='divulgacao', feita no editor da aba Imagens) não
// é tocada aqui — ela é a imagem dos disparos pros leads (cron-bom-dia-rifa).
//
// Render server-side: SVG montado à mão → PNG via resvg-wasm (fonte DejaVu
// baixada 1x no cold start). Sem emoji dentro do SVG (a fonte não tem glifo).
//
// Segurança: verify_jwt=false (pg_cron via pg_net); Bearer == env OU segredo do
// vault via RPC service-only ler_segredo_cron. Body de teste: {tenant_id} filtra
// um tenant, {sem_post:true} gera cartela/galeria mas não posta no Status.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { horaDoSorteio, svgCartela } from "./cartela.ts";

// Rifa mora na Plataforma Limpa (o contrato é que mora na Babel, com env
// própria — ver `_shared/tools-internas.ts`). O default aqui apontava pra
// babel-os.com e divergia do resto, o que já mascarou troca de domínio.
const APP_PUBLIC_URL = Deno.env.get("APP_PUBLIC_URL") ?? "https://www.plataformalimpa.com.br";
const MAX_RIFAS_POR_TENANT = 3;
const MAX_NUMEROS_CARTELA = 100;
// Espaço entre cada post dentro do loop — sem isso, se o WhatsApp ficar
// desconectado (re-scan de QR) por várias janelas de 30min, o snapshot
// vendidos_no_ultimo_status fica congelado (só avança em res.ok) e, ao
// reconectar, o próximo tick posta TODAS as rifas pendentes + espelhos de
// uma vez só, em rajada (Theus 2026-09-02 — 7 rifas no Status ao reconectar).
const INTERVALO_ENTRE_POSTS_MS = 8000;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const URL_WASM = "https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm";
// Cartela nova (10/09): serifada no título/números/pódio, sans regular nas linhas do sorteio.
const URL_FONTES = ["DejaVuSans-Bold", "DejaVuSans", "DejaVuSerif-Bold"]
  .map((f) => `https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/${f}.ttf`);

// CORS: o botão 🧪 da aba Imagens chama esta edge do NAVEGADOR — preflight
// OPTIONS precisa responder (mesma lição do botão de disparo, 2026-08-21).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const fmtBRL = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const horaBRT = () =>
  new Date(Date.now() - 3 * 3600_000).toISOString().slice(11, 16);

// ── Render: init preguiçoso do wasm + fonte, 1x por instância ───────────────
let prontoRender: Promise<Uint8Array[] | null> | null = null;
function garantirRender(): Promise<Uint8Array[] | null> {
  if (!prontoRender) {
    prontoRender = (async () => {
      try {
        await initWasm(fetch(URL_WASM));
        return await Promise.all(URL_FONTES.map(async (url) => {
          const r = await fetch(url);
          if (!r.ok) throw new Error(`fonte http ${r.status} (${url})`);
          return new Uint8Array(await r.arrayBuffer());
        }));
      } catch (e) {
        console.error("[cron-status-rifa] render indisponível:", e);
        return null;
      }
    })();
  }
  return prontoRender;
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

/** Hora do sorteio + nome do rifeiro vêm da arte mais recente que os tiver. */
async function dadosDaArte(supabase: Sb, rifaId: string): Promise<{ hora: string | null; rifeiro: string | null }> {
  const { data } = await supabase
    .from("rifa_imagens")
    .select("hora_sorteio, nome_rifeiro")
    .eq("rifa_id", rifaId)
    .is("deleted_at", null)
    .or("hora_sorteio.not.is.null,nome_rifeiro.not.is.null")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { hora: data?.hora_sorteio ?? null, rifeiro: data?.nome_rifeiro ?? null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, erro: "metodo_invalido" }, 405);

  const chaveServico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, chaveServico);

  const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  let autorizado = bearer.length > 0 && bearer === chaveServico;
  if (!autorizado && bearer.length > 0) {
    const { data: segredoCron } = await supabase.rpc("ler_segredo_cron");
    autorizado = typeof segredoCron === "string" && segredoCron.length > 0 && bearer === segredoCron;
  }
  // 3º caminho — MODO TESTE do tenant (botão da aba Imagens): JWT do dono
  // posta AGORA no próprio Status (ignora o toggle). corpo.tenant_id é
  // ignorado nesse modo — ninguém posta em nome de outro tenant.
  let tenantTeste: string | null = null;
  if (!autorizado && bearer.length > 0) {
    const { data: auth } = await supabase.auth.getUser(bearer);
    if (auth?.user?.id) {
      autorizado = true;
      tenantTeste = auth.user.id;
    }
  }
  if (!autorizado) return json({ ok: false, erro: "nao_autorizado" }, 401);

  const corpo = (await req.json().catch(() => ({}))) as { tenant_id?: string; sem_post?: boolean };
  const tenantFiltro = tenantTeste ?? corpo.tenant_id;

  // Janela de silêncio (Fabrício, 11/09/2026): a cartela no Status atualiza só até as 23:00 e
  // volta a partir das 06:00 (horário de Brasília). Vale pra todos os tenants — ninguém quer
  // Status de rifa pipocando de madrugada. Teste manual (`sem_post`) e chamada com tenant_id
  // explícito (botão 🧪 da aba Imagens) passam, porque não são o cron.
  const horaBRTAgora = Number(horaBRT().slice(0, 2));
  const madrugada = horaBRTAgora >= 23 || horaBRTAgora < 6;
  if (madrugada && !corpo.sem_post && !tenantFiltro) {
    return json({ ok: true, silencio_noturno: true, hora_brt: horaBRT(), posts: 0, cartelas: 0 });
  }

  let q = supabase.from("rifas_config_tenant").select("tenant_id").eq("postar_status_ativo", true);
  if (tenantFiltro) q = supabase.from("rifas_config_tenant").select("tenant_id").eq("tenant_id", tenantFiltro);
  const { data: configs } = await q;

  let posts = 0;
  let cartelas = 0;
  let tenantsSemCanal = 0;

  for (const cfg of configs ?? []) {
    const { data: canal } = await supabase
      .from("canais")
      .select("zapi_instance_id, zapi_token, zapi_security_token, zapi_api_url, whatsapp_phone")
      .eq("user_id", cfg.tenant_id)
      .eq("type", "whatsapp")
      .eq("is_active", true)
      .not("zapi_instance_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (!canal && !corpo.sem_post) {
      tenantsSemCanal++;
      continue;
    }

    const { data: rifas } = await supabase
      .from("rifas")
      .select("id, titulo, premio_principal, premios_extras, metodo_sorteio, data_sorteio_prevista, hora_sorteio, total_numeros, numeracao_desde_zero, preco_numero_centavos, chave_publica, vendidos_no_ultimo_status, status_ultimo_post_em")
      .eq("tenant_id", cfg.tenant_id)
      .eq("status", "ativa")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_RIFAS_POR_TENANT);
    if (!rifas?.length) continue;

    const base = canal
      ? `${canal.zapi_api_url || "https://api.z-api.io"}/instances/${canal.zapi_instance_id}/token/${canal.zapi_token}`
      : "";
    const headers = { "Content-Type": "application/json", "Client-Token": canal?.zapi_security_token || "" };

    for (const rifa of rifas) {
      const { data: nums } = await supabase
        .from("numeros_rifa")
        .select("numero, status, pedidos_rifa(nome)")
        .eq("rifa_id", rifa.id);
      const vendidos = new Set<number>();
      const reservados = new Set<number>();
      const nomes = new Map<number, string>();
      for (const n of nums ?? []) {
        const numero = Number(n.numero);
        if (n.status === "pago") vendidos.add(numero);
        else if (n.status === "reservado") reservados.add(numero);
        const nomeComprador = (n as { pedidos_rifa?: { nome?: string } }).pedidos_rifa?.nome;
        if (nomeComprador) nomes.set(numero, nomeComprador);
      }
      const restam = rifa.total_numeros - vendidos.size - reservados.size;

      // Rifa recém-ativada com ZERO número vendido/reservado ainda não posta
      // no Status (Theus 2026-09-02) — só entra na vitrine depois do 1º
      // negócio de verdade. O botão de teste (modo_teste) segue postando
      // mesmo sem venda, pra dar pra conferir o visual da cartela.
      // Exceção (Fabrício 10/09): rifa que JÁ postou e teve o snapshot zerado (reembolso — ver
      // rifa_reembolsar_pedido) posta de novo mesmo se ficou sem nenhum número ocupado; senão o
      // Status seguiria mostrando o número devolvido como vendido.
      const postForcado = rifa.vendidos_no_ultimo_status === null && !!rifa.status_ultimo_post_em;
      if (!tenantTeste && !postForcado && vendidos.size === 0 && reservados.size === 0) continue;

      // Só posta quando A CARTELA MUDOU desde o último post. O botão de teste sempre posta.
      // Δ 2026-09-09: o gatilho passou a ser vendidos + reservados, não só vendidos — pro Theus,
      // reserva também é número saindo da mesa, e a cartela precisa refletir isso na hora.
      // `vendidos_no_ultimo_status` guarda esse total de OCUPADOS (o nome ficou do tempo em que
      // era só venda).
      const ocupados = vendidos.size + reservados.size;
      const cartelaMudou = rifa.vendidos_no_ultimo_status === null ||
        Number(rifa.vendidos_no_ultimo_status) !== ocupados;

      // Δ 2026-09-09 (Theus): sem venda por 1 hora, a rifa REAPARECE no Status com a última
      // cartela postada. Status do WhatsApp é vitrine que envelhece: rifa parada some do topo e
      // ninguém mais vê. Aqui nada é regerado — a cartela é idêntica, então reusa a imagem que
      // já está na galeria.
      const ultimoPost = rifa.status_ultimo_post_em ? new Date(rifa.status_ultimo_post_em).getTime() : 0;
      const horaSemPostar = Date.now() - ultimoPost >= 3600_000;
      const republicando = !cartelaMudou && horaSemPostar;

      // sem_post = só regerar a cartela da galeria (ex.: desenho novo) — renderiza mesmo sem mudança
      // e sem postar; o snapshot do Status não é tocado, então o próximo tick não posta por causa disso.
      if (!tenantTeste && !corpo.sem_post && !cartelaMudou && !republicando) continue;
      const { hora: horaSorteio } = await dadosDaArte(supabase, rifa.id);

      // ── Cartela (rifa de até 100 números) ────────────────────────────────
      let urlCartela: string | null = null;
      // Cartela em BASE64 pro post (a Z-API aceita "link ou Base64" — mandar
      // os bytes elimina qualquer falha silenciosa dela ao baixar a URL).
      let cartelaBase64: string | null = null;
      // Republicando: a cartela é a MESMA (nada mudou), então reusa a imagem que já está na
      // galeria em vez de renderizar de novo. Se não houver, cai no render normal abaixo.
      if (republicando && !corpo.sem_post) {
        const { data: jaTem } = await supabase
          .from("rifa_imagens")
          .select("url")
          .eq("rifa_id", rifa.id)
          .eq("tipo", "cartela")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        urlCartela = (jaTem?.url as string | undefined) ?? null;
      }
      if (!urlCartela && rifa.total_numeros <= MAX_NUMEROS_CARTELA) {
        const fontes = await garantirRender();
        if (fontes) {
          try {
            // Modelo aprovado pelo Fabrício (10/09): grade + pódio + valor e tipo de sorteio (cartela.ts).
            const svg = svgCartela({
              titulo: rifa.titulo,
              total: rifa.total_numeros,
              desdeZero: Boolean(rifa.numeracao_desde_zero),
              vendidos,
              reservados,
              nomes,
              precoCentavos: rifa.preco_numero_centavos,
              premios: [rifa.premio_principal, ...((rifa.premios_extras ?? []) as unknown[])].map((p) => String(p ?? "")),
              metodo: String(rifa.metodo_sorteio ?? ""),
              dataSorteio: rifa.data_sorteio_prevista ?? null,
              horaSorteio: horaDoSorteio(rifa.hora_sorteio, horaSorteio, String(rifa.metodo_sorteio ?? ""), rifa.data_sorteio_prevista ?? null),
            });
            const png = new Resvg(svg, {
              fitTo: { mode: "width", value: 1080 },
              font: { fontBuffers: fontes, loadSystemFonts: false, defaultFontFamily: "DejaVu Sans" },
            }).render().asPng();

            // Caminho FIXO por rifa + upsert: sem dança de apagar arquivo.
            // (Incidente 2026-08-21: o UPDATE da linha falhou silencioso e o
            // delete do PNG "antigo" matou o arquivo que a linha apontava —
            // URL morta = Status sem post com a Z-API fingindo sucesso.)
            const caminho = `${cfg.tenant_id}/cartelas/${rifa.id}.png`;
            const { error: erroUp } = await supabase.storage
              .from("rifas-anexos")
              .upload(caminho, png, { contentType: "image/png", upsert: true });
            if (erroUp) throw erroUp;
            // ?v= fura o cache do CDN — o WhatsApp sempre baixa a versão nova.
            urlCartela = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/rifas-anexos/${caminho}?v=${Date.now()}`;
            cartelaBase64 = `data:image/png;base64,${encodeBase64(png)}`;

            // Prova real: a imagem TEM que estar acessível antes de postar.
            const head = await fetch(urlCartela, { method: "HEAD" });
            if (!head.ok) throw new Error(`cartela inacessível (http ${head.status})`);

            // Galeria: 1 linha viva de cartela por rifa — escrita CHECADA.
            const { data: linhaAtual } = await supabase
              .from("rifa_imagens")
              .select("id")
              .eq("rifa_id", rifa.id)
              .eq("tipo", "cartela")
              .is("deleted_at", null)
              .limit(1)
              .maybeSingle();
            const legenda = `Cartela atualizada as ${horaBRT()}`;
            if (linhaAtual) {
              const { error: erroUpd } = await supabase
                .from("rifa_imagens")
                .update({ url: urlCartela, legenda, hora_sorteio: horaSorteio, created_at: new Date().toISOString() })
                .eq("id", linhaAtual.id);
              if (erroUpd) throw erroUpd;
            } else {
              const { error: erroIns } = await supabase.from("rifa_imagens").insert({
                tenant_id: cfg.tenant_id,
                rifa_id: rifa.id,
                tipo: "cartela",
                url: urlCartela,
                legenda,
                hora_sorteio: horaSorteio,
              });
              if (erroIns) throw erroIns;
            }
            cartelas++;
          } catch (e) {
            console.error(`[cron-status-rifa] cartela falhou rifa=${rifa.id}:`, e);
            urlCartela = null;
          }
        }
      }

      if (corpo.sem_post || !canal) continue;

      // ── Post no Status: cartela como imagem; sem cartela → texto direto ──
      const linhas = [
        `${rifa.titulo}`,
        `Vendidos ${vendidos.size}/${rifa.total_numeros} · Restam ${restam}`,
        `${fmtBRL(rifa.preco_numero_centavos)} o número`,
        `Prêmio: ${rifa.premio_principal}`,
      ];
      if (horaSorteio) linhas.push(`Sorteio às ${horaSorteio}`);
      linhas.push(`Garanta o seu: ${APP_PUBLIC_URL}/rifa/${rifa.chave_publica}`);
      const texto = linhas.join("\n");

      try {
        // Δ 2026-09-09 (Theus): no Status vai SÓ A IMAGEM. A cartela já diz tudo — título,
        // números livres, ocupados e a legenda de cores —, e texto por cima virava poluição.
        // O texto só aparece quando não há cartela (rifa acima de 100 números), senão o post
        // sairia vazio.
        // Bytes quando acabou de renderizar; URL quando é republicação da mesma cartela
        // (a Z-API aceita "link ou Base64").
        const imagemDoPost = cartelaBase64 ?? urlCartela;
        const res = imagemDoPost
          ? await fetch(`${base}/send-image-status`, {
              method: "POST",
              headers,
              body: JSON.stringify({ image: imagemDoPost }),
            })
          : await fetch(`${base}/send-text-status`, {
              method: "POST",
              headers,
              body: JSON.stringify({ message: texto }),
            });
        if (res.ok) {
          posts++;
          await supabase.from("rifas")
            .update({ vendidos_no_ultimo_status: ocupados, status_ultimo_post_em: new Date().toISOString() })
            .eq("id", rifa.id);
        } else console.error(`[cron-status-rifa] Z-API falhou tenant=${cfg.tenant_id} status=${res.status} corpo=${(await res.text()).slice(0, 200)}`);

        // ESPELHO verificável: manda a MESMA cartela como mensagem pro próprio
        // número do chip — o dono vê na conversa "Você" o que foi postado no
        // Status, sem depender da aba de Status renderizar. Best-effort.
        const fonePropio = String(canal.whatsapp_phone ?? "").replace(/\D/g, "");
        if (fonePropio.length >= 10) {
          // O espelho continua com a legenda: é a conversa do dono consigo mesmo, serve de
          // registro do que foi ao ar e de quando. Quem não pode ter texto é o Status.
          const corpoEspelho = imagemDoPost
            ? { rota: "send-image", body: { phone: fonePropio, image: imagemDoPost, caption: `[espelho do Status]\n${texto}` } }
            : { rota: "send-text", body: { phone: fonePropio, message: `[espelho do Status]\n${texto}` } };
          await fetch(`${base}/${corpoEspelho.rota}`, {
            method: "POST",
            headers,
            body: JSON.stringify(corpoEspelho.body),
          }).catch((e) => console.error("[cron-status-rifa] espelho falhou:", e));
        }
      } catch (e) {
        console.error(`[cron-status-rifa] fetch falhou tenant=${cfg.tenant_id}:`, e);
      }

      // Espaço entre posts — não estoura tudo de uma vez quando o WhatsApp
      // volta a conectar com vários tenants/rifas pendentes acumulados.
      await dormir(INTERVALO_ENTRE_POSTS_MS);
    }

    if (!corpo.sem_post) {
      await supabase
        .from("rifas_config_tenant")
        .update({ status_ultimo_post_em: new Date().toISOString() })
        .eq("tenant_id", cfg.tenant_id);
    }
  }

  return json({ ok: true, posts, cartelas, tenants_sem_canal: tenantsSemCanal, modo_teste: !!tenantTeste });
});
