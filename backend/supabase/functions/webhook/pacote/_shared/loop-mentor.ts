/**
 * _shared/loop-mentor.ts
 *
 * Loop Mentor (D4) — humano-no-loop.
 *
 * Quando o RAG não tem bloco para cobrir a pergunta do lead (Gate A1)
 * ou o Auditor reprova após 2 rounds (Gate B1), este helper:
 *  1. Cria registro em `perguntas_sem_resposta` (status_loop='aguardando_dono').
 *  2. Cria notificação realtime pro dono no painel Mentor.
 *  3. Retorna bolha fixa amigável pro lead (sem inventar fato).
 *
 * O trigger `trg_perguntas_sem_resp_dispara_retorno` cuida de acionar
 * a edge `ragentic-retornar-resposta-mentor` quando o dono responder.
 *
 * ATENÇÃO: a coluna na tabela é `conversation_id` (não `conversa_id`).
 * O trigger serializa como `conversa_id` no body do http_post.
 */

// deno-lint-ignore-file no-explicit-any

type SupabaseClient = any;

export type OpsCriarLacuna = {
  tenantId: string;
  conversaId: string;
  leadId: string | null;
  agenteId: string | null;
  perguntaOriginalLead: string;
  contextoResumido: string;
  /** Nome do nicho do agente — alimenta classificador de relevância. */
  nichoNome?: string | null;
  /** Persona resumida (1-2 linhas) ou produto-foco do agente — alimenta classificador. */
  escopoAgente?: string | null;
};

export type ResultadoLacuna = {
  pergunta_id: string | null;
  bolha_fixa_para_lead: string;
  /** true se classificador aprovou e lacuna foi criada; false se foi recusa direta. */
  foi_pro_mentor: boolean;
  /** Motivo curto do classificador (auditoria). */
  motivo_classificador?: string;
};

/** Bolha fixa natural — pergunta foi pro Mentor, dono já vai responder. */
const BOLHA_FIXA_PRO_MENTOR =
  "Boa! Tô chamando o chefe aqui pra confirmar isso direitinho — assim que ele me responder eu já te falo. Enquanto isso, tem outra coisa que eu possa te ajudar?";

/** Bolha de recusa educada — pergunta não é relevante pro escopo do agente. */
const BOLHA_RECUSA_FORA_ESCOPO =
  "Essa pergunta foge um pouquinho do que normalmente atendo por aqui. Posso te ajudar com algo dentro do que cuidamos?";

/**
 * Classifica via LLM (Gemma-4 leve) se a pergunta merece ir pro Mentor.
 * Pergunta absurda/fora-de-escopo → relevante=false → agente recusa direto, sem poluir o Mentor.
 *
 * Falha silenciosa: se LLM erra, default é RELEVANTE=true (não bloquear lacuna por falha técnica).
 */
