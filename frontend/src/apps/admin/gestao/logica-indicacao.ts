/**
 * Regras das indicações usadas por mais de uma tela (lista de Indicações, detalhe da indicação, modal do
 * cliente e Vendas). Estavam dentro de aba-indicacoes.tsx; saíram para cá para o painel da indicação
 * (painel-indicacao.tsx) poder usá-las sem importação circular. aba-indicacoes.tsx reexporta tudo, então
 * quem já importava de lá continua funcionando.
 * Original: financeiro.html:1071-1136 (STATUS_IND, HORARIOS, norm, resolverIndicador, waLink, indSort).
 */

import type { Cliente, Indicacao, Indicador, TomSelo } from "./tipos";
import { STATUS_INDICACAO } from "./tipos";

/** financeiro.html:1074 */
export const HORARIOS: Array<[string, string]> = [
  ["manha", "Manhã"],
  ["tarde", "Tarde"],
  ["noite", "Noite"],
];
export const rotuloHorario = (k: string | null | undefined): string =>
  HORARIOS.find(([x]) => x === k)?.[1] ?? k ?? "";

/** STATUS_IND_PILL (:1073) nos selos da babel: roxo → aurora, warn → aviso, ok → ok, neutral → neutro. */
export const TOM_STATUS_INDICACAO: Record<string, TomSelo> = {
  novo: "aurora",
  contato: "aviso",
  reuniao: "aviso",
  fechou: "ok",
  perdido: "neutro",
};

/** statusIndLabel (:1075). */
export const rotuloStatusIndicacao = (k: string | null | undefined): string =>
  STATUS_INDICACAO.find(([x]) => x === k)?.[1] ?? (k || "Novo");

/** norm — original :1076: sem acento, minúsculo, espaços únicos. */
export function norm(t: string | null | undefined): string {
  return String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** waLink — original :1135. */
export function waLink(tel: string | null | undefined): string {
  let d = String(tel || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length <= 11) d = "55" + d;
  return `https://wa.me/${d}`;
}

export interface IndicadorResolvido {
  cliente: Cliente | null;
  via: "manual" | "link" | "nome" | null;
}

/**
 * resolverIndicador — original :1089-1094. `indicador_id` guarda o id do CLIENTE (vínculo manual);
 * `referrer_code` casa com `gestao_indicadores.codigo` (o `id` do indicador é o id do cliente); na falta dos
 * dois, casa pelo nome informado, só se for único.
 */
export function resolverIndicador(
  ind: Pick<Indicacao, "indicador_id" | "referrer_code" | "referrer_name">,
  clientes: Cliente[],
  indicadores: Indicador[],
): IndicadorResolvido {
  if (ind.indicador_id) {
    const c = clientes.find((x) => x.id === ind.indicador_id);
    if (c) return { cliente: c, via: "manual" };
  }
  if (ind.referrer_code) {
    const codigo = ind.referrer_code.toUpperCase();
    const indicador = indicadores.find((i) => (i.codigo || "").toUpperCase() === codigo);
    if (indicador) {
      const c = clientes.find((x) => x.id === indicador.id);
      if (c) return { cliente: c, via: "link" };
    }
  }
  if (ind.referrer_name) {
    const n = norm(ind.referrer_name);
    const achados = clientes.filter((c) => norm(c.nome) === n);
    if (achados.length === 1) return { cliente: achados[0], via: "nome" };
  }
  return { cliente: null, via: null };
}

/**
 * Momento de chegada da indicação, para ordenar e mostrar (artefato `createdAt`, :1136, :1220).
 * Na importação o artefato guarda o carimbo da planilha; aqui ele vira `data_indicacao` (dia, sem fuso),
 * então a ordem usa o dia da indicação e, dentro do mesmo dia, a hora da gravação.
 */
export function chegadaDaIndicacao(i: Pick<Indicacao, "data_indicacao" | "criado_em">): string {
  const dia = i.data_indicacao || (i.criado_em ?? "").slice(0, 10);
  return `${dia}|${i.criado_em ?? ""}`;
}

/** indSort (:1136): mais recente primeiro. */
export const ordenarIndicacoes = (a: Indicacao, b: Indicacao): number =>
  chegadaDaIndicacao(b).localeCompare(chegadaDaIndicacao(a));

/** indicacoesPorCliente (:1244-1249): lista de cada cliente que indicou, mais recente primeiro. */
export function indicacoesPorCliente(
  indicacoes: Indicacao[],
  clientes: Cliente[],
  indicadores: Indicador[],
): Map<string, Indicacao[]> {
  const m = new Map<string, Indicacao[]>();
  for (const i of indicacoes) {
    const r = resolverIndicador(i, clientes, indicadores);
    if (!r.cliente) continue;
    const lista = m.get(r.cliente.id) ?? [];
    lista.push(i);
    m.set(r.cliente.id, lista);
  }
  for (const lista of m.values()) lista.sort(ordenarIndicacoes);
  return m;
}
