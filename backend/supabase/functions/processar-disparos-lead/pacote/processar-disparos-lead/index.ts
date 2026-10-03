/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// processar-disparos-lead — cron 5min, generaliza processar-disparos-rifa
// pro domínio de leads/campanha (Mentor de Disparo). Acha `disparos_lead`
// ativos cujo horário bateu (ou `horario IS NULL` = 1x "agora"), resolve o
// público (contatos_ids manual OU listas_disparo_lead → resolvedor de
// critério compartilhado), manda foto/texto/vídeo/foto+texto via Z-API
// (mensagem fixa — sem agente reescrevendo nada), respeita o tempo de
// descanso entre envios, loga cada tentativa em disparos_lead_envios.
//
// Espelha o padrão de auth de processar-disparos-rifa: verify_jwt=false
// (pg_cron via pg_net), Bearer == SERVICE_ROLE_KEY OU segredo do vault, OU
// JWT do tenant em modo teste (dispara agora, só esse tenant, ignora
// horário/dedup).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { tenantsPausados } from "../_shared/pausa-tenant.ts";
import { resolverLeadsDisparo, type ParametrosResolucaoLead } from "../_shared/resolver-criterios-lead.ts";

const JANELA_MINUTOS = 5;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const agoraBRT = () => new Date(Date.now() - 3 * 3600_000);
const diaBRT = () => agoraBRT().toISOString().slice(0, 10);
const horaMinutoBRT = () => agoraBRT().toISOString().slice(11, 16);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

function diffMinutos(horarioAgendado: string, agora: string): number {
  const [h1, m1] = horarioAgendado.split(":").map(Number);
  const [h2, m2] = agora.split(":").map(Number);
  return Math.abs(h1 * 60 + m1 - (h2 * 60 + m2));
}

interface LeadAlvo {
  /** null pra alvo de disparo manual (número digitado, sem lead correspondente). */
  id: string | null;
  phone: string | null;
  name: string | null;
  nome_exibicao: string | null;
  produto: string | null;
  fase_pipeline: string | null;
}

interface ContatoManual {
  telefone: string;
  nome: string | null;
}

