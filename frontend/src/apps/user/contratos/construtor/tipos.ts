/**
 * Tipos v2 do construtor de template de contrato.
 * Espelha as colunas v2 da tabela `contratos_template` (DEC-037).
 * NÃO importar de @/apps/user/contratos/tipos — são mundos separados.
 */

// ---------------------------------------------------------------------------
// Campos do cliente (step 1 da jornada do lead)
// ---------------------------------------------------------------------------

export type TipoCampoCliente =
  | "texto"
  | "texto_longo"
  | "email"
  | "telefone"
  | "cpf"
  | "cnpj"
  | "data"
  | "numero";

export type IconeCampoCliente =
  | "user"
  | "id"
  | "mail"
  | "phone"
  | "map"
  | "hash";

export interface CampoCliente {
  /** Identificador técnico (sem espaço, sem acento). Vira token {{slug}} no editor. */
  slug: string;
  /** Texto que o lead vê no formulário. */
  rotulo: string;
  tipo: TipoCampoCliente;
  obrigatorio: boolean;
  icone: IconeCampoCliente;
}

// ---------------------------------------------------------------------------
// Produtos aceitos (preco vive no template, não no produto)
// ---------------------------------------------------------------------------

export interface ConfigParcelamento {
  entrada: number;
  max_parcelas: number;
  /** Pode ser > à vista quando há juros embutidos */
  valor_parcelado_total: number;
}

export interface ProdutoAceito {
  produto_id: string;
  preco_avista: number;
  parcelamento: ConfigParcelamento;
  /**
   * Campos que `derivar_template_v2` grava no banco e o tipo não declarava.
   * Opcionais porque item montado na tela pode nascer sem eles.
   */
  nome?: string;
  /** `true` = produto entrou na lista sem preço configurado (placeholder). */
  preco_pendente?: boolean;
}

// ---------------------------------------------------------------------------
// Pagamento
// ---------------------------------------------------------------------------

export type ModoPagamento = "unico" | "por_produto";
export type PosicaoPagamento = "before_sign" | "after_sign" | null;

export interface PagamentoConfig {
  modo: ModoPagamento;
  chave_pix: string | null;
  link_parcelamento: string | null;
  posicao_pagamento: PosicaoPagamento;
}

// ---------------------------------------------------------------------------
// Provas
// ---------------------------------------------------------------------------

export type InstrucaoSelfie =
  | ""
  | "mostrar_2_dedos"
  | "segurar_documento"
  | "documento_e_2_dedos";

export interface ProvasConfig {
  selfie: boolean;
  documento: boolean;
  assinatura_manuscrita: boolean;
  testemunha: boolean;
  num_testemunhas: number;
  instrucao_selfie: InstrucaoSelfie;
}

// ---------------------------------------------------------------------------
// Template v2 (espelho das colunas do banco)
// ---------------------------------------------------------------------------

export type PassoJornada =
  | "dados"
  | "pagamento"
  | "contrato"
  | "comprovante"
  | "selfie"
  | "documento"
  | "assinatura"
  | "testemunha";

export interface TemplateV2 {
  id: string;
  user_id: string;
  nome: string;
  ativo: boolean;
  /** JSON ProseMirror do editor — cláusulas que aparecem em todo contrato */
  conteudo_comum: ProseMirrorDoc | null;
  /** Mapa produto_id → nós ProseMirror do editor */
  clausulas_por_produto: Record<string, ProseMirrorNode[]> | null;
  campos_cliente: CampoCliente[];
  produtos_aceitos: ProdutoAceito[];
  pagamento: PagamentoConfig | null;
  provas: ProvasConfig | null;
  jornada_ordem: PassoJornada[];
}

// ---------------------------------------------------------------------------
// ProseMirror doc (subset tipado)
// ---------------------------------------------------------------------------

/** Nó básico ProseMirror/TipTap serializado como JSON. */
export interface ProseMirrorNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ProseMirrorNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

export interface ProseMirrorDoc {
  type: "doc";
  content: ProseMirrorNode[];
}

// ---------------------------------------------------------------------------
// Tokens — catálogo completo (spec §4)
// ---------------------------------------------------------------------------

export type ClasseToken =
  | "cliente"    // {{slug}} — lead preenche
  | "sistema"    // {TOKEN} — cálculo automático
  | "valor"      // {TOTAL_*}, {VALOR_PARCELA} etc
  | "condicional" // {COND_PAGAMENTO}
  | "produto";   // só em cláusula de produto

export type TipoToken = "inline" | "bloco";

export interface TokenInfo {
  token: string;
  rotulo: string;
  descricao: string;
  classe: ClasseToken;
  tipo: TipoToken;
  /** Se true, só pode ser usado dentro de uma cláusula de produto */
  apenas_em_produto?: boolean;
}

