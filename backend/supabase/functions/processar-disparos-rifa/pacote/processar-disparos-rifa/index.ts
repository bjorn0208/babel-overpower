/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// processar-disparos-rifa — roda a cada 5 min (pg_cron), acha agendamentos
// ativos cujo horário bateu com o minuto BRT atual e ainda não rodaram hoje,
// manda foto/texto/vídeo/foto+texto pros contatos alvo (contatos_ids do
// agendamento ou todos os marcados em rifa_lista_disparo), respeitando o
// tempo de descanso entre cada envio. Loga cada tentativa em
// rifa_disparo_envios pra alimentar a taxa de envio ao vivo do frontend.
//
// Espelha o padrão de auth de cron-status-rifa / cron-bom-dia-rifa:
// verify_jwt=false (pg_cron via pg_net), Bearer == SERVICE_ROLE_KEY OU
// segredo do vault, OU JWT do tenant na invocação manual pela UI.
//
// ── Disparo manual em 2 estágios (spec Theus 2026-09-06) ────────────────────
// A UI invoca com `agendamento_id` + `modo`:
//
//   modo="teste"  → estágio 1. Manda pra UM número só, o do dono (config
//                   `disparos_telefone_teste`, ou o WhatsApp conectado do
//                   tenant). Carimba `teste_em`/`teste_phone` e NÃO queima o
//                   `ultima_execucao_dia` — testar não gasta o disparo do dia.
//
//   modo="real"   → estágio 2. Só passa se existir teste válido: `teste_em`
//                   preenchido E >= `atualizado_em`. Editou a mensagem depois
//                   de testar? O teste vence e ele tem que testar de novo.
//
// Antes disso, "Testar agora" chamava esta mesma edge com `agendamento_id` e
// ela disparava pra LISTA REAL, só pulando a checagem de horário. Era um
// blast disfarçado de teste.
//
// ── Pausa geral ────────────────────────────────────────────────────────────
// `rifas_config_tenant.disparos_pausados` é conferido antes de começar cada
// agendamento E antes de CADA envio. Como o loop dorme 20-90s entre mensagens,
// apertar pausa para na mensagem seguinte. Vale pro manual e pro cron.

import { createClient } from "jsr:@supabase/supabase-js@2";

const JANELA_MINUTOS = 5;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const fmtBRL = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const agoraBRT = () => new Date(Date.now() - 3 * 3600_000);
const diaBRT = () => agoraBRT().toISOString().slice(0, 10);
const horaMinutoBRT = () => agoraBRT().toISOString().slice(11, 16);

/** "HH:MM" dentro de [inicio, fim] — null nos dois lados = sem restrição. */
function dentroDaJanela(agora: string, inicio: string | null, fim: string | null): boolean {
  if (!inicio || !fim) return true;
  const i = inicio.slice(0, 5);
  const f = fim.slice(0, 5);
  return i <= f ? agora >= i && agora <= f : agora >= i || agora <= f; // cobre janela que cruza meia-noite
}

/** Jitter anti-ban: nunca um intervalo fixo — sorteia entre min e max a cada envio. */
function descansoAleatorioMs(minSeg: number, maxSeg: number): number {
  const min = Math.max(0, minSeg);
  const max = Math.max(min, maxSeg);
  return Math.round((min + Math.random() * (max - min)) * 1000);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

/** Diferença em minutos entre "HH:MM" do agendamento e o agora BRT (0-1439). */
function diffMinutos(horarioAgendado: string, agora: string): number {
  const [h1, m1] = horarioAgendado.split(":").map(Number);
  const [h2, m2] = agora.split(":").map(Number);
  return Math.abs(h1 * 60 + m1 - (h2 * 60 + m2));
}

/** Config de disparo do tenant. Erro de leitura NUNCA pausa sozinho — pausa
 *  fantasma seria pior que a falta dela: o dono acha que mandou e não mandou. */
async function lerConfigDisparo(
  sb: Sb,
  tenantId: string,
): Promise<{ pausados: boolean; telefoneTeste: string | null }> {
  const { data, error } = await sb
    .from("rifas_config_tenant")
    .select("disparos_pausados, disparos_telefone_teste")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    console.warn(`[processar-disparos-rifa] config do tenant ${tenantId} ilegível:`, error.message);
    return { pausados: false, telefoneTeste: null };
  }
  return {
    pausados: data?.disparos_pausados === true,
    telefoneTeste: (data?.disparos_telefone_teste ?? null) as string | null,
  };
}

/** Alvo do estágio 1: número escolhido na config, senão o WhatsApp conectado
 *  do próprio tenant. Sem nenhum dos dois não há teste possível. */
