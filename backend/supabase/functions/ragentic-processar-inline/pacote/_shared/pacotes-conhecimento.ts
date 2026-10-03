// _shared/pacotes-conhecimento.ts — Pacotes de Conhecimento (upgrade ON/OFF por agente).
//
// Camada EXTRA de conhecimento, somada ao padrão (global/nicho/tenant). O dono liga pacotes
// no Hub de Conhecimento; desligado, nada aqui roda e o prompt sai idêntico ao de antes.
//
// Cada bloco tem um modo:
//   • "sempre"     → entra inteiro em TODO turno (bloco fixo, como a Rifa do Dia).
//   • "relevancia" → busca híbrida (busca_hibrida_pacotes) + rerank, só quando o assunto bate.
//
// Catraca no banco (pacote_liberado_para_tenant): pacote do próprio tenant, ou pacote da Babel
// ativo, do nicho e — se vendido na Loja — instalado. Re-checada a cada turno: desinstalou, saiu.
// Falha de leitura degrada pra "sem pacote" — nunca derruba o turno.

import { EMBED_DIM, gerarEmbeddingQuery, rerankCohere } from "./tools-internas.ts";

export type BlocoPacoteFixo = {
  id: string;
  pacote_id: string;
  pacote_nome: string;
  titulo: string;
  conteudo: string;
  category: string | null;
};

export type BlocoPacoteRelevante = {
  id: string;
  pacote_id: string;
  pacote_nome: string;
  titulo: string;
  conteudo: string;
  category: string | null;
  rerank_score: number;
};

export type PacotesAgente = {
  pacotes: Array<{ id: string; nome: string }>;
  temRelevancia: boolean;
  fixos: BlocoPacoteFixo[];
};

const VAZIO: PacotesAgente = { pacotes: [], temRelevancia: false, fixos: [] };

/** Teto do bloco fixo inteiro no prompt (cada bloco "sempre" já é ≤ 1500 no banco). */
export const TETO_FIXOS_CHARS = 6000;

export async function carregarPacotesAgente(
  // deno-lint-ignore no-explicit-any
  sb: any,
  agenteId: string | null | undefined,
): Promise<PacotesAgente> {
  if (!agenteId) return VAZIO;
  try {
    const { data, error } = await sb.rpc("pacotes_conhecimento_do_agente", { p_agente_id: agenteId });
    if (error || !data) {
      if (error) console.warn(`[pacotes] pacotes_conhecimento_do_agente: ${error.message}`);
      return VAZIO;
    }
    return {
      pacotes: Array.isArray(data.pacotes) ? data.pacotes : [],
      temRelevancia: data.tem_relevancia === true,
      fixos: Array.isArray(data.fixos) ? data.fixos : [],
    };
  } catch (e) {
    console.warn(`[pacotes] falha ao carregar: ${(e as Error).message}`);
    return VAZIO;
  }
}

/**
 * Bloco fixo ("sempre") pro system prompt. `rotular` numera a fonte [N] no registro global de
 * citações do turno. Respeita o teto total — o que passa do teto fica de fora (em ordem).
 */
export function montarBlocoPacotesFixos(
  fixos: BlocoPacoteFixo[],
  rotular: (id: string, fonte: string) => string,
  teto = TETO_FIXOS_CHARS,
): string {
  if (!fixos.length) return "";
  const linhas: string[] = [];
  let usado = 0;
  for (const b of fixos) {
    const conteudo = String(b.conteudo ?? "").trim();
    if (!conteudo) continue;
    const corpo = `${b.titulo} (pacote "${b.pacote_nome}") — ${conteudo}`;
    if (usado + corpo.length > teto) break;
    usado += corpo.length;
    linhas.push(`${rotular(b.id, "pacote")} ${corpo}`);
  }
  if (!linhas.length) return "";
  return "\n\nCONHECIMENTO EXTRA — PACOTES ATIVOS (soma ao conhecimento da empresa; se conflitar com a BASE DE CONHECIMENTO da empresa, vale a da empresa — cite a fonte [N]):\n" +
    linhas.join("\n\n");
}

/** Busca por relevância nos blocos "relevancia" dos pacotes ligados do agente. */
export async function recuperarBlocosPacotes(
  // deno-lint-ignore no-explicit-any
  sb: any,
  opts: {
    query: string;
    agente_id: string;
    limite?: number;
    piso?: number;
    categoriasBloqueadas?: string[];
  },
): Promise<BlocoPacoteRelevante[]> {
  const query = (opts.query || "").trim();
  const limite = Math.min(opts.limite ?? 4, 8);
  if (!query) return [];
  try {
    const embedding = await gerarEmbeddingQuery(sb, query);
    const temVetor = !!(embedding && embedding.length === EMBED_DIM);
    const { data, error } = await sb.rpc("busca_hibrida_pacotes", {
      p_query_text: query,
      p_query_embedding: temVetor ? embedding : null,
      p_agente_id: opts.agente_id,
      p_match_count: Math.max(limite * 4, 16),
    });
    if (error) {
      console.warn(`[pacotes] busca_hibrida_pacotes: ${error.message}`);
      return [];
    }
    // deno-lint-ignore no-explicit-any
    const candidatos: any[] = (data as any[]) ?? [];
    if (!candidatos.length) return [];

    // Mesma trava de fase do recall padrão: categoria bloqueada sai, sem fallback.
    const bloqueadas = (opts.categoriasBloqueadas ?? []).map((c) => c.toLowerCase());
    const permitidos = candidatos.filter((b) => !bloqueadas.includes(String(b.category ?? "").toLowerCase()));
    if (!permitidos.length) return [];

    const docs = permitidos.map((b) => `${b.titulo || ""}\n\n${b.conteudo || ""}`.trim());
    const ranked = await rerankCohere(sb, query, docs, Math.max(limite * 2, 8));
    const PISO = opts.piso ?? 0.2;
    // deno-lint-ignore no-explicit-any
    let finais: Array<{ b: any; score: number }>;
    if (ranked && ranked.length > 0) {
      // Com rerank: só entra o que é relevante de verdade. Pacote é bônus — melhor não trazer
      // nada do que trazer bloco fora de assunto (diferente do recall padrão, sem fallback).
      finais = ranked
        .map((r) => ({ b: permitidos[r.index], score: r.score }))
        .filter((x) => x.b && x.score >= PISO);
    } else {
      finais = permitidos.map((b) => ({ b, score: Number(b.rrf_score ?? 0) }));
    }
    return finais.slice(0, limite).map(({ b, score }) => ({
      id: String(b.id),
      pacote_id: String(b.pacote_id),
      pacote_nome: String(b.pacote_nome ?? ""),
      titulo: String(b.titulo ?? ""),
      conteudo: String(b.conteudo ?? ""),
      category: (b.category ?? null) as string | null,
      rerank_score: score,
    }));
  } catch (e) {
    console.warn(`[pacotes] falha na busca: ${(e as Error).message}`);
    return [];
  }
}

/** Trecho dos blocos por relevância pro system prompt (conteúdo cortado em 600 chars). */
export function montarTrechoPacotesRelevantes(
  blocos: BlocoPacoteRelevante[],
  rotular: (id: string, fonte: string) => string,
): string {
  if (!blocos.length) return "";
  return "\n\nCONHECIMENTO EXTRA DOS PACOTES (relevante pra este turno — soma à base da empresa; cite a fonte [N]):\n" +
    blocos
      .map((b) => `${rotular(b.id, "pacote")} ${b.titulo} (pacote "${b.pacote_nome}") — ${b.conteudo.slice(0, 600)}`)
      .join("\n\n");
}
