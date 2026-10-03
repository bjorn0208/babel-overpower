/**
 * Tipos, constantes e helpers compartilhados do app Contratos.
 * Mantém o que era inline no monolito — sem lógica de UI aqui.
 */

import type React from "react";

// ---------------------------------------------------------------------------
// Interfaces de dados
// ---------------------------------------------------------------------------

export interface Contrato {
  id: string;
  chave_publica: string;
  titulo: string | null;
  status: string;
  origem: string | null;
  created_at: string;
  assinado_em: string | null;
  dados_cliente: Record<string, string> | null;
  dados_signatario: Record<string, string> | null;
  pdf_url: string | null;
  conversa_id: string | null;
  lead_id: string | null;
  url_selfie: string | null;
  url_documento: string | null;
  url_selfie_testemunha: string | null;
  url_documento_testemunha: string | null;
  url_comprovante_pagamento: string | null;
  lead?: {
    name: string | null;
    nome_exibicao: string | null;
    phone: string | null;
    url_foto_perfil: string | null;
  } | null;
}

/**
 * Campos que dirigem os passos da página pública de assinatura.
 * Compartilhado pelo montador de template (`TemplateContrato`) e pelo
 * gerador livre (`aba-gerador`) — mesma UI (`PainelRecursos`), mesmo destino
 * (`contratos`/`contratos_template`).
 */
export interface RecursosEditaveis {
  campos_obrigatorios: string[];
  instrucao_selfie: string | null;
  num_testemunhas: number;
  chave_pix: string | null;
  link_parcelamento: string | null;
  /** Literais aceitos pela página pública: "before_sign" | "antes_assinatura" = antes; qualquer outro = depois */
  posicao_pagamento: string | null;
}

export interface TemplateContrato extends RecursosEditaveis {
  id: string;
  user_id: string;
  produto_id: string | null;
  nome: string;
  conteudo: string;
  ativo: boolean;
  opcoes_parcelamento: Array<Record<string, unknown>>;
  valor_a_vista: number | null;
  placeholders: Array<{ nome: string; descricao?: string; tipo?: string }>;
}

export interface OpcaoParcelamento {
  entrada: number;
  parcelas: number;
  valor_parcela: number;
}

export interface ProdutoResumo {
  id: string;
  nome: string;
}

export type Aba = "gerador" | "templates" | "historico" | "validade";
export type FiltroOrigem = "todos" | "agente" | "manual";
export type FiltroStatus = "assinados" | "validar" | "pendentes" | "todos";

// ---------------------------------------------------------------------------
// Toast helper (resolve em runtime)
// ---------------------------------------------------------------------------

export interface ToastApi {
  success: (m: string) => void;
  error: (m: string) => void;
}

export function pegarToast(): ToastApi {
  const w = window as unknown as { useToast?: () => ToastApi };
  return w.useToast?.() ?? { success: () => {}, error: () => {} };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseBruto = any;

// ---------------------------------------------------------------------------
// Helpers de status / badge
// ---------------------------------------------------------------------------

export function statusAssinado(s: string): boolean {
  return s === "signed" || s === "assinado";
}
export function statusValidar(s: string): boolean {
  return s === "awaiting_validation" || s === "aguardando_validacao";
}
export function statusRejeitado(s: string): boolean {
  return s === "rejected" || s === "rejeitado";
}

export function badgeStatus(s: string): { rotulo: string; cor: string; fundo: string } {
  if (statusAssinado(s)) return { rotulo: "Assinado", cor: "oklch(0.72 0.18 145)", fundo: "oklch(0.72 0.18 145 / 0.15)" };
  if (statusValidar(s)) return { rotulo: "Validar", cor: "oklch(0.7 0.18 220)", fundo: "oklch(0.7 0.18 220 / 0.15)" };
  if (statusRejeitado(s)) return { rotulo: "Rejeitado", cor: "oklch(0.65 0.24 25)", fundo: "oklch(0.65 0.24 25 / 0.15)" };
  return { rotulo: "Pendente", cor: "oklch(0.78 0.18 80)", fundo: "oklch(0.78 0.18 80 / 0.15)" };
}
export function badgeOrigem(o: string | null): { rotulo: string; cor: string; fundo: string } {
  if (o === "agente") return { rotulo: "Agente", cor: "oklch(0.65 0.22 280)", fundo: "oklch(0.65 0.22 280 / 0.15)" };
  return { rotulo: "Manual", cor: "oklch(0.98 0 0 / 0.55)", fundo: "oklch(0.98 0 0 / 0.05)" };
}

export function nomeContato(c: Contrato): string | null {
  const fromLead = c.lead?.nome_exibicao || c.lead?.name;
  if (fromLead) return fromLead;
  const sd = c.dados_signatario || {};
  const cd = c.dados_cliente || {};
  return (
    sd.NOME_CLIENTE || sd.nome_completo || sd.nome ||
    cd.NOME_CLIENTE || cd.nome_completo || cd.nome ||
    null
  );
}

// ---------------------------------------------------------------------------
// Constantes de query
// ---------------------------------------------------------------------------

// `texto_contrato` NÃO entra — pode ter dezenas de KB por contrato.
// Lazy load só quando precisar exibir. `dados_cliente`/`dados_signatario`
// ficam porque `nomeContato()` os usa como fallback quando lead sem nome.
export const COLUNAS =
  "id, chave_publica, titulo, status, origem, created_at, assinado_em, " +
  "dados_cliente, dados_signatario, pdf_url, conversa_id, lead_id, " +
  "url_selfie, url_documento, url_selfie_testemunha, url_documento_testemunha, " +
  "url_comprovante_pagamento, lead:leads(name, nome_exibicao, phone, url_foto_perfil)";

// ---------------------------------------------------------------------------
// Estilo base de input (design glass dark)
// ---------------------------------------------------------------------------

export const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: 12,
  background: "oklch(0.18 0.06 280 / 0.4)",
  color: "oklch(0.98 0 0)",
  border: "1px solid oklch(0.98 0 0 / 0.1)",
  borderRadius: 10,
  outline: "none",
};
