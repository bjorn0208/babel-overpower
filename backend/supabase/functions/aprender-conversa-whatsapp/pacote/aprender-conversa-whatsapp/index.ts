/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
/**
 * aprender-conversa-whatsapp — "fase 2" do Importar WhatsApp pessoal (2026-09-03)
 *
 * Chamada 1 vez por conversa (loop sequencial no frontend, não em lote) logo
 * depois que `ImportarWhatsappPessoal.tsx` termina de gravar leads/conversas/
 * mensagens via Baileys. Lê a conversa importada, manda pro LLM Mentor extrair
 * 1 insight de evolução (o que o agente aprende com essa troca) e grava como
 * bloco novo em `blocos_conhecimento` — mesma caixa de revisão "Sugestões da
 * análise de conversas" que `analisar-conversas-fechamento` já alimenta
 * (`tag='analise_conversas_ia'`, `ativo=false` até o tenant aprovar), só que
 * título prefixado 💬 (em vez de 🧠) pra diferenciar "aprendizado de conversa
 * importada" de "padrão de fechamento".
 *
 * Deliberadamente 1 LLM call por conversa (não em lote): o frontend mostra um
 * indicador "IA aprendendo" por contato enquanto processa, e precisa saber
 * quando CADA conversa terminou — não dá pra fazer isso com 1 chamada batch
 * como o `analisar-conversas-fechamento`.
 *
 * Lê/escreve tudo com o JWT do próprio tenant (RLS isola) — só usa
 * service_role pra ler a credencial do provedor de IA.
 *
 * verify_jwt: true.
 */

import { corsOk, jsonRes } from "../_shared/cors.ts";
import { criarClienteAdmin, criarClienteUsuario } from "../_shared/supabase.ts";
import { getConfigChamada } from "../_shared/config-chamadas.ts";

const MAX_MENSAGENS = 60;
const MAX_CARACTERES_TRANSCRICAO = 8000;
const TIPOS_VALIDOS = new Set([
  "apresentacao", "valor", "resposta", "pagamento", "processo", "clausula_contrato", "contato", "empresa",
]);

