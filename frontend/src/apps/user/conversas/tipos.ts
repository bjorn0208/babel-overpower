/**
 * Tipos cravados da tela Conversas — Onda A (esqueleto mock).
 *
 * Onda B substitui mock por fontes reais Supabase:
 *  - Conversa ← public.conversas
 *  - Lead ← public.leads
 *  - Mensagem ← public.mensagens
 *  - Ficha ← public.fichas_lead + valores_ficha
 *  - Mente ← public.traces (raciocinio_interno) + public.prancheta (proxima_intencao)
 *  - Cargo ← public.cargos
 */

export type AbaDossie =
  | "mente"
  | "quem"
  | "financeiro"
  | "operacao"
  | "compromissos"
  | "aprendizado"
  | "agente";

export type CargoTipologia =
  | "atendimento"
  | "mentor"
  | "vendedor"
  | "financeiro"
  | "suporte"
  | "admin";

export type StatusConversa =
  | "ativa"
  | "aguardando"
  | "pausada"
  | "encerrada";

export type EstadoPessoa =
  | "lead"
  | "cliente"
  | "em_campanha"
  | "cliente_em_campanha";

/**
 * Item da Prancheta do cargo — formato OFICIAL Ragentic
 * (`arquivo/referencias/ragentic-plano/.../25-cargos-prancheta-diretrizes.md`).
 *
 *  - `obrigatorio: true`  → conta na Cobertura, vira checklist com ✓/○
 *  - `obrigatorio: false` → opcional, vira chip discreto (não bloqueia score)
 *  - cargos legados em string puro são tratados como obrigatórios (default).
 */
export interface CampoCargo {
  chave: string;
  descricao?: string;
  obrigatorio?: boolean;
}

export interface Cargo {
  id: string;
  nome: string;
  tipologia: CargoTipologia;
  cor_acento: string;
  /** Bússola do cargo — texto longo descrevendo o que o cargo faz e como.
   *  Fonte: `public.cargos.objetivo_principal`. Briefing §1264 — aparece sob o nome.
   */
  objetivo_principal?: string;
  /** Regras livres cravadas pelo tenant na Curadoria — fluxo, proibições, exemplos.
   *  Fonte: `public.cargos.regras_livres`. Onda 2026-05-14 — colapsável em <details> na AbaMente.
   *  Vendedor Carol tem 1468 chars de FLUXO Excellence cravado (Saudação→Qualificação→Apresentação→Negociação→Fechado).
   */
  regras_livres?: string;
  /** Template da Prancheta — lista de campos rastreados, com obrigatório vs opcional.
   *  Fonte: `public.cargos.campos_rastreio` jsonb (`[{chave, descricao, obrigatorio}]`).
   *  Briefing §1265: pra cada campo, lê `leads.dados_ficha[chave]` pra valor capturado.
   *  Cobertura = obrigatórios preenchidos / total de obrigatórios × 100.
   */
  campos_rastreio?: CampoCargo[];
}

/**
 * Fato persistente sobre o lead — Onda 2026-05-14 A1.
 * Fonte: `public.memoria_lead`. Extrator Sistema 1 escreve a cada turno
 * (com confianca >= 0.6 + evidencia_literal validada). Cron destila curto→longo 06h UTC.
 */
export interface FatoLead {
  id: string;
  fato: string;
  categoria: "fato_biografico" | "fato_financeiro" | "objecao" | "interesse" | "historico_negociacao";
  relevancia: "alta" | "media" | "baixa";
  confianca: number;
  valido_desde?: string | null;
  criado_em: string;
  escopo: "curto" | "longo";
}

/**
 * Episódio passado com o lead — Onda 2026-05-14 A2.
 * Fonte: `public.memoria_episodica`. Síntese escreve inline em mudança forte.
 */
export interface Episodio {
  id: string;
  episodio_resumo: string;
  gancho?: string | null;
  emocao?: string | null;
  outcome?: string | null;
  decay_factor: number;
  relevancia: number;
  turno_inicio: number;
  turno_fim: number;
  criado_em: string;
}

/**
 * Alerta no dossiê — Onda 2026-05-14 B3.
 * Fonte: RPC `fn_alertas_dossie(p_lead_id)`. Severity: vermelho > amarelo > verde.
 */
export interface AlertaDossie {
  tipo: "pagamento_pendente" | "contrato_pendente_assinatura" | "compromisso_vencido" | "lead_frio";
  severity: "vermelho" | "amarelo" | "verde";
  msg: string;
}

/**
 * Autor humano de uma mensagem com `papel: "humano"` — o tenant ou um membro
 * da equipe dele que respondeu pelo mesmo WhatsApp do agente.
 *
 * Fonte: `mensagens.carga.sender` (`{ name, cargo, avatar_url }`) + `mensagens.sender_id`.
 * Hoje 100% das mensagens `role='human'` no banco já têm esse dado preenchido.
 */