async function classificarRelevancia(
  supabase: SupabaseClient,
  opts: { tenantId: string; perguntaOriginalLead: string; nichoNome?: string | null; escopoAgente?: string | null },
): Promise<{ relevante: boolean; motivo: string }> {
  try {
    const { getConfigChamada } = await import("./config-chamadas.ts");
    const cfg = await getConfigChamada(supabase, "classificador_relevancia_mentor", opts.tenantId, null);

    // chamarLlmComTools NÃO suporta response_format/temperatura/max_tokens — bug observado em prod
    // (smoke Diego v94 caiu em fallback "default aprovar" porque texto_final não veio JSON puro).
    // Solução: fetch direto OpenRouter com response_format=json_object pra forçar JSON estruturado.
    const { data: prov } = await supabase
      .from("provedores_llm")
      .select("api_key")
      .eq("slug", "openrouter")
      .eq("is_active", true)
      .maybeSingle();
    if (!prov?.api_key) throw new Error("api_key OpenRouter ausente em provedores_llm");

    const escopo = opts.escopoAgente?.trim() || opts.nichoNome?.trim() || "(escopo do agente não cravado)";
    const prompt = (cfg.prompt_template?.trim()?.length ?? 0) > 0
      ? cfg.prompt_template
      : 'Você é o Classificador de Relevância. Recebe uma pergunta de lead e o escopo do agente. Decida se a pergunta é plausível dentro do escopo (merece ir pro dono responder) ou se é absurda/fantasiosa/fora-de-escopo (recusa direta). Retorne JSON: {"relevante": boolean, "motivo": string}.';

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${prov.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.modelo,
        temperature: cfg.temperatura,
        max_tokens: cfg.max_tokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: `ESCOPO DO AGENTE:\n${escopo}\n\nPERGUNTA DO LEAD:\n"${opts.perguntaOriginalLead.slice(0, 600)}"\n\nResponda JSON {"relevante": boolean, "motivo": string}.` },
        ],
      }),
    });

    if (!resp.ok) throw new Error(`OpenRouter HTTP ${resp.status}: ${(await resp.text().catch(() => "")).slice(0, 200)}`);
    const data = await resp.json();
    const conteudo = data?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!conteudo) throw new Error("conteúdo vazio do LLM");

    const j = JSON.parse(conteudo);
    if (typeof j.relevante !== "boolean") throw new Error("campo relevante ausente/inválido");
    return { relevante: j.relevante, motivo: String(j.motivo ?? "").slice(0, 200) };
  } catch (e) {
    console.warn("[loop-mentor.classificador] falha — default relevante=true:", (e as Error).message);
    return { relevante: true, motivo: `classificador falhou (${(e as Error).message.slice(0, 80)}); default aprovar` };
  }
}

/**
 * Cria lacuna no Mentor e retorna bolha fixa pro lead.
 * Falha silenciosa (não derruba o turno): se INSERT falhar, retorna bolha fixa com pergunta_id null.
 */
export async function criarLacunaParaMentor(
  supabase: SupabaseClient,
  opts: OpsCriarLacuna,
): Promise<ResultadoLacuna> {
  // 1) Classifica relevância via LLM antes de poluir o Mentor com pergunta absurda
  const veredictoRel = await classificarRelevancia(supabase, {
    tenantId: opts.tenantId,
    perguntaOriginalLead: opts.perguntaOriginalLead,
    nichoNome: opts.nichoNome,
    escopoAgente: opts.escopoAgente,
  });

  if (!veredictoRel.relevante) {
    // Pergunta absurda/fora-de-escopo — recusa direta, não cria lacuna no Mentor
    console.warn("[loop-mentor] pergunta NÃO relevante — recusa direta:", veredictoRel.motivo);
    return {
      pergunta_id: null,
      bolha_fixa_para_lead: BOLHA_RECUSA_FORA_ESCOPO,
      foi_pro_mentor: false,
      motivo_classificador: veredictoRel.motivo,
    };
  }

  const perguntaParaMentor =
    `Lead perguntou: "${opts.perguntaOriginalLead.slice(0, 400)}". ` +
    `Não tenho informação nos blocos do conhecimento. Me responde aqui que devolvo pra ele automaticamente.`;

  let pergunta_id: string | null = null;

  try {
    // Verifica se já existe pergunta pendente idêntica (dedup simples por conversa)
    const { data: existente } = await supabase
      .from("perguntas_sem_resposta")
      .select("id")
      .eq("tenant_id", opts.tenantId)
      .eq("conversation_id", opts.conversaId)
      .eq("status_loop", "aguardando_dono")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existente?.id) {
      // Já tem pergunta aberta para esta conversa — não duplica
      console.warn("[loop-mentor] pergunta duplicada ignorada, conversa:", opts.conversaId);
      pergunta_id = existente.id as string;
    } else {
      const { data: inserido } = await supabase
        .from("perguntas_sem_resposta")
        .insert({
          tenant_id: opts.tenantId,
          conversation_id: opts.conversaId,
          lead_id: opts.leadId ?? null,
          agente_id: opts.agenteId ?? null,
          pergunta: opts.perguntaOriginalLead.slice(0, 1000),
          contexto: opts.contextoResumido.slice(0, 2000),
          pergunta_para_mentor: perguntaParaMentor,
          status_loop: "aguardando_dono",
          ocorrencias: 1,
        })
        .select("id")
        .single();

      pergunta_id = (inserido?.id as string) ?? null;
    }

    // Notificação realtime pro dono (tabela `notificacoes` existente)
    if (pergunta_id) {
      await supabase.from("notificacoes").insert({
        user_id: opts.tenantId, // tenant_id = profiles.id = auth.uid()
        tipo: "pergunta_mentor",
        icone: "help-circle",
        titulo: "Pergunta esperando você",
        mensagem: `"${opts.perguntaOriginalLead.slice(0, 200)}"`,
        acao: `/agente?pergunta=${pergunta_id}`,
        acao_label: "Responder agora",
      });
    }
  } catch (e) {
    console.warn("[loop-mentor] erro ao criar lacuna:", (e as Error).message);
  }

  return {
    pergunta_id,
    bolha_fixa_para_lead: BOLHA_FIXA_PRO_MENTOR,
    foi_pro_mentor: true,
    motivo_classificador: veredictoRel.motivo,
  };
}


