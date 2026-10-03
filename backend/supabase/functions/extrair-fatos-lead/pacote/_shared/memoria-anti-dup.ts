/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

// Gate anti-duplicação semântico COMPARTILHADO (Mem0-style).
// Caminho B (2026-05-30): centraliza o dedup de fato num ponto único, usado pelo
// motor (ragentic-processar-inline, no lugar do dedup lexical) e pela edge
// extrair-fatos-lead. Decide ADD/UPDATE/NOOP por SIMILARIDADE SEMÂNTICA (embedding
// + RPC lead_memory_similar), não por palavras.
// INVIOLÁVEL: leadId NUNCA null/vazio — cross-lead leak viola LGPD.

// O motor usa client esm.sh e a edge usa jsr — tipo genérico evita incompatibilidade.
// deno-lint-ignore no-explicit-any
type AnyClient = any;

export type DecisaoAntiDup = "ADD" | "UPDATE" | "NOOP";

export type HitSimilar = { id: string; fato: string; similaridade: number };

export type DecisaoFato = {
  decisao: DecisaoAntiDup;
  /** ID do fato existente quando UPDATE — para soft-invalidar o anterior */
  fatoExistenteId?: string;
  /** Similaridade cosine com o fato existente mais próximo (0..1) */
  similaridade?: number;
};

/** Fato candidato genérico — compatível com o extrator inline do motor e o da edge. */
export type FatoCandidato = {
  fato: string;
  categoria: string;
  relevancia: string;
  confianca: number;
  valido_desde?: string | null;
  /** A6: carga emocional 0..1 (0=neutro, 1=muito carregado) — alimenta a saliência viva. */
  valencia_emocional?: number | null;
  /** A6: true quando o lead declarou/confirmou explicitamente — vira piso inegociável no recall. */
  confirmado_pelo_lead?: boolean | null;
};

export type ResultadoGate = {
  fato: FatoCandidato;
  decisao: DecisaoAntiDup;
  fatoExistenteId?: string;
  similaridade?: number;
};

// Thresholds anti-duplicação por categoria (Mem0-style). Fonte: wave0-cognitivo §4.
// Categoria fora do mapa cai no default 0.85.
export const THRESHOLD_POR_CATEGORIA: Record<string, number> = {
  fato_biografico: 0.85,
  fato_financeiro: 0.90,
  objecao: 0.90,
  interesse: 0.80,
  historico_negociacao: 0.80,
};

/**
 * Função PURA de decisão: dado o fato candidato e o vizinho mais próximo já
 * existente, decide ADD (novo) / UPDATE (substitui por versão mais específica) /
 * NOOP (duplicata semântica — descarta).
 *
 * Regras:
 *  - confiança < 0.5 → NOOP (especulação não entra na memória)
 *  - sem vizinho similar → ADD
 *  - similaridade >= threshold:
 *      - novo mais específico (>1.3x o tamanho) E confiança >= 0.8 → UPDATE
 *      - senão → NOOP (mesma percepção; é o que mata a duplicata)
 *  - similaridade < threshold → ADD
 */
export function decidirAcaoFato(params: {
  fatoTexto: string;
  confianca: number;
  threshold: number;
  hitTopo: HitSimilar | null;
}): DecisaoFato {
  const { fatoTexto, confianca, threshold, hitTopo } = params;

  if (confianca < 0.5) return { decisao: "NOOP", similaridade: 0 };
  if (!hitTopo) return { decisao: "ADD" };

  const sim = hitTopo.similaridade ?? 0;
  if (sim >= threshold) {
    const novoMaisEspecifico = fatoTexto.length > hitTopo.fato.length * 1.3;
    if (novoMaisEspecifico && confianca >= 0.8) {
      return { decisao: "UPDATE", fatoExistenteId: hitTopo.id, similaridade: sim };
    }
    return { decisao: "NOOP", similaridade: sim };
  }
  return { decisao: "ADD", similaridade: sim };
}

/** Gera embedding via edge gerar-embedding. Retorna array ou null em falha. */
async function gerarEmbedding(
  supabase: AnyClient,
  texto: string,
): Promise<number[] | null> {
  try {
    // A edge `gerar-embedding` é PROCESSADORA DE FILA (pgmq), não embeda texto avulso.
    // `gerarEmbeddingQuery` (Voyage voyage-4, 1024d) é o caminho certo.
    // Import dinâmico lazy: tools-internas puxa libs Deno; mantém este módulo testável
    // com tsx (o teste exercita só `decidirAcaoFato` puro e nunca chega aqui).
    const { gerarEmbeddingQuery } = await import("./tools-internas.ts");
    return await gerarEmbeddingQuery(supabase, texto);
  } catch (e) {
    console.warn("[memoria-anti-dup] embedding falhou:", (e as Error).message ?? e);
    return null;
  }
}

/**
 * Avalia cada fato extraído contra a memória existente do lead (semântico).
 * Falha de infra (sem embedding / RPC erro) → ADD conservador (não perder fato).
 * INVIOLÁVEL: leadId nunca vazio — checado antes.
 */
