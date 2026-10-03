/**
 * Monta o Pensamento estruturado a partir do `pensamento_atual` que o RPC
 * `fn_dossie_lead_consolidado` devolve (fonte da verdade rica do motor).
 *
 * O Chat-Teste antes remontava o pensamento do `trace` raso da edge
 * (`Intenção: X` / `Usar tool Y`) — perdendo motivo, leitura da situação e o
 * plano real dos próximos turnos que o motor já gera e persiste. Aqui usamos
 * o dossiê; só caímos no `fallback` (trace) se o RPC vier sem conteúdo útil.
 */
import type { AcaoPretendida, Pensamento, PlanoTurno } from "../conversas/tipos";

export function pensamentoDoDossie(
  pa: Record<string, unknown> | null | undefined,
  fallback: Pensamento,
  ehAcaoValida: (s: unknown) => s is AcaoPretendida,
): Pensamento {
  if (!pa || typeof pa !== "object") return fallback;

  const proximaIntencao =
    typeof pa.proxima_intencao === "string" ? pa.proxima_intencao : "";
  const leitura =
    typeof pa.leitura_da_situacao === "string" ? pa.leitura_da_situacao : null;
  const motivo = typeof pa.motivo === "string" ? pa.motivo : null;
  const planoBruto = Array.isArray(pa.plano_proximos_turnos)
    ? (pa.plano_proximos_turnos as unknown[])
    : [];

  // Sem nada útil no RPC → fica no trace (não regride pra vazio).
  const temConteudo =
    proximaIntencao.length > 0 || leitura !== null || motivo !== null || planoBruto.length > 0;
  if (!temConteudo) return fallback;

  const plano: PlanoTurno[] = planoBruto
    .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
    .map((p) => ({
      turno: Number(p.turno ?? 0),
      o_que_fazer: String(p.o_que_fazer ?? ""),
      por_que: String(p.por_que ?? ""),
    }));

  return {
    id: `rpc-${typeof pa.atualizado_em === "string" ? pa.atualizado_em : Date.now()}`,
    proxima_intencao: proximaIntencao || "Processando próximo turno",
    acao_pretendida: ehAcaoValida(pa.acao_pretendida)
      ? pa.acao_pretendida
      : "responder_e_aguardar",
    leitura_da_situacao: leitura,
    motivo,
    quando_voltar: typeof pa.quando_voltar === "string" ? pa.quando_voltar : null,
    plano_proximos_turnos: plano,
    criado_em: new Date().toISOString(),
  };
}