/** Catálogo completo de tokens do spec §4 */
export const CATALOGO_TOKENS: TokenInfo[] = [
  // -- Blocos de sistema --
  {
    token: "{ITENS_CONTRATADOS}",
    rotulo: "Itens contratados",
    descricao: "Tabela automática com os produtos do carrinho",
    classe: "sistema",
    tipo: "bloco",
  },
  {
    token: "{CLAUSULAS_POR_PRODUTO}",
    rotulo: "Cláusulas por produto",
    descricao: "Injeta cláusulas específicas de cada produto comprado",
    classe: "sistema",
    tipo: "bloco",
  },
  {
    token: "{COND_PAGAMENTO}",
    rotulo: "Condição de pagamento",
    descricao: "Mostra à vista ou parcelado conforme a escolha do lead",
    classe: "condicional",
    tipo: "bloco",
  },
  {
    token: "{ASSINATURAS}",
    rotulo: "Assinaturas",
    descricao: "Linhas de assinatura do contato e testemunhas",
    classe: "sistema",
    tipo: "bloco",
  },
  // -- Valores inline --
  {
    token: "{TOTAL_AVISTA}",
    rotulo: "Total à vista",
    descricao: "Soma dos preços à vista de todos os itens",
    classe: "valor",
    tipo: "inline",
  },
  {
    token: "{TOTAL_PARCELADO}",
    rotulo: "Total parcelado",
    descricao: "Soma dos totais parcelados de todos os itens",
    classe: "valor",
    tipo: "inline",
  },
  {
    token: "{NUMERO_PARCELAS}",
    rotulo: "Número de parcelas",
    descricao: "Escolha do lead (limitado por max_parcelas)",
    classe: "valor",
    tipo: "inline",
  },
  {
    token: "{VALOR_PARCELA}",
    rotulo: "Valor da parcela",
    descricao: "Total parcelado ÷ número de parcelas",
    classe: "valor",
    tipo: "inline",
  },
  // -- Tokens de produto (só em cláusula de produto) --
  {
    token: "{PRODUTO_NOME}",
    rotulo: "Nome do produto",
    descricao: "Nome do produto no contexto da cláusula",
    classe: "produto",
    tipo: "inline",
    apenas_em_produto: true,
  },
  {
    token: "{PRODUTO_QTD}",
    rotulo: "Quantidade",
    descricao: "Quantidade comprada deste produto",
    classe: "produto",
    tipo: "inline",
    apenas_em_produto: true,
  },
  {
    token: "{PRODUTO_PRECO_AVISTA}",
    rotulo: "Preço à vista (produto)",
    descricao: "Subtotal à vista deste produto (qtd × preço)",
    classe: "produto",
    tipo: "inline",
    apenas_em_produto: true,
  },
  {
    token: "{PRODUTO_PRECO_PARCELADO}",
    rotulo: "Preço parcelado (produto)",
    descricao: "Subtotal parcelado deste produto",
    classe: "produto",
    tipo: "inline",
    apenas_em_produto: true,
  },
];

/** Tokens inline de bloco (usados no BlockToken) */
export const TOKENS_BLOCO = CATALOGO_TOKENS.filter(
  (t) => t.tipo === "bloco"
).map((t) => t.token);

/** Mapa rápido token → info */
export const MAP_TOKENS: Record<string, TokenInfo> = Object.fromEntries(
  CATALOGO_TOKENS.map((t) => [t.token, t])
);

// ---------------------------------------------------------------------------
// Token → aba de configuração
// ---------------------------------------------------------------------------

/**
 * Qual aba do painel direito configura o valor que este token imprime.
 *
 * Pedido do Theus (2026-09-08): "ter como editar dentro do contrato e já ir às
 * configurações automaticamente". O dono lê o contrato, vê `{TOTAL_AVISTA}` no meio
 * do texto e não tem como saber em qual das 6 abas aquele número é definido — clicar
 * na pílula resolve isso.
 *
 * `null` = token que não tem configuração (texto puro do sistema).
 *
 * O tipo de retorno é `TabId` de `painel-direito/tabs.tsx`; não importo aqui pra não
 * criar ciclo (tabs → tipos → tabs), então repito os literais.
 */
export type AbaConfig = "preco" | "campos" | "pagamento" | "provas" | "lead";

export function abaDoToken(token: string): AbaConfig | null {
  // Campo do contato: `{{slug}}` — o dono edita a lista em "Campos do contato".
  if (/^\{\{.+\}\}$/.test(token)) return "campos";

  if (token === "{COND_PAGAMENTO}") return "pagamento";
  if (token === "{ASSINATURAS}") return "provas";

  const info = MAP_TOKENS[token];
  if (!info) return null;

  // Valor, produto e itens do carrinho saem todos da aba Preço.
  if (info.classe === "valor" || info.classe === "produto") return "preco";
  if (token === "{ITENS_CONTRATADOS}" || token === "{CLAUSULAS_POR_PRODUTO}") return "preco";

  return null;
}

/** Rótulo da aba, pro tooltip dizer aonde o clique leva. */
export const ROTULO_ABA: Record<AbaConfig, string> = {
  preco: "Preço",
  campos: "Campos do contato",
  pagamento: "Pagamento",
  provas: "Provas",
  lead: "Página do lead",
};

/** Evento que a pílula dispara e o construtor escuta pra trocar de aba. */
export const EVENTO_ABRIR_CONFIG = "contrato:abrir-config";
