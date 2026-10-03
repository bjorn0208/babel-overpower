/**
 * Tipos e helpers do app Financeiro.
 * Domínio: livro-caixa do dono (movimentos) + documentos (comprovante/extrato)
 * alimentados pelo assistente financeiro via WhatsApp (cargo Financeiro).
 */

import type React from "react";

// ---------------------------------------------------------------------------
// Interfaces de dados
// ---------------------------------------------------------------------------

export interface MovimentoFinanceiro {
  id: string;
  owner_id: string;
  tipo: "entrada" | "saida";
  valor: number;
  descricao: string | null;
  categoria: string | null;
  categoria_id: string | null;
  data_movimento: string | null;
  origem: "manual" | "agente_wpp" | "comprovante" | "extrato";
  documento_id: string | null;
  lead_id: string | null;
  criado_em: string;
  documento?: { storage_path: string | null; tipo: string } | null;
}

export interface ConfigFinanceiro {
  numero_dono: string;
  ativo: boolean;
}

export type Aba = "movimentos" | "pastas" | "contas" | "receber" | "metas" | "consultoria" | "conversa" | "configuracoes";

// ---------------------------------------------------------------------------
// Toast helper (resolve em runtime — mesmo padrão do app Consulta)
// ---------------------------------------------------------------------------

export interface ToastApi {
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
}

export function pegarToast(): ToastApi {
  const w = window as unknown as { useToast?: () => ToastApi };
  return w.useToast?.() ?? { success: () => {}, error: () => {}, info: () => {} };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseBruto = any;

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

export function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "2026-07" → "julho de 2026" */
export function rotuloMes(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(ano, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

/** Mês corrente em BRT no formato YYYY-MM. */
export function mesAtual(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

/** Soma delta meses a um YYYY-MM. */
export function somarMes(mes: string, delta: number): string {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(ano, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function badgeOrigem(o: MovimentoFinanceiro["origem"]): { rotulo: string; cor: string; fundo: string } {
  switch (o) {
    case "comprovante":
      return { rotulo: "Comprovante", cor: "oklch(0.7 0.18 220)", fundo: "oklch(0.7 0.18 220 / 0.15)" };
    case "extrato":
      return { rotulo: "Extrato", cor: "oklch(0.65 0.22 280)", fundo: "oklch(0.65 0.22 280 / 0.15)" };
    case "agente_wpp":
      return { rotulo: "WhatsApp", cor: "oklch(0.72 0.18 145)", fundo: "oklch(0.72 0.18 145 / 0.15)" };
    default:
      return { rotulo: "Manual", cor: "oklch(0.98 0 0 / 0.55)", fundo: "oklch(0.98 0 0 / 0.05)" };
  }
}

// ---------------------------------------------------------------------------
// Estilo base de input (design glass dark — mesmo idioma do app Consulta)
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
