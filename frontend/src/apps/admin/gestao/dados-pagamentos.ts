/**
 * Histórico de pagamentos (Lote J, item 19 do dossiê `plano-integracao/DOSSIE-O-QUE-FALTA-NO-APP.md`).
 *
 * O banco já grava sozinho, por gatilho, toda vez que um pagamento (parcela ou mensalidade) é
 * apagado, desmarcado ou alterado: `public.gestao_pagamentos_log` (id, tabela, linha_id, cliente_id,
 * acao, antes jsonb, depois jsonb, por uuid, em timestamptz). `authenticated` já tem `select` nela e
 * a RLS só deixa ver quem pode ver o financeiro — nada de política nova aqui, só leitura.
 *
 * Mesmo cliente e mesmo estilo de erro de `dados.ts` (reaproveita a classe `ErroDados` de lá;
 * `dados.ts` não foi editado). Este arquivo só lê; nunca grava.
 */

import { supabase } from "@/integrations/supabase/client";
import { ErroDados } from "./dados";
import { dataBR, dataHoraBR, formatBRL, type PagamentoLog, type SupabaseBruto } from "./tipos";

const sb = (): SupabaseBruto => supabase as SupabaseBruto;

/** Limite razoável para uma lista de histórico (não é um relatório, é "o que mudou recentemente"). */
const LIMITE_PADRAO = 200;

export interface FiltroPagamentosLog {
  /** Só as alterações deste cliente. */
  clienteId?: string;
  /** Só as alterações desta linha (uma parcela ou uma mensalidade específica). */
  linhaId?: string;
  /** Só as alterações desta tabela ("gestao_parcelas" ou "gestao_mensalidades"). */
  tabela?: string;
  limite?: number;
}

/** Lê o log, mais recente primeiro. Falha do banco vira ErroDados (mesma classe de dados.ts). */
export async function lerPagamentosLog(filtro: FiltroPagamentosLog = {}): Promise<PagamentoLog[]> {
  let q = sb()
    .from("gestao_pagamentos_log")
    .select("id, tabela, linha_id, cliente_id, acao, antes, depois, por, em")
    .order("em", { ascending: false })
    .limit(filtro.limite ?? LIMITE_PADRAO);
  if (filtro.clienteId) q = q.eq("cliente_id", filtro.clienteId);
  if (filtro.linhaId) q = q.eq("linha_id", filtro.linhaId);
  if (filtro.tabela) q = q.eq("tabela", filtro.tabela);
  const { data, error } = await q;
  if (error) {
    console.error("[Gestão]", error.code ?? "", error.message ?? "");
    throw new ErroDados("Não consegui carregar o histórico de pagamentos.", error.code);
  }
  return (data ?? []) as PagamentoLog[];
}

// ---------------------------------------------------------------------------
// Tradução para linguagem de gente — nunca despeja o JSON de `antes`/`depois` na tela.
// ---------------------------------------------------------------------------

const VERBO: Record<PagamentoLog["acao"], string> = {
  apagou: "apagou",
  desmarcou: "desmarcou o pagamento de",
  alterou: "alterou o pagamento de",
};

const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v) || 0);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

function valorDaLinha(l: Record<string, unknown>): number | null {
  return numOrNull(l.valor_recebido ?? l.valor);
}
function dataPagamento(l: Record<string, unknown>): string | null {
  return strOrNull(l.pago_em);
}

/** "a mensalidade 3" / "a parcela \"Entrada\"" / "o registro" — o que foi alterado, em português. */
function rotuloLinha(log: PagamentoLog): string {
  const linha = log.antes ?? log.depois ?? {};
  if (log.tabela === "gestao_mensalidades") {
    const n = linha.n;
    return n != null ? `a mensalidade ${String(n)}` : "a mensalidade";
  }
  if (log.tabela === "gestao_parcelas") {
    const desc = strOrNull(linha.descricao);
    return desc ? `a parcela "${desc}"` : "a parcela";
  }
  return "o registro";
}

/** Frase entre parênteses com o que mudou, ou null quando não há o que resumir. */
function detalhe(log: PagamentoLog): string | null {
  const antes = log.antes ?? {};
  const depois = log.depois ?? {};
  if (log.acao !== "alterou") {
    // apagou/desmarcou: o que existia antes (o que se perdeu)
    const v = valorDaLinha(antes);
    const d = dataPagamento(antes) ?? strOrNull(antes.vencimento);
    if (v != null && d) return `era ${formatBRL(v)} pago em ${dataBR(d)}`;
    if (v != null) return `era ${formatBRL(v)}`;
    return null;
  }
  const vAntes = valorDaLinha(antes);
  const vDepois = valorDaLinha(depois);
  const dAntes = dataPagamento(antes);
  const dDepois = dataPagamento(depois);
  const partes: string[] = [];
  if (vAntes != null && vDepois != null && vAntes !== vDepois) {
    partes.push(`valor de ${formatBRL(vAntes)} para ${formatBRL(vDepois)}`);
  }
  if (dAntes !== dDepois) {
    partes.push(`pagamento de ${dAntes ? dataBR(dAntes) : "—"} para ${dDepois ? dataBR(dDepois) : "—"}`);
  }
  return partes.length ? partes.join("; ") : null;
}

/**
 * Linha legível: "Fulano desmarcou o pagamento da parcela X em 20/09/2026 14:30 (era R$ 1.000,00
 * pago em 15/09/2026)." `nomeDe` resolve o uuid de `por` para um nome (ver `perfis()` em dados.ts);
 * sem resolução (ou sem autor), mostra "alguém do time".
 */
export function resumoHistoricoLinha(log: PagamentoLog, nomeDe: (id: string) => string): string {
  const quem = log.por ? nomeDe(log.por) : "alguém do time";
  const d = detalhe(log);
  return `${quem} ${VERBO[log.acao]} ${rotuloLinha(log)} em ${dataHoraBR(log.em)}${d ? ` (${d})` : ""}.`;
}
