/**
 * _shared/auditor-groundedness.ts
 *
 * Auditor semântico de Groundedness.
 *
 * Recebe bolhas geradas pela Síntese + blocos do RAG.
 * Audita SOMENTE bolhas factuais (fato_produto, promessa).
 * Bolhas de tipo humanizacao/variacao/pergunta_socratica/acolhimento passam direto como APROVADA.
 *
 * Retorna veredito por bolha + metadados de latência/custo.
 * Se não houver bolhas auditáveis → retorna { rodou_auditor: false }.
 *
 * Camada B1 (Auditor) do RAG-first amarrado (dossiê 2026-05-28).
 */

// deno-lint-ignore-file no-explicit-any

type SupabaseClient = any;

import { getConfigChamada } from "./config-chamadas.ts";
import type { BlocoParaSintese, BolhaComCitacao } from "./sintese-com-citacao.ts";

export type ResultadoAuditoria = {
  bolha_indice: number;
  status: "APROVADA" | "REPROVADA";
  motivo: string | null;
};

export type RespostaAuditor = {
  resultados: ResultadoAuditoria[];
  rodou_auditor: boolean;
  latencia_ms: number;
  tokens_in: number;
  tokens_out: number;
  modelo: string;
};

const TIPOS_FACTUAL = new Set(["fato_produto", "promessa"]);

/**
 * Audita semanticamente as bolhas geradas contra os blocos do RAG.
 * Bolhas não factuais são aprovadas sem LLM.
 */
