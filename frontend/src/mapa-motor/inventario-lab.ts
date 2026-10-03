// Inventário completo das peças do ragentic-lab
// Fonte: agent-output/analises/inventario-ragentic-lab.md (2026-05-18)
// ~92 peças em 15 seções — FIEL ao inventário (não resume/omite)
//
// COBERTURA: cruzamento heurístico por termos-chave entre nome/o_que_faz da peça
// e label/faz dos 42 nós do grafo do motor de hoje.
// NÃO é automação perfeita — guia visual. Confirme manualmente.
// Critério: "tem" = nó com função equivalente clara; "parcial" = nó cobre parte;
// "falta" = sem correspondente identificado; "?" = incerto/ambíguo.

import type { PecaLab } from "./tipos-lab";

export const INVENTARIO_LAB: PecaLab[] = [
  // ─── 1. Infraestrutura de Turno ───────────────────────────────────────────

  {
    id: "lock-conversa",
    nome: "Lock de conversa",
    o_que_faz:
      "pg_advisory_xact_lock(conversa_id) impede processamento paralelo do mesmo lead",
    onde_no_lab: "src/routes/api/chat.ts ~L120-160",
    maturidade: "implementada",
    secao: "infra-turno",
    cobertura: "?",
    nos_correspondentes: [],
  },
  {
    id: "pausa-expiracao",
    nome: "Pausa com expiração",
    o_que_faz:
      "Verifica conversas.pausada_ate antes de processar — bloqueia turno se em pausa",
    onde_no_lab: "chat.ts ~L160-190",
    maturidade: "implementada",
    secao: "infra-turno",
    cobertura: "?",
    nos_correspondentes: [],
  },
  {
    id: "dedup-mensagem",
    nome: "Deduplicação de mensagem",
    o_que_faz:
      "mensagens_processadas flag; mensagem duplicada retorna 200 sem reprocessar",
    onde_no_lab: "chat.ts ~L190-220",
    maturidade: "implementada",
    secao: "infra-turno",
    cobertura: "parcial",
    nos_correspondentes: ["webhook-dedup"],
  },
  {
    id: "historico-curto",
    nome: "Histórico curto por turno",
    o_que_faz:
      "Carrega N últimas mensagens + sinais temporais (tempo desde última fala, contagem de mensagens)",
    onde_no_lab: "chat.ts ~L220-280",
    maturidade: "implementada",
    secao: "infra-turno",
    cobertura: "parcial",
    nos_correspondentes: ["working-memory"],
  },
  {
    id: "traces-turno",
    nome: "Sistema de traces",
    o_que_faz:
      "traces_do_turno por evento (porteiro, sintese, ferramenta, handoff, workspace); função trace() utilitária",
    onde_no_lab: "chat.ts ~L80-115",
    maturidade: "implementada",
    secao: "infra-turno",
    cobertura: "tem",
    nos_correspondentes: ["trace-sintese"],
  },
  {
    id: "budget-tracking",
    nome: "Budget tracking por turno",
    o_que_faz:
      "registrar_uso_ia(tokens_in, tokens_out, custo, modelo) após cada chamada LLM",
    onde_no_lab: "chat.ts permeado",
    maturidade: "implementada",
    secao: "infra-turno",
    cobertura: "parcial",
    nos_correspondentes: ["trace-sintese"],
  },
  {
    id: "persistencia-estado",
    nome: "Persistência de estado da conversa",
    o_que_faz:
      "estado_da_conversa.flags JSONB: crenca, pensamento, psique_ultimo_turno, workspace; salvo ao fim do turno",
    onde_no_lab: "chat.ts ~L2200-2350",
    maturidade: "implementada",
    secao: "infra-turno",
    cobertura: "parcial",
    nos_correspondentes: ["crenca-upsert", "intencoes-pendentes"],
  },
  {
    id: "canal-atuacao",
    nome: "Canal de atuação (externo/interno)",
    o_que_faz:
      "conversas.canal determina branch do motor; canal=interno ativa modo Mentor com cargo imutável",
    onde_no_lab: "chat.ts ~L300-360, tese 34",
    maturidade: "implementada",
    secao: "infra-turno",
    cobertura: "tem",
    nos_correspondentes: ["parse-body", "canal-interno-branch"],
  },

  // ─── 2. Porteiro / Roteador S1 ────────────────────────────────────────────

  {
    id: "porteiro-s1",
    nome: "Porteiro S1 (Gemma 4 31b)",
    o_que_faz:
      "LLM barato de triagem: decide cargo, urgência, intenção, postura; não fala com lead",
    onde_no_lab: "chat.ts ~L366-560",
    maturidade: "implementada",
    secao: "porteiro-s1",
    cobertura: "tem",
    nos_correspondentes: ["porteiro"],
  },
  {
    id: "filtro-cargos-canal",
    nome: "Filtro de cargos por canal_atuacao",
    o_que_faz:
      "Antes do Porteiro, filtra cargos pelo campo canal_atuacao (externo/interno/ambos); S1 só vê cargos elegíveis",
    onde_no_lab: "chat.ts ~L340-365, tese 34",
    maturidade: "implementada",
    secao: "porteiro-s1",
    cobertura: "tem",
    nos_correspondentes: ["cargos-canal"],
  },
  {
    id: "hyde",
    nome: "HyDE (Hypothetical Document Embeddings)",
    o_que_faz:
      "Porteiro gera hyde_resposta_hipotetica — resposta hipotética ideal — para enriquecer embedding da query RAG",
    onde_no_lab: "chat.ts ~L430-460",
    maturidade: "implementada",
    secao: "porteiro-s1",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "catalogo-produtos-s1",
    nome: "Catálogo de produtos pré-Porteiro",
    o_que_faz:
      "Lista de produtos do agente injetada no contexto S1 para campo produto_foco na saída",
    onde_no_lab: "chat.ts ~L295-330",
    maturidade: "implementada",
    secao: "porteiro-s1",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "goal-stack-s1",
    nome: "Goal Stack / Pilha de Objetivos no S1",
    o_que_faz:
      "TOPO da pilha de objetivos injetado no contexto do Porteiro; S1 decide acao_no_objetivo",
    onde_no_lab: "chat.ts ~L415-435, tese 33",
    maturidade: "implementada",
    secao: "porteiro-s1",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "espelhamento-estilo-s1",
    nome: "Espelhamento estilístico S1",
    o_que_faz:
      "S1 analisa histórico e injeta perfil de estilo do lead (tamanho médio, emoji, registro) para Síntese",
    onde_no_lab: "chat.ts ~L445-465",
    maturidade: "implementada",
    secao: "porteiro-s1",
    cobertura: "falta",
    nos_correspondentes: [],
  },

  // ─── 3. Recall / RAG ──────────────────────────────────────────────────────

  {
    id: "cache-semantico",
    nome: "Cache semântico de recall",
    o_que_faz:
      "RPC consultar_cache_semantico antes do RAG; gravar_cache_semantico ao fim; TTL configurável por agente",
    onde_no_lab: "chat.ts ~L560-610",
    maturidade: "implementada",
    secao: "recall-rag",
    cobertura: "?",
    nos_correspondentes: [],
  },
  {
    id: "busca-hibrida-hnsw-gin",
    nome: "Busca híbrida HNSW+GIN",
    o_que_faz:
      "RPC buscar_blocos_hibrido combina vector (HNSW) + full-text BM25 (GIN) em CTE separadas",
    onde_no_lab: "chat.ts ~L615-670, tese 22",
    maturidade: "implementada",
    secao: "recall-rag",
    cobertura: "tem",
    nos_correspondentes: ["recall-rag-first"],
  },
  {
    id: "rag-3-escopos",
    nome: "RAG 3 escopos (universal/nicho/agente)",
    o_que_faz:
      "calibragem_recall por agente define pesos de cada escopo; \"specific wins\"",
    onde_no_lab: "chat.ts ~L670-700, tese 01",
    maturidade: "implementada",
    secao: "recall-rag",
    cobertura: "tem",
    nos_correspondentes: ["recall-rag-first"],
  },
  {
    id: "decay-ebbinghaus",
    nome: "Decay Ebbinghaus nos blocos",
    o_que_faz:
      "Score final = exp(-dias_sem_acesso/decay_dias) * fator_recencia + boost_uso; pontuarBloco()",
    onde_no_lab: "chat.ts ~L730-790, tese 15",
    maturidade: "implementada",
    secao: "recall-rag",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "rcr-router-cargo",
    nome: "RCR-Router boost por cargo",
    o_que_faz:
      "Blocos ligados ao cargo ativo recebem multiplicador 1.25× via _p_cargo_id no RPC",
    onde_no_lab: "chat.ts ~L700-730, tese 34",
    maturidade: "implementada",
    secao: "recall-rag",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "boost-produto-foco",
    nome: "Boost por produto em foco",
    o_que_faz:
      "Blocos tagueados com produto_foco recebem boost adicional via _p_produtos_foco",
    onde_no_lab: "chat.ts ~L700-730",
    maturidade: "implementada",
    secao: "recall-rag",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "cohere-rerank",
    nome: "Cohere Rerank v3.5",
    o_que_faz:
      "Re-rankeamento neural dos top-K blocos; fallback RRF se API indisponível",
    onde_no_lab: "chat.ts ~L790-850, tese 14",
    maturidade: "implementada",
    secao: "recall-rag",
    cobertura: "tem",
    nos_correspondentes: ["recall-rag-first"],
  },
  {
    id: "incrementar-uso-blocos",
    nome: "Incrementar uso dos blocos",
    o_que_faz:
      "RPC incrementar_uso_blocos ao fim do turno; alimenta score de uso para Ebbinghaus",
    onde_no_lab: "chat.ts ~L2180-2200",
    maturidade: "implementada",
    secao: "recall-rag",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "ab-testing-blocos",
    nome: "A/B testing de blocos",
    o_que_faz:
      "testes_ab_blocos com usos_a/usos_b; Porteiro seleciona variante por hash do lead_id",
    onde_no_lab: "chat.ts ~L860-900",
    maturidade: "implementada",
    secao: "recall-rag",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "recall-memoria-episodica",
    nome: "Recall de memória episódica",
    o_que_faz:
      "Carrega episodios_memoria do lead: ganchos abertos, promessas, tópicos cobertos, momentos marcantes",
    onde_no_lab: "chat.ts ~L900-950",
    maturidade: "implementada",
    secao: "recall-rag",
    cobertura: "tem",
    nos_correspondentes: ["recall-memoria"],
  },
  {
    id: "working-summary",
    nome: "Working summary rolante",
    o_que_faz:
      "working_summary comprimido + working_summary_ate_em; atualizado periodicamente, não a cada turno",
    onde_no_lab: "chat.ts ~L950-990",
    maturidade: "implementada",
    secao: "recall-rag",
    cobertura: "falta",
    nos_correspondentes: [],
  },

  // ─── 4. Workspace Incremental ─────────────────────────────────────────────

  {
    id: "curador-foco",
    nome: "Curador de Foco (Gemma 4 31b)",
    o_que_faz:
      "LLM intermediário: comprime contexto do turno em narrativa ~400-600 tokens antes da Síntese",
    onde_no_lab:
      "chat.ts ~L1000-1100, laboratorio-ragentic/04-arquitetura/workspace-incremental.md",
    maturidade: "implementada",
    secao: "workspace",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "campos-workspace",
    nome: "Campos do workspace",
    o_que_faz:
      "Seis campos narrativos: retrato_vivo, fatos_criticos_a_lembrar, promessas_vivas, tensoes_nao_resolvidas, proximo_movimento_esperado, o_que_evitar_neste_turno",
    onde_no_lab: "workspace-incremental.md + chat.ts",
    maturidade: "implementada",
    secao: "workspace",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "atualizacao-incremental",
    nome: "Atualização incremental do workspace",
    o_que_faz:
      "atualizarWorkspaceIncremental() só reescreve campos que mudaram, não recomputa tudo",
    onde_no_lab: "chat.ts ~L1080-1120",
    maturidade: "implementada",
    secao: "workspace",
    cobertura: "falta",
    nos_correspondentes: [],
  },

  // ─── 5. BDI / Theory of Mind ──────────────────────────────────────────────

  {
    id: "crencas-sobre-lead",
    nome: "Crenças sobre o lead",
    o_que_faz:
      "crencas_sobre_o_lead JSONB: acredita_que, deseja_que, planeja, medo_de, hipotese_a_testar; atualizado pela Síntese",
    onde_no_lab: "chat.ts ~L1130-1180, tese 03",
    maturidade: "implementada",
    secao: "bdi-tom",
    cobertura: "parcial",
    nos_correspondentes: ["working-memory", "crenca-upsert"],
  },
  {
    id: "revisoes-crenca",
    nome: "Revisões de crença",
    o_que_faz:
      "revisoes_crenca registra trajetória BDI ao longo da conversa",
    onde_no_lab: "chat.ts ~L2130-2160",
    maturidade: "implementada",
    secao: "bdi-tom",
    cobertura: "parcial",
    nos_correspondentes: ["crenca-upsert"],
  },
  {
    id: "goal-stack-bdi",
    nome: "Goal Stack (BDI goals)",
    o_que_faz:
      "objetivos_da_conversa: status perseguindo/bloqueado/cumprido/abandonado; Porteiro decide acao_no_objetivo; Síntese vê TOPO",
    onde_no_lab: "chat.ts + tese 33",
    maturidade: "implementada",
    secao: "bdi-tom",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "intencoes-pendentes-bdi",
    nome: "Intenções pendentes",
    o_que_faz:
      "intencoes_pendentes registra sem disparar; plano de próximos 2 turnos da Síntese",
    onde_no_lab: "chat.ts ~L2155-2180, tese 09",
    maturidade: "implementada",
    secao: "bdi-tom",
    cobertura: "tem",
    nos_correspondentes: ["intencoes-pendentes"],
  },

  // ─── 6. Estado Afetivo ────────────────────────────────────────────────────

  {
    id: "estado-afetivo",
    nome: "Estado afetivo persistente",
    o_que_faz:
      "estado_afetivo: valencia (positivo/negativo), confianca_no_lead, ultima_ruptura, afinidade_declarada; persiste entre turnos",
    onde_no_lab: "chat.ts ~L1180-1230",
    maturidade: "implementada",
    secao: "estado-afetivo",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "reparacao-ruptura",
    nome: "Reparação ativa de ruptura",
    o_que_faz:
      "Detecta ruptura (ultima_ruptura recente) e injeta blocosReparacaoAtiva de RAG no contexto",
    onde_no_lab: "chat.ts ~L1230-1270",
    maturidade: "implementada",
    secao: "estado-afetivo",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "humor-interno",
    nome: "Humor interno do agente",
    o_que_faz:
      "Campo {nome, valencia, motivo} gerado pela Síntese; persiste em psique_ultimo_turno",
    onde_no_lab: "chat.ts ~L1740-1804 (output S2)",
    maturidade: "implementada",
    secao: "estado-afetivo",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "coerencia-emocional",
    nome: "Coerência emocional do turno",
    o_que_faz:
      "Síntese gera 1 frase de coerência emocional que todas as bolhas seguem",
    onde_no_lab: "chat.ts ~L1740-1804",
    maturidade: "implementada",
    secao: "estado-afetivo",
    cobertura: "falta",
    nos_correspondentes: [],
  },

  // ─── 7. Síntese S2 ────────────────────────────────────────────────────────

  {
    id: "sintese-s2",
    nome: "Síntese S2 (gemini-3.1-flash-lite-preview)",
    o_que_faz:
      "LLM caro: gera bolhas, decide tools, preenche CoT 6 campos, define postura dialógica",
    onde_no_lab: "chat.ts ~L1740-1835",
    maturidade: "implementada",
    secao: "sintese-s2",
    cobertura: "tem",
    nos_correspondentes: ["sintese-llm"],
  },
  {
    id: "chain-of-thought",
    nome: "Chain of Thought 6 campos",
    o_que_faz:
      "Campos estruturados antes das bolhas: leitura_da_situacao, proxima_intencao, plano_proximos_2_turnos, acao_pretendida, humor_interno, coerencia_emocional",
    onde_no_lab: "chat.ts ~L1740-1804",
    maturidade: "implementada",
    secao: "sintese-s2",
    cobertura: "tem",
    nos_correspondentes: ["pensamento-estruturado"],
  },
  {
    id: "postura-dialogica",
    nome: "Postura dialógica (8 opções)",
    o_que_faz:
      "Síntese escolhe postura: inquirir/acolher/provar/concordar_e_avancar/discordar/silenciar/excursionar_social/retornar_ao_comercial",
    onde_no_lab: "chat.ts ~L1760-1790",
    maturidade: "implementada",
    secao: "sintese-s2",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "pergunta-investigativa",
    nome: "Pergunta investigativa (arma da psique)",
    o_que_faz:
      "Campo pergunta_investigativa: {campo_ficha_alvo, hipotese_que_testa} — questão que parece conversa mas coleta dados da ficha",
    onde_no_lab: "chat.ts ~L1790-1804",
    maturidade: "implementada",
    secao: "sintese-s2",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "opiniao-meio-fala",
    nome: "Opinião no meio da fala",
    o_que_faz:
      "Campo opiniao_no_meio_da_fala — agente expressa opinião real para autenticidade",
    onde_no_lab: "chat.ts ~L1790-1804",
    maturidade: "implementada",
    secao: "sintese-s2",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "silencio-deliberado",
    nome: "Silêncio deliberado (zero bolhas)",
    o_que_faz:
      "bolhas: [] é resposta válida; decidido via bloco RAG 'Silêncio após despedida', não hardcoded",
    onde_no_lab:
      "chat.ts + laboratorio-ragentic/04-arquitetura/silencio-zero-bolhas.md",
    maturidade: "implementada",
    secao: "sintese-s2",
    cobertura: "parcial",
    nos_correspondentes: ["quebrar-bolhas"],
  },
  {
    id: "anti-placeholder",
    nome: "Anti-placeholder guard",
    o_que_faz:
      "Instrução explícita no prompt S2: proibido [NOME], [DATA] sem valor real",
    onde_no_lab: "chat.ts ~L1800-1810",
    maturidade: "implementada",
    secao: "sintese-s2",
    cobertura: "falta",
    nos_correspondentes: [],
  },

  // ─── 8. Guard Anti-Redundância ────────────────────────────────────────────

  {
    id: "validacao-anti-redundancia",
    nome: "Validação anti-redundância",
    o_que_faz:
      "validarBolhasNaoRedundantes(): LLM valida se bolhas repetem o que já foi dito; 1 retry autorizado",
    onde_no_lab:
      "chat.ts ~L1836-1919, laboratorio-ragentic/04-arquitetura/anti-redundancia.md",
    maturidade: "implementada",
    secao: "anti-redundancia",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "proposta-aprendizado",
    nome: "Proposta de aprendizado em falha",
    o_que_faz:
      "Se 2 tentativas ainda redundantes → grava proposta_aprendizado no banco para revisão humana",
    onde_no_lab: "chat.ts ~L1900-1919",
    maturidade: "implementada",
    secao: "anti-redundancia",
    cobertura: "falta",
    nos_correspondentes: [],
  },

  // ─── 9. Tools / ReAct ─────────────────────────────────────────────────────

  {
    id: "react-read-tools",
    nome: "ReAct read tools",
    o_que_faz:
      "Tools de leitura (buscar_dados_*, consultar_*) forçam 2ª síntese com resultado; sem side-effect",
    onde_no_lab: "chat.ts ~L1920-2050, tese 23",
    maturidade: "implementada",
    secao: "tools-react",
    cobertura: "tem",
    nos_correspondentes: ["tools-cargo-externo"],
  },
  {
    id: "react-write-tools",
    nome: "ReAct write tools",
    o_que_faz:
      "Tools de escrita executadas otimisticamente; resultado injetado como contexto",
    onde_no_lab: "chat.ts ~L2050-2120",
    maturidade: "implementada",
    secao: "tools-react",
    cobertura: "tem",
    nos_correspondentes: ["tools-cargo-externo"],
  },
  {
    id: "handoff-cargos",
    nome: "Handoff explícito de cargos",
    o_que_faz:
      "3 tools: enviar_para_juridico, enviar_para_financeiro, enviar_para_pos_venda; atualiza conversas.cargo_ativo_id + trace",
    onde_no_lab:
      "chat.ts + laboratorio-ragentic/04-arquitetura/ragentic-handoff-cargos.md",
    maturidade: "implementada",
    secao: "tools-react",
    cobertura: "tem",
    nos_correspondentes: ["tools-cargo-externo"],
  },
  {
    id: "tools-especificas-cargo",
    nome: "Tools específicas por cargo",
    o_que_faz:
      "Jurídico: marcar_contrato_assinado, emitir_link_contrato, lembrar_assinatura_contrato; Financeiro: gerar_cobranca, validar_comprovante_pagamento; RH: salvar_curriculo",
    onde_no_lab: "chat.ts ~L1936-2050",
    maturidade: "implementada",
    secao: "tools-react",
    cobertura: "tem",
    nos_correspondentes: ["tools-cargo-externo"],
  },
  {
    id: "generative-ui",
    nome: "Generative UI (tools de UI)",
    o_que_faz:
      "Tools que retornam componentes React inline: resumo_operacional, listar_atendimentos, funil_de_vendas, revisar_aprendizados",
    onde_no_lab: "chat.ts + tese 29/31",
    maturidade: "implementada",
    secao: "tools-react",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "curadoria-oficial-mentor",
    nome: "Curadoria Oficial (10 tools Mentor)",
    o_que_faz:
      "criar_bloco, editar_bloco, arquivar_bloco, promover_bloco_escopo, criar_cargo, editar_cargo, editar_persona_agente, listar_blocos, aprovar_proposta_por_id, desfazer_ultima_acao",
    onde_no_lab: "chat.ts + tese 35",
    maturidade: "implementada",
    secao: "tools-react",
    cobertura: "parcial",
    nos_correspondentes: ["tools-cargo-externo"],
  },
  {
    id: "acoes-agendadas-ema",
    nome: "Ações agendadas (EMA)",
    o_que_faz:
      "Tools criam acoes_agendadas com detecção de conflito, circuit-breaker, idempotência via request_id",
    onde_no_lab: "chat.ts ~L2060-2090",
    maturidade: "implementada",
    secao: "tools-react",
    cobertura: "parcial",
    nos_correspondentes: ["tools-cargo-externo", "process-followups"],
  },

  // ─── 10. Memória de Longo Prazo ───────────────────────────────────────────

  {
    id: "ficha-lead",
    nome: "Ficha do lead (extração incremental)",
    o_que_faz:
      "fichas_lead com campos em camadas (hipótese → fato confirmado); atualizada pela Síntese por turno",
    onde_no_lab: "chat.ts ~L2120-2160, tese 03",
    maturidade: "implementada",
    secao: "memoria-lp",
    cobertura: "tem",
    nos_correspondentes: ["extrator-s1"],
  },
  {
    id: "score-pesos-aprendidos",
    nome: "Score do lead com pesos aprendidos",
    o_que_faz:
      "score_pesos_aprendidos por agente; RPC recalibrar_pesos_score ajusta após conversão/perda",
    onde_no_lab: "chat.ts ~L2160-2185",
    maturidade: "implementada",
    secao: "memoria-lp",
    cobertura: "parcial",
    nos_correspondentes: ["score-engajamento"],
  },
  {
    id: "tendencia-score",
    nome: "Tendência de score",
    o_que_faz:
      "RPC tendencia_de_score retorna subindo/caindo/estavel baseado em histórico",
    onde_no_lab: "chat.ts ~L2185-2200",
    maturidade: "INCERTO",
    secao: "memoria-lp",
    cobertura: "?",
    nos_correspondentes: [],
  },
  {
    id: "ganchos-abertos",
    nome: "Ganchos abertos (episódios)",
    o_que_faz:
      "episodios_memoria tipo gancho_aberto: assunto iniciado mas não concluído, reativado se relevante",
    onde_no_lab: "chat.ts ~L900-950",
    maturidade: "implementada",
    secao: "memoria-lp",
    cobertura: "parcial",
    nos_correspondentes: ["recall-memoria"],
  },
  {
    id: "promessas-pendentes",
    nome: "Promessas pendentes do agente",
    o_que_faz:
      "episodios_memoria tipo promessa_do_agente: compromissos do agente ao lead para follow-up",
    onde_no_lab: "chat.ts ~L900-950",
    maturidade: "implementada",
    secao: "memoria-lp",
    cobertura: "parcial",
    nos_correspondentes: ["recall-memoria", "working-memory"],
  },
  {
    id: "topicos-cobertos",
    nome: "Tópicos já cobertos",
    o_que_faz:
      "episodios_memoria tipo topico_coberto: evita repetição de abertura já feita",
    onde_no_lab: "chat.ts ~L900-950",
    maturidade: "implementada",
    secao: "memoria-lp",
    cobertura: "parcial",
    nos_correspondentes: ["recall-memoria"],
  },
  {
    id: "tags-emergentes",
    nome: "Tags emergentes",
    o_que_faz:
      "Síntese atualiza atualizacao_tags snake_case; auto-tag produto:<slug> ao detectar produto em foco",
    onde_no_lab: "chat.ts ~L2200-2230",
    maturidade: "implementada",
    secao: "memoria-lp",
    cobertura: "parcial",
    nos_correspondentes: ["extrator-s1"],
  },
  {
    id: "apresentacao-unica",
    nome: "Apresentação única",
    o_que_faz:
      "Flag apresentacao_feita sticky; agente não se apresenta de novo na mesma conversa",
    onde_no_lab: "chat.ts ~L2230-2250",
    maturidade: "implementada",
    secao: "memoria-lp",
    cobertura: "falta",
    nos_correspondentes: [],
  },

  // ─── 11. Consciência Estendida ────────────────────────────────────────────

  {
    id: "opinioes-formadas",
    nome: "Opiniões formadas pelo agente",
    o_que_faz:
      "blocos_opiniao tipo=opiniao_formada: agente acumula posição sobre o lead injetada no contexto",
    onde_no_lab: "chat.ts ~L1270-1300",
    maturidade: "implementada",
    secao: "consciencia",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "carrinho-lead",
    nome: "Carrinho do lead",
    o_que_faz:
      "Estado do carrinho (produtos, preços, descontos) injetado no contexto da Síntese",
    onde_no_lab: "chat.ts ~L1300-1340",
    maturidade: "implementada",
    secao: "consciencia",
    cobertura: "parcial",
    nos_correspondentes: ["tools-cargo-externo"],
  },
  {
    id: "contratos-pagamentos",
    nome: "Contratos e pagamentos",
    o_que_faz:
      "Estado de contratos, pagamentos, comprovantes injetado no contexto",
    onde_no_lab: "chat.ts ~L1340-1380",
    maturidade: "implementada",
    secao: "consciencia",
    cobertura: "parcial",
    nos_correspondentes: ["tools-cargo-externo"],
  },
  {
    id: "timeline-eventos",
    nome: "Timeline de eventos",
    o_que_faz:
      "Movimentos e eventos do lead em ordem cronológica injetados no contexto",
    onde_no_lab: "chat.ts ~L1380-1420",
    maturidade: "implementada",
    secao: "consciencia",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "estados-ocupacao",
    nome: "Estados de ocupação",
    o_que_faz:
      "estados_de_ocupacao com escopo hierárquico; léxico circadiano (bom dia/boa tarde/boa noite)",
    onde_no_lab: "chat.ts ~L1420-1460",
    maturidade: "implementada",
    secao: "consciencia",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "humanizacao-estilistica",
    nome: "Humanização estilística",
    o_que_faz:
      "padrao_erro_humano (typos controlados), humanizacao_autoexposicao (agente conta algo pessoal)",
    onde_no_lab: "chat.ts ~L1460-1500",
    maturidade: "implementada",
    secao: "consciencia",
    cobertura: "falta",
    nos_correspondentes: [],
  },

  // ─── 12. Cargos e Identidade ──────────────────────────────────────────────

  {
    id: "cargos-funcionais",
    nome: "Cargos funcionais (substitui fluxo_fases)",
    o_que_faz:
      "cargos com canal_atuacao, bussola (objetivo), prancheta (campos_rastreio), blocos procedurais",
    onde_no_lab: "tese 25 + chat.ts",
    maturidade: "implementada",
    secao: "cargos-identidade",
    cobertura: "tem",
    nos_correspondentes: ["cargos-canal", "resolver-cargo-id"],
  },
  {
    id: "blindagem-identidade",
    nome: "Blindagem de identidade / Carga Única",
    o_que_faz:
      "Nome do agente fixo; cargo é função, não identidade; impede impersonação por instrução do lead",
    onde_no_lab: "tese 26 + chat.ts",
    maturidade: "implementada",
    secao: "cargos-identidade",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "blocos-procedurais-cargo",
    nome: "Blocos procedurais por cargo",
    o_que_faz:
      "4 blocos por cargo: postura/abertura, sequência padrão, anti-padrões+handoff, fechamento; 32 blocos seeded por agente",
    onde_no_lab: "ragentic-handoff-cargos.md + migration",
    maturidade: "implementada",
    secao: "cargos-identidade",
    cobertura: "parcial",
    nos_correspondentes: ["recall-rag-first"],
  },
  {
    id: "handoff-implicito",
    nome: "Handoff implícito (Porteiro)",
    o_que_faz:
      "S1 pode trocar cargo via RAG ao detectar mudança de domínio (ex: lead pede currículo → RH)",
    onde_no_lab: "chat.ts + tese 34",
    maturidade: "implementada",
    secao: "cargos-identidade",
    cobertura: "parcial",
    nos_correspondentes: ["porteiro", "resolver-cargo-id"],
  },
  {
    id: "cargo-imutavel-interno",
    nome: "Cargo imutável no canal interno",
    o_que_faz:
      "Modo Mentor: cargo fixo no canal=interno; tools de handoff são no-op",
    onde_no_lab: "chat.ts + tese 34",
    maturidade: "implementada",
    secao: "cargos-identidade",
    cobertura: "tem",
    nos_correspondentes: ["canal-interno-branch"],
  },

  // ─── 13. Cronjobs / Automações de Fundo ──────────────────────────────────

  {
    id: "sono-noturno",
    nome: "Sono noturno (consolidação diária)",
    o_que_faz:
      "Cron noturno: 1) consolidação por agente, 2) detecta anti-padrões (≥3 erros), 3) tags emergentes, 4) Ebbinghaus delete (importância<0.3, >60 dias)",
    onde_no_lab: "src/routes/api/public/hooks/sono-noturno.ts",
    maturidade: "implementada",
    secao: "cronjobs",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "detector-silencio",
    nome: "Detector de silêncio",
    o_que_faz:
      "detectar-silencio.ts: agente falou por último + N horas sem resposta → enfileira agendar_retorno",
    onde_no_lab: "src/routes/api/public/hooks/detectar-silencio.ts",
    maturidade: "implementada",
    secao: "cronjobs",
    cobertura: "parcial",
    nos_correspondentes: ["process-followups"],
  },
  {
    id: "janela-circadiana",
    nome: "Janela circadiana",
    o_que_faz:
      "decidirJanelaCircadiana(): ideal 9-21h BRT, morna 8-22h (só se urgência>0.7), fora → adia para next_window",
    onde_no_lab: "src/lib/circadiano.server.ts",
    maturidade: "implementada",
    secao: "cronjobs",
    cobertura: "parcial",
    nos_correspondentes: ["process-followups"],
  },
  {
    id: "campanhas-tag",
    nome: "Campanhas por tag",
    o_que_faz:
      "disparar-campanhas.ts: disparo segmentado por array overlap de tags",
    onde_no_lab: "src/routes/api/public/hooks/disparar-campanhas.ts",
    maturidade: "implementada",
    secao: "cronjobs",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "executar-acoes-agendadas",
    nome: "Executar ações agendadas",
    o_que_faz:
      "executar-acoes-agendadas.ts: processa fila acoes_agendadas com SKIP LOCKED",
    onde_no_lab: "src/routes/api/public/hooks/executar-acoes-agendadas.ts",
    maturidade: "implementada",
    secao: "cronjobs",
    cobertura: "tem",
    nos_correspondentes: ["process-followups"],
  },
  {
    id: "re-embedding-cron",
    nome: "Re-embedding cron",
    o_que_faz:
      "processar-reembedding.ts: reprocessa blocos com vetor_semantico stale",
    onde_no_lab: "src/routes/api/public/hooks/processar-reembedding.ts",
    maturidade: "implementada",
    secao: "cronjobs",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "pulso-proatividade",
    nome: "Pulso de proatividade",
    o_que_faz:
      "pulso-proatividade.ts: verifica leads elegíveis para contato proativo dentro da janela circadiana",
    onde_no_lab: "src/routes/api/public/hooks/pulso-proatividade.ts",
    maturidade: "INCERTO",
    secao: "cronjobs",
    cobertura: "?",
    nos_correspondentes: [],
  },

  // ─── 14. Infraestrutura de Conhecimento ───────────────────────────────────

  {
    id: "fila-pgmq",
    nome: "Fila PGMQ",
    o_que_faz:
      "pgmq.ts: fila durável no banco para tarefas assíncronas (embedding, re-engajamento)",
    onde_no_lab: "src/lib/pgmq.ts",
    maturidade: "implementada",
    secao: "infra-conhecimento",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "classificador-escopo",
    nome: "Classificador de escopo de proposta",
    o_que_faz:
      "classificador-escopo.server.ts: decide se proposta de aprendizado vai para agente/nicho/universal",
    onde_no_lab: "src/lib/classificador-escopo.server.ts",
    maturidade: "implementada",
    secao: "infra-conhecimento",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "clusterizador-aprendizados",
    nome: "Clusterizador de aprendizados emergentes",
    o_que_faz:
      "clusterizador-aprendizados.server.ts: agrupa propostas similares antes de promover ao cérebro coletivo",
    onde_no_lab: "src/lib/clusterizador-aprendizados.server.ts",
    maturidade: "implementada",
    secao: "infra-conhecimento",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "cerebro-coletivo",
    nome: "Cérebro coletivo (promoção)",
    o_que_faz:
      "Bloco promovido agente→nicho→universal; lógica de threshold e validação",
    onde_no_lab: "tese 17 + código de cron",
    maturidade: "implementada",
    secao: "infra-conhecimento",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "vocabulario-emergente-tags",
    nome: "Vocabulário emergente de tags",
    o_que_faz:
      "Tags nascem bottom-up nas conversas; limiar de promoção nicho→universal",
    onde_no_lab: "tese 18 + cron sono-noturno",
    maturidade: "implementada",
    secao: "infra-conhecimento",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "tinder-curadoria",
    nome: "Tinder de Curadoria (Fase 3)",
    o_que_faz:
      "Carrossel inline no chat do Mentor para aprovar/rejeitar propostas de aprendizado",
    onde_no_lab: "tese 32 + Generative UI tinder-curadoria",
    maturidade: "implementada",
    secao: "infra-conhecimento",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "snapshot-curadoria",
    nome: "Snapshot 24h de curadoria (undo)",
    o_que_faz:
      "Cada ação de curadoria grava snapshot; desfazer_ultima_acao reverte em até 24h",
    onde_no_lab: "tese 35 + chat.ts",
    maturidade: "implementada",
    secao: "infra-conhecimento",
    cobertura: "falta",
    nos_correspondentes: [],
  },

  // ─── 15. Interface do Agente (Workbench Lab) ──────────────────────────────

  {
    id: "generative-ui-framework",
    nome: "Generative UI framework",
    o_que_faz:
      "Síntese retorna ui_inline com componentes React materializados no chat; SSE streaming com metadata",
    onde_no_lab: "tese 29/31 + chat.ts",
    maturidade: "implementada",
    secao: "interface-workbench",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "componentes-ui-gerados",
    nome: "Componentes UI gerados",
    o_que_faz:
      "card-kpi, grupo-kpis, lista-leads, funil-de-vendas, tinder-curadoria, resumo-operacional",
    onde_no_lab:
      "src/components/ui-generativa/ (INCERTO — não confirmado diretamente)",
    maturidade: "INCERTO",
    secao: "interface-workbench",
    cobertura: "?",
    nos_correspondentes: [],
  },
  {
    id: "cerebro-ao-vivo",
    nome: "Cérebro ao vivo (workbench)",
    o_que_faz:
      "Painel lateral mostra estado interno: crenças, workspace, traces, score em tempo real",
    onde_no_lab: "tese 28/30 + frontend lab",
    maturidade: "parcial",
    secao: "interface-workbench",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "faixa-pensamento",
    nome: "Faixa de pensamento",
    o_que_faz:
      "Exibe CoT do agente (leitura_da_situacao, plano) visivelmente no Mentor",
    onde_no_lab: "tese 28 + frontend lab",
    maturidade: "parcial",
    secao: "interface-workbench",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "ficha-lead-ui",
    nome: "Ficha do Lead (UI)",
    o_que_faz:
      "Componente que mostra fichas_lead + score + tendência ao lado do chat",
    onde_no_lab: "tese 28/30 + frontend lab",
    maturidade: "parcial",
    secao: "interface-workbench",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "home-mentor-console",
    nome: "Home orientada ao Mentor (console-mode)",
    o_que_faz:
      "Home é o chat do Mentor como PID 1; sem dashboard tradicional",
    onde_no_lab: "tese 30",
    maturidade: "doc-only",
    secao: "interface-workbench",
    cobertura: "falta",
    nos_correspondentes: [],
  },
  {
    id: "sse-streaming",
    nome: "SSE streaming de resposta",
    o_que_faz:
      "Resposta entregue via Server-Sent Events com tokens em tempo real",
    onde_no_lab: "chat.ts ~L2350-2400",
    maturidade: "implementada",
    secao: "interface-workbench",
    cobertura: "falta",
    nos_correspondentes: [],
  },
];

/** Rótulos legíveis para cada seção */
export const SECAO_LABELS: Record<string, string> = {
  "infra-turno": "1. Infra de Turno",
  "porteiro-s1": "2. Porteiro S1",
  "recall-rag": "3. Recall / RAG",
  workspace: "4. Workspace Incremental",
  "bdi-tom": "5. BDI / Theory of Mind",
  "estado-afetivo": "6. Estado Afetivo",
  "sintese-s2": "7. Síntese S2",
  "anti-redundancia": "8. Anti-Redundância",
  "tools-react": "9. Tools / ReAct",
  "memoria-lp": "10. Memória Longo Prazo",
  consciencia: "11. Consciência Estendida",
  "cargos-identidade": "12. Cargos e Identidade",
  cronjobs: "13. Cronjobs / Automações",
  "infra-conhecimento": "14. Infra de Conhecimento",
  "interface-workbench": "15. Interface Workbench",
};
