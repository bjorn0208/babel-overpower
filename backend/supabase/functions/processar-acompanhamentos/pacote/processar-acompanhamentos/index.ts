import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { tenantPausado } from "../_shared/pausa-tenant.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { criarClienteAdmin } from "../_shared/supabase.ts";
import {
  checkIsWithinBusinessHours,
  computeNextBusinessHourSlot,
  TIPOS_FORA_DO_GATE,
  type HorarioConfig,
} from "../_shared/business-hours.ts";
import { incrementarRetomadasSemResposta } from "../_shared/desistencia-guard.ts";
import { consumirOutbox } from "./outbox-consumer.ts";

// Process-followups — roda via pg_cron ou webhook externo (tipicamente a cada 1 min)
// Busca acoes_agendadas pendentes e dispara follow-up no chat
// R01.2: também consome caixa_saida_mensagens (bolhas agendadas pelo chat)

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = criarClienteAdmin();
    const inicioExecucao = Date.now();

    // Fix 2026-05-11 · libera zumbis (status='processando' presos ha >15min)
    // antes de claim novo lote. SQL barato no banco, sem cron novo.
    const { data: zumbisLiberados } = await supabase.rpc("liberar_zumbis", {
      p_max_idade_minutos: 15,
    });
    if (zumbisLiberados && zumbisLiberados > 0) {
      console.warn(`[process-followups] reaper liberou ${zumbisLiberados} acoes zumbi`);
    }

    // Fix 2026-05-11 · claim atomico via RPC `pegar_proxima_acao_agendada`.
    // DISTINCT ON (conversation_id) + SKIP LOCKED garante: (a) 1 acao por
    // conversa por execucao do cron — elimina explosao "8 mensagens em 20s",
    // (b) ausencia de race condition entre instancias paralelas do cron.
    // Status ja eh marcado como 'processando' dentro da propria RPC; nao
    // precisa de UPDATE manual abaixo (linha 106-110 do legado, removida).
    // Δ 2026-09-15: lote 50 → 8. Cada ação chama o motor síncrono (6-46s) e o worker morre
    // com ~200s de wall clock (Shutdown EarlyDrop): num lote de 29 (rajada do sweep das 17h UTC)
    // ~18 ficavam em 'processando' SEM enviar e o reaper as matava como 'falhou' (≈50% das
    // retomadas da plataforma). Lote pequeno + orçamento de tempo + devolução no loop abaixo.
    const { data: acoes, error: fetchErr } = await supabase.rpc(
      "pegar_proxima_acao_agendada",
      { p_limite: 8 },
    );

    if (fetchErr) throw fetchErr;
    const acoesPendentes = (acoes ?? []) as Array<{
      id: string;
      conversation_id: string;
      agente_id: string | null;
      action_type: string;
      // deno-lint-ignore no-explicit-any
      carga: any;
      lead_id: string | null;
      // 2026-09-17: faltava no tipo (a RPC devolve SETOF acoes_agendadas, então
      // em runtime vinha) — o compilador acusava no reenfileiramento da linha 598.
      tenant_id: string | null;
    }>;

    let processed = 0;
    let errors = 0;
    let rescheduled = 0;
    let encerradas = 0;

    // Cache de configuração do agent por agent_id (evita refetch em loop)
    const agentConfigCache = new Map<string, { horario: HorarioConfig | null; respeitaHorario: boolean } | null>();
    async function getAgentGate(agentId: string | null | undefined) {
      if (!agentId) return null;
      if (agentConfigCache.has(agentId)) return agentConfigCache.get(agentId) ?? null;
      const { data: ag } = await supabase.from("agentes_usuario")
        .select("configuracao").eq("id", agentId).maybeSingle();
      const cfg = (ag?.configuracao as Record<string, unknown> | null) || null;
      const horario = (cfg?.horario as HorarioConfig | undefined) || null;
      const respeitaHorario = Boolean(
        (cfg?.automacoes as Record<string, unknown> | undefined)?.respeita_horario_comercial,
      );
      const entry = { horario, respeitaHorario };
      agentConfigCache.set(agentId, entry);
      return entry;
    }

    for (let idxAcao = 0; idxAcao < acoesPendentes.length; idxAcao++) {
      const acao = acoesPendentes[idxAcao];
      // Orçamento de tempo: não começa ação nova depois de 90s — sobra fôlego pra esta execução
      // terminar e consumir o outbox. As não iniciadas voltam pra 'pendente' (próximo cron pega).
      if (Date.now() - inicioExecucao > 90_000) {
        const naoIniciadas = acoesPendentes.slice(idxAcao).map((a) => a.id);
        await supabase.from("acoes_agendadas")
          .update({ status: "pendente" })
          .in("id", naoIniciadas)
          .eq("status", "processando");
        console.warn(`[process-followups] orçamento de tempo: ${naoIniciadas.length} ação(ões) devolvida(s) pra pendente`);
        break;
      }
      try {
        // Guard: conversa fechada ou agente desligado -> cancelar acao.
        // Fix 2026-09-08 · todo cancelamento daqui passa a carimbar `error_message`.
        // Antes saía mudo (status='cancelado', motivo nulo), e foi assim que 472
        // disparos de campanha morreram sem deixar rastro nem na UI nem no log.
        //
        // Campanha é outbound: é a decisão do dono de reabordar o lead. Conversa
        // encerrada e agente desligado são o estado NORMAL de quem vai ser reabordado,
        // então `campaign_trigger` não morre por isso — o bloco dele reabre a conversa,
        // como `retomada_encerramento` e `cobranca_pagamento` já fazem. Opt-out e
        // campanha inativa seguem barrando, e são conferidos lá.
        const ehDisparoDeCampanha = acao.action_type === "campaign_trigger";
        const { data: convCheck } = await supabase.from("conversas")
          .select("status, agent_enabled").eq("id", acao.conversation_id).maybeSingle();
        if (!convCheck) {
          await supabase.from("acoes_agendadas")
            .update({ status: 'cancelado', error_message: "conversa inexistente" })
            .eq("id", acao.id);
          continue;
        }
        if (convCheck.status === 'encerrada' && !ehDisparoDeCampanha) {
          await supabase.from("acoes_agendadas")
            .update({ status: 'cancelado', error_message: "conversa encerrada" })
            .eq("id", acao.id);
          continue;
        }
        if (convCheck.agent_enabled === false && !ehDisparoDeCampanha) {
          await supabase.from("acoes_agendadas")
            .update({ status: 'cancelado', error_message: "agente desligado na conversa" })
            .eq("id", acao.id);
          continue;
        }

        // Gate horário comercial: tenant pode marcar respeita_horario_comercial=true
        // para que automações (exceto ações acionadas pelo cliente) só disparem dentro da janela.
        if (!TIPOS_FORA_DO_GATE.has(acao.action_type)) {
          const gate = await getAgentGate(acao.agente_id);
          // Pós-venda de relacionamento só faz sentido nas horas seguintes à contratação:
          // fora do horário ele morre em vez de virar mensagem no dia seguinte.
          if (acao.action_type === "pos_venda_relacionamento" && gate?.respeitaHorario &&
            !checkIsWithinBusinessHours(gate.horario)) {
            await supabase.from("acoes_agendadas")
              .update({ status: "cancelado", error_message: "pós-venda fora do horário" })
              .eq("id", acao.id);
            continue;
          }
          if (gate?.respeitaHorario && !checkIsWithinBusinessHours(gate.horario)) {
            const proximoSlot = computeNextBusinessHourSlot(gate.horario);
            await supabase.from("acoes_agendadas")
              .update({ scheduled_at: proximoSlot.toISOString() })
              .eq("id", acao.id)
              .eq("status", "pendente");
            rescheduled++;
            continue;
          }
        }

        // DEC-014 prioridade compromisso: se a própria ação não é compromisso explícito,
        // verifica se a conversa tem algum compromisso ativo (callback/retorno/cobrança-data-prometida).
        // Compromisso ativo cancela automação genérica (followup_inatividade etc.).
        const acoesCompromisso = new Set([
          "agendamento_callback","agendamento_retorno","lembrete_retorno","iniciar_atendimento",
          "lembrete_reuniao",
          // Resposta à mensagem que o lead mandou fora do horário — é dívida com o lead, não automação.
          "responder_fora_horario",
          // Follow-up cadenciado da Bel é combinado explícito com o lead —
          // convive com reunião marcada (senão DEC-014 o cancelaria).
          "followup_cadenciado",
        ]);
        const ehCompromissoExplicito =
          acoesCompromisso.has(acao.action_type) ||
          ((acao.action_type === "cobranca_pagamento" || acao.action_type === "cobranca_assinatura")
            && (acao.carga?.origem === "trigger_promessa_data" || acao.carga?.origem === "trigger_promessa_assinatura"));

        if (!ehCompromissoExplicito) {
          const { data: temCompromisso } = await supabase.rpc("existe_compromisso_ativo", {
            p_conversation_id: acao.conversation_id,
          });
          if (temCompromisso === true) {
            await supabase.from("acoes_agendadas").update({ status: 'cancelado' }).eq("id", acao.id);
            continue;
          }
        }

        // Fix 2026-05-11 · UPDATE manual removido. RPC pegar_proxima_acao_agendada
        // ja marcou como 'processando' atomicamente (FOR UPDATE SKIP LOCKED).
        // Motor oficial Ragentic v6 (substituiu chat v260 em 2026-05-12 — aposentar chat v260).
        // Os tokens [INICIAR_ATENDIMENTO], [RETOMADA_*], [LEMBRETE_*], [COBRANCA_*], [CAMPANHA_*],
        // [PLANEJAR_RETOMADA_*] e [TRIGGER_TEMPORAL_*] são interpretados pelo handler proativo
        // do ragentic-processar-inline (MAPA_TOKENS + modo proativo).
        const chatUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ragentic-processar-inline`;
        // deno-lint-ignore no-explicit-any
        const chatBody: Record<string, any> = {
          agente_id: acao.agente_id,
          conversation_id: acao.conversation_id,
          channel: "followup",
        };

        if (acao.action_type === "iniciar_atendimento") {
          // Limpar flag fila_espera
          await supabase.from("fichas_lead").update({ proximo_esperado: null })
            .eq("conversation_id", acao.conversation_id);
          chatBody.message = "[INICIAR_ATENDIMENTO]";
          if (acao.carga?.media_url) chatBody.media_url = acao.carga.media_url;
        } else if (acao.action_type === "responder_fora_horario") {
          // Alguém da equipe já respondeu o lead manualmente depois da mensagem noturna → não duplica.
          if (acao.carga?.recebida_em) {
            const { data: respHumana } = await supabase.from("mensagens")
              .select("id, carga")
              .eq("conversation_id", acao.conversation_id)
              .eq("role", "human")
              .gt("created_at", acao.carga.recebida_em)
              .limit(20);
            // deno-lint-ignore no-explicit-any
            const humanoRespondeu = (respHumana ?? []).some((m: any) => m?.carga?.autor !== "agente");
            if (humanoRespondeu) {
              await supabase.from("acoes_agendadas")
                .update({ status: "cancelado", error_message: "equipe já respondeu o lead" })
                .eq("id", acao.id);
              continue;
            }
          }
          chatBody.message = "[RESPONDER_FORA_HORARIO]";
        } else if (acao.action_type === "retomada_horario") {
          chatBody.message = "[RETOMADA_HORARIO]";
          if (acao.carga?.media_url) chatBody.media_url = acao.carga.media_url;
        } else if (acao.action_type === "lembrete_assinatura") {
          // Verificar se contrato ja foi assinado
          if (acao.carga?.contrato_token) {
            const { data: ctr } = await supabase.from("contratos").select("assinado_em").eq("chave_publica", acao.carga.contrato_token).maybeSingle();
            if (ctr?.assinado_em) {
              await supabase.from("acoes_agendadas").update({ status: 'cancelado' }).eq("id", acao.id);
              continue;
            }
          }
          chatBody.message = "[LEMBRETE_ASSINATURA]";
        } else if (acao.action_type === "lembrete_reuniao") {
          // Guard: reunião cancelada/cumprida → lembrete morre junto.
          if (acao.carga?.compromisso_id) {
            const { data: comp } = await supabase.from("compromissos").select("status").eq("id", acao.carga.compromisso_id).maybeSingle();
            if (comp && comp.status !== "pendente") {
              await supabase.from("acoes_agendadas").update({ status: 'cancelado' }).eq("id", acao.id);
              continue;
            }
          }
          chatBody.message = "[LEMBRETE_REUNIAO]";
          chatBody.metadata = {
            titulo: acao.carga?.titulo ?? "Reunião",
            reuniao_em: acao.carga?.reuniao_em ?? null,
            link_sala: acao.carga?.link_sala ?? null,
          };
        } else if (acao.action_type === "lembrete_pagamento") {
          // Verificar se pagamento ja foi feito
          if (acao.carga?.contrato_token) {
            const { data: ctr } = await supabase.from("contratos").select("url_comprovante_pagamento").eq("chave_publica", acao.carga.contrato_token).maybeSingle();
            if (ctr?.url_comprovante_pagamento) {
              await supabase.from("acoes_agendadas").update({ status: 'cancelado' }).eq("id", acao.id);
              continue;
            }
          }
          chatBody.message = "[LEMBRETE_PAGAMENTO]";
        } else if (acao.action_type === "agendamento_callback") {
          chatBody.message = "[RETOMADA_AGENDAMENTO]";
        } else if (acao.action_type === "cobranca_pagamento") {
          // Guard: se ja pagou, cancelar
          if (acao.carga?.contrato_token) {
            const { data: ctr } = await supabase.from("contratos").select("url_comprovante_pagamento").eq("chave_publica", acao.carga.contrato_token).maybeSingle();
            if (ctr?.url_comprovante_pagamento) {
              await supabase.from("acoes_agendadas").update({ status: 'cancelado' }).eq("id", acao.id);
              continue;
            }
          }
          // Reabrir conversa se estiver fechada (permite cobranca)
          await supabase.from("conversas").update({ status: 'ativa', agent_enabled: true }).eq("id", acao.conversation_id);
          chatBody.message = "[COBRANCA_PAGAMENTO]";
          chatBody.metadata = {
            tom: acao.carga?.tom || "empatico",
            tentativa: acao.carga?.tentativa || 1,
            total_tentativas: acao.carga?.total_tentativas || 3,
          };
        } else if (acao.action_type === "cobranca_assinatura") {
          // Guard: se ja assinou, cancelar
          if (acao.carga?.contrato_token) {
            const { data: ctr } = await supabase.from("contratos").select("assinado_em").eq("chave_publica", acao.carga.contrato_token).maybeSingle();
            if (ctr?.assinado_em) {
              await supabase.from("acoes_agendadas").update({ status: 'cancelado' }).eq("id", acao.id);
              continue;
            }
          }
          chatBody.message = "[COBRANCA_ASSINATURA]";
          chatBody.metadata = {
            tom: acao.carga?.tom || "empatico",
            tentativa: acao.carga?.tentativa || 1,
            total_tentativas: acao.carga?.total_tentativas || 3,
          };
        } else if (acao.action_type === "agendamento_retorno") {
          chatBody.message = "[RETOMADA_AGENDAMENTO]";
          chatBody.metadata = {
            tom: acao.carga?.tom || "empatico",
            tentativa: 1,
            total_tentativas: 1,
          };
        } else if (acao.action_type === "retomada_encerramento") {
          // Reabrir conversa antes de chamar o chat
          await supabase.from("conversas").update({ status: 'ativa', agent_enabled: true }).eq("id", acao.conversation_id);
          chatBody.message = "[RETOMADA_ENCERRAMENTO]";
        } else if (acao.action_type === "campaign_trigger") {
          // Disparo de campanha enfileirado por process-campaigns.
          // Valida campanha ativa e não deletada, monta chatBody com metadata pra chat carregar briefing.
          const campaignId = acao.carga?.campaign_id as string | undefined;
          const campaignLeadId = acao.carga?.campaign_lead_id as string | undefined;
          if (!campaignId || !campaignLeadId) {
            await supabase.from("acoes_agendadas")
              .update({ status: 'falhou' })
              .eq("id", acao.id);
            errors++;
            continue;
          }
          const { data: camp } = await supabase.from("campanhas")
            .select("status, deleted_at, tenant_id, mensagem_inicial, midia_url, tipo_conteudo")
            .eq("id", campaignId).maybeSingle();

          // Δ 2026-09-17 (Theus): PAUSA é reversível. Antes, campanha fora de
          // 'ativa' matava o lead como desistente — pausar era destrutivo. Agora
          // pausa (da campanha OU o freio de mão do tenant) só REAGENDA a ação.
          const pausaDoTenant = camp ? await tenantPausado(supabase, camp.tenant_id) : false;
          if (camp && camp.deleted_at === null && (camp.status === 'pausada' || pausaDoTenant)) {
            const motivoPausa = pausaDoTenant ? "envios_pausados_no_tenant" : "campanha_pausada";
            await supabase.from("acoes_agendadas")
              .update({
                status: 'pendente',
                scheduled_at: new Date(Date.now() + 30 * 60_000).toISOString(),
                error_message: motivoPausa,
              })
              .eq("id", acao.id);
            console.log(`[process-followups] ${motivoPausa}: ação ${acao.id} reagendada em 30min`);
            continue;
          }

          // Campanha deletada, encerrada ou em rascunho: aí sim o lead sai.
          if (!camp || camp.deleted_at !== null || camp.status !== 'ativa') {
            const exitReason = camp?.deleted_at ? "campanha_deletada" : "manual";
            await supabase.from("leads_campanha")
              .update({ state: "desistente", closed_at: new Date().toISOString(), exit_reason: exitReason })
              .eq("id", campaignLeadId);
            await supabase.from("acoes_agendadas")
              .update({ status: 'cancelado', error_message: exitReason })
              .eq("id", acao.id);
            continue;
          }

          // Fix 2026-09-08 · opt-out tardio, que só `campaign_reproposta` conferia.
          // O disparo inicial passa a checar o mesmo par (exclusão do tenant + flag no
          // lead) entre o enfileiramento e a execução — a elegibilidade filtra na hora
          // de enrolar, mas o lead pode pedir pra sair no meio do caminho.
          if (acao.lead_id) {
            const [{ data: optTenant }, { data: leadOptOut }] = await Promise.all([
              supabase.from("exclusoes_tenant")
                .select("id")
                .eq("lead_id", acao.lead_id)
                .eq("tenant_id", camp.tenant_id)
                .maybeSingle(),
              supabase.from("leads")
                .select("opt_out_at")
                .eq("id", acao.lead_id)
                .maybeSingle(),
            ]);
            if (optTenant || leadOptOut?.opt_out_at) {
              await supabase.from("leads_campanha")
                .update({ state: "desistente", closed_at: new Date().toISOString(), exit_reason: "opt_out" })
                .eq("id", campaignLeadId);
              await supabase.from("acoes_agendadas")
                .update({ status: 'cancelado', error_message: "opt_out tardio detectado no worker" })
                .eq("id", acao.id);
              continue;
            }
          }

          // Campanha reabre a conversa: o lead a ser reabordado normalmente está com a
          // conversa encerrada e o agente desligado. Só chega aqui quem já passou pela
          // campanha ativa e pelo opt-out acima.
          await supabase.from("conversas")
            .update({ status: 'ativa', agent_enabled: true })
            .eq("id", acao.conversation_id);

          // Δ 2026-09-17 (Theus): mensagem personalizada da campanha. Com
          // `mensagem_inicial` preenchida, o 1º contato sai EXATAMENTE como o dono
          // escreveu (texto, foto ou vídeo) — sem passar pelo modelo. Mesmo caminho
          // do lembrete_retorno: grava em `mensagens` e enfileira no outbox, que
          // já cuida de Z-API, ritmo de bolha e dedup.
          const textoFixo = (camp.mensagem_inicial ?? "").trim();
          if (textoFixo) {
            const { data: convC } = await supabase.from("conversas")
              .select("tenant_id, channel, lead_id").eq("id", acao.conversation_id).single();
            const { data: leadC } = acao.lead_id
              ? await supabase.from("leads").select("name, nome_exibicao, produto, fase_pipeline")
                  .eq("id", acao.lead_id).maybeSingle()
              : { data: null };
            const primeiroNome = String(leadC?.nome_exibicao || leadC?.name || "")
              .trim().split(/\s+/)[0] ?? "";
            const mensagemFinal = textoFixo
              .replace(/\{\{\s*nome\s*\}\}/gi, primeiroNome)
              .replace(/\{\{\s*produto\s*\}\}/gi, String(leadC?.produto ?? ""))
              .replace(/\{\{\s*fase_pipeline\s*\}\}/gi, String(leadC?.fase_pipeline ?? ""));

            const tipoConteudo = String(camp.tipo_conteudo ?? "texto");
            const midiaUrl = tipoConteudo === "texto" ? null : (camp.midia_url ?? null);
            if (tipoConteudo !== "texto" && !midiaUrl) {
              await supabase.from("acoes_agendadas")
                .update({ status: 'falhou', error_message: "campanha com mídia sem midia_url" })
                .eq("id", acao.id);
              errors++;
              continue;
            }

            const { data: msgFixa } = await supabase.from("mensagens")
              .insert({
                conversation_id: acao.conversation_id,
                role: "assistant",
                content: tipoConteudo === "foto" && !mensagemFinal ? "[MEDIA_ENVIADA]" : mensagemFinal,
                carga: { origem: "campanha_mensagem_fixa", campaign_id: campaignId, midia_url: midiaUrl },
              })
              .select("id").single();

            if (convC?.channel === "whatsapp" && convC.tenant_id) {
              const { data: jaNaFila } = await supabase.from("caixa_saida_mensagens")
                .select("id")
                .eq("conversation_id", acao.conversation_id)
                .contains("carga", { scheduled_action_id: acao.id })
                .limit(1);
              if (!jaNaFila?.length) {
                await supabase.from("caixa_saida_mensagens").insert({
                  conversation_id: acao.conversation_id,
                  tenant_id: convC.tenant_id,
                  status: 'pendente',
                  content: mensagemFinal,
                  bubble_order: 0,
                  scheduled_at: new Date().toISOString(),
                  delay_calculado_ms: 0,
                  engagement_level: "morno",
                  carga: {
                    assistant_message_id: msgFixa?.id,
                    typing_ms: 2500,
                    delay_message_s: 0,
                    scheduled_action_id: acao.id,
                    origem: "campanha_mensagem_fixa",
                    midia_url: midiaUrl,
                    tipo_midia: tipoConteudo === "video" ? "video" : (midiaUrl ? "foto" : null),
                  },
                });
              }
            }

            await supabase.from("leads_campanha")
              .update({ phase: "abordado", last_contact_at: new Date().toISOString() })
              .eq("id", campaignLeadId);
            await supabase.from("acoes_agendadas").update({ status: 'executado' }).eq("id", acao.id);
            processed++;
            continue; // não chama o modelo: a mensagem é a do dono
          }

          chatBody.message = "[CAMPANHA_INICIAR]";
          chatBody.metadata = {
            campaign_id: campaignId,
            campaign_lead_id: campaignLeadId,
          };
        } else if (acao.action_type === "lembrete_retorno") {
          const minutos = acao.carga?.minutos_antes || 30;
          const msgLembrete = `Olá! Só passando pra lembrar que em ${minutos} minutos vou entrar em contato com você conforme combinamos. Até já!`;
          const { data: convL } = await supabase.from("conversas")
            .select("tenant_id, channel").eq("id", acao.conversation_id).single();
          const { data: msgRow } = await supabase.from("mensagens")
            .insert({ conversation_id: acao.conversation_id, role: "assistant", content: msgLembrete }).select("id").single();
          if (convL?.channel === "whatsapp" && convL.tenant_id) {
            const { data: jaExiste } = await supabase.from("caixa_saida_mensagens")
              .select("id")
              .eq("conversation_id", acao.conversation_id)
              .contains("carga", { scheduled_action_id: acao.id })
              .limit(1);
            if (!jaExiste?.length) {
              await supabase.from("caixa_saida_mensagens").insert({
                conversation_id: acao.conversation_id, tenant_id: convL.tenant_id,
                status: 'pendente', content: msgLembrete, bubble_order: 0,
                scheduled_at: new Date().toISOString(), delay_calculado_ms: 0, engagement_level: "morno",
                carga: {
                  assistant_message_id: msgRow?.id, typing_ms: 4000,
                  delay_message_s: 0, scheduled_action_id: acao.id, origem: "lembrete_retorno",
                },
              });
            }
          }
          await supabase.from("acoes_agendadas").update({ status: 'executado' }).eq("id", acao.id);
          processed++;
          continue; // Nao chamar chat
        } else if (acao.action_type === "campaign_reproposta") {
          // Reproposta enfileirada pela RPC enviar_reproposta (Fase 2B).
          // Valida campanha, verifica opt-out LGPD, monta chatBody com contexto completo.
          const campaignId = acao.carga?.campaign_id as string | undefined;
          const campaignLeadId = acao.carga?.campaign_lead_id as string | undefined;
          const repropostaId = acao.carga?.reproposta_id as string | undefined;
          const textoPersonalizado = acao.carga?.texto_personalizado as string | undefined;

          if (!campaignId || !campaignLeadId) {
            await supabase.from("acoes_agendadas").update({ status: 'falhou' }).eq("id", acao.id);
            errors++;
            continue;
          }

          // Validar campanha: não deletada e tenant correto
          const { data: campRep } = await supabase.from("campanhas")
            .select("status, deleted_at, tenant_id").eq("id", campaignId).maybeSingle();
          if (!campRep || campRep.deleted_at !== null) {
            await supabase.from("acoes_agendadas")
              .update({ status: 'cancelado', error_message: "campanha_deletada" })
              .eq("id", acao.id);
            continue;
          }

          // LGPD: verificar opt-out do lead antes de disparar (Decisão 12)
          const [{ data: optTenant }, { data: leadOptOut }] = await Promise.all([
            supabase.from("exclusoes_tenant")
              .select("id")
              .eq("lead_id", acao.lead_id)
              .eq("tenant_id", campRep.tenant_id)
              .maybeSingle(),
            supabase.from("leads")
              .select("opt_out_at")
              .eq("id", acao.lead_id)
              .maybeSingle(),
          ]);
          if (optTenant || leadOptOut?.opt_out_at) {
            await supabase.from("acoes_agendadas")
              .update({ status: 'cancelado', error_message: "opt_out tardio detectado no worker" })
              .eq("id", acao.id);
            continue;
          }

          chatBody.message = "[CAMPANHA_REPROPOSTA]";
          chatBody.metadata = {
            campaign_id: campaignId,
            campaign_lead_id: campaignLeadId,
            reproposta_id: repropostaId,
            texto_personalizado: textoPersonalizado,
            lead_id: acao.lead_id,
          };
        } else if (acao.action_type === "planejar_retomada") {
          // ── Gate de desistência (2026-06-13, flag USAR_GATE_DESISTENCIA) ──
          // ANTES de planejar mais uma retomada, checa se o lead já bateu o limite de
          // tentativas sem resposta. Bateu → marca lead 'desistiu', desliga agente, cancela
          // pendentes e NÃO planeja nova. Fecha o loop infinito (a função existia sem caller).
          if ((Deno.env.get("USAR_GATE_DESISTENCIA") ?? "true") !== "false") {
            try {
              const { verificarDesistenciaELimite } = await import("../_shared/desistencia-guard.ts");
              const _des = await verificarDesistenciaELimite(
                supabase, acao.conversation_id, acao.lead_id ?? null, acao.agente_id ?? "",
              );
              if (_des.desistiu) {
                await supabase.from("acoes_agendadas")
                  .update({ status: 'cancelado', error_message: `desistencia: ${_des.retomadas}/${_des.limite} retomadas sem resposta` })
                  .eq("id", acao.id);
                console.warn(`[process-followups] lead desistiu (${_des.retomadas}/${_des.limite}) conv=${acao.conversation_id}`);
                encerradas++;
                continue;
              }
            } catch (eDes) {
              // Fail-open: erro no gate NÃO trava a retomada (zero regressão).
              console.warn(`[process-followups] gate desistência falhou (segue): ${(eDes as Error).message}`);
            }
          }
          // DEC-017 · cron criou intent · LLM (Gemma+Flash) decide
          // QUANDO+ÂNGULO+ASSUNTO consumindo blocos estrategia_retomada.
          const cond = String(acao.carga?.condicao_tipo ?? "silencio_pos_fase").toUpperCase();
          const sufixo = cond === "NAO_ASSINOU_CONTRATO" ? "CONTRATO"
            : cond === "NAO_ENVIOU_COMPROVANTE" ? "COMPROVANTE"
            : cond === "NAO_RESPONDEU_PROPOSTA" ? "PROPOSTA"
            : cond === "DESPEDIDA_SEM_DATA" ? "DESPEDIDA"
            : "SILENCIO";
          chatBody.message = `[PLANEJAR_RETOMADA_${sufixo}]`;
          chatBody.metadata = {
            tom: acao.carga?.tom || "empatico",
            tentativa: acao.carga?.tentativa || 1,
            trigger_nome: acao.carga?.trigger_nome,
            condicao_tipo: acao.carga?.condicao_tipo,
            scheduled_action_id: acao.id,
          };
        } else if (acao.action_type === "retomada_planejada") {
          // DEC-017 · LLM já planejou · agora compõe a fala usando o plano + contexto fresco.
          const cond = String(acao.carga?.condicao_tipo ?? "silencio_pos_fase").toUpperCase();
          const sufixo = cond === "NAO_ASSINOU_CONTRATO" ? "CONTRATO"
            : cond === "NAO_ENVIOU_COMPROVANTE" ? "COMPROVANTE"
            : cond === "NAO_RESPONDEU_PROPOSTA" ? "PROPOSTA"
            : cond === "DESPEDIDA_SEM_DATA" ? "DESPEDIDA"
            : "SILENCIO";
          chatBody.message = `[TRIGGER_TEMPORAL_${sufixo}]`;
          chatBody.metadata = {
            tom: acao.carga?.tom || "empatico",
            tentativa: acao.carga?.tentativa || 1,
            trigger_nome: acao.carga?.trigger_nome,
            condicao_tipo: acao.carga?.condicao_tipo,
            assunto_planejado: acao.carga?.assunto,
            angulo_planejado: acao.carga?.angulo,
            estrategia_chunk_id: acao.carga?.estrategia_chunk_id,
            scheduled_action_id: acao.id,
          };
        } else if (acao.action_type === "followup_cadenciado") {
          // Tool `agendar_followup` (Bel, 2026-08-25): retomada combinada com
          // o lead. O pipeline recebe o token + contexto pra abrir SEM se
          // reapresentar (estado S6 do prompt da Bel).
          chatBody.message = "[FOLLOWUP_CADENCIADO]";
          chatBody.metadata = {
            assunto: acao.carga?.assunto,
            motivo: acao.carga?.motivo,
            frase_de_retomada: acao.carga?.frase_de_retomada,
            estado_conversa: acao.carga?.estado_conversa,
            tentativa: acao.carga?.tentativa || 1,
            total_tentativas: acao.carga?.total_tentativas || 3,
            scheduled_action_id: acao.id,
          };
        } else if (acao.action_type === "pos_venda_relacionamento") {
          // Pós-venda de relacionamento (2026-09-18, Malu/Carlos): depois do contrato assinado a
          // agente segue conversando algumas horas pra conhecer o lead. Agendado pelo trigger
          // `agendar_pos_venda_relacionamento` em contratos (config do agente
          // `pos_venda_relacionamento`). Conversa rolando agora → não interrompe: o toque morre.
          const { data: ultimaMsg } = await supabase.from("mensagens")
            .select("created_at")
            .eq("conversation_id", acao.conversation_id)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const minutosSilencio = ultimaMsg?.created_at
            ? (Date.now() - new Date(ultimaMsg.created_at as string).getTime()) / 60_000
            : Infinity;
          const silencioMin = Number(acao.carga?.silencio_min_minutos ?? 40);
          if (minutosSilencio < silencioMin) {
            await supabase.from("acoes_agendadas")
              .update({ status: "cancelado", error_message: `conversa ativa (${Math.round(minutosSilencio)} min)` })
              .eq("id", acao.id);
            continue;
          }
          chatBody.message = "[POS_VENDA_RELACIONAMENTO]";
          chatBody.metadata = {
            tentativa: acao.carga?.tentativa || 1,
            total_tentativas: acao.carga?.total_tentativas || 1,
            scheduled_action_id: acao.id,
          };
        } else if (acao.action_type === "agendar_compromisso") {
          // Tool `gerenciar_compromisso` (Onda 2 Ragentic, _shared/tools-internas.ts:720)
          // grava com este type. Caminho semântico equivalente é RETOMADA_AGENDAMENTO
          // (MAPA_TOKENS:515 do motor): cargo Atendimento + situação "Hora do callback
          // agendado com o lead. Retome contato lembrando do compromisso marcado.".
          // Antes deste fix (2026-05-26 22:13 BRT) caía no else → [FOLLOWUP_AUTOMATICO]
          // e devolvia 400 por falta de phone — 100% das promessas viravam silêncio.
          chatBody.message = "[RETOMADA_AGENDAMENTO]";
          chatBody.metadata = {
            titulo: acao.carga?.titulo,
            request_id: acao.carga?.request_id,
          };
        } else {
          chatBody.message = "[FOLLOWUP_AUTOMATICO]";
        }

        // Defesa transversal (2026-05-26 22:13 BRT): motor `ragentic-processar-inline`
        // exige `phone` (linha :252) — sem ele devolve 400 `params_missing` e a ação
        // morre em silêncio após 3 retries. Nenhum dos cases acima passa `phone` no
        // chatBody; aqui resolvemos via conversa antes do invoke. Faltar phone na
        // conversa é raro (legado), mas marcamos `falhou` com motivo explícito.
        if (!chatBody.phone) {
          const { data: convPhone } = await supabase
            .from("conversas")
            .select("phone")
            .eq("id", acao.conversation_id)
            .maybeSingle();
          if (!convPhone?.phone) {
            await supabase
              .from("acoes_agendadas")
              .update({ status: 'falhou', error_message: 'phone_ausente_na_conversa' })
              .eq("id", acao.id);
            errors++;
            continue;
          }
          chatBody.phone = convPhone.phone;
        }

        const res = await fetch(chatUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify(chatBody),
        });

        if (!res.ok) {
          await supabase.from("acoes_agendadas").update({ status: 'falhou' }).eq("id", acao.id);
          errors++;
          continue;
        }

        // Automacao bloqueada por horario: reagendar pro proximo turno
        try {
          const chatData = await res.json();
          if (chatData?.fora_horario) {
            const proximo = chatData.proximo_inicio ? new Date(chatData.proximo_inicio) : null;
            if (proximo && proximo > new Date()) {
              await supabase.from("acoes_agendadas").update({
                status: 'pendente', scheduled_at: chatData.proximo_inicio,
              }).eq("id", acao.id);
              rescheduled++;
            } else {
              await supabase.from("acoes_agendadas").update({ status: 'falhou' }).eq("id", acao.id);
              errors++;
            }
            continue;
          }
        } catch (e) { console.warn(`[process-followups] JSON parse falhou acao ${acao.id}:`, e); }

        await supabase.from("acoes_agendadas").update({ status: 'executado' }).eq("id", acao.id);

        // Fase 1.5 RAG-FIRST: retomada_planejada executada com sucesso (lead não respondeu ainda).
        // Incrementa contador para gate de desistência em planejar-retomada.ts.
        if (acao.action_type === "retomada_planejada") {
          await incrementarRetomadasSemResposta(supabase, acao.conversation_id);
        }

        // Follow-up cadenciado (Bel, 2026-08-25): passo N executado → agenda o
        // próximo da cadência (1 → +3 dias · 2 → +7 dias). Esgotou as 3
        // tentativas → lead vira base_fria (seção 7 do prompt da Bel).
        if (acao.action_type === "followup_cadenciado") {
          const tentativaFc = Number(acao.carga?.tentativa || 1);
          const totalFc = Number(acao.carga?.total_tentativas || 3);
          if (tentativaFc < totalFc) {
            const diasProx = tentativaFc === 1 ? 3 : 7;
            await supabase.rpc("enfileirar_acao_agendada", {
              p_conversation_id: acao.conversation_id,
              p_lead_id: acao.lead_id ?? null,
              p_agente_id: acao.agente_id ?? null,
              p_tenant_id: acao.tenant_id ?? null,
              p_action_type: "followup_cadenciado",
              p_scheduled_at: new Date(Date.now() + diasProx * 86400000).toISOString(),
              p_carga: { ...(acao.carga ?? {}), tentativa: tentativaFc + 1, origem: "cadencia_automatica" },
              p_node_name: null,
              p_template: null,
            });
          } else if (acao.lead_id) {
            await supabase.from("leads").update({ fase_pipeline: "base_fria" }).eq("id", acao.lead_id);
          }
        }

        // Campanha: após chat processar [CAMPANHA_INICIAR] com sucesso,
        // marca lead como abordado + registra timestamp de contato.
        if (acao.action_type === "campaign_trigger") {
          const campaignLeadIdExec = acao.carga?.campaign_lead_id as string | undefined;
          if (campaignLeadIdExec) {
            await supabase.from("leads_campanha")
              .update({
                phase: "abordado",
                last_contact_at: new Date().toISOString(),
              })
              .eq("id", campaignLeadIdExec);
          }
        }

        // Reproposta: após chat processar [CAMPANHA_REPROPOSTA] com sucesso,
        // atualiza last_contact_at. NÃO muda phase nem reproposta_count (RPC já fez — Fase 2B).
        if (acao.action_type === "campaign_reproposta") {
          const campaignLeadIdRep = acao.carga?.campaign_lead_id as string | undefined;
          if (campaignLeadIdRep) {
            await supabase.from("leads_campanha")
              .update({ last_contact_at: new Date().toISOString() })
              .eq("id", campaignLeadIdRep);
          }
        }

        processed++;
      } catch (err) {
        console.error(`Erro ao processar acao ${acao.id}:`, err);
        await supabase
          .from("acoes_agendadas")
          .update({ status: 'falhou' })
          .eq("id", acao.id);
        errors++;
      }
    }

    // --- Encerrar conversas inativas (encerrar_apos) ---
    try {
      const { data: agentes } = await supabase.from("agentes_usuario").select("id, user_id, configuracao");
      for (const ag of (agentes || [])) {
        // deno-lint-ignore no-explicit-any
        const encerrar = (ag.configuracao as any)?.automacoes?.encerrar_apos;
        if (!encerrar?.valor) continue;
        const dias = encerrar.valor;
        const cutoff = new Date(Date.now() - dias * 86400000).toISOString();
        // Buscar conversas ativas DESTE agente sem msg recente
        const { data: convs } = await supabase
          .from("conversas")
          .select("id")
          .eq("tenant_id", ag.user_id)
          .eq("agent_enabled", true)
          .eq("status", "ativa")
          .lt("updated_at", cutoff)
          .limit(20);
        if (convs && convs.length > 0) {
          const ids = convs.map((c: { id: string }) => c.id);
          await supabase.from("conversas").update({ agent_enabled: false }).in("id", ids);
          encerradas += ids.length;
        }
      }
    } catch { /* encerrar_apos best-effort */ }

    // --- R01.2 — Consumir outbox de bolhas agendadas ---
    const { outboxEnviadas, outboxFalhas, outboxAdiadosRateLimit } = await consumirOutbox(supabase);

    return new Response(JSON.stringify({
      processed, errors, rescheduled, total: acoesPendentes.length, encerradas,
      outbox_enviadas: outboxEnviadas,
      outbox_falhas: outboxFalhas,
      outbox_adiados_rate_limit: outboxAdiadosRateLimit,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Erro ao processar acompanhamentos:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
