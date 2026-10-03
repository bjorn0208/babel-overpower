import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { despacharBolhaViaZapi } from "./despachar-bolha.ts";
import { temLinkContratoFantasma, temPlaceholderNaoResolvido } from "../_shared/guards-link-contrato.ts";

export type OutboxResult = {
  outboxEnviadas: number;
  outboxFalhas: number;
  outboxAdiadosRateLimit: number;
};

type OutboxPayload = {
  typing_ms?: number;
  delay_message_s?: number;
  assistant_message_id?: string;
  /** Bolha de foto (2026-09-07): sai por send-image com o content como legenda. */
  midia_url?: string;
  /** Δ 2026-09-17: "video" manda por send-video (campanha com vídeo). Ausente = foto. */
  tipo_midia?: "foto" | "video" | null;
};

const RATE_LIMIT_ENDPOINT = "zapi_send";
const RATE_LIMIT_WINDOW_SECONDS = 3600;
const RATE_LIMIT_ADIAMENTO_MS = 5 * 60 * 1000;

// Janela de frescor do barge-in (gatilho A). O webhook grava is_typing=true +
// last_typing_at=now a cada COMPOSING do Z-API (presença renovada de poucos em
// poucos segundos enquanto o lead digita). Só travamos o despacho se o último
// COMPOSING chegou dentro desta janela. Defesa contra is_typing PRESO em true
// (presence-por-LID liga, mas o "parou" não casa e nunca desliga) — sem isso o
// despacho ficava travado pra sempre e o agente parecia mudo (incidente lead
// Diego Andrade, 2026-05-22).
const TYPING_FRESCO_MS = 15_000;

// F0 (blueprint v3 §4): bolha-do-link de contrato despachada → carimba a
// confirmação de entrega no contrato. O sweep-contrato usa esse carimbo como
// safety-net (pendente sem carimbo após X min = reenfileira o MESMO link).
async function marcarLinkContratoEntregue(supabase: SupabaseClient, carga: unknown): Promise<void> {
  const contratoId = (carga as { contrato_id?: string; origem?: string } | null | undefined)?.contrato_id;
  if (!contratoId) return;
  try {
    await supabase.from("contratos")
      .update({ link_entregue_em: new Date().toISOString() })
      .eq("id", contratoId)
      .is("link_entregue_em", null);
  } catch { /* best-effort — não derruba o despacho */ }
}

// Heurística DEC-028: WhatsApp/Z-API não publicam SLA; estes tetos protegem chip novo.
export function calcularTetoMensagensHora(opts: {
  chipConnectedSince: string | null;
  overrideTenant: number | null;
}): number {
  if (opts.overrideTenant != null) return opts.overrideTenant;
  if (!opts.chipConnectedSince) return 80;

  const dias = Math.floor((Date.now() - new Date(opts.chipConnectedSince).getTime()) / 86400000);
  if (dias < 3) return 30;
  if (dias < 7) return 80;
  if (dias < 15) return 150;
  if (dias < 30) return 250;
  return 400;
}

