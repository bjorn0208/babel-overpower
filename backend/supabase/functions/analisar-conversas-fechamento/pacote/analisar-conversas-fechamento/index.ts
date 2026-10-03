/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
import { corsOk, jsonRes } from "./_shared/cors.ts";
import { criarClienteAdmin, criarClienteUsuario } from "./_shared/supabase.ts";
import { getConfigChamada } from "./_shared/config-chamadas.ts";

const MAX_LEADS = 100;
const MAX_MENSAGENS_POR_CONVERSA = 40;
const MAX_CARACTERES_TOTAL = 45000;
const MAX_ITENS = 10;
const TIPOS_VALIDOS = new Set([
  "apresentacao", "valor", "resposta", "pagamento", "processo", "clausula_contrato", "contato", "empresa",
]);

function montarPromptSistema(existentes: { id: string; title: string; content: string }[]): string {
  const blocoExistentes = existentes.length
    ? `\n\nPADRÕES QUE JÁ FORAM SUGERIDOS ANTES (não repita nenhum deles):\n` +
      existentes.map((e) => `- [id=${e.id}] ${e.title}: ${e.content.slice(0, 300)}`).join("\n") +
      `\n\nSe um padrão novo que você encontrar for basicamente O MESMO fato/argumento de um item acima,
NÃO crie item novo — só devolva uma versão atualizada dele SE a nova redação tiver MAIS contexto e
for MAIS fácil de entender que a existente (nesse caso inclua "atualizar_id" com o id acima). Se a
existente já está boa, simplesmente ignore esse padrão e não devolva nada sobre ele.`
    : "";

  return `Você é um analista de vendas. Abaixo estão transcrições reais de conversas de
WhatsApp que TERMINARAM EM FECHAMENTO (o lead comprou/converteu). Extraia padrões concretos e
REUTILIZÁVEIS que o agente pode usar em conversas futuras — argumento que convenceu, jeito de
contornar objeção, frase que destravou o fechamento, ordem de perguntas que funcionou.

REGRAS INVIOLÁVEIS:
- Baseie-se SOMENTE no que está literalmente nas conversas abaixo. NUNCA invente ou generalize
  além do que está escrito.
- Cada item deve ser um padrão ESPECÍFICO desse negócio, não conselho genérico de vendas.
- Devolva no MÁXIMO 10 itens — só os padrões mais fortes/repetidos.
- NUNCA devolva dois itens que digam essencialmente a mesma coisa entre si — se dois padrões se
  sobrepõem, funda em 1 só, o mais completo e claro.${blocoExistentes}

Devolva SOMENTE um JSON (array), sem texto antes ou depois, no formato:
[{ "title": "título curto", "content": "o padrão explicado, pronto pra um agente reusar", "category": "categoria livre", "tipo": "um de: apresentacao|valor|resposta|pagamento|processo|clausula_contrato|contato|empresa", "tags": ["frase ou pergunta que ativa esse padrão"], "atualizar_id": "id de um padrão existente acima, só se for atualização — senão omita ou null" }]`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsOk();

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return jsonRes({ error: "Authorization header ausente." }, 401);

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

    const { data: leads, error: leadsErr } = await cliente
      .from("leads")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("desfecho", "convertido")
      .order("updated_at", { ascending: false })
      .limit(MAX_LEADS);
    if (leadsErr) return jsonRes({ ok: false, mensagem: `Falha ao ler leads: ${leadsErr.message}` }, 500);
    if (!leads?.length) {
      return jsonRes({ ok: false, mensagem: "Nenhuma conversa fechada (desfecho = convertido) encontrada ainda." }, 422);
    }

    const leadIds = leads.map((l) => l.id as string);
    const { data: conversas, error: convErr } = await cliente
      .from("conversas")
      .select("id, lead_id")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: false });
    if (convErr) return jsonRes({ ok: false, mensagem: `Falha ao ler conversas: ${convErr.message}` }, 500);
    if (!conversas?.length) {
      return jsonRes({ ok: false, mensagem: "Os leads convertidos não têm conversa associada." }, 422);
    }

    const conversaPorLead = new Map<string, string>();
    for (const c of conversas) {
      if (!conversaPorLead.has(c.lead_id as string)) conversaPorLead.set(c.lead_id as string, c.id as string);
    }
    const conversaIds = [...conversaPorLead.values()];

    const { data: mensagens, error: msgErr } = await cliente
      .from("mensagens")
      .select("conversation_id, role, content, created_at")
      .in("conversation_id", conversaIds)
      .neq("role", "system")
      .order("created_at", { ascending: true });
    if (msgErr) return jsonRes({ ok: false, mensagem: `Falha ao ler mensagens: ${msgErr.message}` }, 500);

    const porConversa = new Map<string, { role: string; content: string }[]>();
    for (const m of mensagens ?? []) {
      if (!m.content) continue;
      const lista = porConversa.get(m.conversation_id as string) ?? [];
      if (lista.length < MAX_MENSAGENS_POR_CONVERSA) {
        lista.push({ role: m.role as string, content: m.content as string });
      }
      porConversa.set(m.conversation_id as string, lista);
    }

    const transcricoes: string[] = [];
    let totalChars = 0;
    for (const [convId, msgs] of porConversa) {
      if (!msgs.length) continue;
      const bloco = `--- Conversa ${convId} ---\n` +
        msgs.map((m) => `${m.role === "assistant" ? "Agente" : "Lead"}: ${m.content}`).join("\n");
      if (totalChars + bloco.length > MAX_CARACTERES_TOTAL) break;
      transcricoes.push(bloco);
      totalChars += bloco.length;
    }
    if (!transcricoes.length) {
      return jsonRes({ ok: false, mensagem: "Conversas fechadas encontradas, mas sem mensagens de texto pra analisar." }, 422);
    }

    const { data: existentes } = await cliente
      .from("blocos_conhecimento")
      .select("id, title, content")
      .eq("agente_id", agente.id)
      .eq("tag", "analise_conversas_ia")
      .is("deleted_at", null);
    const existentesLista = (existentes ?? []) as { id: string; title: string; content: string }[];
    const idsExistentes = new Set(existentesLista.map((e) => e.id));

    const admin = criarClienteAdmin();
    const cfg = await getConfigChamada(admin, "mentor", tenantId);
    const { data: prov } = await admin
      .from("provedores_llm")
      .select("base_url, api_key")
      .eq("slug", "openrouter")
      .eq("is_active", true)
      .single();
    if (!prov?.api_key) return jsonRes({ ok: false, mensagem: "Credencial do provedor de IA indisponível." }, 500);

    const resp = await fetch(`${prov.base_url}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${prov.api_key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ragentic.app",
        "X-Title": "Ragentic · analisar-conversas-fechamento",
      },
      body: JSON.stringify({
        model: cfg.modelo,
        messages: [
          { role: "system", content: montarPromptSistema(existentesLista) },
          { role: "user", content: `CONVERSAS:\n\n${transcricoes.join("\n\n")}` },
        ],
        temperature: 0.3,
        max_tokens: 3000,
      }),
    });
    if (!resp.ok) {
      return jsonRes({ ok: false, mensagem: `LLM ${resp.status}: ${(await resp.text()).slice(0, 300)}` }, 500);
    }
    const json = await resp.json();
    const bruto: string = json.choices?.[0]?.message?.content ?? "";
    const match = bruto.match(/\[[\s\S]*\]/);
    // deno-lint-ignore no-explicit-any
    let itens: any[];
    try {
      itens = JSON.parse(match ? match[0] : bruto);
    } catch {
      return jsonRes({ ok: false, mensagem: "A IA não devolveu JSON válido — tenta de novo." }, 502);
    }
    if (!Array.isArray(itens)) itens = [];

    const montarCampos = (it: Record<string, unknown>) => {
      const tipo = TIPOS_VALIDOS.has(it?.tipo as string) ? (it.tipo as string) : "processo";
      const tags = Array.isArray(it?.tags) ? (it.tags as unknown[]).map(String).slice(0, 8) : [];
      return {
        tipo,
        title: `🧠 ${String(it?.title ?? "Padrão de fechamento").slice(0, 140)}`,
        content: String(it?.content ?? "").trim().slice(0, 4000),
        category: String(it?.category ?? "Padrões de fechamento").slice(0, 100),
        tags,
      };
    };

    const novos = itens
      .filter((it) => !idsExistentes.has(String(it?.atualizar_id ?? "")))
      .slice(0, MAX_ITENS)
      .map((it) => ({
        agente_id: agente.id,
        escopo: "tenant",
        ativo: false,
        tag: "analise_conversas_ia",
        embedding_status: "pendente",
        ...montarCampos(it),
      }))
      .filter((l) => l.content.length > 0);

    const atualizacoes = itens
      .filter((it) => idsExistentes.has(String(it?.atualizar_id ?? "")))
      .map((it) => ({ id: String(it.atualizar_id), campos: montarCampos(it) }))
      .filter((u) => u.campos.content.length > 0);

    let criados = 0;
    let atualizados = 0;

    if (novos.length) {
      const { data: inseridos, error: insErr } = await cliente
        .from("blocos_conhecimento")
        .insert(novos)
        .select("id");
      if (insErr) return jsonRes({ ok: false, mensagem: `Falha ao gravar blocos: ${insErr.message}` }, 500);
      criados = inseridos?.length ?? 0;
    }

    for (const u of atualizacoes) {
      const { error: updErr } = await cliente
        .from("blocos_conhecimento")
        .update({ ...u.campos, embedding_status: "pendente" })
        .eq("id", u.id)
        .eq("agente_id", agente.id);
      if (!updErr) atualizados++;
    }

    if (!criados && !atualizados) {
      return jsonRes({
        ok: true,
        criados: 0,
        atualizados: 0,
        conversas_analisadas: transcricoes.length,
        mensagem: "Nenhum padrão novo — a base já cobre bem o que apareceu nessas conversas.",
      });
    }

    return jsonRes({ ok: true, criados, atualizados, conversas_analisadas: transcricoes.length });
  } catch (err) {
    console.error("analisar-conversas-fechamento erro:", err);
    return jsonRes({ ok: false, mensagem: String((err as Error).message ?? err) }, 500);
  }
});
