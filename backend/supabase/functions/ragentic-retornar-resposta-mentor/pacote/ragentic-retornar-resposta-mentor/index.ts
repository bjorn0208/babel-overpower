/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

/**
 * ragentic-retornar-resposta-mentor
 *
 * Edge disparada pelo trigger SQL `trg_perguntas_sem_resp_dispara_retorno`
 * via `net.http_post` quando o dono responde no painel Mentor.
 *
 * verify_jwt = false (chamada server-side pelo pg_net, sem JWT).
 *
 * Fluxo:
 * 1. Lê `perguntas_sem_resposta` (resposta_do_dono + contexto).
 * 2. Lê config do agente da conversa (nome, persona).
 * 3. Sintetiza bolha pro lead via Gemini-flash-lite (resposta do dono = bloco temporário).
 * 4. Enfileira em `caixa_saida_mensagens` (process-followups despacha).
 * 5. Chama Gemma-4 pra propor gaveta/escopo onde salvar como bloco.
 * 6. UPDATE `perguntas_sem_resposta`: status_loop='entregue_lead' + gaveta/escopo propostos.
 * 7. INSERT notificação pro dono: "Resposta enviada. Sugestão: virar bloco em X/Y."
 *
 * Body esperado: { pergunta_id: string, tenant_id: string, conversa_id: string }
 */

// deno-lint-ignore-file no-explicit-any

import { criarClienteAdmin } from "../_shared/supabase.ts";
import { corsHeaders, corsOk, jsonRes } from "../_shared/cors.ts";
import { getConfigChamada } from "../_shared/config-chamadas.ts";

