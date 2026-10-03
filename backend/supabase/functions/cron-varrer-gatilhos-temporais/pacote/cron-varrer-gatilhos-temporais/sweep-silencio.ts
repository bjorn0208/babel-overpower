/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  enfileirarAcaoTemporal,
  jaDisparouRecente,
  type ConversaAtiva,
  type TriggerTemporal,
} from "./enqueue-acao.ts";

// ---------------------------------------------------------------------------
// Sweep de silêncio — dispara follow-up quando o lead parou de responder há
// mais de `tempo_aguardar_minutos` minutos.
//
// Cobre dois condicao_tipo:
//   - 'silencio_pos_fase'    : silêncio genérico após qualquer fase
//   - 'nao_respondeu_proposta': lead recebeu proposta mas não respondeu
//
// Proxy de silêncio: conversations.updated_at (mesma estratégia do
// encerrar_apos em process-followups — sem coluna dedicada no schema atual).
//
// Conversations sem lead_id, fechadas ou com agente desativado são ignoradas.
// ---------------------------------------------------------------------------

const BATCH_SIZE = 100;
// Δ 2026-09-15 (HS Consultoria): antes era UM lote de 100 da plataforma inteira, sem ORDER BY
// (Seq Scan na ordem física) — ~11% das 1.485 conversas elegíveis eram avaliadas e sempre as
// mesmas. Agora: janela de silêncio útil (o maior gatilho é 4320 min = 3 dias), mais recentes
// primeiro, paginado, com orçamento de tempo pra caber no wall clock da edge.
const JANELA_MAX_DIAS = 5;
const MAX_PAGINAS = 10;
const ORCAMENTO_MS = 120_000;

// Intervalo mínimo de silêncio para sequer considerar uma conversa (30 min).
// Triggers com tempo_aguardar_minutos < 30 serão descartados no filtro de tempo.
const MIN_SILENCIO_MINUTOS = 30;

export interface SweepSilencioResult {
  processadas: number;
  disparadas: number;
  erros: number;
}

// Gatilhos PRÓPRIOS de tenant (2026-09-15, Amorim): cadência sob medida, ex. "a cada 2 dias,
// 3 vezes, e depois com 20 dias". A RPC `buscar_triggers_temporais` já devolve só os do
// tenant quando ele tem algum pro condicao_tipo. Aqui entram as duas peças que faltavam:
//   - `acao_payload.retomadas_min/retomadas_max`: o gatilho só vale quando o contador
//     fichas_lead.dados_capturados.retomadas_sem_resposta está nessa faixa;
//   - varredura extra dos tenants cujo gatilho mais longo passa da JANELA_MAX_DIAS.
const FOLGA_JANELA_TENANT_MIN = 2 * 24 * 60;