export async function auditarBolhas(
  supabase: SupabaseClient,
  opts: {
    tenantId: string;
    nichoId: string | null;
    blocosRecuperados: BlocoParaSintese[];
    bolhasGeradas: BolhaComCitacao[];
  },
): Promise<RespostaAuditor> {
  // Bolhas factuais que precisam de auditoria
  const auditaveis = opts.bolhasGeradas
    .map((b, i) => ({ ...b, _indice: i }))
    .filter((b) => TIPOS_FACTUAL.has(b.tipo));

  // Resultado base: todas aprovadas sem auditoria
  const resultadosBase: ResultadoAuditoria[] = opts.bolhasGeradas.map((_, i) => ({
    bolha_indice: i,
    status: "APROVADA",
    motivo: null,
  }));

  if (auditaveis.length === 0) {
    return {
      resultados: resultadosBase,
      rodou_auditor: false,
      latencia_ms: 0,
      tokens_in: 0,
      tokens_out: 0,
      modelo: "",
    };
  }

  const cfg = await getConfigChamada(supabase, "auditor_groundedness", opts.tenantId, opts.nichoId);

  // Monta contexto de blocos
  const blocosCtx = opts.blocosRecuperados.length
    ? opts.blocosRecuperados
        .map((b) => `[${b.id}]: ${b.title ? b.title + " — " : ""}${b.content.slice(0, 500)}`)
        .join("\n")
    : "(nenhum bloco recuperado)";

  // Monta lista de bolhas a auditar
  const bolhasCtx = auditaveis
    .map((b) => JSON.stringify({
      indice: b._indice,
      texto: b.texto,
      blocos_usados: b.blocos_usados,
      tipo: b.tipo,
    }))
    .join("\n");

  const systemPrompt = [
    "Você é o Auditor de Groundedness. Recebe (a) blocos do RAG com conteúdo oficial e (b) bolhas factuais geradas pelo Sintetizador.",
    "",
    "Para cada bolha, julgue se o TEXTO respeita ESTRITAMENTE as informações dos blocos citados em blocos_usados.",
    "Uma bolha está REPROVADA se:",
    "- Afirma fato (preço, prazo, processo, oferta, garantia) que NÃO está em nenhum dos blocos citados.",
    "- Cita bloco_id inexistente na lista abaixo.",
    "- Distorce ou exagera informação do bloco.",
    "",
    "Uma bolha está APROVADA se:",
    "- Todos os fatos afirmados têm suporte direto nos blocos citados.",
    "- Não faz afirmação factual além do que os blocos cobrem.",
    "",
    "BLOCOS DO RAG:",
    blocosCtx,
    "",
    "BOLHAS A AUDITAR:",
    bolhasCtx,
    "",
    "Retorne APENAS JSON puro (sem markdown):",
    '{ "resultados": [{ "bolha_indice": <int>, "status": "APROVADA" | "REPROVADA", "motivo": "<string curta ou null>" }] }',
    "",
    "Retorne um resultado para CADA bolha auditável. Status REPROVADA deve ter motivo não-nulo.",
  ].join("\n");

  // Busca credencial
  const { data: provData } = await supabase
    .from("provedores_llm")
    .select("base_url, api_key")
    .eq("slug", "openrouter")
    .eq("is_active", true)
    .single();

  if (!provData?.api_key) {
    console.warn("[auditor-groundedness] credencial não encontrada — aprovação automática");
    return { resultados: resultadosBase, rodou_auditor: false, latencia_ms: 0, tokens_in: 0, tokens_out: 0, modelo: cfg.modelo };
  }

  const inicio = Date.now();
  const corpo = {
    model: cfg.modelo,
    messages: [{ role: "system", content: systemPrompt }],
    temperature: cfg.temperatura,
    max_tokens: cfg.max_tokens,
    response_format: { type: "json_object" },
  };

  let textoRaw = "";
  let tokens_in = 0;
  let tokens_out = 0;
  let latencia_ms = 0;

  try {
    const resp = await fetch(`${provData.base_url}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provData.api_key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ragentic.app",
        "X-Title": "Ragentic · auditor-groundedness",
      },
      body: JSON.stringify(corpo),
    });
    latencia_ms = Date.now() - inicio;

    if (!resp.ok) {
      const txt = await resp.text();
      console.warn(`[auditor-groundedness] LLM ${resp.status}: ${txt.slice(0, 200)} — aprovação automática`);
      return { resultados: resultadosBase, rodou_auditor: false, latencia_ms, tokens_in: 0, tokens_out: 0, modelo: cfg.modelo };
    }

    const json = await resp.json();
    tokens_in = json.usage?.prompt_tokens ?? 0;
    tokens_out = json.usage?.completion_tokens ?? 0;
    textoRaw = json.choices?.[0]?.message?.content ?? "";
  } catch (e) {
    latencia_ms = Date.now() - inicio;
    console.warn("[auditor-groundedness] erro na chamada LLM:", (e as Error).message, "— aprovação automática");
    return { resultados: resultadosBase, rodou_auditor: false, latencia_ms, tokens_in: 0, tokens_out: 0, modelo: cfg.modelo };
  }

  // Parse resultado do auditor
  const resultadosFinais = [...resultadosBase];
  try {
    const parsed = JSON.parse(textoRaw);
    const arr: Array<{ bolha_indice: number; status: string; motivo?: string | null }> =
      Array.isArray(parsed.resultados) ? parsed.resultados : [];
    for (const r of arr) {
      const idx = Number(r.bolha_indice);
      if (!Number.isFinite(idx) || idx < 0 || idx >= resultadosFinais.length) continue;
      resultadosFinais[idx] = {
        bolha_indice: idx,
        status: r.status === "REPROVADA" ? "REPROVADA" : "APROVADA",
        motivo: r.motivo ?? null,
      };
    }
  } catch (e) {
    console.warn("[auditor-groundedness] parse falhou:", (e as Error).message, "— mantém aprovação automática");
  }

  return {
    resultados: resultadosFinais,
    rodou_auditor: true,
    latencia_ms,
    tokens_in,
    tokens_out,
    modelo: cfg.modelo,
  };
}


export type ResultadoRespostaGroundedness = {
  veredito: "APROVADA" | "REPROVADA";
  /** ids dos blocos que sustentam as afirmações factuais (preenche o "Bloco ID"). */
  blocos_que_sustentam: string[];
  /** afirmações factuais sem bloco que as sustente (motivo da reprovação). */
  afirmacoes_sem_suporte: string[];
  /** Cirurgia por bolha (2026-06-11): índices das bolhas reprovadas — o motor corta SÓ elas,
   *  as demais saem pro lead. Vazio com veredito REPROVADA = legado (descarta tudo). */
  bolhas_reprovadas: number[];
  /** TESTE 2 falhou: o CONTATO pediu fato específico que nenhuma fonte cobre → é candidato
   *  legítimo a virar pergunta pro dono (curiosidade). TESTE 1 (invenção) NÃO liga isto. */
  lacuna_cobertura: boolean;
  motivo: string;
  rodou_auditor: boolean;
  latencia_ms: number;
  tokens_in: number;
  tokens_out: number;
  modelo: string;
};

/** Normaliza pra contraprova literal: minúsculas, sem acento, espaços colapsados. */
function _normalizarContraprova(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Contraprova determinística: a bolha tem algum trecho de ≥minChars contido nas fontes?
 *  Janelas a cada 10 chars — barato (<5ms) e zero alucinação. Só APROVA, nunca reprova. */
function _bolhaTemTrechoNasFontes(bolha: string, fontesNorm: string, minChars = 30): boolean {
  const b = _normalizarContraprova(bolha);
  if (b.length < minChars) return false;
  for (let i = 0; i + minChars <= b.length; i += 10) {
    if (fontesNorm.includes(b.slice(i, i + minChars))) return true;
  }
  return false;
}

/**
 * Audita uma RESPOSTA já gerada (texto livre, sem citação prévia) contra os blocos do RAG.
 *
 * Usado pelo Gate B1 do motor `ragentic-processar-inline`, que NÃO produz bolhas com
 * `blocos_usados` (a síntese inline tem tool-calling próprio). É o ÚNICO juiz do RAG-first
 * (o Gate A1 por score foi desligado em 2026-05-29). Aplica DOIS testes — REPROVA se qualquer falhar:
 *  TESTE 1 (anti-invenção): toda afirmação factual da resposta se comprova em alguma fonte do prompt?
 *  TESTE 2 (cobertura): o CONTATO pediu um fato específico que NENHUMA fonte cobre? → vai pro Mentor.
 *  Pergunta de QUALIFICAÇÃO feita pelo agente NÃO conta como "não respondeu" (conduzir venda ≠ lacuna).
 *
 * Falha silenciosa = APROVADA (motor crítico — nunca derruba o turno).
 * Resposta sem afirmação factual E sem fato específico pedido pelo contato = APROVADA sem LLM extra.
 */
export async function auditarRespostaGroundedness(
  supabase: SupabaseClient,
  opts: {
    tenantId: string;
    nichoId: string | null;
    perguntaLead: string;
    bolhas: string[];
    blocosRecuperados: BlocoParaSintese[];
    /** Outras fontes de conhecimento que entraram no MESMO prompt (gavetas: regras
     *  operacionais, anti-padrões, humanização, procedimentos; comportamento; diretrizes
     *  do cargo). Texto puro — contam como suporte válido pra afirmação factual. */
    contextoAdicional?: string | null;
    /** Temas que o DONO já descartou pra este lead (memória da ficha). Se a pergunta do
     *  contato é sobre um destes, o TESTE 2 (cobertura) não se aplica — o agente deve
     *  contornar, não re-escalar. Texto puro (1 fato por linha). */
    temasDescartados?: string | null;
    /** Últimas falas do PRÓPRIO agente nesta conversa (≤4). Contam como fonte: repetir o
     *  que ele mesmo disse antes (com fonte na época) é consistência, não invenção —
     *  varredura 2026-06-11: 8% das reprovações eram exatamente isso (caso CNPJ). */
    historicoAgente?: string | null;
  },
): Promise<ResultadoRespostaGroundedness> {
  const base: ResultadoRespostaGroundedness = {
    veredito: "APROVADA",
    blocos_que_sustentam: [],
    afirmacoes_sem_suporte: [],
    bolhas_reprovadas: [],
    lacuna_cobertura: false,
    motivo: "",
    rodou_auditor: false,
    latencia_ms: 0,
    tokens_in: 0,
    tokens_out: 0,
    modelo: "",
  };

  const bolhasLimpa = opts.bolhas.map((b) => (b ?? "").trim());
  const textoResposta = bolhasLimpa.filter(Boolean).join("\n");
  // Marcadores internos (silêncio/no-reply) não são resposta factual — passam direto.
  if (!textoResposta || /^\[(sil[êe]ncio|no-reply)\]$/i.test(textoResposta) || textoResposta.length < 3) {
    return base;
  }

  // ── Contraprova determinística (2026-06-11) — roda ANTES do juiz LLM ──
  // Fontes normalizadas: blocos + gavetas/comportamento + falas recentes do agente.
  // Bolha com trecho ≥30 chars contido nas fontes = pré-aprovada (impossível ser invenção).
  // Se TODAS as bolhas têm match → APROVADA sem chamar o juiz (mata os 33% de falso positivo
  // por leitura ruim do modelo pequeno — casos Dantas "15 a 45 dias" e CDC).
  // Trade-off consciente: nesses turnos o TESTE 2 não roda (se o agente desviou da pergunta
  // citando só coisas com fonte, não vira lacuna) — preferimos zero falso positivo.
  const _fontesNorm = _normalizarContraprova([
    opts.blocosRecuperados.map((b) => `${b.title ?? ""} ${b.content}`).join(" \n "),
    opts.contextoAdicional ?? "",
    opts.historicoAgente ?? "",
  ].join(" \n "));
  const _preAprovada = bolhasLimpa.map((b) => !b || _bolhaTemTrechoNasFontes(b, _fontesNorm));
  if (_preAprovada.every(Boolean)) {
    base.motivo = "contraprova_literal_total";
    return base;
  }

  const cfg = await getConfigChamada(supabase, "auditor_groundedness", opts.tenantId, opts.nichoId);
  base.modelo = cfg.modelo;

  const blocosCtx = opts.blocosRecuperados.length
    ? opts.blocosRecuperados
        .map((b) => `[${b.id}]: ${b.title ? b.title + " — " : ""}${b.content.slice(0, 500)}`)
        .join("\n")
    : "(nenhum bloco recuperado)";

  // 6000 → 12000 (2026-09-10): gavetas + comportamento + Rifa do Dia + tools já passavam de 7 mil
  // e o fim era cortado — o juiz condenava resposta certa por não ver a fonte.
  // 12k → 24k (2026-09-18): as regras do cargo ativo (script do Vendedor, ~10k) entraram como fonte
  // e não podem expulsar gavetas/comportamento/pacotes que vêm depois.
  const outrasFontes = (opts.contextoAdicional ?? "").trim().slice(0, 24000);
  const temasDesc = (opts.temasDescartados ?? "").trim().slice(0, 2000);
  const systemPrompt = [
    "Você é o Auditor de um agente de vendas/atendimento. Sua finalidade é UMA só: garantir que o agente só afirme o que as fontes sustentam e, quando o CONTATO pede um fato que as fontes não cobrem, sinalizar pra buscar com o dono — em vez de inventar.",
    "Recebe (a) a PERGUNTA do contato, (b) a RESPOSTA que o agente gerou, (c) os BLOCOS DE CONHECIMENTO oficiais e (d) OUTRAS FONTES que estavam no mesmo prompt (regras operacionais, comportamento, procedimentos, humanização do agente).",
    "",
    "Aplique DOIS testes. O veredito é REPROVADA se QUALQUER um falhar; caso contrário APROVADA.",
    "",
    "TESTE 1 — ANTI-INVENÇÃO (a resposta se comprova nas fontes?):",
    "- Para cada AFIRMAÇÃO FACTUAL sobre o produto/serviço na resposta — preço, prazo, processo, oferta, garantia, característica, disponibilidade, parceria, idioma, formato — ela precisa estar SUSTENTADA por ALGUMA das fontes (blocos OU outras fontes).",
    "- Sustentada = o conteúdo aparece (literal ou claramente derivável) em ALGUMA fonte. Se vier de um bloco com id, cite o id em blocos_que_sustentam.",
    "- Afirmação factual que NÃO está em NENHUMA fonte (o agente inventou, deduziu ou usou conhecimento geral do mundo) → FALHA o teste 1. Liste a afirmação em afirmacoes_sem_suporte.",
    '- NEGAR a existência de algo ("não temos X", "não fazemos Y") só passa se alguma fonte confirmar a ausência. Inventar uma negação FALHA o teste 1.',
    "",
    "TESTE 2 — COBERTURA (o que o contato pediu está nas fontes?):",
    "- Olhe a PERGUNTA do contato. Ele pediu um FATO ESPECÍFICO e verificável sobre o produto/serviço? (ex: 'vocês têm parceria com o cartório X?', 'atende em alemão?', 'qual o valor?', 'tem garantia de quanto tempo?')",
    "- Se SIM e NENHUMA fonte cobre esse fato → FALHA o teste 2 (o agente não tem como responder com verdade; o dono precisa fornecer). Liste o fato pedido em afirmacoes_sem_suporte.",
    "- Se SIM e ALGUMA fonte cobre → passa (ainda que a resposta pudesse ser melhor).",
    "- Se o contato pediu uma AÇÃO (ex.: 'me manda a foto') e uma ferramenta deste turno diz que já a FEZ (ex.: 'Foto da rifa enviada') → passa: a entrega foi feita por fora do texto, e a resposta não precisa repetir.",
    "- Se o contato NÃO pediu fato específico (saudação, 'tenho interesse', 'como funciona?', 'sim', 'ok', desabafo, pedido vago) → o teste 2 SEMPRE passa. Pergunta genérica de descoberta é respondida com o material de apresentação que existir; não é lacuna.",
    "- EXCEÇÃO IMPORTANTE: se a pergunta do contato é sobre um tema que aparece em TEMAS JÁ DESCARTADOS PELO DONO (abaixo), o teste 2 NÃO se aplica. O dono já decidiu não responder isso — o agente deve CONTORNAR e seguir a conversa, nunca escalar de novo. Uma resposta de contorno (reconhece que não tem a info e puxa pra frente) é APROVADA.",
    "",
    "DISTINÇÃO CRÍTICA (não confunda — isto NUNCA reprova):",
    "- Pergunta de QUALIFICAÇÃO que o AGENTE faz ao contato ('qual seu objetivo?', 'seu nome está negativado?', 'me conta sua situação') NÃO é 'deixar de responder' — é conduzir a venda.",
    "- Acolhimento, empatia, saudação e perguntas do agente ao contato NÃO são afirmações factuais — ignore no teste 1.",
    "- Afirmações sobre o PRÓPRIO CONTATO (dados que ele forneceu, a situação dele, o nome dele) NÃO são fato-do-produto — ignore no teste 1.",
    "- Resposta sem afirmação factual E sem fato específico pedido pelo contato → APROVADA, listas vazias.",
    "- Na dúvida, e havendo fonte que cobre o tema, prefira APROVADA (o auditor não trava resposta legítima nem qualificação).",
    "",
    `PERGUNTA DO LEAD:\n"${opts.perguntaLead.slice(0, 600)}"`,
    "",
    "BOLHAS DA RESPOSTA DO AGENTE (audite CADA bolha pelo índice; bolha pré-aprovada por contraprova literal já está marcada):",
    bolhasLimpa.map((b, i) => `[${i}]${_preAprovada[i] ? " (PRÉ-APROVADA — não reprove)" : ""} ${b.slice(0, 500)}`).join("\n").slice(0, 2400),
    "",
    "BLOCOS DE CONHECIMENTO:",
    blocosCtx,
    ...(outrasFontes ? ["", "OUTRAS FONTES DISPONÍVEIS NO MESMO PROMPT (também contam como suporte):", outrasFontes] : []),
    ...(opts.historicoAgente?.trim()
      ? ["", "FALAS RECENTES DO PRÓPRIO AGENTE NESTA CONVERSA (contam como fonte — repetir o que ele já disse é consistência, não invenção):", opts.historicoAgente.trim().slice(0, 800)]
      : []),
    ...(temasDesc ? ["", "TEMAS JÁ DESCARTADOS PELO DONO (não escalar — agente deve contornar se o contato insistir):", temasDesc] : []),
    "",
    "Retorne APENAS JSON puro (sem markdown):",
    '{ "veredito": "APROVADA" | "REPROVADA", "bolhas_reprovadas": [<índices das bolhas que FALHARAM o teste 1>], "lacuna_cobertura": <true SÓ se o teste 2 falhou — o contato pediu fato específico sem nenhuma fonte>, "blocos_que_sustentam": ["<id>"], "afirmacoes_sem_suporte": ["<frase>"], "motivo": "<1 frase curta>" }',
  ].join("\n");

  const { data: provData } = await supabase
    .from("provedores_llm")
    .select("base_url, api_key")
    .eq("slug", "openrouter")
    .eq("is_active", true)
    .single();

  if (!provData?.api_key) {
    console.warn("[auditor-resposta] credencial não encontrada — aprovação automática");
    return base;
  }

  const inicio = Date.now();
  try {
    const resp = await fetch(`${provData.base_url}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provData.api_key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ragentic.app",
        "X-Title": "Ragentic · auditor-resposta-groundedness",
      },
      body: JSON.stringify({
        model: cfg.modelo,
        messages: [{ role: "system", content: systemPrompt }],
        temperature: cfg.temperatura,
        max_tokens: cfg.max_tokens,
        response_format: { type: "json_object" },
      }),
    });
    base.latencia_ms = Date.now() - inicio;

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      console.warn(`[auditor-resposta] LLM ${resp.status}: ${txt.slice(0, 200)} — aprovação automática`);
      return base;
    }

    const json = await resp.json();
    base.tokens_in = json.usage?.prompt_tokens ?? 0;
    base.tokens_out = json.usage?.completion_tokens ?? 0;
    const textoRaw: string = json.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(textoRaw);

    const idsValidos = new Set(opts.blocosRecuperados.map((b) => b.id));
    const sustentam = Array.isArray(parsed.blocos_que_sustentam)
      ? parsed.blocos_que_sustentam.map(String).filter((id: string) => idsValidos.has(id))
      : [];
    let semSuporte = Array.isArray(parsed.afirmacoes_sem_suporte)
      ? parsed.afirmacoes_sem_suporte.map(String).filter(Boolean)
      : [];

    // ── Veto determinístico (2026-06-11): juiz não pode reprovar o que está escrito nas fontes ──
    // Bolha pré-aprovada pela contraprova sai da lista de reprovadas; afirmação "sem suporte"
    // com trecho ≥20 chars presente nas fontes também cai. Se nada sobrar e teste 2 passou → APROVADA.
    let bolhasReprovadas: number[] = Array.isArray(parsed.bolhas_reprovadas)
      ? parsed.bolhas_reprovadas.map(Number).filter((i: number) => Number.isInteger(i) && i >= 0 && i < bolhasLimpa.length)
      : [];
    bolhasReprovadas = bolhasReprovadas.filter((i) => !_preAprovada[i]);
    semSuporte = semSuporte.filter((a: string) => !_bolhaTemTrechoNasFontes(a, _fontesNorm, 20));
    const lacunaCobertura = parsed.lacuna_cobertura === true;

    let veredito: "APROVADA" | "REPROVADA" = parsed.veredito === "REPROVADA" ? "REPROVADA" : "APROVADA";
    if (veredito === "REPROVADA" && bolhasReprovadas.length === 0 && semSuporte.length === 0 && !lacunaCobertura) {
      veredito = "APROVADA"; // reprovação inteira vetada pela contraprova
    }

    return {
      veredito,
      blocos_que_sustentam: sustentam,
      afirmacoes_sem_suporte: semSuporte,
      bolhas_reprovadas: bolhasReprovadas,
      lacuna_cobertura: lacunaCobertura,
      motivo: String(parsed.motivo ?? "").slice(0, 300),
      rodou_auditor: true,
      latencia_ms: base.latencia_ms,
      tokens_in: base.tokens_in,
      tokens_out: base.tokens_out,
      modelo: cfg.modelo,
    };
  } catch (e) {
    base.latencia_ms = Date.now() - inicio;
    console.warn("[auditor-resposta] erro/parse — aprovação automática:", (e as Error).message);
    return base;
  }
}