export type OpsPerguntaConsciente = {
  tenantId: string;
  conversaId: string;
  leadId: string | null;
  agenteId: string | null;
  /** Pergunta JÁ formulada pelo agente (curiosidade articulada) — é o que o dono lê. */
  perguntaFormulada: string;
  /** 1-2 linhas de contexto pro dono entender o caso. */
  contextoResumido: string;
  /** Embedding da pergunta (halfvec 1024, Voyage) — liga o dedup semântico global do tenant.
   *  Null = pula dedup vetorial (fallback: dedup por conversa, comportamento antigo). */
  vetorSemantico?: number[] | null;
};

/**
 * Registra uma pergunta CONSCIENTE do agente (via tool `perguntar_ao_dono`).
 *
 * Diferente de `criarLacunaParaMentor` (gate cego): aqui o próprio agente DECIDIU
 * perguntar, então NÃO roda classificador de relevância NEM devolve bolha fixa —
 * quem escreve a bolha pro lead é o agente, no tom da conversa.
 *
 * Dedup: 1 pergunta aberta por conversa (status `aguardando_dono`).
 * Falha silenciosa: erro no INSERT não derruba o turno (retorna pergunta_id null).
 */
export async function registrarPerguntaConsciente(
  supabase: SupabaseClient,
  opts: OpsPerguntaConsciente,
): Promise<{ pergunta_id: string | null; ja_existia: boolean; resposta_existente: string | null }> {
  const perguntaLimpa = (opts.perguntaFormulada ?? "").trim();
  if (!perguntaLimpa) return { pergunta_id: null, ja_existia: false, resposta_existente: null };

  let pergunta_id: string | null = null;
  let ja_existia = false;

  try {
    // ── Dedup semântico GLOBAL do tenant (2026-06-11) — backtest: 29/88 lacunas eram duplicatas ──
    // Similar ≥0.88 já RESPONDIDA → não cria; devolve a resposta do dono pro motor usar agora.
    // Similar ≥0.88 ABERTA (qualquer conversa) → não duplica; soma ocorrência e reusa o id
    // (a promessa ao lead continua válida — a lacuna existe).
    if (Array.isArray(opts.vetorSemantico) && opts.vetorSemantico.length > 0) {
      const { data: similar } = await supabase.rpc("buscar_pergunta_similar", {
        p_tenant_id: opts.tenantId,
        p_embedding: opts.vetorSemantico,
        p_limiar: 0.88,
      });
      const s = Array.isArray(similar) ? similar[0] : similar;
      if (s?.id) {
        if (typeof s.resposta_do_dono === "string" && s.resposta_do_dono.trim()) {
          console.warn(`[loop-mentor.consciente] dedup: similar já RESPONDIDA (${Number(s.similaridade).toFixed(2)}) — reusa resposta, não cria lacuna`);
          // Δ 2026-09-08 — reforço vermelho: se a resposta reusada ainda está pré-aprovada
          // (bloco não aprovado), conta a reperguntada. A RPC só incrementa enquanto
          // aprovado=false, então bloco já aprovado é no-op. É o que faz o card ficar
          // vermelho em Conhecimentos: "leads continuam perguntando, aprove."
          if (s.bloco_criado_id) {
            await supabase.rpc("incrementar_reperguntas_bloco", { p_bloco_id: s.bloco_criado_id });
          }
          return { pergunta_id: null, ja_existia: true, resposta_existente: s.resposta_do_dono.trim() };
        }
        await supabase.from("perguntas_sem_resposta")
          .update({ ocorrencias: ((s.ocorrencias as number) ?? 1) + 1, ultima_ocorrencia: new Date().toISOString() })
          .eq("id", s.id);
        console.warn(`[loop-mentor.consciente] dedup: similar ABERTA (${Number(s.similaridade).toFixed(2)}) — soma ocorrência, não duplica`);
        return { pergunta_id: s.id as string, ja_existia: true, resposta_existente: null };
      }
    }

    const { data: existente } = await supabase
      .from("perguntas_sem_resposta")
      .select("id")
      .eq("tenant_id", opts.tenantId)
      .eq("conversation_id", opts.conversaId)
      .eq("status_loop", "aguardando_dono")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existente?.id) {
      pergunta_id = existente.id as string;
      ja_existia = true;
    } else {
      const { data: inserido } = await supabase
        .from("perguntas_sem_resposta")
        .insert({
          tenant_id: opts.tenantId,
          conversation_id: opts.conversaId,
          lead_id: opts.leadId ?? null,
          agente_id: opts.agenteId ?? null,
          pergunta: perguntaLimpa.slice(0, 1000),
          contexto: (opts.contextoResumido ?? "").slice(0, 2000),
          pergunta_para_mentor: perguntaLimpa.slice(0, 1000),
          status_loop: "aguardando_dono",
          ocorrencias: 1,
          // dedup semântico futuro depende deste vetor gravado na criação (estava sempre nulo)
          ...(Array.isArray(opts.vetorSemantico) && opts.vetorSemantico.length > 0
            ? { vetor_semantico: JSON.stringify(opts.vetorSemantico) }
            : {}),
        })
        .select("id")
        .single();

      pergunta_id = (inserido?.id as string) ?? null;
    }

    // Notificação realtime pro dono — só na criação (não re-notifica pergunta já aberta)
    if (pergunta_id && !ja_existia) {
      await supabase.from("notificacoes").insert({
        user_id: opts.tenantId, // tenant_id = profiles.id = auth.uid()
        tipo: "pergunta_mentor",
        icone: "help-circle",
        titulo: "Pergunta esperando você",
        mensagem: `"${perguntaLimpa.slice(0, 200)}"`,
        acao: `/agente?pergunta=${pergunta_id}`,
        acao_label: "Responder agora",
      });
    }
  } catch (e) {
    console.warn("[loop-mentor.consciente] erro ao registrar pergunta:", (e as Error).message);
  }

  return { pergunta_id, ja_existia, resposta_existente: null };
}