function montarMensagem(template: string | null, lead: LeadAlvo): string {
  if (!template) return "";
  return template
    .replaceAll("{{nome}}", lead.nome_exibicao || lead.name || "")
    .replaceAll("{{produto}}", lead.produto ?? "")
    .replaceAll("{{fase_pipeline}}", lead.fase_pipeline ?? "");
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
  let tenantTeste: string | null = null;
  let disparoTeste: string | null = null;
  if (!autorizado && bearer.length > 0) {
    const { data: auth } = await supabase.auth.getUser(bearer);
    if (auth?.user?.id) {
      autorizado = true;
      tenantTeste = auth.user.id;
    }
  }
  if (!autorizado) return json({ ok: false, erro: "nao_autorizado" }, 401);

  const corpo = (await req.json().catch(() => ({}))) as { disparo_id?: string };
  if (tenantTeste && corpo.disparo_id) disparoTeste = corpo.disparo_id;

  const hoje = diaBRT();
  const agora = horaMinutoBRT();

  let q = supabase.from("disparos_lead").select("*").eq("ativo", true);
  if (disparoTeste) q = q.eq("id", disparoTeste);
  else if (tenantTeste) q = q.eq("tenant_id", tenantTeste);
  const { data: disparos } = await q;

  // Δ 2026-09-17 (Theus): freio de mão do tenant vale também pro disparo do
  // Mentor — o botão promete "pausa tudo".
  const pausados = await tenantsPausados(
    supabase,
    (disparos ?? []).map((d: { tenant_id: string }) => d.tenant_id),
  );

  let processados = 0;
  let enviados = 0;
  let falharam = 0;

  for (const disparo of disparos ?? []) {
    if (pausados.has(disparo.tenant_id)) {
      console.log(`[disparos-lead] tenant ${disparo.tenant_id} com envios pausados — pulando disparo ${disparo.id}`);
      continue;
    }
    // Dedup: horario nulo = 1x "agora" (roda uma vez, depois desativa).
    // horario preenchido = recorrente diário, mesma janela do Rifa.
    // Claim ATÔMICO no início (auditoria 2026-08-31): antes o carimbo só era
    // gravado no fim, após percorrer todos os contatos com descanso — o próximo
    // tick do cron lia o mesmo disparo e mandava de novo → blast duplicado no
    // WhatsApp. O UPDATE condicional trava a linha; a execução concorrente não
    // casa o filtro e pula.
    if (!disparoTeste) {
      if (disparo.horario === null) {
        if (disparo.ultima_execucao_dia !== null) continue;
        const { data: claim } = await supabase.from("disparos_lead")
          .update({ ultima_execucao_dia: hoje, updated_at: new Date().toISOString() })
          .eq("id", disparo.id)
          .is("ultima_execucao_dia", null)
          .select("id");
        if (!claim || claim.length === 0) continue;
      } else {
        if (disparo.ultima_execucao_dia === hoje) continue;
        if (diffMinutos(disparo.horario.slice(0, 5), agora) > JANELA_MINUTOS) continue;
        const { data: claim } = await supabase.from("disparos_lead")
          .update({ ultima_execucao_dia: hoje, updated_at: new Date().toISOString() })
          .eq("id", disparo.id)
          .or(`ultima_execucao_dia.is.null,ultima_execucao_dia.neq.${hoje}`)
          .select("id");
        if (!claim || claim.length === 0) continue;
      }
    }

    const { data: canal } = await supabase
      .from("canais")
      .select("zapi_instance_id, zapi_token, zapi_security_token, zapi_api_url")
      .eq("user_id", disparo.tenant_id)
      .eq("type", "whatsapp")
      .eq("is_active", true)
      .not("zapi_instance_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (!canal) continue;

    // Alvos: contatos_ids manual (override) OU lista salva resolvida ao vivo.
    let alvos: LeadAlvo[] = [];
    let idsAlvo: string[] = [];

    if (disparo.contatos_ids?.length) {
      idsAlvo = disparo.contatos_ids;
    } else if (disparo.lista_disparo_id) {
      const { data: lista } = await supabase
        .from("listas_disparo_lead")
        .select("lead_ids, criterios")
        .eq("id", disparo.lista_disparo_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (!lista) continue;

      if (lista.lead_ids?.length) {
        idsAlvo = lista.lead_ids;
      } else {
        const cfg = (lista.criterios ?? {}) as Partial<ParametrosResolucaoLead> & { publico?: "lead" | "cliente" | "ambos" };
        idsAlvo = await resolverLeadsDisparo(supabase, {
          tenantId: disparo.tenant_id,
          modo: cfg.modo ?? "todos",
          operadorGlobal: cfg.operadorGlobal ?? "AND",
          criterios: cfg.criterios ?? [],
          publico: cfg.publico,
        });
      }
    }

    if (idsAlvo.length > 0) {
      const { data } = await supabase
        .from("leads")
        .select("id, phone, name, nome_exibicao, produto, fase_pipeline")
        .in("id", idsAlvo)
        .eq("tenant_id", disparo.tenant_id)
        .is("deleted_at", null)
        .is("opt_out_at", null);
      alvos = (data ?? []) as LeadAlvo[];
    }

    // Disparo manual (números digitados) — soma aos alvos de lead/lista, se
    // houver. Sem lead correspondente, então sem checagem de opt-out de CRM
    // (mesmo padrão do disparo manual já em produção no app Rifas).
    if ((disparo.contatos_manuais as ContatoManual[] | null)?.length) {
      const manuais: LeadAlvo[] = (disparo.contatos_manuais as ContatoManual[]).map((c) => ({
        id: null,
        phone: c.telefone,
        name: c.nome,
        nome_exibicao: c.nome,
        produto: null,
        fase_pipeline: null,
      }));
      alvos = [...alvos, ...manuais];
    }

    const base = `${canal.zapi_api_url || "https://api.z-api.io"}/instances/${canal.zapi_instance_id}/token/${canal.zapi_token}`;
    const headers = { "Content-Type": "application/json", "Client-Token": canal.zapi_security_token || "" };
    const descansoMs = Math.max(0, (disparo.tempo_descanso_segundos ?? 5) * 1000);

    for (const [i, alvo] of alvos.entries()) {
      processados++;
      const phone = String(alvo.phone ?? "").replace(/\D/g, "");
      if (phone.length < 10) { falharam++; continue; }

      const mensagem = montarMensagem(disparo.mensagem, alvo);

      let rota: string;
      let payload: Record<string, unknown>;
      if (disparo.tipo_conteudo === "texto") {
        rota = "send-text";
        payload = { phone, message: mensagem };
      } else if (disparo.tipo_conteudo === "video") {
        rota = "send-video";
        payload = { phone, video: disparo.midia_url, caption: mensagem };
      } else {
        // "foto" ou "foto_texto" — diferença é só se manda legenda.
        rota = "send-image";
        payload = { phone, image: disparo.midia_url, caption: disparo.tipo_conteudo === "foto_texto" ? mensagem : undefined };
      }

      let statusEnvio: "sucesso" | "erro" = "sucesso";
      let erroDetalhe: string | null = null;
      try {
        if (disparo.tipo_conteudo !== "texto" && !disparo.midia_url) {
          throw new Error("disparo sem midia_url configurada");
        }
        const res = await fetch(`${base}/${rota}`, { method: "POST", headers, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error(`Z-API status ${res.status}: ${(await res.text()).slice(0, 200)}`);
        enviados++;
      } catch (e) {
        statusEnvio = "erro";
        erroDetalhe = e instanceof Error ? e.message : String(e);
        falharam++;
        console.error(`[processar-disparos-lead] falhou disparo=${disparo.id} phone=${phone}:`, erroDetalhe);
      }

      await supabase.from("disparos_lead_envios").insert({
        tenant_id: disparo.tenant_id,
        disparo_id: disparo.id,
        lead_id: alvo.id,
        phone,
        status: statusEnvio,
        mensagem_enviada: mensagem,
        erro_detalhe: erroDetalhe,
      });

      if (i < alvos.length - 1 && descansoMs > 0) await new Promise((r) => setTimeout(r, descansoMs));
    }

    // ultima_execucao_dia já foi carimbado no claim atômico do início.
    // Aqui só resta desativar o disparo "1x agora" pra não reagendar.
    if (!disparoTeste && disparo.horario === null) {
      await supabase.from("disparos_lead")
        .update({ ativo: false, updated_at: new Date().toISOString() })
        .eq("id", disparo.id);
    }
  }

  return json({ ok: true, processados, enviados, falharam, modo_teste: !!tenantTeste });
});