export async function avaliarFatosAntiDup(params: {
  supabase: AnyClient;
  leadId: string;
  fatos: FatoCandidato[];
}): Promise<ResultadoGate[]> {
  const { supabase, leadId, fatos } = params;

  if (!leadId) {
    console.warn("[memoria-anti-dup] leadId ausente — ADD direto (não deve ocorrer)");
    return fatos.map((f) => ({ fato: f, decisao: "ADD" as DecisaoAntiDup }));
  }

  const resultados: ResultadoGate[] = [];

  for (const fato of fatos) {
    if (fato.confianca < 0.5) {
      resultados.push({ fato, decisao: "NOOP", similaridade: 0 });
      continue;
    }

    const embedding = await gerarEmbedding(supabase, fato.fato);
    if (!embedding) {
      resultados.push({ fato, decisao: "ADD" });
      continue;
    }

    const threshold = THRESHOLD_POR_CATEGORIA[fato.categoria] ?? 0.85;

    const { data: similares, error: simErr } = await supabase.rpc("lead_memory_similar", {
      p_lead_id: leadId,
      p_embedding: `[${embedding.join(",")}]`,
      p_threshold: threshold,
      p_top_k: 3,
    });

    if (simErr) {
      console.warn("[memoria-anti-dup] lead_memory_similar falhou:", simErr.message);
      resultados.push({ fato, decisao: "ADD" });
      continue;
    }

    const hits = (similares as HitSimilar[]) ?? [];
    const hitTopo = hits.length > 0 ? hits[0] : null;

    const d = decidirAcaoFato({
      fatoTexto: fato.fato,
      confianca: fato.confianca,
      threshold,
      hitTopo,
    });
    resultados.push({ fato, ...d });
  }

  return resultados;
}

/**
 * Persiste o resultado do gate. ADD/UPDATE inserem o fato novo; UPDATE também
 * soft-invalida o anterior (ativa=false, trilha LGPD). NOOP é ignorado.
 * `camposComuns` carrega o que varia por caminho (motor seta modulo/escopo/conversation_id).
 */
export async function persistirFatos(params: {
  supabase: AnyClient;
  leadId: string;
  tenantId: string;
  resultados: ResultadoGate[];
  fonteTurno: number;
  camposComuns?: {
    conversation_id?: string | null;
    fonte?: string;
    modulo?: string;
    escopo?: string;
  };
}): Promise<{ inseridos: number; atualizados: number; ignorados: number; erros: string[] }> {
  const { supabase, leadId, tenantId, resultados, fonteTurno, camposComuns } = params;

  let inseridos = 0;
  let atualizados = 0;
  let ignorados = 0;
  const erros: string[] = [];

  for (const res of resultados) {
    if (res.decisao === "NOOP") {
      ignorados++;
      continue;
    }

    const { error: insertErr } = await supabase.from("memoria_lead").insert({
      lead_id: leadId,
      tenant_id: tenantId,
      fato: res.fato.fato,
      categoria: res.fato.categoria,
      relevancia: res.fato.relevancia,
      confianca: res.fato.confianca,
      // A6: emoção do fato (default 0 = neutro) + confirmação explícita do lead.
      // confirmado = lead declarou de boca própria (confiança >= 0.95 no schema = "declarou explicitamente"),
      // a menos que o call-site já tenha decidido. Vira piso inegociável no recall.
      valencia_emocional: res.fato.valencia_emocional ?? 0,
      confirmado_pelo_lead: res.fato.confirmado_pelo_lead ?? (res.fato.confianca >= 0.95),
      fonte_turno: fonteTurno,
      ativa: true,
      valido_desde: res.fato.valido_desde ?? null,
      conversation_id: camposComuns?.conversation_id ?? null,
      fonte: camposComuns?.fonte ?? "auto",
      modulo: camposComuns?.modulo ?? null,
      escopo: camposComuns?.escopo ?? "curto",
      embedding_status: "pendente",
    });

    if (insertErr) {
      const msg = `INSERT falhou ("${res.fato.fato.slice(0, 60)}"): ${insertErr.message}`;
      console.warn("[memoria-anti-dup]", msg);
      erros.push(msg);
      continue;
    }

    if (res.decisao === "UPDATE" && res.fatoExistenteId) {
      // A6 bitemporal: o fato antigo deixou de valer no mundo real AGORA (substituído por versão
      // mais específica). Marca valido_ate (mundo real) + sistema_expirou_em (quando o sistema
      // parou de acreditar) + ativa=false — append-only, nada se perde.
      const agora = new Date().toISOString();
      const { error: updErr } = await supabase
        .from("memoria_lead")
        .update({ ativa: false, valido_ate: agora, sistema_expirou_em: agora })
        .eq("id", res.fatoExistenteId)
        .eq("lead_id", leadId); // defesa em profundidade
      if (updErr) erros.push(`UPDATE soft-invalida falhou (${res.fatoExistenteId}): ${updErr.message}`);
      atualizados++;
    } else {
      inseridos++;
    }
  }

  return { inseridos, atualizados, ignorados, erros };
}
