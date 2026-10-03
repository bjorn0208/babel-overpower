/**
 * Tipos, interfaces e helpers do app admin de Consulta.
 * Espelha os campos do plano de banco — sem lógica de UI aqui.
 */

import type React from "react";

// ---------------------------------------------------------------------------
// Interfaces de dados
// ---------------------------------------------------------------------------

export interface TipoConsulta {
  id: string;
  nome: string;
  descricao: string | null;
  /** Identificador do tipo na API externa de consulta */
  codigo_api: string;
  tipo_doc: "cpf" | "cnpj" | "ambos";
  /** Preço em R$ cobrado do tenant por consulta (debitado da carteira) */
  custo: number;
  /** Custo bruto na API externa (Motor de Crédito) — referência de margem */
  sale_api: number | null;
  ativo: boolean;
  ordem: number;
}

export interface ConfigApi {
  id: string;
  provedor: string;
  url_base: string;
  /** Nome do secret no vault — nunca armazenar o token em texto plano */
  secret_nome: string;
  ativo: boolean;
}

export interface PacoteCredito {
  id: string;
  nome: string;
  /** Valor em R$ que o tenant paga para adquirir o pacote */
  valor: number;
  /** Saldo em R$ creditado na carteira do tenant após aprovação */
  credito: number;
  ativo: boolean;
  ordem: number;
}

export interface Recarga {
  id: string;
  tenant_id: string;
  pacote_id: string;
  valor: number;
  credito: number;
  url_comprovante: string | null;
  status: "aguardando" | "comprovante_enviado" | "aprovado" | "recusado";
  created_at: string;
  tenant?: { full_name?: string | null; avatar_url?: string | null } | null;
}

// ---------------------------------------------------------------------------
// Tipos de navegação
// ---------------------------------------------------------------------------

export type Secao = "tipos" | "api" | "pacotes" | "recargas" | "rag";

// ---------------------------------------------------------------------------
// Toast helper (resolve em runtime — mesmo padrão de contratos/tipos.ts)
// ---------------------------------------------------------------------------

export interface ToastApi {
  success: (m: string) => void;
  error: (m: string) => void;
  warning?: (m: string) => void;
}

export function pegarToast(): ToastApi {
  const w = window as unknown as { useToast?: () => ToastApi };
  return w.useToast?.() ?? { success: () => {}, error: () => {} };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseBruto = any;

// ---------------------------------------------------------------------------
// Helpers de formatação
// ---------------------------------------------------------------------------

export function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatTipoDoc(t: TipoConsulta["tipo_doc"]): string {
  const mapa: Record<TipoConsulta["tipo_doc"], string> = {
    cpf: "Só CPF",
    cnpj: "Só CNPJ",
    ambos: "CPF e CNPJ",
  };
  return mapa[t];
}

// ---------------------------------------------------------------------------
// Estilo base de input (design glass dark — idêntico ao de contratos/tipos.ts)
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
