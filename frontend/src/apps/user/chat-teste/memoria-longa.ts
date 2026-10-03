/**
 * Helpers puros — montam a memória longa + timeline da AbaQuem a partir do
 * DossieEnriquecido (RPC fn_dossie_lead_consolidado). Onda 2026-05-16.
 *
 * Motivo: o Chat-Teste deixava `conversa.lead.memoria_longa`/`timeline` no mock
 * fixo de `conversaInicial()`. A AbaQuem lia mock → engajamento 0, pontos-chave
 * vazio, "em contato hoje" sempre. Aqui derivamos do que o motor JÁ grava:
 *  - resumo        ← crenca_conversa.resumo_agente
 *  - pontos_chave  ← memoria_lead (fatos), relevância alta primeiro
 *  - engajamento   ← engajamento_lead.pontuacao (0-1) OU score_lead/100 (proxy honesto)
 *  - primeiro_contato ← MIN(mensagens.created_at) via RPC lead.first_contact_at
 */
import type { DossieEnriquecido } from "../conversas/hooks/useConversasLive";
import type { EventoTimeline, MemoriaLonga } from "../conversas/tipos";

const PESO_RELEVANCIA = { alta: 3, media: 2, baixa: 1 } as const;

export function montarMemoriaLonga(
  dossie: DossieEnriquecido,
  scoreLead: number,
  primeiroContatoAnterior?: string,
): MemoriaLonga {
  const pontuacaoRpc =
    dossie.engajamento && typeof dossie.engajamento.pontuacao === "number"
      ? Number(dossie.engajamento.pontuacao)
      : null;
  const engajamento_score =
    pontuacaoRpc != null
      ? Math.max(0, Math.min(1, pontuacaoRpc))
      : Math.max(0, Math.min(1, (Number(scoreLead) || 0) / 100));

  const pontos_chave = [...dossie.fatos]
    .sort(
      (a, b) =>
        PESO_RELEVANCIA[b.relevancia] * b.confianca -
        PESO_RELEVANCIA[a.relevancia] * a.confianca,
    )
    .map((f) => f.fato)
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .slice(0, 6);

  const primeiro_contato_iso =
    dossie.lead?.first_contact_at ??
    dossie.lead?.criado_em ??
    primeiroContatoAnterior ??
    new Date().toISOString();

  return {
    resumo: dossie.crenca_resumo ?? "",
    pontos_chave,
    engajamento_score,
    primeiro_contato_iso,
  };
}

export function montarTimelineQuem(dossie: DossieEnriquecido): EventoTimeline[] {
  return [...dossie.episodios]
    .sort(
      (a, b) =>
        new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime(),
    )
    .map((e) => ({
      id: `ep-${e.id}`,
      tipo: "conversa_iniciada" as const,
      rotulo: e.episodio_resumo || e.gancho || "Episódio passado",
      data_iso: e.criado_em,
    }));
}
