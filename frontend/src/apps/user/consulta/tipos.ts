/**
 * Tipos, constantes e helpers compartilhados do app Consulta.
 * Domínio: consulta de documento (CPF/CNPJ) com carteira de crédito.
 */

import type React from "react";

// ---------------------------------------------------------------------------
// Interfaces de dados
// ---------------------------------------------------------------------------

export interface TipoConsulta {
  id: string;
  nome: string;
  descricao: string | null;
  codigo_api: string;
  tipo_doc: "cpf" | "cnpj" | "ambos";
  custo: number;
  ativo: boolean;
  ordem: number;
  // Esquema de validação do serviço na API externa (ex: { uf: "required", insumo: "array", "insumo.*": "in:acao,scpc_pf" }).
  // A aba Consultar deriva daqui os campos extras que o tenant precisa preencher (uf, insumo) antes de consultar.
  settings_api: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Params dinâmicos exigidos por serviço (derivados do settings_api do tipo)
// ---------------------------------------------------------------------------

export type CampoParam = {
  chave: string;
  obrigatorio: boolean;
  tipo: "uf" | "multiselect" | "texto";
  opcoes?: string[];
};

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

/**
 * Lê o `settings_api` do tipo e devolve os campos que o tenant precisa preencher.
 * Ignora `documento`/`tipo_documento` (já tratados) e as regras de item (`chave.*`).
 */
export function derivarCamposParams(settings: Record<string, unknown> | null | undefined): CampoParam[] {
  if (!settings || typeof settings !== "object") return [];
  const campos: CampoParam[] = [];
  for (const [chave, regra] of Object.entries(settings)) {
    if (chave === "documento" || chave === "tipo_documento" || chave.includes(".")) continue;
    const regraStr = String(regra ?? "");
    const obrigatorio = /required/.test(regraStr);
    const ehArray = /array/.test(regraStr) || `${chave}.*` in settings;
    if (ehArray) {
      const regraItem = String(settings[`${chave}.*`] ?? "");
      const m = regraItem.match(/in:([\w,]+)/);
      campos.push({ chave, obrigatorio, tipo: "multiselect", opcoes: m ? m[1].split(",") : [] });
    } else if (chave === "uf") {
      campos.push({ chave, obrigatorio, tipo: "uf" });
    } else {
      campos.push({ chave, obrigatorio, tipo: "texto" });
    }
  }
  return campos;
}

export interface Consulta {
  id: string;
  tipo_id: string;
  lead_id: string | null;
  conversa_id: string | null;
  chave_publica: string;
  origem: "manual" | "link";
  // Consulta criada via link começa sem documento/tipo (cliente preenche depois) → nullable.
  tipo_doc: "cpf" | "cnpj" | null;
  documento: string | null;
  status:
    | "rascunho"
    | "aguardando_pagamento"
    | "comprovante_enviado"
    | "validando"
    | "fila_revisao"
    | "consultando"
    | "concluida"
    | "erro"
    | "recusada";
  custo: number | null;
  preco: number | null;
  dados_cliente: Record<string, string> | null;
  url_selfie: string | null;
  url_documento: string | null;
  url_comprovante_pagamento: string | null;
  resultado: Record<string, unknown> | null;
  pdf_url: string | null;
  titulo: string | null;
  consultada_em: string | null;
  erro_motivo: string | null;
  created_at: string;
  lead?: {
    name: string | null;
    nome_exibicao: string | null;
    phone: string | null;
    url_foto_perfil: string | null;
  } | null;
}

export interface MovimentoCarteira {
  id: string;
  tipo: "credito" | "debito" | "estorno";
  valor: number;
  saldo_apos: number;
  consulta_id: string | null;
  recarga_id: string | null;
  created_at: string;
}

export interface PacoteCredito {
  id: string;
  nome: string;
  valor: number;
  credito: number;
  ativo: boolean;
  ordem: number;
}

export interface Recarga {
  id: string;
  pacote_id: string;
  valor: number;
  credito: number;
  chave_pix: string | null;
  url_comprovante: string | null;
  status: "aguardando" | "comprovante_enviado" | "aprovado" | "recusado";
  created_at: string;
}

export type Aba = "consultar" | "configuracoes" | "carteira" | "historico";
export type FiltroOrigem = "todos" | "manual" | "link";
export type FiltroStatus =
  | "todos"
  | "rascunho"
  | "aguardando_pagamento"
  | "comprovante_enviado"
  | "consultando"
  | "concluida"
  | "erro";

// ---------------------------------------------------------------------------
// Toast helper (resolve em runtime)
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
// Helpers de formatação
// ---------------------------------------------------------------------------

export function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Formata CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00) automaticamente. */
export function mascaraDoc(valor: string): string {
  const d = valor.replace(/\D/g, "");
  if (d.length <= 11) {
    // CPF
    return d
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  // CNPJ
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

/** Detecta se o documento (apenas dígitos) é CPF ou CNPJ. */
export function detectarTipoDoc(doc: string): "cpf" | "cnpj" {
  return doc.replace(/\D/g, "").length <= 11 ? "cpf" : "cnpj";
}

// ---------------------------------------------------------------------------
// Helpers de status / badge
// ---------------------------------------------------------------------------

export function badgeStatus(s: Consulta["status"]): {
  rotulo: string;
  cor: string;
  fundo: string;
} {
  switch (s) {
    case "concluida":
      return {
        rotulo: "Concluída",
        cor: "oklch(0.72 0.18 145)",
        fundo: "oklch(0.72 0.18 145 / 0.15)",
      };
    case "consultando":
      return {
        rotulo: "Consultando",
        cor: "oklch(0.7 0.18 220)",
        fundo: "oklch(0.7 0.18 220 / 0.15)",
      };
    case "aguardando_pagamento":
      return {
        rotulo: "Aguardando pgto",
        cor: "oklch(0.78 0.18 80)",
        fundo: "oklch(0.78 0.18 80 / 0.15)",
      };
    case "comprovante_enviado":
      return {
        rotulo: "Comprovante env.",
        cor: "oklch(0.75 0.16 60)",
        fundo: "oklch(0.75 0.16 60 / 0.15)",
      };
    case "validando":
      return {
        rotulo: "Validando",
        cor: "oklch(0.7 0.18 220)",
        fundo: "oklch(0.7 0.18 220 / 0.15)",
      };
    case "fila_revisao":
      return {
        rotulo: "Em revisão",
        cor: "oklch(0.78 0.18 80)",
        fundo: "oklch(0.78 0.18 80 / 0.15)",
      };
    case "recusada":
      return {
        rotulo: "Recusada",
        cor: "oklch(0.65 0.24 25)",
        fundo: "oklch(0.65 0.24 25 / 0.15)",
      };
    case "erro":
      return {
        rotulo: "Erro",
        cor: "oklch(0.65 0.24 25)",
        fundo: "oklch(0.65 0.24 25 / 0.15)",
      };
    default:
      return {
        rotulo: "Rascunho",
        cor: "oklch(0.98 0 0 / 0.55)",
        fundo: "oklch(0.98 0 0 / 0.05)",
      };
  }
}

export function badgeOrigem(o: "manual" | "link"): {
  rotulo: string;
  cor: string;
  fundo: string;
} {
  if (o === "link") {
    return {
      rotulo: "Link",
      cor: "oklch(0.65 0.22 280)",
      fundo: "oklch(0.65 0.22 280 / 0.15)",
    };
  }
  return {
    rotulo: "Manual",
    cor: "oklch(0.98 0 0 / 0.55)",
    fundo: "oklch(0.98 0 0 / 0.05)",
  };
}

export function nomeContato(c: Consulta): string | null {
  const fromLead = c.lead?.nome_exibicao || c.lead?.name;
  if (fromLead) return fromLead;
  const cd = c.dados_cliente || {};
  return cd.NOME_CLIENTE || cd.nome_completo || cd.nome || null;
}

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
