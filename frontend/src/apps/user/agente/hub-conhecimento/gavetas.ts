/**
 * Descritor das 9 gavetas de CONTEÚDO do agente (hub Conhecimento).
 *
 * Cada gaveta mapeia uma tabela `blocos_*` (ou equivalente) que o motor lê via
 * `busca_hibrida_*`. O hub deixa o tenant ver herança (Universo/Nicho/Você),
 * criar/editar/excluir o próprio bloco e desligar/religar bloco de nicho
 * (override por tenant — Parte 1 do banco, 2026-06-03).
 *
 * Regras gravadas:
 *  - Universo (global): só leitura, FIXO (nunca desliga).
 *  - Nicho: herdado, o tenant pode desligar/religar (override `ativo=false`).
 *  - Você (tenant): criar/editar/excluir à vontade.
 *
 * `tabelaOverride = null` ⇒ gaveta sem toggle de nicho ainda (Conhecimento:
 * a RPC do motor usa `agente_id`, não `tenant_id`; resolver mexe no motor).
 */

import {
  BookOpen,
  Brain,
  Smile,
  Zap,
  Shuffle,
  ListChecks,
  Heart,
  Star,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

export type EscopoBloco = "global" | "nicho" | "tenant";

export type CampoForm = {
  chave: string;
  rotulo: string;
  tipo: "texto" | "area";
};

export type Gaveta = {
  id: string;
  rotulo: string;
  Icone: LucideIcon;
  descricao: string;
  tabela: string;
  /** null = sem toggle de desligar nicho por enquanto */
  tabelaOverride: string | null;
  /** como o bloco do tenant é amarrado ao dono */
  tenancy: "tenant_id" | "agente_id";
  /**
   * Tem coluna `deleted_at`. Hoje TODAS as gavetas têm (conferido em produção 2026-09-03) —
   * o flag sobrou pra `filtrarVisivel` saber se pode filtrar `deleted_at is null`.
   * Exclusão é sempre soft delete; ver `excluirBloco` em acoes-gaveta.ts.
   */
  temDeletedAt: boolean;
  /** coluna usada como título na lista/card */
  campoTitulo: string;
  /** coluna usada como corpo; corpoJson embrulha em { instrucao } */
  campoCorpo: string;
  corpoJson?: boolean;
  /** campos do formulário de criar/editar (todos obrigatórios) */
  campos: CampoForm[];
  /** colunas extra a preencher no insert do bloco próprio */
  fixosInsert?: Record<string, string>;
};

export const GAVETAS: readonly Gaveta[] = [
  {
    id: "conhecimento",
    rotulo: "Conhecimento",
    Icone: BookOpen,
    descricao: "Fatos do negócio que o agente usa pra responder.",
    tabela: "blocos_conhecimento",
    tabelaOverride: null,
    tenancy: "agente_id",
    temDeletedAt: true,
    campoTitulo: "title",
    campoCorpo: "content",
    campos: [
      { chave: "title", rotulo: "Título", tipo: "texto" },
      { chave: "content", rotulo: "Conteúdo", tipo: "area" },
    ],
  },
  {
    id: "comportamento",
    rotulo: "Comportamento",
    Icone: Brain,
    descricao: "Como o agente age em cada situação.",
    tabela: "blocos_comportamento",
    tabelaOverride: "overrides_tenant_blocos_comportamento",
    tenancy: "tenant_id",
    temDeletedAt: true,
    campoTitulo: "situacao_descricao",
    campoCorpo: "instrucao",
    campos: [
      { chave: "situacao_descricao", rotulo: "Situação", tipo: "texto" },
      { chave: "instrucao", rotulo: "O que fazer", tipo: "area" },
    ],
    fixosInsert: { origem: "tenant" },
  },
  {
    id: "humanizacao",
    rotulo: "Humanização",
    Icone: Smile,
    descricao: "O jeito de falar, o tom humano.",
    tabela: "blocos_humanizacao",
    tabelaOverride: "overrides_tenant_blocos_humanizacao",
    tenancy: "tenant_id",
    temDeletedAt: true,
    campoTitulo: "regra",
    campoCorpo: "contexto_uso",
    campos: [
      { chave: "categoria", rotulo: "Categoria", tipo: "texto" },
      { chave: "regra", rotulo: "Regra", tipo: "texto" },
      { chave: "contexto_uso", rotulo: "Quando usar", tipo: "area" },
    ],
  },
  {
    id: "gatilho",
    rotulo: "Gatilhos",
    Icone: Zap,
    descricao: "Quando o agente reage a algo do lead.",
    tabela: "blocos_gatilho",
    tabelaOverride: "overrides_tenant_blocos_gatilho",
    tenancy: "tenant_id",
    temDeletedAt: true,
    campoTitulo: "nome_trigger",
    campoCorpo: "exemplo_frase",
    campos: [
      { chave: "nome_trigger", rotulo: "Nome do gatilho", tipo: "texto" },
      { chave: "exemplo_frase", rotulo: "Frase de exemplo", tipo: "texto" },
      { chave: "acao_disparada", rotulo: "Ação disparada", tipo: "area" },
    ],
  },
  {
    id: "variacao",
    rotulo: "Variações",
    Icone: Shuffle,
    descricao: "Variar a resposta pra não soar robótico.",
    tabela: "blocos_variacao",
    tabelaOverride: "overrides_tenant_blocos_variacao",
    tenancy: "tenant_id",
    temDeletedAt: true,
    campoTitulo: "nome_variation",
    campoCorpo: "instrucao",
    campos: [
      { chave: "nome_variation", rotulo: "Nome", tipo: "texto" },
      { chave: "instrucao", rotulo: "Instrução", tipo: "area" },
    ],
  },
  {
    id: "procedurais",
    rotulo: "Procedimentos",
    Icone: ListChecks,
    descricao: "Passos que o agente segue numa tarefa.",
    tabela: "blocos_procedurais",
    tabelaOverride: "overrides_tenant_blocos_procedurais",
    tenancy: "tenant_id",
    temDeletedAt: true,
    campoTitulo: "nome_procedimento",
    campoCorpo: "passos",
    corpoJson: true,
    campos: [
      { chave: "nome_procedimento", rotulo: "Nome do procedimento", tipo: "texto" },
      { chave: "passos", rotulo: "Passos", tipo: "area" },
    ],
  },
  {
    id: "emocao",
    rotulo: "Emoção",
    Icone: Heart,
    descricao: "Como o agente responde à emoção do lead.",
    tabela: "emocao_blocos",
    tabelaOverride: "overrides_tenant_blocos_emocao",
    tenancy: "tenant_id",
    temDeletedAt: true,
    campoTitulo: "emocao",
    campoCorpo: "corpo",
    campos: [
      { chave: "emocao", rotulo: "Emoção", tipo: "texto" },
      { chave: "corpo", rotulo: "Resposta", tipo: "area" },
    ],
  },
  {
    id: "prova_social",
    rotulo: "Prova social",
    Icone: Star,
    descricao: "Depoimentos que o agente pode citar.",
    tabela: "prova_social_blocos",
    tabelaOverride: "overrides_tenant_blocos_prova_social",
    tenancy: "tenant_id",
    temDeletedAt: true,
    campoTitulo: "autor",
    campoCorpo: "depoimento",
    campos: [
      { chave: "autor", rotulo: "Autor", tipo: "texto" },
      { chave: "depoimento", rotulo: "Depoimento", tipo: "area" },
    ],
  },
  {
    id: "anti_padroes",
    rotulo: "Anti-padrões",
    Icone: ShieldAlert,
    descricao: "O que o agente deve evitar.",
    tabela: "anti_padroes",
    tabelaOverride: "overrides_tenant_blocos_anti_padroes",
    tenancy: "tenant_id",
    temDeletedAt: true,
    campoTitulo: "situacao",
    campoCorpo: "acao_correta",
    campos: [
      { chave: "situacao", rotulo: "Situação a evitar", tipo: "texto" },
      { chave: "acao_correta", rotulo: "Ação correta", tipo: "area" },
    ],
  },
] as const;

export const ESCOPOS: readonly { id: EscopoBloco | "todos"; rotulo: string }[] = [
  { id: "todos", rotulo: "Tudo" },
  { id: "global", rotulo: "Universo" },
  { id: "nicho", rotulo: "Nicho" },
  { id: "tenant", rotulo: "Você" },
] as const;

/** cor semântica por escopo (oklch da casa) */
export function corEscopo(escopo: EscopoBloco): string {
  if (escopo === "tenant") return "oklch(0.72 0.16 155)"; // Você — verde (controle)
  if (escopo === "nicho") return "oklch(0.70 0.16 235)"; // Nicho — azul (herdado, desligável)
  return "oklch(0.68 0.14 290)"; // Universo — roxo (fixo)
}

export function rotuloEscopo(escopo: EscopoBloco): string {
  if (escopo === "tenant") return "Você";
  if (escopo === "nicho") return "Nicho";
  return "Universo";
}
