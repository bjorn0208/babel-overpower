/**
 * Tipos do app Rifas — espelham o banco real (tabelas `rifas`,
 * `pedidos_rifa`, `rifas_config_tenant` e o retorno de `obter_rifa_por_token`).
 * Valores monetários sempre em centavos, como no banco.
 */

export type StatusRifa = "rascunho" | "ativa" | "pausada" | "encerrada" | "sorteada";

export type StatusPedidoRifa =
  | "reservado"
  | "aguardando_validacao"
  | "pago"
  | "expirado"
  | "cancelado"
  | "rejeitado";

export type OrigemPedidoRifa = "link" | "agente" | "manual";

export type MetodoSorteio = "loteria_federal" | "plataforma" | "ppt" | "ptm" | "pt_rio" | "ptv" | "ptn" | "corujinha";

/** Campos vivos da rifa que o schema tipado ainda não conhece (drift):
 *  numeração desde zero (00–99) e prêmios extras (2º, 3º prêmio...). */
export interface RifaExtras {
  numeracao_desde_zero?: boolean | null;
  premios_extras?: string[] | null;
}

/** Número fixado pelo dono pra um tipo de sorteio — vale pra toda rifa desse tipo. */
export interface NumeroFixoRifa {
  id: string;
  metodo_sorteio: MetodoSorteio;
  numero: number;
  nome: string;
  phone: string | null;
  created_at: string;
  /** 'pendente' = pedido que o CLIENTE fez pela conversa e espera o dono aprovar.
   *  Pendente não reserva número nenhum: até aprovar, o número segue à venda. */
  status?: "ativo" | "pendente";
  solicitado_em?: string | null;
  solicitado_por_conversa?: string | null;
}

/** Dívida gerada no sorteio: número (fixo ou reservado) que não foi pago. */
export interface DividaRifa {
  id: string;
  rifa_id: string;
  numero: number;
  nome: string;
  phone: string | null;
  valor_centavos: number;
  origem: "fixo" | "reserva";
  pago: boolean;
  sorteio_em: string;
}

export interface PromocaoRifa {
  qtd: number;
  preco_total_centavos: number;
}

export interface CotaPremiada {
  numero: number;
  premio: string;
  pedido_ganhador?: string | null;
  ganhador_nome?: string | null;
}

export interface Rifa {
  id: string;
  tenant_id: string;
  titulo: string;
  descricao: string | null;
  imagem_url: string | null;
  galeria_urls: string[];
  premio_principal: string;
  total_numeros: number;
  preco_numero_centavos: number;
  promocoes: PromocaoRifa[];
  cotas_premiadas: CotaPremiada[];
  status: StatusRifa;
  chave_publica: string;
  data_sorteio_prevista: string | null;
  metodo_sorteio: MetodoSorteio;
  numero_sorteado: number | null;
  ganhador_nome: string | null;
  ganhador_phone: string | null;
  sorteada_em: string | null;
  minutos_reserva: number;
  max_numeros_por_pedido: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // vivos no banco (drift do schema tipado):
  numeracao_desde_zero?: boolean | null;
  premios_extras?: string[] | null;
  /** Código legível pra controle (Theus 2026-09-02) — R{DD}{MM}{AA}{NN}, gerado sozinho ao criar. */
  codigo_controle?: string | null;
}

