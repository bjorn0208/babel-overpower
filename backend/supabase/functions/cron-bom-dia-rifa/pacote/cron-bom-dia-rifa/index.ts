/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// cron-bom-dia-rifa — ritual diário da rifa em duas etapas (pg_cron):
//
//   etapa "saudacao" (07h BRT): manda "oi, bom dia" pros contatos do tenant
//     oferecendo a rifa do dia — SEM link, SEM números. Opt-in: quem responder
//     cai no motor (webhook → ragentic), que já vende rifa pelas tools.
//   etapa "followup" (12h BRT): quem foi saudado hoje e NÃO respondeu recebe
//     o estado atual da rifa (vendidos/disponíveis/preço + link).
//
// Entrega pela caixa_saida_mensagens (mesmo trilho do lembrete_retorno do
// processar-acompanhamentos): ritmo anti-ban, anti-eco e histórico no painel
// vêm de graça. Dedup por (tenant, lead, dia) em rifa_bom_dia_envios.
//
// Segurança: verify_jwt=false (pg_cron via pg_net), corpo exige
// Bearer == SERVICE_ROLE_KEY — fail closed.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { montarSaudacao } from "../_shared/nomes.ts";

// Rifa mora na Plataforma Limpa (o contrato é que mora na Babel, com env
// própria — ver `_shared/tools-internas.ts`). O default aqui apontava pra
// babel-os.com e divergia do resto, o que já mascarou troca de domínio.
const APP_PUBLIC_URL = Deno.env.get("APP_PUBLIC_URL") ?? "https://www.plataformalimpa.com.br";
// Teto diário de saudações por tenant — protege o chip de flood no 1º dia
// de base grande. Excedente fica pro dia seguinte (dedup por dia libera).
const MAX_SAUDACOES_DIA = 150;

// CORS: o botão 🧪 da aba Disparo chama esta edge do NAVEGADOR — sem o
// preflight OPTIONS respondido, o browser bloqueia (incidente 2026-08-21).
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

/** Dia corrente em BRT (UTC-3) no formato date — pg_cron roda em UTC. */
const diaBRT = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

const ehVideo = (url: string) => /\.(mp4|mov|webm)(\?|$)/i.test(url);

/** Aplica o template custom do tenant (rifas_config_tenant) se preenchido;
 * senão cai no texto padrão. Mesmo estilo de placeholder de processar-disparos-rifa. */
