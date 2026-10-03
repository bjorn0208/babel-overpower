/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// cron-recategorizar-blocos · one-shot · Bloco 3 parte 2
// Re-classifica semanticamente todos os blocos com tag IS NULL via Gemma 27B
// NÃO toca blocos atômicos (tag preenchido · gerados pelo Bloco 3.5)
// Aplica limpar_antes_embedar() nos blocos que mudam para categorias de conteúdo denso

import { criarClienteAdmin } from "../_shared/supabase.ts";
import { autorizarCron } from "../_shared/auth-cron.ts";

const MODEL = "google/gemma-3-27b-it";
const PARALELISMO = 15; // req/s · throughput OpenRouter

const CATEGORIAS_VALIDAS = [
  "preco",
  "garantia",
  "prazo",
  "pagamento",
  "produto",
  "faq",
  "objecao_lead",
  "contrato",
  "fluxo",
  "empresa",
  "atendimento",
  "identidade",
  "processo",
] as const;

type Categoria = (typeof CATEGORIAS_VALIDAS)[number];

// Categorias que exigem cap de bytes para manter semântica densa
const CAP_POR_CATEGORIA: Partial<Record<Categoria, number>> = {
  contrato: 800,
  preco: 600,
  garantia: 600,
  prazo: 600,
  pagamento: 600,
};

const SYSTEM_PROMPT = `Você é um classificador de blocos de conhecimento.
Recebe um trecho de texto e deve responder APENAS com 1 palavra sendo a categoria correta.

Categorias disponíveis:
- preco           valores · preços · valor à vista · valor parcelado · custos
- garantia        garantia · devolução · ressarcimento · "se não funcionar"
- prazo           prazos · tempo · "30 dias" · cronograma
- pagamento       PIX · boleto · cartão · forma de pagar · chave PIX
- produto         descrição do produto · benefícios · funcionalidades
- faq             pergunta frequente · resposta padrão a dúvida comum
- objecao_lead    resposta a objeção · "é caro" · "tô na dúvida" · superação de obstáculo
- contrato        cláusula contratual · disposições · jurídico · § parágrafo
- fluxo           passo-a-passo · sequência operacional · "primeiro... depois..."
- empresa         dados da empresa · descrição institucional · CNPJ · histórico
- atendimento     instrução de atendimento · como agente conversa · tom · saudação
- identidade      personalidade do agente · valores · forma de ser
- processo        processo jurídico · ação revisional · trâmite

Responda APENAS a palavra. Sem explicação. Sem aspas.

Exemplos:
TEXTO: "Limpa Nome custa R$ 597 à vista" → preco
TEXTO: "Garantia: nome limpo em 90d ou devolução" → garantia
TEXTO: "CLÁUSULA 7º DISPOSIÇÕES GERAIS" → contrato
TEXTO: "Pergunta frequente: O que acontece com meu score?" → faq
TEXTO: "Sou a Carol · me apresento sempre antes" → identidade`;

type LinhaBloco = {
  id: string;
  agente_id: string;
  content: string;
  category: string | null;
};