export interface PedidoRifa {
  id: string;
  rifa_id: string;
  tenant_id: string;
  chave_publica: string;
  nome: string;
  /** Nullable (2026-09-01): pedido `origem=manual` vindo de número fixo sem
   * telefone cadastrado é caso de uso legítimo. */
  phone: string | null;
  lead_id: string | null;
  conversa_id: string | null;
  origem: OrigemPedidoRifa;
  qtd_numeros: number;
  numeros: number[];
  valor_centavos: number;
  status: StatusPedidoRifa;
  comprovante_url: string | null;
  motivo_rejeicao: string | null;
  /** Prazo de pagamento da reserva — desde 10/09, 1h antes do sorteio quando a rifa tem data. */
  expira_em: string | null;
  pago_em: string | null;
  /** Reserva vencida lançada como dívida (pelo dono, ou pela cron antiga até 10/09). */
  divida_gerada_em?: string | null;
  /** Dono decidiu não cobrar a reserva vencida — o sorteio não gera dívida dela. */
  divida_dispensada_em?: string | null;
  /** Quando o dono foi avisado no sino de que a reserva venceu sem pagamento. */
  aviso_dono_em?: string | null;
  /** Desistência com reembolso: último reembolso, total devolvido, números que saíram e o motivo. */
  reembolsado_em?: string | null;
  reembolso_centavos?: number;
  numeros_reembolsados?: number[];
  motivo_reembolso?: string | null;
  /** Coluna gerada no banco: `coalesce(pago_em, updated_at)` — usada pra separar
   * "Todos" (ativos + concluídos há &lt;24h) de "Histórico" (concluídos há mais tempo). */
  concluido_em: string;
  created_at: string;
  updated_at: string;
}

/** Stats derivadas dos pedidos de uma rifa (agregação client-side). */
export interface StatsRifa {
  /** Números pagos. */
  vendidos: number;
  /** Números em reserva ou aguardando validação. */
  reservados: number;
  arrecadadoCentavos: number;
  /** Phones distintos com pedido pago. */
  participantes: number;
}

/** Retorno de `obter_rifa_por_token` (vitrine pública — sem tenant_id). */
export interface DetalheRifa {
  ok: boolean;
  rifa: {
    titulo: string;
    descricao: string | null;
    imagem_url: string | null;
    galeria_urls?: string[];
    premio_principal: string;
    total_numeros: number;
    preco_numero_centavos: number;
    promocoes: PromocaoRifa[];
    status: string;
    data_sorteio_prevista: string | null;
    metodo_sorteio: string;
    max_numeros_por_pedido: number;
    minutos_reserva: number;
  };
  progresso: { pagos: number; reservados: number; disponiveis: number };
  /** Presente só quando total_numeros ≤ 1000 (grid consciente). */
  numeros_ocupados: number[] | null;
  ultimas_compras: Array<{ nome_mascarado: string; qtd: number; minutos_atras: number }>;
  ranking: Array<{ nome: string; phone_mascarado: string; qtd: number }>;
  cotas_premiadas: Array<{ numero: number; premio: string; ganho: boolean; ganhador_nome: string | null }>;
  resultado: { numero_sorteado: number; ganhador_nome: string | null; sorteada_em: string } | null;
  chave_pix: string | null;
}

export interface ConfigRifas {
  agente_pode_vender: boolean;
  chave_pix: string | null;
  /** Cron posta resumo/arte das rifas ativas no Status do WhatsApp a cada 30 min. */
  postar_status_ativo: boolean;
  /** Ritual bom-dia: saudação 7h oferecendo a rifa (opt-in) + follow-up 12h sem resposta. */
  bom_dia_rifa_ativo: boolean;
  /** Texto customizado (null = usa o padrão da edge). Placeholders: saudação
   * {{titulo}} {{premio}}; followup soma {{vendidos}} {{restam}} {{preco}} {{link}}. */
  bom_dia_mensagem_saudacao: string | null;
  bom_dia_mensagem_followup: string | null;
  /** Mídia própria (imagem/vídeo) — null = saudação fica só texto, followup
   * cai pra arte de divulgação automática (comportamento de antes). */
  bom_dia_midia_saudacao_url: string | null;
  bom_dia_midia_followup_url: string | null;
  /** Última vez que o Status foi postado (leitura — vem do cron). */
  ultimoPostStatusEm?: string | null;
}

/** Carga do wizard de criar/editar (colunas editáveis de `rifas`). */
export interface CargaRifa {
  titulo: string;
  descricao: string | null;
  imagem_url: string | null;
  galeria_urls: string[];
  premio_principal: string;
  total_numeros: number;
  preco_numero_centavos: number;
  promocoes: PromocaoRifa[];
  cotas_premiadas: CotaPremiada[];
  data_sorteio_prevista: string | null;
  metodo_sorteio: MetodoSorteio;
  minutos_reserva: number;
  max_numeros_por_pedido: number;
  premios_extras: string[];
  numeracao_desde_zero: boolean;
}
