/**
 * Definição das abas do app Curadoria.
 *
 * Ordem: Avisos (tela inicial padrão) → Operação (11 abas do mock) → Control plane novas (3 do mock C1/C2/B).
 *
 * - `secao` controla agrupamento no Sidebar.
 * - `destaque` ativa glow verde nas abas-coração (Chamadas / Crons / Cross-Nicho).
 * - `atalho` é o número do ⌘1..⌘9 (apenas as 9 mais usadas têm).
 */

import type { DefAba } from "./tipos";

export const ABAS: DefAba[] = [
  // === AVISOS — tela inicial ===
  {
    id: "avisos",
    label: "Avisos",
    icone: "Bell",
    componente: "AbaAvisos",
    secao: "avisos",
    badge: "novo",
  },

  // === OPERAÇÃO ===
  {
    id: "cerebro",
    label: "Cérebro",
    icone: "Brain",
    componente: "AbaCerebro",
    atalho: "1",
    badge: "24h",
    secao: "operacao",
  },
  {
    id: "dashboard",
    label: "Dashboard",
    icone: "Chart",
    componente: "AbaDashboard",
    atalho: "2",
    secao: "operacao",
  },
  {
    id: "conversa",
    label: "Conversa",
    icone: "Chat",
    componente: "AbaConversa",
    atalho: "3",
    secao: "operacao",
  },
  {
    id: "blocos",
    label: "Blocos",
    icone: "Book",
    componente: "AbaBlocos",
    atalho: "4",
    badge: "1.6k",
    secao: "operacao",
  },
  {
    id: "pacotes",
    label: "Pacotes de Conhecimento",
    icone: "Book",
    componente: "AbaPacotesConhecimento",
    secao: "operacao",
    badge: "novo",
  },
  {
    id: "simulador",
    label: "Simulador",
    icone: "Flask",
    componente: "AbaSimulador",
    atalho: "5",
    secao: "operacao",
  },
  {
    id: "empatia",
    label: "Empatia",
    icone: "Heart",
    componente: "AbaEmpatia",
    atalho: "6",
    secao: "operacao",
  },
  {
    id: "produtos",
    label: "Produtos",
    icone: "Cart",
    componente: "AbaProdutos",
    atalho: "7",
    secao: "operacao",
  },
  {
    id: "tools",
    label: "Tools",
    icone: "Wrench",
    componente: "AbaTools",
    atalho: "8",
    secao: "operacao",
  },
  {
    id: "gatilhos",
    label: "Gatilhos",
    icone: "Zap",
    componente: "AbaGatilhos",
    atalho: "9",
    secao: "operacao",
  },
  {
    id: "acompanhamentos",
    label: "Acompanhamentos",
    icone: "Cal",
    componente: "AbaAcompanhamentos",
    secao: "operacao",
  },
  {
    id: "cargos",
    label: "Cargos",
    icone: "Badge",
    componente: "AbaCargos",
    secao: "operacao",
  },

  // === CONTROL PLANE — novas (C1, C2, B) ===
  {
    id: "chamadas",
    label: "Chamadas LLM",
    icone: "Cpu",
    componente: "AbaChamadasLlm",
    destaque: true,
    badge: "⭐ C1",
    secao: "control_plane",
  },
  {
    id: "crons",
    label: "Crons / Sono",
    icone: "Clock",
    componente: "AbaCrons",
    destaque: true,
    badge: "⭐ C2",
    secao: "control_plane",
  },
  {
    id: "cross_nicho",
    label: "Cross-Nicho",
    icone: "Layers",
    componente: "AbaCrossNicho",
    destaque: true,
    badge: "⭐ B",
    secao: "control_plane",
  },
  {
    id: "recursos",
    label: "Recursos & Custos",
    icone: "Zap",
    componente: "AbaRecursosCustos",
    destaque: true,
    badge: "💰",
    secao: "control_plane",
  },
];

export function getAbaPorId(id: string): DefAba | undefined {
  return ABAS.find((a) => a.id === id);
}

export const ABA_PADRAO: DefAba["id"] = "avisos";

export const SECOES_SIDEBAR: Array<{
  chave: DefAba["secao"];
  titulo: string;
}> = [
  { chave: "avisos", titulo: "Tela inicial" },
  { chave: "operacao", titulo: "Operação" },
  { chave: "control_plane", titulo: "Control plane · novas" },
];