export interface AutorHumano {
  /** `mensagens.sender_id` — id do profile que enviou (pode faltar em msg legada). */
  id?: string;
  /** Nome de exibição do autor. */
  nome: string;
  /** Cargo cadastrado no perfil (`profiles.cargo`) — pode ser nulo/vazio. */
  cargo?: string | null;
  /** URL da foto de perfil do autor — pode faltar (cai pra iniciais). */
  foto_url?: string | null;
}

export interface Mensagem {
  id: string;
  conversa_id: string;
  papel: "lead" | "agente" | "humano" | "sistema";
  tipo: "texto" | "audio" | "imagem" | "video" | "documento" | "sticker" | "localizacao" | "contato";
  /** Texto da mensagem (sempre presente, mesmo em mídia — pode ser legenda ou descrição) */
  conteudo: string;
  /** URL público/assinado da mídia (Storage). Onda B.4: vem de `mensagens.midia_url`. */
  midia_url?: string;
  /** Nome do arquivo (para documentos, mostrado na bolha) */
  nome_arquivo?: string;
  /** Duração em segundos (para áudio e vídeo) */
  duracao_segundos?: number;
  /** Tamanho em bytes (para documentos) */
  tamanho_bytes?: number;
  /** Localização recebida (papel "lead"): coordenadas + endereço textual. */
  local?: { lat: number; lng: number; endereco?: string };
  /** Contato (vCard) recebido: nome + telefone(s). */
  contato?: { nome: string; telefones: string[] };
  /** Tempo real (ms) que esta bolha ficou "digitando" antes de aparecer.
   *  Preenchido só pelo Chat-Teste (render escalonado) — instrumentação pra
   *  mensurar a variação do ritmo humanizado. App Conversas não usa. */
  duracao_digitacao_ms?: number;
  /** Identidade do autor quando `papel === "humano"` (tenant ou membro da
   *  equipe que respondeu pelo WhatsApp do agente). `undefined` nos demais papéis. */
  autor?: AutorHumano;
  criado_em: string;
  lido: boolean;
  enviado: boolean;
  /** Envio pro WhatsApp falhou — o texto ficou salvo mas o lead NÃO recebeu.
   *  Pinta o selo "não entregue" + botão de reenviar na bolha. Sem isso a
   *  mensagem parece entregue e o atendente segue a conversa no vazio. */
  falhou?: boolean;
}

/**
 * Ação pretendida pelo agente no próximo turno.
 * Estrutura cravada do Ragentic original (faixa-de-pensamento.tsx).
 * Renderiza como badge curto no header da Mente.
 */
export type AcaoPretendida =
  | "responder_e_aguardar"
  | "fazer_pergunta_de_qualificacao"
  | "oferecer"
  | "fechar"
  | "agendar_retorno"
  | "escalar_humano"
  | "esperar_silencio"
  | "registrar_e_seguir";

export const ROTULO_ACAO: Record<AcaoPretendida, string> = {
  responder_e_aguardar: "responder e aguardar",
  fazer_pergunta_de_qualificacao: "qualificar",
  oferecer: "oferecer",
  fechar: "fechar",
  agendar_retorno: "agendar retorno",
  escalar_humano: "escalar p/ humano",
  esperar_silencio: "esperar silêncio",
  registrar_e_seguir: "registrar e seguir",
};

export interface PlanoTurno {
  turno: number;
  o_que_fazer: string;
  por_que: string;
}

/**
 * Pensamento estruturado do agente — Sistema 2 visível.
 * Fonte real (Onda B): public.intencoes_pendentes (id, conversa_id, intencao, dados jsonb).
 * Fallback: derivar de public.prancheta (belief + resumo_agente) quando intencoes vazia.
 */
export interface Pensamento {
  id: string;
  proxima_intencao: string;
  acao_pretendida: AcaoPretendida;
  leitura_da_situacao: string | null;
  motivo: string | null;
  quando_voltar: string | null;
  plano_proximos_turnos: PlanoTurno[];
  criado_em: string;
}

export interface CompromissoAtivo {
  id: string;
  titulo: string;
  prometido_em: string;
  vencimento_iso?: string;
}

export interface MenteAgente {
  cargo_ativo: Cargo;
  pensamento: Pensamento;
  tags: string[];
  dados_capturados: Record<string, string | number | null>;
  prancheta_belief: Record<string, unknown>;
  confianca_atual: number;
  /** Escala 0-100 · vem de `conversas.score_lead`. */
  score_lead: number;
  /** Escala 0-100 · porcentagem do template de prancheta preenchido. Derivado. */
  cobertura_prancheta: number;
  /** Promessas pendentes do agente que ainda não foram cumpridas. */
  compromissos_ativos: CompromissoAtivo[];
  /** Onda 2026-05-14 A1: fatos persistentes sobre o lead (memoria_lead via RAG-FIRST).
   *  Frontend renderiza top-10 agrupados por categoria na AbaMente. Hidratação via RPC.
   */
  fatos_do_lead?: FatoLead[];
  /** Onda 2026-05-14 A2: episódios passados (memoria_episodica via RAG-FIRST).
   *  Frontend renderiza timeline na AbaQuem. Hidratação via RPC.
   */
  episodios?: Episodio[];
  /** Onda 2026-05-14 B3: alertas calculados via RPC fn_alertas_dossie(lead_id). */
  alertas?: AlertaDossie[];
  atualizado_em: string;
}