type ResultadoChunk = {
  id: string;
  categoria_antes: string;
  categoria_depois: string;
  ok: boolean;
  erro?: string;
};

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const { ok: _cronOk } = await autorizarCron(req);
  if (!_cronOk) {
    return new Response(JSON.stringify({ ok: false, erro: "nao_autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const supabase = criarClienteAdmin();

  // Buscar API key OpenRouter (env ou provedores_llm)
  let apiKey = Deno.env.get("OPENROUTER_API_KEY") ?? "";
  if (!apiKey) {
    const { data } = await supabase
      .from("provedores_llm")
      .select("api_key")
      .eq("slug", "openrouter")
      .single();
    apiKey = ((data as { api_key?: string } | null)?.api_key ?? "")
      .trim()
      .replace(/[\r\n\t]/g, "");
  }
  if (!apiKey) {
    return jsonResp({ error: "API key OpenRouter ausente" }, 503);
  }

  const t0 = Date.now();
  const body = await req.json().catch(() => ({})) as {
    tenant_id?: string;
    dry_run?: boolean;
    limite?: number;
  };
  const tenantIdFiltro = body.tenant_id ?? null;
  const dryRun = body.dry_run === true;
  const limite = body.limite ?? 1000;

  // Buscar IDs dos agentes do tenant filtrado (quando fornecido)
  let agentIds: string[] | null = null;
  if (tenantIdFiltro) {
    const { data: agentes } = await supabase
      .from("agentes_usuario")
      .select("id")
      .eq("user_id", tenantIdFiltro);
    agentIds = (agentes ?? []).map((a: { id: string }) => a.id);
    if (agentIds.length === 0) {
      return jsonResp({ ok: true, nada_a_processar: true, motivo: "tenant sem agentes" });
    }
  }

  // Buscar blocos elegíveis: ativos · sem tag (não atômicos) · sem filtro de tamanho
  let query = supabase
    .from("blocos_conhecimento")
    .select("id, agente_id, content, category")
    .eq("ativo", true)
    .is("tag", null)
    .limit(limite);

  if (agentIds) {
    query = query.in("agente_id", agentIds);
  }

  const { data: blocos, error: errFetch } = await query;
  if (errFetch) return jsonResp({ error: errFetch.message }, 500);

  const linhas = blocos as LinhaBloco[] | null;
  if (!linhas || linhas.length === 0) {
    return jsonResp({ ok: true, nada_a_processar: true });
  }

  let totalCustoUsd = 0;
  const results: ResultadoChunk[] = [];

  // Classifica 1 bloco via Gemma 27B e aplica UPDATE + auditoria
  async function classificar(bloco: LinhaBloco): Promise<ResultadoChunk> {
    try {
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://plataforma-limpa.vercel.app",
          "X-Title": "PL - cron-recategorizar-blocos",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `TEXTO: """${bloco.content.slice(0, 1500)}"""` },
          ],
          temperature: 0.1,
          max_tokens: 20,
          provider: { sort: "throughput", allow_fallbacks: true },
        }),
      });

      if (!resp.ok) {
        return {
          id: bloco.id,
          categoria_antes: bloco.category ?? "null",
          categoria_depois: bloco.category ?? "null",
          ok: false,
          erro: `HTTP ${resp.status}`,
        };
      }

      const respJson = await resp.json() as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const raw = (respJson.choices?.[0]?.message?.content ?? "").trim().toLowerCase();

      // Mapear resposta para categoria válida (tolerante a leve variação)
      const novaCategoria: Categoria =
        (CATEGORIAS_VALIDAS.find((c) => raw.startsWith(c)) as Categoria | undefined) ??
        ((bloco.category as Categoria | null | undefined) ?? "produto");

      // Acumular custo estimado (preços Gemma 27B no OpenRouter)
      const promptT = respJson.usage?.prompt_tokens ?? 0;
      const completionT = respJson.usage?.completion_tokens ?? 0;
      totalCustoUsd += (promptT * 0.15 + completionT * 0.20) / 1_000_000;

      // UPDATE somente se categoria mudou e não é dry-run
      if (novaCategoria !== bloco.category && !dryRun) {
        const { error: updErr } = await supabase
          .from("blocos_conhecimento")
          .update({ category: novaCategoria })
          .eq("id", bloco.id);

        if (!updErr) {
          // Registrar mudança de categoria no audit log
          await supabase.from("auditoria_blocos").insert({
            chunk_id: bloco.id,
            tabela: "blocos_conhecimento",
            acao: "re_categorizacao",
            antes: { category: bloco.category },
            depois: { category: novaCategoria },
            motivo: "re-categorização semântica via Gemma 27B (Bloco 3 parte 2)",
            executado_via: "cron",
          });

          // Verificar se a nova categoria exige cap de bytes
          const capBytes = CAP_POR_CATEGORIA[novaCategoria] ?? null;
          if (capBytes !== null && bloco.content.length > capBytes) {
            const { data: limpoData } = await supabase.rpc("limpar_antes_embedar", {
              p_text: bloco.content,
              p_cap_bytes: capBytes,
            });

            const textoLimpo: string =
              (limpoData as { texto_limpo?: string } | null)?.texto_limpo ?? bloco.content;

            if (textoLimpo !== bloco.content) {
              await supabase
                .from("blocos_conhecimento")
                .update({ content: textoLimpo, embedding_status: "pendente" })
                .eq("id", bloco.id);

              await supabase.from("auditoria_blocos").insert({
                chunk_id: bloco.id,
                tabela: "blocos_conhecimento",
                acao: "cap_bytes",
                antes: { content: bloco.content, bytes: bloco.content.length },
                depois: { content: textoLimpo, bytes: textoLimpo.length },
                bytes_removidos: bloco.content.length - textoLimpo.length,
                motivo: `cap de ${capBytes} bytes aplicado após re-categorização para ${novaCategoria}`,
                executado_via: "cron",
              });
            }
          }
        }
      }

      return {
        id: bloco.id,
        categoria_antes: bloco.category ?? "null",
        categoria_depois: novaCategoria,
        ok: true,
      };
    } catch (e) {
      return {
        id: bloco.id,
        categoria_antes: bloco.category ?? "null",
        categoria_depois: bloco.category ?? "null",
        ok: false,
        erro: (e as Error).message,
      };
    }
  }

  // Processar em batches de PARALELISMO com throttle de 1s entre lotes
  for (let i = 0; i < linhas.length; i += PARALELISMO) {
    const lote = linhas.slice(i, i + PARALELISMO);
    const loteResults = await Promise.all(lote.map(classificar));
    results.push(...loteResults);

    if (i + PARALELISMO < linhas.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // Estatísticas finais
  const sucesso = results.filter((r) => r.ok).length;
  const erro = results.filter((r) => !r.ok).length;
  const mudou = results.filter((r) => r.ok && r.categoria_antes !== r.categoria_depois).length;

  const distribuicao: Record<string, number> = {};
  for (const r of results) {
    if (r.ok) {
      distribuicao[r.categoria_depois] = (distribuicao[r.categoria_depois] ?? 0) + 1;
    }
  }

  return jsonResp({
    ok: true,
    duration_ms: Date.now() - t0,
    total_processados: linhas.length,
    sucesso,
    erro,
    categoria_mudou: mudou,
    custo_total_usd: Number(totalCustoUsd.toFixed(6)),
    distribuicao_final: distribuicao,
    dry_run: dryRun,
  });
});