const PROMPT_SISTEMA = `Você é um analista que ajuda um agente de IA de atendimento a aprender com
conversas reais de WhatsApp já encerradas. Leia a transcrição abaixo e extraia UM insight de
evolução: o que esse agente deveria aprender ou fazer diferente a partir dessa troca — um padrão
que funcionou, uma objeção e como foi contornada, um processo que ficou claro, ou um erro que não
deve se repetir.

REGRAS INVIOLÁVEIS:
- Baseie-se SOMENTE no que está literalmente na conversa. Nunca invente ou generalize além do que
  está escrito.
- Não é resumo da conversa — é o que fazer diferente/igual da próxima vez, em 1-3 frases.
- Se a conversa não tiver nenhum sinal real de aprendizado (só saudação vazia, só mídia sem
  contexto, nada de substância), devolva null em vez de forçar um insight fraco.

Devolva SOMENTE um JSON, sem texto antes ou depois, no formato:
{ "title": "título curto", "content": "o insight, pronto pro agente usar", "tipo": "um de: apresentacao|valor|resposta|pagamento|processo|clausula_contrato|contato|empresa" }
ou null se não houver insight real.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsOk();

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return jsonRes({ error: "Authorization header ausente." }, 401);

    const { conversa_id } = await req.json().catch(() => ({ conversa_id: null }));
    if (!conversa_id) return jsonRes({ ok: false, mensagem: "conversa_id obrigatório." }, 400);

    const cliente = criarClienteUsuario(authHeader);
    const { data: { user }, error: authError } = await cliente.auth.getUser();
    if (authError || !user) return jsonRes({ error: "Token inválido." }, 401);
    const tenantId = user.id;

    const { data: agente } = await cliente
      .from("agentes_usuario")
      .select("id")
      .eq("user_id", tenantId)
      .maybeSingle();
    if (!agente?.id) return jsonRes({ ok: false, mensagem: "Agente não encontrado pra este tenant." }, 404);

    // Confere que a conversa é do próprio tenant antes de gastar chamada LLM.
    const { data: conversa } = await cliente
      .from("conversas")
      .select("id, tenant_id")
      .eq("id", conversa_id)
      .maybeSingle();
    if (!conversa || conversa.tenant_id !== tenantId) {
      return jsonRes({ ok: false, mensagem: "Conversa não encontrada." }, 404);
    }

    const { data: mensagens, error: msgErr } = await cliente
      .from("mensagens")
      .select("role, content, created_at")
      .eq("conversation_id", conversa_id)
      .neq("role", "system")
      .order("created_at", { ascending: true })
      .limit(MAX_MENSAGENS);
    if (msgErr) return jsonRes({ ok: false, mensagem: `Falha ao ler mensagens: ${msgErr.message}` }, 500);
    if (!mensagens?.length) {
      return jsonRes({ ok: true, criado: false, mensagem: "Conversa sem mensagens de texto." });
    }

    const transcricao = mensagens
      .filter((m) => m.content)
      .map((m) => `${m.role === "assistant" ? "Agente" : "Lead"}: ${m.content}`)
      .join("\n")
      .slice(0, MAX_CARACTERES_TRANSCRICAO);
    if (!transcricao.trim()) {
      return jsonRes({ ok: true, criado: false, mensagem: "Conversa sem conteúdo de texto." });
    }

    const admin = criarClienteAdmin();
    const cfg = await getConfigChamada(admin, "mentor", tenantId);
    const { data: prov } = await admin
      .from("provedores_llm")
      .select("base_url, api_key")
      .eq("slug", "openrouter")
      .eq("is_active", true)
      .single();
    if (!prov?.api_key) return jsonRes({ ok: false, mensagem: "Credencial do provedor de IA indisponível." }, 500);

    const controlador = new AbortController();
    const timeoutId = setTimeout(() => controlador.abort(), 15_000);
    let resp: Response;
    try {
      resp = await fetch(`${prov.base_url}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${prov.api_key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ragentic.app",
          "X-Title": "Ragentic · aprender-conversa-whatsapp",
        },
        body: JSON.stringify({
          model: cfg.modelo,
          messages: [
            { role: "system", content: PROMPT_SISTEMA },
            { role: "user", content: `CONVERSA:\n\n${transcricao}` },
          ],
          temperature: 0.3,
          max_tokens: 500,
        }),
        signal: controlador.signal,
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        return jsonRes({ ok: false, mensagem: "IA demorou demais pra responder (>15s)." }, 504);
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
    if (!resp.ok) {
      return jsonRes({ ok: false, mensagem: `LLM ${resp.status}: ${(await resp.text()).slice(0, 300)}` }, 500);
    }

    const json = await resp.json();
    const bruto: string = json.choices?.[0]?.message?.content ?? "";
    const match = bruto.match(/\{[\s\S]*\}/);
    // deno-lint-ignore no-explicit-any
    let item: any;
    try {
      item = JSON.parse(match ? match[0] : bruto);
    } catch {
      return jsonRes({ ok: true, criado: false, mensagem: "IA não retornou insight válido pra essa conversa." });
    }
    if (!item || typeof item !== "object") {
      return jsonRes({ ok: true, criado: false, mensagem: "Sem insight — conversa sem sinal de aprendizado." });
    }

    const tipo = TIPOS_VALIDOS.has(item?.tipo) ? item.tipo : "processo";
    const content = String(item?.content ?? "").trim().slice(0, 2000);
    if (!content) {
      return jsonRes({ ok: true, criado: false, mensagem: "Sem insight — conversa sem sinal de aprendizado." });
    }

    const { error: insErr } = await cliente.from("blocos_conhecimento").insert({
      agente_id: agente.id,
      escopo: "tenant",
      ativo: false, // pendente de aprovação, mesma caixa "Sugestões" do analisar-conversas-fechamento
      tag: "analise_conversas_ia",
      embedding_status: "pendente",
      tipo,
      title: `💬 ${String(item?.title ?? "Aprendizado de conversa").slice(0, 140)}`,
      content,
      category: "Aprendizado de conversas importadas",
    });
    if (insErr) return jsonRes({ ok: false, mensagem: `Falha ao gravar bloco: ${insErr.message}` }, 500);

    return jsonRes({ ok: true, criado: true });
  } catch (err) {
    console.error("aprender-conversa-whatsapp erro:", err);
    return jsonRes({ ok: false, mensagem: String((err as Error).message ?? err) }, 500);
  }
});