function renderMensagem(template: string | null | undefined, padrao: string, vars: Record<string, string>): string {
  let base = template?.trim() ? template : padrao;
  for (const [chave, valor] of Object.entries(vars)) base = base.replaceAll(`{{${chave}}}`, valor);
  return base;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

/** Enfileira 1 bolha do agente na conversa (mensagens + caixa de saída).
 * Retorna sucesso/erro da ENFILEIRADA (não confirma entrega real — a caixa de
 * saída despacha depois, de forma assíncrona; é o melhor sinal disponível sem
 * tocar no worker de saída). Usado pro check-in de entrega (Theus 2026-09-02). */
async function enfileirarBolha(supabase: Sb, conversaId: string, tenantId: string, texto: string, origem: string): Promise<{ ok: boolean; erro?: string }> {
  const { data: msgRow, error: erroMsg } = await supabase
    .from("mensagens")
    .insert({ conversation_id: conversaId, role: "assistant", content: texto })
    .select("id")
    .single();
  if (erroMsg) return { ok: false, erro: erroMsg.message?.slice(0, 200) };
  const { error: erroCaixa } = await supabase.from("caixa_saida_mensagens").insert({
    conversation_id: conversaId,
    tenant_id: tenantId,
    status: "pendente",
    content: texto,
    bubble_order: 0,
    scheduled_at: new Date().toISOString(),
    delay_calculado_ms: 0,
    engagement_level: "morno",
    carga: { assistant_message_id: msgRow?.id, typing_ms: 4000, delay_message_s: 0, origem },
  });
  if (erroCaixa) return { ok: false, erro: erroCaixa.message?.slice(0, 200) };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, erro: "metodo_invalido" }, 405);

  const chaveServico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, chaveServico);

  // Aceita o Bearer da env OU o segredo do vault que o pg_cron envia (as duas
  // gerações de chave de serviço coexistem — igualdade só com a env dava 401
  // no smoke). RPC ler_segredo_cron é service-only.
  const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  let autorizado = bearer.length > 0 && bearer === chaveServico;
  if (!autorizado && bearer.length > 0) {
    const { data: segredoCron } = await supabase.rpc("ler_segredo_cron");
    autorizado = typeof segredoCron === "string" && segredoCron.length > 0 && bearer === segredoCron;
  }
  // 3º caminho — MODO TESTE do tenant (botão da aba Disparo): JWT do dono
  // dispara o ritual AGORA, só pro próprio tenant (ignora o toggle). Envio
  // REAL pela mesma esteira; o dedup diário continua valendo.
  let tenantTeste: string | null = null;
  if (!autorizado && bearer.length > 0) {
    const { data: auth } = await supabase.auth.getUser(bearer);
    if (auth?.user?.id) {
      autorizado = true;
      tenantTeste = auth.user.id;
    }
  }
  if (!autorizado) return json({ ok: false, erro: "nao_autorizado" }, 401);

  const { etapa } = (await req.json().catch(() => ({}))) as { etapa?: string };
  if (!["saudacao", "followup"].includes(etapa ?? "")) {
    return json({ ok: false, erro: "etapa_invalida (saudacao|followup)" }, 400);
  }
  const hoje = diaBRT();

  const COLS_CONFIG =
    "tenant_id, rifa_disparo_id, bom_dia_mensagem_saudacao, bom_dia_mensagem_followup, " +
    "bom_dia_midia_saudacao_url, bom_dia_midia_followup_url";
  const { data: configs } = tenantTeste
    ? await supabase.from("rifas_config_tenant").select(COLS_CONFIG).eq("tenant_id", tenantTeste)
    : await supabase.from("rifas_config_tenant").select(COLS_CONFIG).eq("bom_dia_rifa_ativo", true);

  let enviados = 0;
  let pulados = 0;

  for (const cfg of configs ?? []) {
    // Canal WhatsApp ativo — sem ele a bolha ficaria pendente pra sempre.
    // Credenciais completas: o followup manda a arte de divulgação por
    // send-image DIRETO (a caixa de saída não carrega mídia).
    const { data: canal } = await supabase
      .from("canais")
      .select("zapi_instance_id, zapi_token, zapi_security_token, zapi_api_url")
      .eq("user_id", cfg.tenant_id)
      .eq("type", "whatsapp")
      .eq("is_active", true)
      .not("zapi_instance_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (!canal) continue;

    // Rifa do dia: a ESCOLHIDA na aba Disparo (se seguir ativa); senão a
    // ativa mais recente do tenant.
    const COLS_RIFA = "id, titulo, premio_principal, total_numeros, preco_numero_centavos, chave_publica";
    // deno-lint-ignore no-explicit-any
    let rifa: any = null;
    if (cfg.rifa_disparo_id) {
      const { data } = await supabase
        .from("rifas")
        .select(COLS_RIFA)
        .eq("id", cfg.rifa_disparo_id)
        .eq("tenant_id", cfg.tenant_id)
        .eq("status", "ativa")
        .is("deleted_at", null)
        .maybeSingle();
      rifa = data ?? null;
    }
    if (!rifa) {
      const { data } = await supabase
        .from("rifas")
        .select(COLS_RIFA)
        .eq("tenant_id", cfg.tenant_id)
        .eq("status", "ativa")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      rifa = data ?? null;
    }
    if (!rifa) continue;

    // Agente ativo — dono das conversas que a saudação abre.
    const { data: agente } = await supabase
      .from("agentes")
      .select("id")
      .eq("user_id", cfg.tenant_id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (!agente) continue;

    if (etapa === "saudacao") {
      const { data: jaSaudados } = await supabase
        .from("rifa_bom_dia_envios")
        .select("lead_id")
        .eq("tenant_id", cfg.tenant_id)
        .eq("dia", hoje);
      const saudados = new Set((jaSaudados ?? []).map((r: { lead_id: string }) => r.lead_id));

      // ALVOS: se a lista de disparo tem gente MARCADA, a saudação vai SÓ pra
      // elas (aba Disparo). Lista vazia → fallback: leads recentes do tenant.
      let alvos: Array<{ phone: string; leadId: string | null; nome: string | null }> = [];
      const { data: lista } = await supabase
        .from("rifa_lista_disparo")
        .select("nome, phone")
        .eq("tenant_id", cfg.tenant_id)
        .eq("marcado", true)
        .limit(MAX_SAUDACOES_DIA);
      if (lista?.length) {
        alvos = lista.map((l: { nome: string | null; phone: string }) => ({ phone: String(l.phone ?? ""), leadId: null, nome: l.nome }));
      } else {
        const { data: leads } = await supabase
          .from("leads")
          .select("id, phone, name")
          .eq("tenant_id", cfg.tenant_id)
          .is("deleted_at", null)
          .not("phone", "is", null)
          .order("updated_at", { ascending: false })
          .limit(MAX_SAUDACOES_DIA + saudados.size);
        alvos = (leads ?? []).map((l: { id: string; phone: string; name: string | null }) => ({ phone: String(l.phone ?? ""), leadId: l.id, nome: l.name }));
      }

      // AGENDA DO CHIP: Status do WhatsApp só é visível pra quem está salvo
      // na agenda do aparelho (regra do WhatsApp, mútua). Salva os alvos via
      // /contacts/add ANTES da saudação — sem isso o post do Status existe
      // mas ninguém vê (incidente 2026-08-21). Best-effort.
      try {
        const contatos = alvos
          .map((a) => ({ firstName: (a.nome ?? "").trim() || "Contato", phone: a.phone.replace(/\D/g, "") }))
          .filter((c) => c.phone.length >= 10);
        if (contatos.length > 0) {
          const baseAgenda = `${canal.zapi_api_url || "https://api.z-api.io"}/instances/${canal.zapi_instance_id}/token/${canal.zapi_token}`;
          await fetch(`${baseAgenda}/contacts/add`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Client-Token": canal.zapi_security_token || "" },
            body: JSON.stringify(contatos),
          });
        }
      } catch (e) {
        console.error("[cron-bom-dia-rifa] contacts/add falhou:", e);
      }

      const padraoSaudacao = (
        `{{saudacao}}, bom dia! ☀️ Tudo bem por aí?\n` +
        `Hoje tá rolando a rifa *${rifa.titulo}* — prêmio: ${rifa.premio_principal}. ` +
        `Quer que eu te mande os detalhes ou te explique como funciona? É só me responder aqui 😉`
      );

      const baseZapiSaudacao = `${canal.zapi_api_url || "https://api.z-api.io"}/instances/${canal.zapi_instance_id}/token/${canal.zapi_token}`;
      const headersZapiSaudacao = { "Content-Type": "application/json", "Client-Token": canal.zapi_security_token || "" };

      let doTenant = 0;
      for (const alvo of alvos) {
        if (doTenant >= MAX_SAUDACOES_DIA) break;
        if (alvo.leadId && saudados.has(alvo.leadId)) continue;
        const phone = alvo.phone.replace(/\D/g, "");
        if (phone.length < 10) continue;

        const { data: conv } = await supabase.rpc("buscar_ou_criar_conversa", {
          p_phone: phone,
          p_tenant_id: cfg.tenant_id,
          p_agent_id: agente.id,
          p_channel: "whatsapp",
          p_first_fase: "saudacao",
        });
        const conversaId = conv?.conversation?.id;
        const leadIdReal = conv?.conversation?.lead_id ?? alvo.leadId;
        if (!conversaId || !leadIdReal) {
          pulados++;
          continue;
        }
        // Dedup do dia também pro caminho da lista (lead só conhecido agora).
        if (saudados.has(leadIdReal)) continue;

        // Saudação inteligente (Theus 2026-09-02): nome de pessoa → "Oi {nome}";
        // nome de empresa/serviço ou sem nome → genérico (Olá/Oi/Opa rotativo).
        const saudacao = renderMensagem(cfg.bom_dia_mensagem_saudacao, padraoSaudacao, {
          titulo: rifa.titulo ?? "", premio: rifa.premio_principal ?? "", saudacao: montarSaudacao(alvo.nome),
        });

        // Mídia própria (2026-09-01): manda DIRETO por Z-API (a caixa de saída
        // não carrega mídia — mesmo motivo do followup já ser direto). Sem
        // mídia, mantém o trilho de sempre (caixa_saida_mensagens).
        let mandouMidia = false;
        let statusSaudacao: "sucesso" | "erro" = "erro";
        let erroSaudacao: string | null = null;
        if (cfg.bom_dia_midia_saudacao_url) {
          try {
            const rota = ehVideo(cfg.bom_dia_midia_saudacao_url) ? "send-video" : "send-image";
            const campoMidia = ehVideo(cfg.bom_dia_midia_saudacao_url) ? "video" : "image";
            const res = await fetch(`${baseZapiSaudacao}/${rota}`, {
              method: "POST",
              headers: headersZapiSaudacao,
              body: JSON.stringify({ phone, [campoMidia]: cfg.bom_dia_midia_saudacao_url, caption: saudacao }),
            });
            if (res.ok) {
              await supabase.from("mensagens").insert({
                conversation_id: conversaId,
                role: "assistant",
                content: saudacao,
                carga: { origem: "bom_dia_rifa", file: { url: cfg.bom_dia_midia_saudacao_url, tipo: campoMidia } },
              });
              mandouMidia = true;
              statusSaudacao = "sucesso";
            } else {
              erroSaudacao = `zapi_status_${res.status}`;
            }
          } catch (e) {
            console.error(`[cron-bom-dia-rifa] mídia da saudação falhou lead=${leadIdReal}:`, e);
            erroSaudacao = (e as Error).message?.slice(0, 200) ?? "erro_desconhecido";
          }
        }
        if (!mandouMidia) {
          const resultado = await enfileirarBolha(supabase, conversaId, cfg.tenant_id, saudacao, "bom_dia_rifa");
          statusSaudacao = resultado.ok ? "sucesso" : "erro";
          erroSaudacao = resultado.ok ? null : (resultado.erro ?? "erro_desconhecido");
        }
        await supabase.from("rifa_bom_dia_envios").insert({
          tenant_id: cfg.tenant_id,
          rifa_id: rifa.id,
          lead_id: leadIdReal,
          conversa_id: conversaId,
          dia: hoje,
          status_saudacao: statusSaudacao,
          erro_saudacao: erroSaudacao,
        });
        saudados.add(leadIdReal);
        enviados++;
        doTenant++;
      }
    } else {
      // FOLLOWUP — só quem foi saudado hoje, ainda sem followup e SEM resposta.
      const { data: pendentes } = await supabase
        .from("rifa_bom_dia_envios")
        .select("id, lead_id, conversa_id, saudado_em")
        .eq("tenant_id", cfg.tenant_id)
        .eq("dia", hoje)
        .is("followup_em", null)
        .not("conversa_id", "is", null);

      if (!pendentes?.length) continue;

      const { count: pagos } = await supabase
        .from("numeros_rifa")
        .select("id", { count: "exact", head: true })
        .eq("rifa_id", rifa.id)
        .eq("status", "pago");
      const { count: reservados } = await supabase
        .from("numeros_rifa")
        .select("id", { count: "exact", head: true })
        .eq("rifa_id", rifa.id)
        .eq("status", "reservado");
      const vendidos = pagos ?? 0;
      const disponiveis = Math.max(0, rifa.total_numeros - vendidos - (reservados ?? 0));

      const linkRifa = `${APP_PUBLIC_URL}/rifa/${rifa.chave_publica}`;
      const varsFollowup = {
        titulo: rifa.titulo ?? "",
        premio: rifa.premio_principal ?? "",
        vendidos: String(vendidos),
        restam: String(disponiveis),
        preco: fmtBRL(rifa.preco_numero_centavos),
        link: linkRifa,
      };
      const corpoFollowupPadrao =
        `Passando pra te atualizar sobre a rifa *${rifa.titulo}* 👀\n` +
        `🏆 Prêmio: ${rifa.premio_principal}\n` +
        `🔥 ${vendidos} números já garantidos · restam ${disponiveis} de ${rifa.total_numeros}\n` +
        `💰 ${fmtBRL(rifa.preco_numero_centavos)} por número\n`;
      // Theus 2026-08-24: disparo com imagem NÃO leva link cru — a legenda convida a responder
      // (o motor vende no chat).
      // Δ 2026-09-09 (Fabrício): o fallback em TEXTO também parou de mandar link. A atualização
      // de status na conversa é foto com legenda; link cru na conversa tira o cliente do chat,
      // que é onde o agente fecha. Template custom do tenant continua mandando no que ele
      // escrever (se ele puser `{{link}}`, o link vai — a escolha é dele).
      const followupTextoPadrao = `{{saudacao}}! ` + corpoFollowupPadrao + `Quer participar? É só me responder aqui 😉`;
      const followupImagemPadrao = followupTextoPadrao;

      // Mídia própria do tenant tem prioridade; sem ela, cai pra arte de
      // DIVULGAÇÃO mais recente da galeria (comportamento de antes, só imagem).
      let urlMidiaFollowup: string | null = cfg.bom_dia_midia_followup_url ?? null;
      if (!urlMidiaFollowup) {
        const { data: arte } = await supabase
          .from("rifa_imagens")
          .select("url")
          .eq("rifa_id", rifa.id)
          .eq("tipo", "divulgacao")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        urlMidiaFollowup = arte?.url ?? null;
      }
      const baseZapi = `${canal.zapi_api_url || "https://api.z-api.io"}/instances/${canal.zapi_instance_id}/token/${canal.zapi_token}`;
      const headersZapi = { "Content-Type": "application/json", "Client-Token": canal.zapi_security_token || "" };
      const MAX_IMAGENS_FOLLOWUP = 60;
      let imagensEnviadas = 0;

      for (const p of pendentes) {
        // Respondeu depois da saudação? Então o motor já cuidou — não incomoda.
        const { data: respostas } = await supabase
          .from("mensagens")
          .select("id")
          .eq("conversation_id", p.conversa_id)
          .eq("role", "user")
          .gt("created_at", p.saudado_em)
          .limit(1);
        if (respostas?.length) {
          await supabase
            .from("rifa_bom_dia_envios")
            .update({ followup_em: new Date().toISOString() })
            .eq("id", p.id);
          pulados++;
          continue;
        }

        // Nome do lead pra saudação personalizada (Theus 2026-09-02) — busca
        // 1x aqui, serve pro texto E pra legenda da mídia.
        const { data: leadRow } = await supabase
          .from("leads")
          .select("phone, name, nome_exibicao")
          .eq("id", p.lead_id)
          .maybeSingle();
        const saudacaoLead = montarSaudacao(leadRow?.nome_exibicao ?? leadRow?.name ?? null);
        const followup = renderMensagem(cfg.bom_dia_mensagem_followup, followupTextoPadrao, { ...varsFollowup, saudacao: saudacaoLead });
        const legendaImagem = renderMensagem(cfg.bom_dia_mensagem_followup, followupImagemPadrao, { ...varsFollowup, saudacao: saudacaoLead });

        // Com mídia (própria ou arte de divulgação): manda com o texto na
        // legenda (send-image/send-video direto, registrado em `mensagens`
        // pro painel). Sem mídia ou acima do teto: texto pela caixa de saída.
        let mandouMidia = false;
        let statusFollowup: "sucesso" | "erro" = "erro";
        let erroFollowup: string | null = null;
        if (urlMidiaFollowup && imagensEnviadas < MAX_IMAGENS_FOLLOWUP) {
          const fone = String(leadRow?.phone ?? "").replace(/\D/g, "");
          if (fone.length >= 10) {
            try {
              const rota = ehVideo(urlMidiaFollowup) ? "send-video" : "send-image";
              const campoMidia = ehVideo(urlMidiaFollowup) ? "video" : "image";
              const res = await fetch(`${baseZapi}/${rota}`, {
                method: "POST",
                headers: headersZapi,
                body: JSON.stringify({ phone: fone, [campoMidia]: urlMidiaFollowup, caption: legendaImagem }),
              });
              if (res.ok) {
                await supabase.from("mensagens").insert({
                  conversation_id: p.conversa_id,
                  role: "assistant",
                  content: legendaImagem,
                  carga: { origem: "bom_dia_rifa_followup", file: { url: urlMidiaFollowup, tipo: campoMidia } },
                });
                mandouMidia = true;
                statusFollowup = "sucesso";
                imagensEnviadas++;
                await new Promise((r) => setTimeout(r, 400));
              } else {
                erroFollowup = `zapi_status_${res.status}`;
              }
            } catch (e) {
              console.error(`[cron-bom-dia-rifa] mídia do followup falhou lead=${p.lead_id}:`, e);
              erroFollowup = (e as Error).message?.slice(0, 200) ?? "erro_desconhecido";
            }
          } else {
            erroFollowup = "telefone_invalido";
          }
        }
        if (!mandouMidia) {
          const resultado = await enfileirarBolha(supabase, p.conversa_id, cfg.tenant_id, followup, "bom_dia_rifa_followup");
          statusFollowup = resultado.ok ? "sucesso" : "erro";
          erroFollowup = resultado.ok ? null : (resultado.erro ?? "erro_desconhecido");
        }
        await supabase
          .from("rifa_bom_dia_envios")
          .update({ followup_em: new Date().toISOString(), status_followup: statusFollowup, erro_followup: erroFollowup })
          .eq("id", p.id);
        enviados++;
      }
    }
  }

  return json({ ok: true, etapa, enviados, pulados, modo_teste: !!tenantTeste });
});