async function retomadasSemResposta(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<number> {
  const { data } = await supabase.from("fichas_lead")
    .select("dados_capturados").eq("conversation_id", conversationId).maybeSingle();
  const dados = (data?.dados_capturados as Record<string, string> | null) ?? {};
  return Number(dados.retomadas_sem_resposta ?? 0) || 0;
}

export async function sweepSilencio(
  supabase: SupabaseClient,
): Promise<SweepSilencioResult> {
  const res: SweepSilencioResult = { processadas: 0, disparadas: 0, erros: 0 };
  const inicio = Date.now();
  const nichoPorTenant = new Map<string, string | null>();
  const agora = Date.now();
  const corte = new Date(agora - MIN_SILENCIO_MINUTOS * 60_000).toISOString();
  const limiteJanela = new Date(agora - JANELA_MAX_DIAS * 86_400_000).toISOString();

  // 1) Varredura geral: janela de JANELA_MAX_DIAS, mais recentes primeiro.
  await varrerLotes(supabase, res, nichoPorTenant, inicio, { corte, desde: limiteJanela });

  // 2) Varredura extra só dos tenants com gatilho próprio mais longo que a janela geral.
  const { data: longos } = await supabase.from("blocos_gatilho")
    .select("tenant_id, tempo_aguardar_minutos")
    .eq("escopo", "tenant").eq("ativo", true)
    .in("condicao_tipo", ["silencio_pos_fase", "nao_respondeu_proposta"])
    .gt("tempo_aguardar_minutos", JANELA_MAX_DIAS * 24 * 60);
  const maxPorTenant = new Map<string, number>();
  for (const g of (longos ?? []) as Array<{ tenant_id: string | null; tempo_aguardar_minutos: number }>) {
    if (!g.tenant_id) continue;
    maxPorTenant.set(g.tenant_id, Math.max(maxPorTenant.get(g.tenant_id) ?? 0, g.tempo_aguardar_minutos));
  }
  for (const [tenantId, maxMin] of maxPorTenant) {
    if (Date.now() - inicio > ORCAMENTO_MS) break;
    const desde = new Date(agora - (maxMin + FOLGA_JANELA_TENANT_MIN) * 60_000).toISOString();
    await varrerLotes(supabase, res, nichoPorTenant, inicio, { corte: limiteJanela, desde, tenantId });
  }

  return res;
}

async function varrerLotes(
  supabase: SupabaseClient,
  res: SweepSilencioResult,
  nichoPorTenant: Map<string, string | null>,
  inicio: number,
  filtro: { corte: string; desde: string; tenantId?: string },
): Promise<void> {
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    if (Date.now() - inicio > ORCAMENTO_MS) {
      console.warn(`[sweep-silencio] orçamento de tempo atingido na página ${pagina}${filtro.tenantId ? ` (tenant ${filtro.tenantId})` : ""}`);
      return;
    }
    let consulta = supabase
      .from("conversas")
      .select("id, tenant_id, lead_id, updated_at")
      .eq("status", "ativa")
      .eq("agent_enabled", true)
      .not("lead_id", "is", null)
      .lt("updated_at", filtro.corte)
      .gt("updated_at", filtro.desde);
    if (filtro.tenantId) consulta = consulta.eq("tenant_id", filtro.tenantId);
    const { data: conversas, error: fetchErr } = await consulta
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(pagina * BATCH_SIZE, (pagina + 1) * BATCH_SIZE - 1);

    if (fetchErr) {
      console.error("[sweep-silencio] falha ao buscar conversas silenciosas:", fetchErr.message);
      res.erros++;
      return;
    }
    if (!conversas || conversas.length === 0) return;

    // Busca fase atual de cada lead via campaign_leads.
    // Um lead pode não estar em nenhuma campanha — nesse caso fase fica null.
    const leadIds = conversas
      .map((c) => c.lead_id as string)
      .filter((id): id is string => !!id);
    const faseByLeadId = new Map<string, string | null>();
    if (leadIds.length > 0) {
      const { data: clRows, error: clErr } = await supabase
        .from("leads_campanha")
        .select("lead_id, phase")
        .in("lead_id", leadIds)
        .eq("state", "ativo")
        .is("archived_at", null)
        .limit(BATCH_SIZE);
      if (clErr) {
        console.warn(
          "[sweep-silencio] falha ao buscar fases de campaign_leads — continuando sem fase:",
          clErr.message,
        );
      } else if (clRows) {
        for (const row of clRows) {
          if (!faseByLeadId.has(row.lead_id)) faseByLeadId.set(row.lead_id, row.phase ?? null);
        }
      }
    }

    for (const conv of conversas as ConversaAtiva[]) {
      if (Date.now() - inicio > ORCAMENTO_MS) return;
      res.processadas++;
      try {
        // nicho_id do tenant pra RPC de escopo correto (cache por tenant).
        if (!nichoPorTenant.has(conv.tenant_id)) {
          const { data: perfil } = await supabase
            .from("profiles").select("nicho_id").eq("id", conv.tenant_id).maybeSingle();
          nichoPorTenant.set(conv.tenant_id, perfil?.nicho_id ?? null);
        }
        const nichoId: string | null = nichoPorTenant.get(conv.tenant_id) ?? null;
        const faseAtual: string | null = faseByLeadId.get(conv.lead_id) ?? null;
        const silencioMin = (Date.now() - new Date(conv.updated_at).getTime()) / 60_000;
        let contador: number | null = null; // lido sob demanda (só gatilho com faixa de retomadas)

        for (const condicaoTipo of ["silencio_pos_fase", "nao_respondeu_proposta"] as const) {
          const { data: triggers, error: rpcErr } = await supabase.rpc(
            "buscar_triggers_temporais",
            {
              p_condicao_tipo: condicaoTipo,
              p_escopo: "tenant",
              p_nicho_id: nichoId,
              p_tenant_id: conv.tenant_id,
              p_fase_aplicavel: faseAtual, // preenchido quando lead está em campanha ativa
            },
          );
          if (rpcErr) {
            console.warn(`[sweep-silencio] rpc falhou conv=${conv.id} tipo=${condicaoTipo}:`, rpcErr.message);
            res.erros++;
            continue;
          }
          if (!triggers || triggers.length === 0) continue;

          for (const trigger of triggers as TriggerTemporal[]) {
            // Verifica se silêncio atingiu o limiar do trigger.
            if (silencioMin < trigger.tempo_aguardar_minutos) continue;

            const pl = trigger.acao_payload ?? {};
            if (pl.retomadas_min !== undefined || pl.retomadas_max !== undefined) {
              if (contador === null) contador = await retomadasSemResposta(supabase, conv.id);
              if (pl.retomadas_min !== undefined && contador < Number(pl.retomadas_min)) continue;
              if (pl.retomadas_max !== undefined && contador > Number(pl.retomadas_max)) continue;
            }

            // Dedup: não re-disparar o mesmo trigger na janela de 24h.
            const jaFez = await jaDisparouRecente(supabase, conv.id, trigger.id);
            if (jaFez) continue;

            await enfileirarAcaoTemporal(supabase, conv, trigger, condicaoTipo);
            res.disparadas++;
          }
        }
      } catch (err) {
        console.error(`[sweep-silencio] erro inesperado conv=${conv.id}:`, (err as Error).message);
        res.erros++;
      }
    }

    if (conversas.length < BATCH_SIZE) return;
  }
}