export interface Contrato {
  id: string;
  titulo: string;
  valor_total: number;
  parcelas_pagas: number;
  parcelas_total: number;
  status: "ativo" | "atrasado" | "concluido" | "rascunho";
  chave_publica?: string;
  data_assinatura?: string;
}

export interface Pagamento {
  id: string;
  contrato_id?: string;
  valor: number;
  data: string;
  metodo: "pix" | "boleto" | "cartao";
  status: "pago" | "pendente" | "atrasado";
  comprovante_url?: string;
}

export interface Pedido {
  id: string;
  titulo: string;
  valor: number;
  status: "rascunho" | "enviado" | "aprovado" | "fechado";
  criado_em: string;
}

export interface Compromisso {
  id: string;
  titulo: string;
  data_iso: string;
  status: "agendado" | "realizado" | "cancelado";
  observacao?: string;
}

export interface CampanhaInfo {
  id: string;
  nome: string;
  fase_atual: string;
  fase_indice: number;
  total_fases: number;
}

export interface EventoTimeline {
  id: string;
  tipo:
    | "conversa_iniciada"
    | "cargo_trocado"
    | "contrato_assinado"
    | "pagamento_recebido"
    | "campanha_iniciada"
    | "campanha_terminada"
    | "compromisso_marcado";
  rotulo: string;
  data_iso: string;
}

export interface MemoriaLonga {
  resumo: string;
  pontos_chave: string[];
  engajamento_score: number;
  primeiro_contato_iso: string;
}

export interface Lead {
  id: string;
  nome: string;
  telefone: string;
  foto_url?: string;
  canal: "whatsapp" | "instagram" | "site";
  estado: EstadoPessoa;
  /** Produto/serviço contratado · `leads.produto`. Vazio = ainda não definido. */
  produto?: string | null;
  /** Token público do link de acompanhamento · `leads.chave_rastreamento` (uuid). */
  chave_rastreamento?: string | null;
  /** Quando virou cliente · `leads.converted_at`. Null = ainda lead. */
  converted_at?: string | null;
  /** Tem contrato com `contratos.assinado_em` preenchido · pílula "Contratos assinados". */
  tem_contrato_assinado?: boolean;
  /** Fase do funil · `leads.fase_pipeline`. 'desistiu' = gate de desistência desligou a IA. */
  fase_pipeline?: string | null;
  /** Tag viva: nome da pasta da Base onde o contato vive · join `leads.pasta_base_id → pastas_base.nome`. */
  pasta_base_nome?: string | null;
  memoria_longa: MemoriaLonga;
  timeline: EventoTimeline[];
}

export interface Conversa {
  id: string;
  lead: Lead;
  status: StatusConversa;
  agente_ligado: boolean;
  cargo_ativo: Cargo;
  /** Membro da equipe responsável pela conversa · null = sem dono · Onda B: conversas.responsavel_id */
  responsavel_id?: string | null;
  ultima_mensagem_em: string;
  preview_ultima_mensagem: string;
  mensagens_nao_lidas: number;
  mente: MenteAgente;
  mensagens: Mensagem[];
  contratos: Contrato[];
  pagamentos: Pagamento[];
  pedidos: Pedido[];
  campanha_atual?: CampanhaInfo;
  compromissos: Compromisso[];
}

/**
 * Pílulas de filtro = vistas sobre o mesmo pool de conversas.
 * Quando o cargo da conversa muda, ela MIGRA visualmente entre pílulas (funil em movimento).
 *
 * Mapeamento real (reconectado ao banco 2026-05-18):
 *  - todas       → sem filtro
 *  - atendimento → cargo.tipologia === "atendimento"
 *  - vendas      → cargo.nome === "Vendedor" (tipologia real no banco é "face_cliente")
 *  - clientes    → lead.estado in (cliente, cliente_em_campanha) · leads.location='cliente'
 *  - contratos   → lead.tem_contrato_assinado (contratos.assinado_em preenchido)
 */
export type FiltroPilula =
  | "todas"
  | "atendimento"
  | "vendas"
  | "clientes"
  | "contratos"
  | "instagram";

export interface MembroEquipe {
  id: string;
  nome: string;
  cargo_funcional: string;
  foto_url?: string;
  ativo: boolean;
}

export interface ConversasProps {
  onAbrirApp?: (slug: string, props?: Record<string, unknown>) => void;
}