const GAVETAS_VALIDAS = [
  "blocos_conhecimento",
  "blocos_procedurais",
  "blocos_gatilho",
  "blocos_humanizacao",
  "blocos_comportamento",
  "blocos_meta",
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsOk();

  const supabase = criarClienteAdmin();

  try {
    const body = await req.json();
    const pergunta_id: string = body?.pergunta_id;
    const tenant_id: string = body?.tenant_id;
    // Trigger serializa como conversa_id (não conversation_id)
    const conversa_id: string = body?.conversa_id;

    if (!pergunta_id || !tenant_id || !conversa_id) {
      return jsonRes({ ok: false, erro: "campos obrigatórios ausentes: pergunta_id, tenant_id, conversa_id" }, 400);
    }

    // 1. Lê a pergunta com resposta do dono
    const { data: pergunta, error: errP } = await supabase
      .from("perguntas_sem_resposta")
      .select("id, tenant_id, conversation_id, lead_id, agente_id, pergunta, contexto, resposta_do_dono, status_loop, aprovar_direto")
      .eq("id", pergunta_id)
      .maybeSingle();

    if (errP || !pergunta) {
      return jsonRes({ ok: false, erro: "pergunta não encontrada" }, 404);
    }
    if (pergunta.tenant_id !== tenant_id) {
      return jsonRes({ ok: false, erro: "sem permissão" }, 403);
    }
    if (pergunta.status_loop !== "dono_respondeu") {
      return jsonRes({ ok: false, erro: `status_loop inválido: ${pergunta.status_loop}` }, 422);
    }

    const respostaDono: string = (pergunta.resposta_do_dono as string) ?? "";
    // Destino escolhido pelo dono ao responder: true = Conhecimento (ativo), false = Pré-aprovado.
    const aprovarDireto: boolean = pergunta.aprovar_direto === true;
    if (!respostaDono.trim()) {
      return jsonRes({ ok: false, erro: "resposta_do_dono vazia" }, 422);
    }

    // 2. Lê informações do agente para persona
    const agenteId: string | null = pergunta.agente_id as string | null;
    let nomeAgente = "Agente";
    if (agenteId) {
      const { data: agente } = await supabase
        .from("agentes_usuario")
        .select("nome")
        .eq("id", agenteId)
        .maybeSingle();
      if (agente?.nome) nomeAgente = String(agente.nome);
    }

    // 3. Lê configuração de síntese
    const { data: perfilTenant } = await supabase
      .from("profiles")
      .select("nicho_id")
      .eq("id", tenant_id)
      .maybeSingle();
    const nichoId: string | null = (perfilTenant?.nicho_id as string | null) ?? null;
    const cfg = await getConfigChamada(supabase, "sintese", tenant_id, nichoId);

    // 4. Monta credencial OpenRouter
    const { data: provData } = await supabase
      .from("provedores_llm")
      .select("base_url, api_key")
      .eq("slug", "openrouter")
      .eq("is_active", true)
      .single();

    if (!provData?.api_key) {
      return jsonRes({ ok: false, erro: "credencial OpenRouter ausente" }, 500);
    }

    // 5. Busca as últimas mensagens da conversa — ela pode ter avançado várias
    // etapas desde a pergunta; a entrega precisa encaixar no momento ATUAL.
    // Rótulos: user = lead · assistant = agente (teste) · human + source
    // whatsapp_app = eco do próprio agente em produção · human outro = dono manual.
    let historicoRecente = "";
    try {
      const { data: msgsRecentes } = await supabase
        .from("mensagens")
        .select("role, content, carga")
        .eq("conversation_id", pergunta.conversation_id as string)
        .order("created_at", { ascending: false })
        .limit(10);
      if (Array.isArray(msgsRecentes) && msgsRecentes.length) {
        historicoRecente = msgsRecentes
          .reverse()
          .map((m) => {
            const source = (m.carga as { source?: string } | null)?.source ?? "";
            const ehAgente = m.role === "assistant" || (m.role === "human" && source === "whatsapp_app");
            const rotulo = ehAgente ? "AGENTE (você)" : m.role === "user" ? "LEAD" : "EQUIPE";
            return `${rotulo}: ${String(m.content ?? "").slice(0, 220)}`;
          })
          .join("\n");
      }
    } catch (_eHist) {
      // histórico é opcional — sem ele cai no contexto da época da pergunta
    }

    // 5b. Sintetiza bolha pro lead — retomada natural, nada de template fixo
    const systemSintese = [
      `Você é ${nomeAgente}, conversando com um lead no WhatsApp.`,
      `Numa etapa anterior dessa conversa surgiu uma dúvida que você ficou de confirmar. O dono da empresa acabou de te passar a resposta.`,
      `Sua tarefa: escrever UMA bolha de WhatsApp entregando essa informação ao lead AGORA, do jeito mais natural possível.`,
      ``,
      `DÚVIDA QUE FICOU PENDENTE:\n${String(pergunta.pergunta ?? "").slice(0, 400)}`,
      ``,
      `RESPOSTA DO DONO (única fonte de verdade — não invente nada além dela):\n${respostaDono}`,
      ``,
      historicoRecente
        ? `CONVERSA ATÉ AGORA (da mais antiga pra mais recente):\n${historicoRecente}`
        : `CONTEXTO DA ÉPOCA DA PERGUNTA:\n${String(pergunta.contexto ?? "").slice(0, 800)}`,
      ``,
      `COMO ENCAIXAR (decida pelo estado da conversa, sem fórmula pronta):`,
      `- Conversa avançou pra outros assuntos → retoma com gancho leve, tipo "ah, e sobre aquilo que você perguntou de X... me confirmaram aqui:" — com as suas palavras, variando o jeito.`,
      `- A dúvida ainda é o assunto da última mensagem → responde direto, sem gancho artificial.`,
      `- A resposta do dono contradiz algo que você disse antes → corrige com naturalidade, sem se desculpar demais.`,
      `- NÃO responda outras pendências da conversa — só entregue essa informação e, se fizer sentido, devolva a bola pro lead com uma pergunta curta de continuidade.`,
      ``,
      `Regras: 1 bolha curta (1 a 3 frases), português brasileiro informal de WhatsApp, tom humano. Não cite "o dono"/"o sistema" — usa "o pessoal aqui"/"confirmei aqui". Retorne APENAS o texto da bolha, sem aspas, sem markdown.`,
    ].join("\n");

    const inicio = Date.now();
    const respSintese = await fetch(`${provData.base_url}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provData.api_key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ragentic.app",
        "X-Title": "Ragentic · retornar-resposta-mentor",
      },
      body: JSON.stringify({
        model: cfg.modelo,
        messages: [
          { role: "system", content: systemSintese },
          { role: "user", content: "Escreva a bolha agora." },
        ],
        temperature: 0.4,
        max_tokens: 300,
      }),
    });
    const latenciaSintese = Date.now() - inicio;

    let bolhaParaLead = respostaDono.slice(0, 500); // fallback: resposta crua do dono
    if (respSintese.ok) {
      const jsonSintese = await respSintese.json();
      const texto: string = jsonSintese.choices?.[0]?.message?.content ?? "";
      if (texto.trim()) bolhaParaLead = texto.trim();
    } else {
      console.warn("[retornar-resposta-mentor] síntese falhou, usando resposta_do_dono crua");
    }

    // 6. Verifica canal da conversa — Chat de Teste (channel='teste') escreve direto
    // em `mensagens` pro realtime do frontend; canal real usa caixa_saida_mensagens
    // (process-followups despacha via Z-API).
    const { data: convDados } = await supabase
      .from("conversas")
      .select("channel")
      .eq("id", conversa_id)
      .maybeSingle();
    const ehChatTeste = (convDados as { channel?: string } | null)?.channel === "teste";

    if (ehChatTeste) {
      // Chat de Teste: INSERT direto em mensagens → realtime entrega pro frontend.
      // Não usa Z-API nem caixa_saida_mensagens (sem telefone real).
      await supabase.from("mensagens").insert({
        conversation_id: pergunta.conversation_id as string,
        role: "assistant",
        content: bolhaParaLead,
        carga: {
          origem: "ragentic-retornar-resposta-mentor",
          pergunta_id,
          latencia_sintese_ms: latenciaSintese,
          canal: "teste",
        },
      });
    } else {
      // Canal real (WhatsApp etc): enfileira em caixa_saida_mensagens.
      const t0 = Date.now();
      const baseMs = Math.min(4000, Math.max(800, bolhaParaLead.length * 40));
      const scheduledAt = new Date(t0 + baseMs).toISOString();
      await supabase.from("caixa_saida_mensagens").insert({
        tenant_id,
        conversation_id: pergunta.conversation_id,
        status: "pendente",
        content: bolhaParaLead,
        bubble_order: 0,
        scheduled_at: scheduledAt,
        delay_calculado_ms: baseMs,
        engagement_level: "morno",
        carga: {
          origem: "ragentic-retornar-resposta-mentor",
          pergunta_id,
          latencia_sintese_ms: latenciaSintese,
        },
      });
    }

    // 7. Chama Gemma-4 pra propor gaveta + escopo
    let gavetaProposta: string | null = null;
    let escopoProposto: string | null = null;
    // F3 (2026-06-03): a resposta serve a outros leads (true -> vira bloco) ou é só deste lead (false -> não vira bloco).
    let ehReusavel: boolean | null = null;
    try {
      const cfgAuditor = await getConfigChamada(supabase, "auditor_groundedness", tenant_id, nichoId);
      const systemAnalisar = [
        "Você é o Analista de Conhecimento. Recebe uma pergunta de lead + resposta do dono.",
        "Proponha onde salvar essa resposta como bloco de conhecimento permanente do agente.",
        "",
        "Gavetas disponíveis:",
        "- blocos_conhecimento: fatos, dados, FAQ, preços, prazos, processos (MAIS COMUM)",
        "- blocos_procedurais: passo-a-passo, instruções sequenciais",
        "- blocos_gatilho: quando disparar ação X em situação Y",
        "- blocos_humanizacao: tom de voz, exemplos de linguagem",
        "- blocos_comportamento: como agir em situação específica",
        "- blocos_meta: instruções sobre o próprio agente",
        "",
        "Escopos:",
        "- tenant: só este cliente (específico do negócio)",
        "- nicho: todos do mesmo segmento (regra geral do setor)",
        "- global: todos os agentes da plataforma (universal)",
        "",
        "ANTES da gaveta, decida eh_reusavel:",
        "- true: a resposta vira CONHECIMENTO que serve a OUTROS leads no futuro (regra, fato, preço, prazo, processo geral). Ex: 'temos escritório só em SP', 'o prazo médio da liminar é 30 dias'.",
        "- false: a resposta é ESPECÍFICA deste lead/conversa e não serve a mais ninguém. Ex: 'o vencimento DESTE cliente é dia 15', 'no caso dele pode pagar à vista', 'o objetivo dele é comprar um carro'. Quando false, deixe gaveta_proposta e escopo_proposto como null (NÃO salve bloco).",
        "",
        `PERGUNTA DO LEAD: ${String(pergunta.pergunta ?? "").slice(0, 300)}`,
        `RESPOSTA DO DONO: ${respostaDono.slice(0, 500)}`,
        "",
        'Retorne APENAS JSON: { "eh_reusavel": true|false, "gaveta_proposta": "<tabela>"|null, "escopo_proposto": "tenant"|"nicho"|"global"|null, "justificativa_curta": "<1 frase>" }',
      ].join("\n");

      const respAnalise = await fetch(`${provData.base_url}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provData.api_key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ragentic.app",
          "X-Title": "Ragentic · analisar-lacuna-bloco",
        },
        body: JSON.stringify({
          model: cfgAuditor.modelo,
          messages: [{ role: "system", content: systemAnalisar }],
          temperature: 0.0,
          max_tokens: 150,
          response_format: { type: "json_object" },
        }),
      });

      if (respAnalise.ok) {
        const jsonAnalise = await respAnalise.json();
        const textoAnalise: string = jsonAnalise.choices?.[0]?.message?.content ?? "";
        const parsed = JSON.parse(textoAnalise);
        if (typeof parsed?.eh_reusavel === "boolean") ehReusavel = parsed.eh_reusavel;
        // Resposta específica do lead (eh_reusavel=false) NÃO vira bloco — só entrega.
        if (ehReusavel !== false && GAVETAS_VALIDAS.includes(parsed?.gaveta_proposta)) {
          gavetaProposta = parsed.gaveta_proposta as string;
        }
        if (ehReusavel !== false && ["tenant", "nicho", "global"].includes(parsed?.escopo_proposto)) {
          escopoProposto = parsed.escopo_proposto as string;
        }
      }
    } catch (eAnal) {
      console.warn("[retornar-resposta-mentor] análise de gaveta falhou:", (eAnal as Error).message);
    }

    // 8. INSERT bloco NA gaveta escolhida (RAG-first puro — bloco salvo PRIMEIRO)
    // Mentor IA decidiu a gaveta; agora INSERT direto. Trigger BEFORE INSERT já enfileira embedding.
    // Próxima pergunta similar de qualquer lead já tem bloco no RAG → agente responde sem precisar Mentor.
    let blocoCriadoId: string | null = null;
    let statusFinal: "virou_bloco" | "entregue_lead" = "entregue_lead";

    if (gavetaProposta && GAVETAS_VALIDAS.includes(gavetaProposta)) {
      try {
        // Schemas variam por gaveta. blocos_conhecimento tem: title, content, escopo, tags, agente_id, nicho_id, tipo.
        // Tabelas das outras gavetas têm schemas parecidos — fallback genérico cobre.
        const titleBloco = String(pergunta.pergunta ?? "").slice(0, 200);
        const insertPayload: Record<string, unknown> = {
          title: titleBloco,
          content: respostaDono,
          // Δ 2026-09-08 — destino escolhido pelo dono ao responder (coluna
          // `aprovar_direto`, gravada por `responder_pergunta_mentor`):
          //  - aprovar_direto=true  → Conhecimento: bloco ativo, entra no RAG na hora;
          //  - aprovar_direto=false → Pré-aprovado: fora do RAG até aprovação manual.
          // Escopo travado em `tenant` nos dois casos — o palpite de "nicho" do LLM
          // vazava resposta de um escritório pra prateleira compartilhada (PII).
          // A bolha pro lead já foi sintetizada acima e independe disto.
          escopo: "tenant",
          ativo: aprovarDireto,
          aprovado: aprovarDireto,
          tags: aprovarDireto
            ? ["mentor", "lacuna_respondida"]
            : ["mentor", "lacuna_respondida", "pre_aprovado"],
        };
        // Campos opcionais comuns
        if (gavetaProposta === "blocos_conhecimento") {
          insertPayload.agente_id = agenteId;
          insertPayload.tipo = "resposta";
        }

        const { data: bloco, error: eIns } = await supabase
          .from(gavetaProposta)
          .insert(insertPayload)
          .select("id")
          .single();

        if (eIns) {
          console.warn(`[retornar-resposta-mentor] INSERT em ${gavetaProposta} falhou:`, eIns.message);
        } else if (bloco?.id) {
          blocoCriadoId = bloco.id as string;
          statusFinal = "virou_bloco";
        }
      } catch (eIns2) {
        console.warn("[retornar-resposta-mentor] erro INSERT bloco:", (eIns2 as Error).message);
      }
    }

    // 9. UPDATE pergunta: status_loop final + gaveta/escopo cravados + bloco_criado_id (se gravou)
    await supabase
      .from("perguntas_sem_resposta")
      .update({
        status_loop: statusFinal,
        gaveta_proposta: gavetaProposta,
        escopo_proposto: escopoProposto,
        bloco_criado_id: blocoCriadoId,
        eh_reusavel: ehReusavel,
      })
      .eq("id", pergunta_id);

    // 10. Notificação simplificada pro dono (já automático — sem precisar aprovar 1 clique)
    const descGaveta = gavetaProposta ? `${gavetaProposta}/${escopoProposto ?? "tenant"}` : null;
    const tituloNotif = statusFinal === "virou_bloco"
      ? "Bloco salvo + lead respondido"
      : (ehReusavel === false ? "Lead respondido (resposta específica)" : "Lead respondido (gaveta não cravada)");
    const msgNotif = statusFinal === "virou_bloco" && descGaveta
      ? `Bloco salvo em ${descGaveta}. Agente já respondeu ao lead.`
      : (ehReusavel === false
        ? "Resposta específica deste lead — entreguei pra ele, mas não virou bloco (não serviria a outros)."
        : "Lead respondido. Mentor não conseguiu cravar bloco automaticamente — abra pra revisar.");
    await supabase.from("notificacoes").insert({
      user_id: tenant_id, // tenant_id = profiles.id = auth.uid()
      tipo: statusFinal === "virou_bloco" ? "bloco_salvo" : "resposta_entregue",
      icone: "check-circle",
      titulo: tituloNotif,
      mensagem: msgNotif,
      acao: `/agente?pergunta=${pergunta_id}`,
      acao_label: "Ver detalhes",
    });

    return jsonRes({
      ok: true,
      bolha_enviada: bolhaParaLead,
      eh_reusavel: ehReusavel,
      gaveta_proposta: gavetaProposta,
      escopo_proposto: escopoProposto,
      bloco_criado_id: blocoCriadoId,
      status_final: statusFinal,
    });
  } catch (err) {
    console.warn("[retornar-resposta-mentor] erro:", (err as Error).message);
    return jsonRes({ ok: false, erro: String(err) }, 500);
  }
});
