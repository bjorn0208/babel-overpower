// Monta a timeline ordenada de passos para o replay
// Regra de casamento: trace.tipo → ids de nós do grafo via MAPA_TRACE_NOS
// Mensagens e bolhas mapeiam para nós de entrada/saída

import type {
  TraceReal,
  MensagemReal,
  BolhaSaidaReal,
  PassoReplay,
  ConteudoPasso,
} from "./tipos-replay";

// ── Mapa trace.tipo → ids de nós do grafo ────────────────────────────────
// Fonte: fonte_dado_real nos grafo-nos-externo.ts e grafo-nos-interno.ts
const MAPA_TRACE_NOS: Record<string, string[]> = {
  porteiro: ["porteiro"],
  sintese: ["sintese-llm", "trace-sintese"],
  ferramenta: ["sintese-llm"], // tool calls dentro da síntese
  // Ferramentas específicas pelo campo decisao.ferramenta
};

const MAPA_FERRAMENTA_NOS: Record<string, string[]> = {
  recall_pre_sintese: ["recall-rag-first"],
  leitura_memoria_pre_sintese: ["recall-memoria"],
  herdar_crenca_conversa_anterior: ["heranca-crenca"],
  extrair_dados_ficha: ["extrator-s1"],
  score_calculado: ["score-engajamento"],
  memoria_episodica_inline: ["episodica-inline"],
};

function nosParaTrace(t: TraceReal): string[] {
  if (t.tipo === "ferramenta") {
    const dec = t.decisao as Record<string, unknown> | null;
    const ferramenta = typeof dec?.ferramenta === "string" ? dec.ferramenta : "";
    const nos = MAPA_FERRAMENTA_NOS[ferramenta];
    if (nos) return nos;
    return MAPA_TRACE_NOS["ferramenta"] ?? [];
  }
  return MAPA_TRACE_NOS[t.tipo] ?? [];
}

function tituloPasso(tipo: string, decisao: unknown): string {
  if (tipo === "porteiro") return "Porteiro — classificação";
  if (tipo === "sintese") return "Síntese LLM — resposta";
  if (tipo === "ferramenta") {
    const d = decisao as Record<string, unknown> | null;
    const f = typeof d?.ferramenta === "string" ? d.ferramenta : "ferramenta";
    return `Tool: ${f}`;
  }
  return tipo;
}

// ── Builder de passos ─────────────────────────────────────────────────────

function passoDeMensagem(m: MensagemReal): PassoReplay {
  const ehUser = m.role === "user" || m.role === "human";
  const nosAlvo = ehUser ? ["insere-user-msg"] : ["zapi-out"];
  const conteudo: ConteudoPasso = {
    titulo: ehUser ? "Mensagem do lead (user)" : `Mensagem do agente (${m.role})`,
    msg_role: m.role,
    msg_content: m.content,
  };
  return {
    id: `msg-${m.id}`,
    tipo: "mensagem",
    criado_em: m.created_at ?? "",
    nos_alvo: nosAlvo,
    conteudo,
  };
}

function passoDeBolha(b: BolhaSaidaReal): PassoReplay {
  const conteudo: ConteudoPasso = {
    titulo: `Bolha ${b.bubble_order + 1} → caixa de saída`,
    bolha_content: b.content,
    bolha_status: b.status,
    bolha_ordem: b.bubble_order,
  };
  return {
    id: `bolha-${b.id}`,
    tipo: "bolha_saida",
    criado_em: b.created_at,
    nos_alvo: ["enfileirar-bolhas"],
    conteudo,
  };
}

function passoDeTrace(t: TraceReal): PassoReplay {
  const conteudo: ConteudoPasso = {
    titulo: tituloPasso(t.tipo, t.decisao),
    trace_tipo: t.tipo,
    trace_decisao: t.decisao,
    trace_modelo: t.modelo_llm,
    trace_latencia_ms: t.latencia_ms,
    trace_custo_in: t.custo_tokens_in,
    trace_custo_out: t.custo_tokens_out,
    trace_raciocinio: t.raciocinio_interno,
    trace_prompt_resumo: t.prompt_resumo,
  };
  return {
    id: `trace-${t.id}`,
    tipo: "trace",
    criado_em: t.criado_em,
    nos_alvo: nosParaTrace(t),
    conteudo,
  };
}

// ── Montagem principal ────────────────────────────────────────────────────

export function montarTimeline(
  traces: TraceReal[],
  mensagens: MensagemReal[],
  bolhas: BolhaSaidaReal[]
): PassoReplay[] {
  const todos: PassoReplay[] = [
    ...traces.map(passoDeTrace),
    ...mensagens.map(passoDeMensagem),
    ...bolhas.map(passoDeBolha),
  ];

  // Ordena por criado_em ISO — ordem cronológica real
  todos.sort((a, b) => {
    const ta = a.criado_em || "";
    const tb = b.criado_em || "";
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });

  // Dedup: bolhas de mensagens assistente que já vieram como mensagens — remove bolhas cujo
  // conteúdo já está numa mensagem role=assistant no mesmo segundo (evita duplicação visual)
  const msgsAssistente = new Set(
    mensagens
      .filter((m) => m.role === "assistant")
      .map((m) => `${m.content.slice(0, 40)}|${(m.created_at ?? "").slice(0, 19)}`)
  );
  return todos.filter((p) => {
    if (p.tipo !== "bolha_saida") return true;
    const chave = `${(p.conteudo.bolha_content ?? "").slice(0, 40)}|${p.criado_em.slice(0, 19)}`;
    return !msgsAssistente.has(chave);
  });
}