export async function consumirOutbox(
  supabase: SupabaseClient,
): Promise<OutboxResult> {
  let outboxEnviadas = 0;
  let outboxFalhas = 0;
  let outboxAdiadosRateLimit = 0;

  // Limite de wall-clock pra essa execução. Plano Pro permite 400s; saímos antes
  // pra deixar margem e dar chance do próximo cron pegar o que sobrar.
  const TEMPO_MAX_EXEC_MS = 240_000;
  // Horizonte de busca: bolhas com scheduled_at até now+30s entram no batch e
  // o consumer aguarda o tempo certo pra processar cada uma. Sem isso a 2ª bolha
  // do turno (delay engajamento empilhado) só sai no próximo cron — gap de até 2min.
  const HORIZONTE_FUTURO_MS = 30_000;

  const tInicio = Date.now();

  type Bolha = {
    id: string;
    conversation_id: string;
    tenant_id: string;
    content: string;
    bubble_order: number | null;
    retries: number | null;
    carga: unknown;
    scheduled_at: string;
  };

  const processarBolha = async (bolha: Bolha): Promise<void> => {
    // Barge-in: lead voltou a digitar no meio da entrega → interrompe TODAS as
    // bolhas pendentes desta conversa (não só esta) e aborta. O motor reprocessa
    // quando o buffer (o que o lead está digitando agora) ficar pronto — a
    // resposta só sai no silêncio do lead. Reusa RPC substituir_caixa_saida_pendentes.
    //
    // Só dispara se o flag for FRESCO: is_typing=true E last_typing_at dentro de
    // TYPING_FRESCO_MS. Flag velho ou sem last_typing_at = stale (ex.: is_typing
    // preso em true porque o "parou" do Z-API não casou pelo LID) → ignora e
    // segue o despacho, senão a conversa fica muda pra sempre.
    const { data: typingRow } = await supabase.from("estado_digitacao")
      .select("is_typing, last_typing_at")
      .eq("conversation_id", bolha.conversation_id)
      .maybeSingle();
    const typingFresco = typingRow?.is_typing === true &&
      typingRow.last_typing_at != null &&
      (Date.now() - new Date(typingRow.last_typing_at).getTime()) < TYPING_FRESCO_MS;
    if (typingFresco) {
      // P1 fix (2026-05-24): ADIA, não CANCELA. Cancelar (substituir) deixava o lead no
      // SILÊNCIO PERMANENTE quando ele digitava e PARAVA SEM ENVIAR: a resposta pronta era
      // descartada e nada re-disparava o motor (17 conversas em 7 dias; conv 41880c4d = lead
      // confirmou a compra → silêncio). Agora só PULA este tick — a bolha continua 'pendente'.
      // Próximo cron reavalia: se o lead parou de digitar (last_typing_at fica stale > 15s),
      // despacha; se ENVIOU mensagem, o barge-in do webhook (inbound real) cancela e o motor
      // regenera fresco. Assim nunca há resposta perdida; no máximo, atrasada.
      return;
    }

    // Fase B · guard anti-duplicata (race window): se o lead mandou mensagem
    // DEPOIS que esta resposta começou a ser gerada (carga.gerada_ate, gravado
    // pelo motor), ela está obsoleta — o barge-in não a pegou porque ela ainda
    // não existia na caixa quando a msg nova chegou. Cancela o lote e deixa a
    // geração vigente responder com tudo junto.
    const geradaAte = (bolha.carga as { gerada_ate?: string | null } | null | undefined)?.gerada_ate ?? null;
    if (geradaAte) {
      // Single-flight (2026-06-10): além de msg do LEAD (role=user), DONO respondendo manual
      // (role=human que NÃO é eco WhatsApp do agente) também torna a resposta obsoleta —
      // sem isso a bolha do agente atropelava a resposta humana digitada no app Conversas.
      const { data: msgsPosteriores } = await supabase.from("mensagens")
        .select("id, role, carga")
        .eq("conversation_id", bolha.conversation_id)
        .in("role", ["user", "human"])
        .gt("created_at", geradaAte)
        .limit(5);
      const msgPosterior = (msgsPosteriores ?? []).find((m: { role: string; carga: { source?: string } | null }) =>
        m.role === "user" || String(m.carga?.source ?? "") !== "whatsapp_app"
      );
      if (msgPosterior) {
        await supabase.rpc("substituir_caixa_saida_pendentes", { p_conversation_id: bolha.conversation_id });
        return;
      }
    }

    // Guard pause da IA (cravado 2026-05-26): se a conversa foi pausada
    // (agent_enabled=false) ou virou modo humano/encerrada DEPOIS que a bolha
    // entrou na fila, cancela aqui — não despacha. Theus cravou que "desativar
    // IA geral" = silêncio total até clicar de novo. Sem isso, bolhas geradas
    // antes do toggle continuavam vazando via Z-API (incidente tenant Fratta,
    // 2026-05-26: 26+ bolhas saíram após o pause). Webhook já bloqueia novas
    // entradas; aqui fechamos a saída.
    const { data: convPause } = await supabase
      .from("conversas")
      .select("agent_enabled, status")
      .eq("id", bolha.conversation_id)
      .maybeSingle();
    if (
      !convPause ||
      convPause.agent_enabled === false ||
      convPause.status === 'humano' ||
      convPause.status === 'encerrada'
    ) {
      // 'substituida' é o único status terminal "descartada por mudança de estado"
      // que a CHECK constraint da tabela aceita (pendente|processando|enviada|
      // falhou|substituida). Semântica: a bolha foi descartada porque o estado
      // da conversa mudou (pausa humana). O error_reason carrega o motivo real.
      await supabase.from("caixa_saida_mensagens")
        .update({ status: 'substituida', error_reason: 'ia_pausada_ou_humano' })
        .eq("id", bolha.id);
      return;
    }

    // Guard anti-link-fantasma (2026-09-03, reescrito 2026-09-04): o modelo às vezes
    // ESCREVE uma URL de contrato de cabeça em vez de chamar a tool
    // `enviar_link_contrato`, e o lead recebe um link que nunca existiu — não consegue
    // assinar e ninguém percebe.
    //
    // A 1ª versão casava a FORMA da alucinação (`/contrato/` sem uuid no caminho) e
    // deixava passar 3 das 6 alucinações do histórico, todas com "contrato" no HOST:
    // `contratos.exemplo.com/patricia`, `link-do-contrato.com` e
    // `link.contrato.exemplo/aldonir` — esta última saiu pro lead Aldonir (tenant Diego)
    // em 2026-09-04 05:55 BRT.
    //
    // Regra e histórico completos em `_shared/guards-link-contrato.ts`; validado contra
    // os dados reais de 180 dias em `tests/guards-link-contrato.test.ts`.
    if (temLinkContratoFantasma(bolha.content)) {
      console.error(
        `[outbox] bolha ${bolha.id} (conv ${bolha.conversation_id}) BARRADA: link de contrato sem uuid válido — ${bolha.content.slice(0, 200)}`,
      );
      await supabase.from("caixa_saida_mensagens")
        .update({ status: 'falhou', error_reason: 'link_contrato_fantasma' })
        .eq("id", bolha.id);
      outboxFalhas++;
      return;
    }

    // Segunda forma do MESMO defeito (2026-09-04, relato do tenant Tríade: "a IA
    // mandou o contrato e na mensagem tava escrito CONTRATO AQUI"). Em vez de
    // inventar uma URL, o modelo escreve o PLACEHOLDER e a bolha sai assim pro
    // lead: "[LINK DO CONTRATO]", "[link_do_contrato]", "<emitir_link_contrato/>",
    // "[TRIGGER_TEMPORAL: contrato_60min_primeira_cobranca]". 50 ocorrências em
    // 180 dias, a mais antiga de 2026-05-25 — não é regressão, é defeito velho.
    //
    // A isenção pra colchete com URL dentro (markdown `[url](url)`) foi apertada em
    // 2026-09-04: antes bastava ter QUALQUER http:// dentro, e foi por aí que saiu
    // `[Link do Contrato: https://link.contrato.exemplo/aldonir]`. Detalhe no módulo.
    if (temPlaceholderNaoResolvido(bolha.content)) {
      console.error(
        `[outbox] bolha ${bolha.id} (conv ${bolha.conversation_id}) BARRADA: placeholder não resolvido — ${bolha.content.slice(0, 200)}`,
      );
      await supabase.from("caixa_saida_mensagens")
        .update({ status: 'falhou', error_reason: 'placeholder_nao_resolvido' })
        .eq("id", bolha.id);
      outboxFalhas++;
      return;
    }

    // Lock otimista: marca como 'processando' antes de enviar — evita duplicata
    // se outra instância (cron + push imediato) entrar no mesmo batch.
    const { data: locked } = await supabase
      .from("caixa_saida_mensagens")
      .update({ status: 'processando' })
      .eq("id", bolha.id)
      .eq("status", "pendente")
      .select("id");

    if (!locked || locked.length === 0) return;

    const { data: conv } = await supabase
      .from("conversas")
      .select("phone, channel")
      .eq("id", bolha.conversation_id)
      .maybeSingle();

    // Entrega de tela: só o WhatsApp passa pela Z-API. Chat de teste, webchat, perfil
    // público e afins são lidos do banco pelo próprio front, então a bolha se dá por
    // entregue aqui mesmo — inclusive carimbando o link de contrato.
    //
    // Antes só entrava aqui o chat de teste AO VIVO, que marca `carga.simulated_webchat`.
    // A bolha do safety-net de contrato é montada pelo cron (`sweep-contrato.ts`) e não
    // traz esse campo, então caía no `falhou` de baixo. Como `marcarLinkContratoEntregue`
    // só roda no caminho de sucesso, `contratos.link_entregue_em` nunca era carimbado e o
    // sweep reenfileirava o MESMO link a cada 30min até o contrato passar de 48h.
    // 265 bolhas queimadas em 11 tenants até 2026-09-07.
    const isSimulatedWebchat = (bolha.carga as { simulated_webchat?: boolean } | null | undefined)?.simulated_webchat === true;
    const entregaDeTela = isSimulatedWebchat || (conv != null && conv.channel !== "whatsapp");

    if (entregaDeTela) {
      const isFastMode = (bolha.carga as { fast_mode?: boolean } | null | undefined)?.fast_mode === true;
      const assistantMidSim = (bolha.carga as { assistant_message_id?: string } | null | undefined)?.assistant_message_id ?? null;
      if (assistantMidSim) {
        await supabase.from("mensagens")
          .update({ entregue_at: new Date().toISOString() })
          .eq("id", assistantMidSim);
      }
      await supabase.from("caixa_saida_mensagens")
        .update({ status: 'enviada', dispatched_at: new Date().toISOString() })
        .eq("id", bolha.id);
      await marcarLinkContratoEntregue(supabase, bolha.carga);
      outboxEnviadas++;
      if (!isFastMode) await new Promise((r) => setTimeout(r, 100));
      return;
    }

    // Daqui pra baixo é WhatsApp de verdade. Sem conversa ou sem telefone = dado quebrado,
    // e aí falhar é o certo: não há para onde despachar.
    if (!conv) {
      await supabase.from("caixa_saida_mensagens")
        .update({ status: 'falhou', error_reason: "conversa não encontrada" })
        .eq("id", bolha.id);
      outboxFalhas++;
      return;
    }

    if (!conv.phone) {
      await supabase.from("caixa_saida_mensagens")
        .update({ status: 'falhou', error_reason: "conversa whatsapp sem telefone" })
        .eq("id", bolha.id);
      outboxFalhas++;
      return;
    }

    const payload = bolha.carga as OutboxPayload | null | undefined;
    const typingMsBolha = payload?.typing_ms ?? 0;
    const typingSecondsBolha = Math.round(typingMsBolha / 1000);
    const delayMessageSBolha = payload?.delay_message_s ?? 0;
    const assistantMid = payload?.assistant_message_id ?? null;

    const { data: channelRow } = await supabase
      .from("canais")
      .select("id, chip_connected_since, max_messages_per_hour_override")
      .eq("user_id", bolha.tenant_id)
      .eq("type", "whatsapp") // blindagem: tenant pode ter canal instagram ativo na mesma tabela
      .eq("is_active", true)
      .maybeSingle();

    if (channelRow?.id) {
      const tetoCalculado = calcularTetoMensagensHora({
        chipConnectedSince: channelRow.chip_connected_since,
        overrideTenant: channelRow.max_messages_per_hour_override,
      });
      const { data: liberado } = await supabase.rpc("verificar_limite_taxa", {
        p_identifier: channelRow.id,
        p_endpoint: RATE_LIMIT_ENDPOINT,
        p_max_requests: tetoCalculado,
        p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
      });

      if (liberado === false) {
        const proximoSlot = new Date(Date.now() + RATE_LIMIT_ADIAMENTO_MS).toISOString();
        await supabase.from("caixa_saida_mensagens")
          .update({ scheduled_at: proximoSlot, status: 'pendente' })
          .eq("id", bolha.id);
        console.warn(
          `[outbox-rate] channel=${channelRow.id} estourou teto=${tetoCalculado}/h. Adiando para ${proximoSlot}`,
        );
        outboxAdiadosRateLimit++;
        return;
      }
    }

    const resultado = await despacharBolhaViaZapi(
      supabase,
      {
        id: bolha.id,
        conversation_id: bolha.conversation_id,
        tenant_id: bolha.tenant_id,
        content: bolha.content,
        retries: bolha.retries ?? 0,
        typing_seconds: typingSecondsBolha,
        delay_message_s: delayMessageSBolha,
        assistant_message_id: assistantMid,
        midia_url: payload?.midia_url ?? null,
        tipo_midia: payload?.tipo_midia ?? null,
      },
      conv.phone,
    );

    // Canal fora do ar (Δ 2026-09-09): não é falha da mensagem, é o WhatsApp desconectado.
    // Reagenda em 2 min SEM gastar retry — 3 minutinhos de queda não podem matar a bolha.
    if (!resultado.ok && resultado.adiar) {
      await supabase.from("caixa_saida_mensagens")
        .update({
          status: 'pendente',
          scheduled_at: new Date(Date.now() + 120_000).toISOString(),
          error_reason: resultado.error,
        })
        .eq("id", bolha.id);
      outboxFalhas++;
      return;
    }

    if (!resultado.ok) {
      const novosRetries = (bolha.retries ?? 0) + 1;
      if (novosRetries >= 3) {
        await supabase.from("caixa_saida_mensagens")
          .update({ status: 'falhou', retries: novosRetries, error_reason: resultado.error ?? "max retries" })
          .eq("id", bolha.id);
      } else {
        const reagendado = new Date(Date.now() + 60_000).toISOString();
        await supabase.from("caixa_saida_mensagens")
          .update({ status: 'pendente', retries: novosRetries, scheduled_at: reagendado, error_reason: resultado.error })
          .eq("id", bolha.id);
      }
      outboxFalhas++;
    } else {
      outboxEnviadas++;
      await marcarLinkContratoEntregue(supabase, bolha.carga);
      // Sleep mínimo anti-flood Z-API entre bolhas. O delay humanizado entre
      // bolhas vem do scheduled_at empilhado pelo chat — esse 500ms é só
      // proteção do canal Z-API contra rajada.
      await new Promise((r) => setTimeout(r, 500));
    }
  };

  try {
    // Loop de poll-and-wait. Cada iteração busca o próximo lote de bolhas
    // (incluindo as cujo scheduled_at cai dentro de HORIZONTE_FUTURO_MS) e
    // processa em ordem. Pra cada bolha, espera até seu scheduled_at antes de
    // disparar — isso preserva o ritmo humano (digita, envia, espera o lead
    // ler, digita, envia) calculado lá no chat e empilhado no scheduled_at.
    while (Date.now() - tInicio < TEMPO_MAX_EXEC_MS) {
      const horizonte = new Date(Date.now() + HORIZONTE_FUTURO_MS).toISOString();

      const { data: bolhas } = await supabase
        .from("caixa_saida_mensagens")
        .select("id, conversation_id, tenant_id, content, bubble_order, retries, carga, scheduled_at")
        .eq("status", "pendente")
        .lte("scheduled_at", horizonte)
        .order("conversation_id")
        .order("bubble_order")
        .limit(10);

      if (!bolhas || bolhas.length === 0) break;

      for (const bolha of bolhas as Bolha[]) {
        // Respeita scheduled_at: se ainda não chegou, dorme até o instante certo.
        // Cap em 30s pra evitar bloqueio absurdo se algum campo estiver corrompido.
        const schedTime = new Date(bolha.scheduled_at).getTime();
        const esperaSched = schedTime - Date.now();
        if (esperaSched > 0) {
          await new Promise((r) => setTimeout(r, Math.min(esperaSched, 30_000)));
        }

        // Verifica novamente se ainda há orçamento de tempo antes de processar.
        if (Date.now() - tInicio >= TEMPO_MAX_EXEC_MS) break;

        await processarBolha(bolha);
      }
    }
  } catch (outboxErr) {
    console.warn("[process-followups] consumirOutbox erro:", (outboxErr as Error).message);
  }

  return { outboxEnviadas, outboxFalhas, outboxAdiadosRateLimit };
}
