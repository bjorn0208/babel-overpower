/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// cron-cluster-gaps · Fase B Curadoria.
//
// Varre perguntas_sem_resposta com cluster_id IS NULL e resolvido=false.
// Embeda via Voyage voyage-4 @1024 (mesmo modelo que cron-tags-curadoria).
// Clusteriza por similarity 0.85 contra clusters existentes em orphan_questions
// (lê embedding_amostra). Se nenhum bate, cria cluster novo.
//
// Idempotente · roda mesmo com tabela vazia. Schedule via pg_cron a cada 6h.

import { type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { criarClienteAdmin } from "../_shared/supabase.ts";
import { embedarLoteVoyage, getVoyageCreds } from "../_shared/voyage-embed.ts";
import { autorizarCron } from "../_shared/auth-cron.ts";
const SIM_THRESHOLD = 0.85;
const MAX_BATCH = 64;
const MAX_POR_RUN = 200;

type Pergunta = {
  id: string;
  tenant_id: string | null;
  pergunta: string;
  contexto: string | null;
  embedding: number[] | null;
  ocorrencias: number;
};

type Cluster = {
  id: string;
  cluster_id: string | null;
  pergunta_representativa: string;
  embedding_amostra: number[] | null;
  num_perguntas: number;
  num_leads: number;
};

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

function parseEmbedding(raw: unknown): number[] | null {
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === "string") {
    try {
      const limpo = raw.startsWith("[") ? raw : `[${raw}]`;
      const parsed = JSON.parse(limpo);
      return Array.isArray(parsed) ? (parsed as number[]) : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function processarTenant(
  supabase: SupabaseClient,
  tenantId: string | null,
  apiKey: string,
  baseUrl: string,
): Promise<{ embedded: number; clusters_criados: number; perguntas_atribuidas: number }> {
  const stats = { embedded: 0, clusters_criados: 0, perguntas_atribuidas: 0 };

  let q = supabase
    .from("perguntas_sem_resposta")
    .select("id, tenant_id, pergunta, contexto, embedding, ocorrencias")
    .is("cluster_id", null)
    .eq("resolvido", false)
    .order("ocorrencias", { ascending: false })
    .limit(MAX_POR_RUN);
  if (tenantId) q = q.eq("tenant_id", tenantId);
  else q = q.is("tenant_id", null);
  const { data: pendentes, error: errP } = await q;
  if (errP) {
    console.warn(`[cron-cluster-gaps] tenant ${tenantId} carregar pendentes erro: ${errP.message}`);
    return stats;
  }
  const lista = (pendentes ?? []) as Pergunta[];
  if (lista.length === 0) return stats;

  const semEmbed = lista.filter((p) => !p.embedding);
  for (let i = 0; i < semEmbed.length; i += MAX_BATCH) {
    const lote = semEmbed.slice(i, i + MAX_BATCH);
    const vec = await embedarLoteVoyage(supabase, lote.map((p) => p.pergunta), "document", "embed_cluster_gaps", apiKey, baseUrl);
    if (!vec) continue;
    for (let j = 0; j < lote.length; j++) {
      const { error } = await supabase
        .from("perguntas_sem_resposta")
        .update({ vetor_semantico: vec[j] })
        .eq("id", lote[j].id);
      if (!error) {
        stats.embedded++;
        lote[j].embedding = vec[j];
      }
    }
  }

  let clusterQ = supabase
    .from("perguntas_orfas")
    .select("id, cluster_id, pergunta_representativa, embedding_amostra, num_perguntas, num_leads")
    .eq("resolvido", false);
  if (tenantId) clusterQ = clusterQ.eq("tenant_id", tenantId);
  else clusterQ = clusterQ.is("tenant_id", null);
  const { data: clustersExistentes } = await clusterQ;
  const clusters: Cluster[] = ((clustersExistentes ?? []) as Cluster[])
    .map((c) => ({ ...c, embedding_amostra: parseEmbedding(c.embedding_amostra) }))
    .filter((c) => c.embedding_amostra !== null);

  for (const p of lista) {
    const emb = parseEmbedding(p.embedding);
    if (!emb) continue;

    let melhor: { cluster: Cluster; sim: number } | null = null;
    for (const c of clusters) {
      const sim = cosineSimilarity(emb, c.embedding_amostra!);
      if (sim >= SIM_THRESHOLD && (!melhor || sim > melhor.sim)) {
        melhor = { cluster: c, sim };
      }
    }

    if (melhor) {
      const { error: upClusterErr } = await supabase
        .from("perguntas_orfas")
        .update({
          num_perguntas: melhor.cluster.num_perguntas + 1,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", melhor.cluster.id);
      if (!upClusterErr) {
        await supabase
          .from("perguntas_sem_resposta")
          .update({ cluster_id: melhor.cluster.cluster_id })
          .eq("id", p.id);
        stats.perguntas_atribuidas++;
        melhor.cluster.num_perguntas++;
      }
    } else {
      const novoClusterId = `c_${crypto.randomUUID().slice(0, 12)}`;
      const { data: novoOrphan, error: insErr } = await supabase
        .from("perguntas_orfas")
        .insert({
          tenant_id: p.tenant_id,
          cluster_id: novoClusterId,
          titulo: p.pergunta.slice(0, 80),
          pergunta_representativa: p.pergunta,
          intents_inferidas: [],
          num_perguntas: 1,
          num_leads: 1,
          resolvido: false,
          embedding_amostra: emb,
        })
        .select("id, cluster_id, num_perguntas, num_leads")
        .single();
      if (insErr || !novoOrphan) {
        console.warn(`[cron-cluster-gaps] criar cluster erro: ${insErr?.message}`);
        continue;
      }
      await supabase
        .from("perguntas_sem_resposta")
        .update({ cluster_id: novoClusterId })
        .eq("id", p.id);
      clusters.push({
        id: novoOrphan.id,
        cluster_id: novoClusterId,
        pergunta_representativa: p.pergunta,
        embedding_amostra: emb,
        num_perguntas: 1,
        num_leads: 1,
      });
      stats.clusters_criados++;
      stats.perguntas_atribuidas++;
    }
  }

  return stats;
}

Deno.serve(async (req: Request) => {
  const { ok: _cronOk } = await autorizarCron(req);
  if (!_cronOk) {
    return new Response(JSON.stringify({ ok: false, erro: "nao_autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const supabase = criarClienteAdmin();
  const { apiKey, baseUrl } = await getVoyageCreds(supabase);
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "voyage api_key nao configurada" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const inicio = Date.now();

  const { data: tenantsDistintos } = await supabase
    .from("perguntas_sem_resposta")
    .select("tenant_id")
    .is("cluster_id", null)
    .eq("resolvido", false);
  const tenantsUnicos = Array.from(
    new Set(((tenantsDistintos ?? []) as { tenant_id: string | null }[]).map((r) => r.tenant_id ?? "_null")),
  ).map((s) => (s === "_null" ? null : s));

  const logs: { tenant_id: string | null; embedded: number; clusters_criados: number; perguntas_atribuidas: number }[] = [];
  for (const tid of tenantsUnicos) {
    try {
      const log = await processarTenant(supabase, tid, apiKey, baseUrl);
      logs.push({ tenant_id: tid, ...log });
    } catch (e) {
      console.warn(`[cron-cluster-gaps] tenant ${tid} erro: ${(e as Error).message}`);
      logs.push({ tenant_id: tid, embedded: 0, clusters_criados: 0, perguntas_atribuidas: 0 });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, duracao_ms: Date.now() - inicio, tenants: logs.length, logs }),
    { headers: { "Content-Type": "application/json" } },
  );
});