export type DecisaoPerguntaB1 = {
  vale_perguntar: boolean;
  pergunta_para_dono: string;
  bolha_para_lead: string;
};

/**
 * F2 (2026-06-03) — quando o Gate B1 reprova (afirmação factual sem fonte), o AGENTE
 * (não o gate) decide o desfecho. Uma chamada no tom do agente devolve:
 *  - vale_perguntar: a dúvida presta (plausível no escopo) ou é absurda/fora-escopo?
 *  - pergunta_para_dono: a dúvida REFORMULADA, clara, pro responsável humano.
 *  - bolha_para_lead: o que o agente fala AGORA pro lead, no tom dele.
 *
 * Substitui a bolha fixa "tô chamando o chefe" + o recorte cru da fala do lead.
 * Retorna null em QUALQUER falha → o caller usa o fallback (criarLacunaParaMentor).
 */
export async function formularPerguntaEbolha(
  supabase: SupabaseClient,
  opts: {
    tenantId: string;
    agenteNome: string;
    tomAgente?: string | null;
    mensagemLead: string;
    motivoReprovacao: string;
    afirmacoesSemSuporte?: string[];
    historicoResumido: string;
    escopoAgente?: string | null;
  },
): Promise<DecisaoPerguntaB1 | null> {
  try {
    const { getConfigChamada } = await import("./config-chamadas.ts");
    const cfg = await getConfigChamada(supabase, "sintese", opts.tenantId, null);

    const { data: prov } = await supabase
      .from("provedores_llm")
      .select("api_key")
      .eq("slug", "openrouter")
      .eq("is_active", true)
      .maybeSingle();
    if (!prov?.api_key) throw new Error("api_key OpenRouter ausente em provedores_llm");

    const escopo = opts.escopoAgente?.trim() || "(escopo do agente não cravado)";
    const afirmacoes = (opts.afirmacoesSemSuporte ?? []).filter(Boolean).join(" · ").slice(0, 500);

    const sistema =
      `Você é ${opts.agenteNome}, atendente humano de uma empresa.` +
      (opts.tomAgente?.trim() ? ` Seu tom: ${opts.tomAgente.trim()}.` : "") +
      ` O lead te perguntou algo que você NÃO consegue responder com as fontes que tem —` +
      ` responder seria inventar. Você vai pedir ajuda ao responsável da empresa e avisar o lead.\n\n` +
      `Responda APENAS um JSON com 3 campos:\n` +
      `- "vale_perguntar": true se é uma dúvida real e plausível dentro do escopo do serviço, que vale levar ao responsável; false se for absurda, fora do assunto, ofensiva, ou se nem é uma pergunta.\n` +
      `  IMPORTANTE: se a dúvida é sobre dado ESPECÍFICO DO PRÓPRIO LEAD (situação bancária dele, pendência dele em banco X, CPF/CNPJ dele, processo judicial dele, endereço dele), vale_perguntar=false — o responsável da empresa NÃO tem como saber; é dado que o lead fornece ou que se consulta. Só vale perguntar conhecimento REUSÁVEL da empresa/serviço que serviria pra OUTROS leads também.\n` +
      `- "pergunta_para_dono": a dúvida reformulada de forma clara, curta e objetiva pro responsável humano responder (1 frase, em 3ª pessoa sobre o lead). Se vale_perguntar=false, use "".\n` +
      `- "bolha_para_lead": o que VOCÊ fala agora pro lead, no SEU tom, curtinho (1-2 frases). Se vale_perguntar=true: avise com naturalidade que vai confirmar e já retorna — NUNCA invente a resposta nem crave prazo exato. Se vale_perguntar=false: recuse com educação e ofereça ajudar no que é do seu escopo.`;

    const usuario =
      `ESCOPO DO SERVIÇO: ${escopo}\n` +
      `MOTIVO (por que você não pode responder): ${opts.motivoReprovacao || "sem fonte que sustente"}\n` +
      (afirmacoes ? `AFIRMAÇÕES SEM PROVA: ${afirmacoes}\n` : "") +
      `HISTÓRICO RECENTE:\n${opts.historicoResumido}\n\n` +
      `ÚLTIMA FALA DO LEAD: "${opts.mensagemLead.slice(0, 600)}"\n\n` +
      `Responda só o JSON.`;

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${prov.api_key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.modelo,
        temperature: typeof cfg.temperatura === "number" ? cfg.temperatura : 0.5,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sistema },
          { role: "user", content: usuario },
        ],
      }),
    });

    if (!resp.ok) throw new Error(`OpenRouter HTTP ${resp.status}: ${(await resp.text().catch(() => "")).slice(0, 160)}`);
    const data = await resp.json();
    const conteudo = data?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!conteudo) throw new Error("conteúdo vazio do LLM");

    const j = JSON.parse(conteudo);
    if (typeof j.vale_perguntar !== "boolean") throw new Error("campo vale_perguntar ausente/inválido");
    const bolha = String(j.bolha_para_lead ?? "").trim();
    if (!bolha) throw new Error("bolha_para_lead vazia");
    return {
      vale_perguntar: j.vale_perguntar,
      pergunta_para_dono: String(j.pergunta_para_dono ?? "").trim(),
      bolha_para_lead: bolha,
    };
  } catch (e) {
    console.warn("[loop-mentor.formular] falha — fallback bolha fixa:", (e as Error).message);
    return null;
  }
}
