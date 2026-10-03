/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// anunciar-resultado-rifa — botão "📣" da ata do sorteio no app Rifas.
// Divulga o resultado da PRÓPRIA rifa do tenant (rifa já sorteada, dados do
// banco — nada vem do cliente além do id e das opções):
//   postar_status      → pódio (imagem) + texto do resultado no Status do chip
//   avisar_compradores → send-text pra cada comprador PAGO da rifa
// LGPD (item 12): texto E imagem só expõem o PRIMEIRO NOME do ganhador. A
// imagem (SVG→PNG via resvg, mesmo stack da cartela) é gerada aqui em
// best-effort — se falhar, o anúncio segue em texto puro; nunca é o gate.
// Segurança: verify_jwt=true + a rifa precisa ser do tenant do JWT.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { primeiroNome } from "../_shared/nomes.ts";
import { svgGanhadores } from "./ganhadores.ts";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (corpo, status = 200)=>new Response(JSON.stringify(corpo), {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json"
    }
  });
// Espelho TS do SQL `normalizar_telefone_brasil` — pedidos antigos podem ter phone sem DDI 55.
const normalizarTelefoneBrasil = (bruto)=>{
  const v = (bruto ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (/^55\d{10,11}$/.test(v)) return v;
  if (/^\d{10,11}$/.test(v)) return "55" + v;
  return null;
};
const MAX_AVISOS = 150;
const PAUSA_ENTRE_ENVIOS_MS = 350;
const MAX_ITENS_PODIO = 6;
// LGPD: só o primeiro nome chega ao texto e à imagem do anúncio.
const primeiroDe = (nome: string | null | undefined): string => primeiroNome(nome) || "Ganhador(a)";
// ── Render do pódio: init preguiçoso do wasm + fontes, 1x por instância ─────
// Mesma receita do cron-status-rifa (cartela) — sem emoji no SVG, DejaVu não tem.
const URL_WASM = "https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm";
const URL_FONTES = ["DejaVuSans-Bold", "DejaVuSans", "DejaVuSerif-Bold"]
  .map((f) => `https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/${f}.ttf`);
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
        console.error("[anunciar-resultado-rifa] render indisponível:", e);
        return null;
      }
    })();
  }
  return prontoRender;
}
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response("ok", {
    headers: CORS
  });
  if (req.method !== "POST") return json({
    ok: false,
    erro: "metodo_invalido"
  }, 405);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { rifa_id, postar_status, avisar_compradores, tenant_id } = await req.json().catch(()=>({}));
    // DOIS chamadores (2026-09-06): o botão do app manda o JWT do dono; a tool
    // `anunciar_resultado_rifa` do agente roda na edge com service_role e manda o
    // tenant no corpo. Sem este segundo caminho o agente nunca divulgaria resultado
    // (service_role não tem usuário → auth.getUser devolve nulo).
    const ehServiceRole = jwt !== "" && jwt === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    let uid = null;
    if (ehServiceRole) {
      if (!tenant_id) return json({
        ok: false,
        erro: "tenant_id_obrigatorio_no_service_role"
      }, 400);
      uid = tenant_id;
    } else {
      const { data: auth } = await admin.auth.getUser(jwt);
      uid = auth?.user?.id ?? null;
    }
    if (!uid) return json({
      ok: false,
      erro: "nao_autenticado"
    }, 401);
    if (!rifa_id) return json({
      ok: false,
      erro: "rifa_id_obrigatorio"
    }, 400);
    if (!postar_status && !avisar_compradores) {
      return json({
        ok: false,
        erro: "nada_a_fazer (postar_status e/ou avisar_compradores)"
      }, 400);
    }
    const { data: rifa } = await admin.from("rifas").select("id, titulo, chave_publica, status, numero_sorteado, ganhador_nome, resultado_sorteio, total_numeros, numeracao_desde_zero, premio_principal").eq("id", rifa_id).eq("tenant_id", uid).is("deleted_at", null).maybeSingle();
    if (!rifa) return json({
      ok: false,
      erro: "rifa_nao_encontrada"
    }, 404);
    if (rifa.status !== "sorteada") return json({
      ok: false,
      erro: "rifa_ainda_nao_sorteada"
    }, 409);
    const { data: canal } = await admin.from("canais").select("zapi_api_url, zapi_instance_id, zapi_token, zapi_security_token, whatsapp_phone").eq("user_id", uid).eq("type", "whatsapp").eq("is_active", true).not("zapi_instance_id", "is", null).limit(1).maybeSingle();
    if (!canal) return json({
      ok: false,
      erro: "whatsapp_nao_conectado"
    }, 400);
    // Texto único do anúncio — nasce do estado real do banco.
    // Rifas desde zero exibem 00..total-1 (zero à esquerda na largura do maior número).
    const larguraRotulo = String(Math.max(1, (rifa.total_numeros ?? 100) - 1)).length;
    const rotuloNumero = (n)=>rifa.numeracao_desde_zero ? String(n).padStart(larguraRotulo, "0") : String(n);
    const lista = rifa.resultado_sorteio ?? [];
    // LGPD: o texto do anúncio mostra só o primeiro nome do ganhador.
    const linhas = lista.length > 0 ? lista.map((it)=>`${it.ordem}º · ${it.premio} — número *${rotuloNumero(it.numero)}*` + (it.sem_ganhador || !it.ganhador_nome ? " (número não vendido)" : ` · 🏆 ${primeiroDe(it.ganhador_nome)}`)) : [
      `Número sorteado: *${rotuloNumero(rifa.numero_sorteado)}*` + (rifa.ganhador_nome ? ` · 🏆 ${primeiroDe(rifa.ganhador_nome)}` : "")
    ];
    const linkRifa = `${Deno.env.get("APP_PUBLIC_URL") ?? "https://www.plataformalimpa.com.br"}/rifa/${rifa.chave_publica}`;
    const anuncio = `🎉 *Resultado — ${rifa.titulo}*\n\n` + linhas.join("\n") + `\n\nConfira a ata completa:\n${linkRifa}`;
    const base = `${canal.zapi_api_url || "https://api.z-api.io"}/instances/${canal.zapi_instance_id}/token/${canal.zapi_token}`;
    const headers = {
      "Content-Type": "application/json",
      "Client-Token": canal.zapi_security_token || ""
    };
    // ── Imagem do pódio (LGPD: PRIMEIRO nome) — best-effort, nunca é o gate ──
    // Mesmo pipeline da cartela (resvg → bucket → rifa_imagens 'ganhadores').
    let urlGanhadores = null;
    let imagemGanhadores = null;
    try {
      const fontes = await garantirRender();
      if (fontes) {
        // Rifa legada sem resultado_sorteio → pódio só com o número sorteado.
        const bruto = lista.length > 0 ? lista : [{
          ordem: 1,
          premio: rifa.premio_principal ?? "Prêmio",
          numero: rifa.numero_sorteado,
          sem_ganhador: !rifa.ganhador_nome,
          ganhador_nome: rifa.ganhador_nome
        }];
        const itensPodio = bruto.slice(0, MAX_ITENS_PODIO).map((it, idx)=>({
          ordem: Number(it.ordem ?? idx + 1),
          premio: String(it.premio ?? ""),
          numero: rotuloNumero(Number(it.numero)),
          nome: primeiroDe(it.ganhador_nome),
          semGanhador: Boolean(it.sem_ganhador) || !it.ganhador_nome
        }));
        const svg = svgGanhadores({
          titulo: rifa.titulo,
          itens: itensPodio,
          rodape: "Parabéns aos ganhadores!"
        });
        const png = new Resvg(svg, {
          fitTo: { mode: "width", value: 1080 },
          font: { fontBuffers: fontes, loadSystemFonts: false, defaultFontFamily: "DejaVu Sans" }
        }).render().asPng();
        // Caminho FIXO por rifa + upsert (mesma regra da cartela, incidente 2026-08-21).
        const caminho = `${uid}/ganhadores/${rifa.id}.png`;
        const { error: erroUp } = await admin.storage.from("rifas-anexos").upload(caminho, png, { contentType: "image/png", upsert: true });
        if (!erroUp) {
          // ?v= fura o cache do CDN do Supabase.
          urlGanhadores = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/rifas-anexos/${caminho}?v=${Date.now()}`;
          imagemGanhadores = `data:image/png;base64,${encodeBase64(png)}`;
          // Galeria do app: 1 linha viva de pódio por rifa.
          const { data: linhaAtual } = await admin.from("rifa_imagens").select("id").eq("rifa_id", rifa.id).eq("tipo", "ganhadores").is("deleted_at", null).limit(1).maybeSingle();
          const legenda = "Pódio dos ganhadores do sorteio";
          if (linhaAtual) {
            await admin.from("rifa_imagens").update({ url: urlGanhadores, legenda, created_at: new Date().toISOString() }).eq("id", linhaAtual.id);
          } else {
            await admin.from("rifa_imagens").insert({ tenant_id: uid, rifa_id: rifa.id, tipo: "ganhadores", url: urlGanhadores, legenda });
          }
        }
      }
    } catch (e) {
      console.error("[anunciar-resultado-rifa] imagem do pódio falhou — anúncio segue em texto:", e);
    }
    let statusPostado = false;
    if (postar_status) {
      // Status recebe SÓ a imagem do pódio (lição da cartela: a imagem já diz
      // tudo). Se a Z-API recusar a imagem, tenta o texto — o anúncio sempre sai.
      if (imagemGanhadores) {
        const resImg = await fetch(`${base}/send-image-status`, {
          method: "POST",
          headers,
          body: JSON.stringify({ image: imagemGanhadores })
        });
        if (resImg.ok) {
          statusPostado = true;
        } else {
          console.error(`[anunciar-resultado-rifa] imagem do Status recusada (http ${resImg.status}): ${(await resImg.text()).slice(0, 150)}`);
        }
      }
      if (!statusPostado) {
        const res = await fetch(`${base}/send-text-status`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            message: anuncio
          })
        });
        if (!res.ok) {
          return json({
            ok: false,
            erro: `Z-API recusou o Status (http ${res.status}): ${(await res.text()).slice(0, 150)}`
          }, 502);
        }
        statusPostado = true;
      }
      // Espelho verificável no chat do próprio chip (imagem com legenda quando há pódio).
      const fonePropio = String(canal.whatsapp_phone ?? "").replace(/\D/g, "");
      if (fonePropio.length >= 10) {
        const corpoEspelho = imagemGanhadores
          ? { rota: "send-image", body: { phone: fonePropio, image: imagemGanhadores, caption: `[espelho do Status]\n${anuncio}` } }
          : { rota: "send-text", body: { phone: fonePropio, message: `[espelho do Status]\n${anuncio}` } };
        await fetch(`${base}/${corpoEspelho.rota}`, {
          method: "POST",
          headers,
          body: JSON.stringify(corpoEspelho.body)
        }).catch(()=>undefined);
      }
    }
    let avisados = 0;
    if (avisar_compradores) {
      const { data: pagos } = await admin.from("pedidos_rifa").select("phone").eq("rifa_id", rifa.id).eq("status", "pago").limit(500);
      const fones = [
        ...new Set((pagos ?? []).map((p)=>normalizarTelefoneBrasil(String(p.phone ?? ""))).filter((f)=>Boolean(f)))
      ].slice(0, MAX_AVISOS);
      for (const fone of fones){
        const res = await fetch(`${base}/send-text`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            phone: fone,
            message: anuncio
          })
        }).catch(()=>null);
        if (res?.ok) avisados++;
        await new Promise((r)=>setTimeout(r, PAUSA_ENTRE_ENVIOS_MS));
      }
    }
    return json({
      ok: true,
      status_postado: statusPostado,
      imagem_ganhadores: urlGanhadores,
      compradores_avisados: avisados
    });
  } catch (e) {
    console.error("[anunciar-resultado-rifa] erro:", e);
    return json({
      ok: false,
      erro: e instanceof Error ? e.message : String(e)
    }, 500);
  }
});