async function resolverTelefoneTeste(
  sb: Sb,
  tenantId: string,
  daConfig: string | null,
): Promise<string | null> {
  const escolhido = String(daConfig ?? "").replace(/\D/g, "");
  if (escolhido.length >= 10) return escolhido;
  const { data } = await sb
    .from("canais")
    .select("whatsapp_phone")
    .eq("user_id", tenantId)
    .eq("type", "whatsapp")
    .eq("is_active", true)
    .not("whatsapp_phone", "is", null)
    .limit(1)
    .maybeSingle();
  const doCanal = String(data?.whatsapp_phone ?? "").replace(/\D/g, "");
  return doCanal.length >= 10 ? doCanal : null;
}

/** Teste vale enquanto ninguém mexeu no agendamento depois dele. */
function testeValido(ag: Sb): boolean {
  if (!ag.teste_em) return false;
  if (!ag.atualizado_em) return true;
  return new Date(ag.teste_em).getTime() >= new Date(ag.atualizado_em).getTime();
}

function montarMensagem(template: string | null, rifa: Sb, vendidos: number, restam: number): string {
  if (!template) return `${rifa.titulo} — ${vendidos} vendidos, restam ${restam}. ${fmtBRL(rifa.preco_numero_centavos)} o número.`;
  return template
    .replaceAll("{{titulo}}", rifa.titulo ?? "")
    .replaceAll("{{premio}}", rifa.premio_principal ?? "")
    .replaceAll("{{vendidos}}", String(vendidos))
    .replaceAll("{{restam}}", String(restam))
    .replaceAll("{{preco}}", fmtBRL(rifa.preco_numero_centavos));
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
  let agendamentoManual: string | null = null;
  if (!autorizado && bearer.length > 0) {
    const { data: auth } = await supabase.auth.getUser(bearer);
    if (auth?.user?.id) {
      autorizado = true;
      tenantTeste = auth.user.id;
    }
  }
  if (!autorizado) return json({ ok: false, erro: "nao_autorizado" }, 401);

  const corpo = (await req.json().catch(() => ({}))) as {
    agendamento_id?: string;
    modo?: "teste" | "real";
  };
  if (tenantTeste && corpo.agendamento_id) agendamentoManual = corpo.agendamento_id;
  // Só a invocação manual da UI tem estágio. O cron sempre roda como "real".
  const ehTeste = !!agendamentoManual && corpo.modo === "teste";

  const hoje = diaBRT();
  const agora = horaMinutoBRT();

  let q = supabase.from("rifa_agendamentos_disparo").select("*").eq("ativo", true);
  if (agendamentoManual) q = q.eq("id", agendamentoManual);
  else if (tenantTeste) q = q.eq("tenant_id", tenantTeste);
  const { data: agendamentos } = await q;

  let processados = 0;
  let enviados = 0;
  let falharam = 0;
  let houvePausa = false;

  for (const ag of agendamentos ?? []) {
    // Invocação manual só pode tocar agendamento do próprio tenant — o filtro
    // por id acima é por id puro, então sem esta linha um tenant logado
    // dispararia o agendamento de outro sabendo o uuid.
    if (tenantTeste && ag.tenant_id !== tenantTeste) continue;

    const config = await lerConfigDisparo(supabase, ag.tenant_id);
    // Pausa segura a lista, não o teste. Quem pausou quase sempre pausou pra
    // corrigir a mensagem — travar o teste junto o deixaria sem como conferir
    // a correção antes de soltar o freio.
    if (config.pausados && !ehTeste) {
      houvePausa = true;
      continue;
    }

    // Estágio 2 (disparo real pela UI) exige teste válido. O cron não passa
    // por aqui de propósito: os agendamentos que já rodam hoje têm `teste_em`
    // nulo e parariam todos de uma vez, sem ninguém entender por quê.
    if (agendamentoManual && !ehTeste && !testeValido(ag)) {
      return json(
        {
          ok: false,
          erro: "teste_pendente",
          detalhe: ag.teste_em
            ? "A mensagem mudou depois do último teste. Teste de novo antes de mandar pra lista."
            : "Faça o disparo de teste no seu número antes de mandar pra lista.",
        },
        409,
      );
    }
    // Já rodou hoje? Pula (exceto invocação manual por id).
    if (!agendamentoManual) {
      if (ag.ultima_execucao_dia === hoje) continue;
      if (diffMinutos(ag.horario.slice(0, 5), agora) > JANELA_MINUTOS) continue;

      // Claim ATÔMICO no início (auditoria 2026-08-31): antes o carimbo de
      // ultima_execucao_dia só era gravado no fim, após percorrer todos os
      // contatos com descanso (>5 min p/ listas grandes) — o próximo tick do
      // cron (a cada 5 min) lia o mesmo agendamento e disparava de novo →
      // blast duplicado no WhatsApp. O UPDATE condicional trava a linha; a
      // execução concorrente não casa o filtro e pula.
      //
      // `atualizado_em` NÃO entra neste update de propósito. Desde que o teste
      // do estágio 2 é validado por `teste_em >= atualizado_em`, mexer no
      // carimbo aqui faria o cron invalidar o teste do dono toda madrugada,
      // sem ninguém ter editado nada. `atualizado_em` agora significa uma coisa
      // só: alguém mudou o conteúdo do disparo.
      const { data: claim } = await supabase
        .from("rifa_agendamentos_disparo")
        .update({ ultima_execucao_dia: hoje })
        .eq("id", ag.id)
        .or(`ultima_execucao_dia.is.null,ultima_execucao_dia.neq.${hoje}`)
        .select("id");
      if (!claim || claim.length === 0) continue;
    }

    // Janela de horário permitido (anti-ban) — vale pro cron e pro disparo
    // real manual. O teste é isento: é UMA mensagem pro próprio dono, e travar
    // ele fora da janela só o impediria de conferir o material à noite.
    if (!ehTeste && !dentroDaJanela(agora, ag.janela_inicio, ag.janela_fim)) continue;

    const { data: rifa } = await supabase
      .from("rifas")
      .select("id, titulo, premio_principal, total_numeros, preco_numero_centavos, chave_publica")
      .eq("id", ag.rifa_id)
      .eq("tenant_id", ag.tenant_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!rifa) continue;

    const { data: canal } = await supabase
      .from("canais")
      .select("zapi_instance_id, zapi_token, zapi_security_token, zapi_api_url")
      .eq("user_id", ag.tenant_id)
      .eq("type", "whatsapp")
      .eq("is_active", true)
      .not("zapi_instance_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (!canal) continue;

    const { count: pagos } = await supabase
      .from("numeros_rifa").select("id", { count: "exact", head: true })
      .eq("rifa_id", rifa.id).eq("status", "pago");
    const { count: reservados } = await supabase
      .from("numeros_rifa").select("id", { count: "exact", head: true })
      .eq("rifa_id", rifa.id).eq("status", "reservado");
    const vendidos = pagos ?? 0;
    const restam = Math.max(0, rifa.total_numeros - vendidos - (reservados ?? 0));
    const mensagem = montarMensagem(ag.mensagem, rifa, vendidos, restam);

    // Mídia: prioriza o arquivo escolhido pelo dono (`midia_url`). Sem ele,
    // cai pra cartela auto-gerada — mas SÓ pra foto/foto_texto. "Vídeo" exige
    // `midia_url` (a cartela é sempre imagem; mandar ela como vídeo pro
    // send-video da Z-API era a feature morta que existia antes).
    let urlImagem: string | null = ag.midia_url ?? null;
    if (!urlImagem && ag.tipo_conteudo !== "texto" && ag.tipo_conteudo !== "video") {
      const { data: arte } = await supabase
        .from("rifa_imagens")
        .select("url")
        .eq("rifa_id", rifa.id)
        .eq("tipo", "cartela")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      urlImagem = arte?.url ?? null;
    }

    // Alvos. No estágio 1 é UM número só, o do dono — a lista da esteira nem
    // chega a ser lida, então não existe caminho pelo qual um teste vaze pra
    // ela. No estágio 2 e no cron: contatos_ids do agendamento (seleção
    // manual) ou todos os marcados.
    let alvos: Array<{ id: string | null; phone: string }> = [];
    if (ehTeste) {
      const fone = await resolverTelefoneTeste(supabase, ag.tenant_id, config.telefoneTeste);
      if (!fone) {
        return json(
          {
            ok: false,
            erro: "sem_telefone_teste",
            detalhe:
              "Nenhum número pra receber o teste. Preencha o telefone de teste na config do app Rifas ou conecte o WhatsApp do tenant.",
          },
          422,
        );
      }
      alvos = [{ id: null, phone: fone }];
    } else if (ag.contatos_ids?.length) {
      const { data } = await supabase
        .from("rifa_lista_disparo").select("id, phone").in("id", ag.contatos_ids);
      alvos = (data ?? []) as Array<{ id: string; phone: string }>;
    } else {
      const { data } = await supabase
        .from("rifa_lista_disparo").select("id, phone")
        .eq("tenant_id", ag.tenant_id).eq("marcado", true);
      alvos = (data ?? []) as Array<{ id: string; phone: string }>;
    }

    const base = `${canal.zapi_api_url || "https://api.z-api.io"}/instances/${canal.zapi_instance_id}/token/${canal.zapi_token}`;
    const headers = { "Content-Type": "application/json", "Client-Token": canal.zapi_security_token || "" };
    const descansoMin = ag.descanso_min_segundos ?? 20;
    const descansoMax = ag.descanso_max_segundos ?? 90;
    const limiteDiario = ag.limite_diario ?? null;

    for (const [i, alvo] of alvos.entries()) {
      if (limiteDiario !== null && enviados >= limiteDiario) break; // corta o resto — não é falha, é anti-ban

      // Freio de mão conferido a CADA envio, não só no começo: o loop dorme
      // 20-90s entre mensagens e pode levar mais de uma hora numa lista de 300.
      // Sem esta releitura, apertar pausa não pararia o disparo em andamento —
      // que é justamente quando alguém aperta pausa.
      if (!ehTeste) {
        const { pausados } = await lerConfigDisparo(supabase, ag.tenant_id);
        if (pausados) {
          houvePausa = true;
          console.warn(`[processar-disparos-rifa] pausa acionada no meio do agendamento ${ag.id} — parando após ${enviados} envios`);
          break;
        }
      }

      processados++;
      const phone = String(alvo.phone ?? "").replace(/\D/g, "");
      if (phone.length < 10) { falharam++; continue; }

      // delayMessage/delayTyping nativos da Z-API (mesmo padrão já usado no
      // motor de bolhas) — atraso curto e humano em CIMA do descanso entre
      // mensagens, que já é o jitter grande.
      const delayTyping = 1 + Math.round(Math.random() * 2); // 1-3s
      const delayMessage = 1 + Math.round(Math.random() * 2); // 1-3s

      let rota: string;
      let payload: Record<string, unknown>;
      if (ag.tipo_conteudo === "texto") {
        rota = "send-text";
        payload = { phone, message: mensagem, delayTyping, delayMessage };
      } else if (ag.tipo_conteudo === "video") {
        rota = "send-video";
        payload = { phone, video: urlImagem, caption: mensagem, delayMessage };
      } else {
        // "foto" ou "foto_texto" — a única diferença é se manda legenda.
        rota = "send-image";
        payload = { phone, image: urlImagem, caption: ag.tipo_conteudo === "foto_texto" ? mensagem : undefined, delayMessage };
      }

      let statusEnvio: "sucesso" | "erro" = "sucesso";
      let erroDetalhe: string | null = null;
      try {
        if (ag.tipo_conteudo === "video" && !urlImagem) {
          throw new Error("tipo vídeo sem mídia anexada — edite o agendamento e escolha um arquivo");
        }
        if ((ag.tipo_conteudo === "foto" || ag.tipo_conteudo === "foto_texto") && !urlImagem) {
          throw new Error("sem imagem atual da rifa (galeria vazia) nem mídia própria anexada");
        }
        const res = await fetch(`${base}/${rota}`, { method: "POST", headers, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error(`Z-API status ${res.status}: ${(await res.text()).slice(0, 200)}`);
        enviados++;
      } catch (e) {
        statusEnvio = "erro";
        erroDetalhe = e instanceof Error ? e.message : String(e);
        falharam++;
        console.error(`[processar-disparos-rifa] falhou agendamento=${ag.id} phone=${phone}:`, erroDetalhe);
      }

      await supabase.from("rifa_disparo_envios").insert({
        tenant_id: ag.tenant_id,
        agendamento_id: ag.id,
        rifa_id: rifa.id,
        lista_disparo_id: alvo.id,
        phone,
        status: statusEnvio,
        mensagem_enviada: mensagem,
        erro_detalhe: erroDetalhe,
      });

      const ultimoDaLista = i === alvos.length - 1;
      const paramosPorLimite = limiteDiario !== null && enviados >= limiteDiario;
      if (!ultimoDaLista && !paramosPorLimite) {
        await new Promise((r) => setTimeout(r, descansoAleatorioMs(descansoMin, descansoMax)));
      }
    }

    if (ehTeste) {
      // Carimba o teste SÓ se a mensagem saiu de fato. Teste que falhou não
      // pode liberar o estágio 2 — seria o contrário da razão de existir dele.
      // Não mexe em `atualizado_em`: ele guarda a última edição de conteúdo, e
      // é justamente contra ele que `testeValido` compara.
      if (enviados > 0) {
        await supabase.from("rifa_agendamentos_disparo")
          .update({ teste_em: new Date().toISOString(), teste_phone: alvos[0]?.phone ?? null })
          .eq("id", ag.id);
      }
    } else if (!agendamentoManual) {
      // Idem: só o dia da execução. `atualizado_em` é do conteúdo.
      await supabase.from("rifa_agendamentos_disparo")
        .update({ ultima_execucao_dia: hoje })
        .eq("id", ag.id);
    }
  }

  return json({
    ok: true,
    processados,
    enviados,
    falharam,
    estagio: ehTeste ? "teste" : "real",
    pausado: houvePausa,
    // Mantido por compatibilidade: a UI antiga lia esse campo.
    modo_teste: ehTeste,
  });
});
