/** Formatação e rótulos do app Rifas. Dinheiro sempre chega em centavos. */

import type { MetodoSorteio, StatusPedidoRifa, StatusRifa } from "./tipos";

export const fmtBRL = (centavos: number | null | undefined): string =>
  (Number(centavos ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const fmtNumero = (n: number): string => new Intl.NumberFormat("pt-BR").format(n);

export const fmtCompacto = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".", ",")}k`;
  return String(n);
};

const DATA_PURA = /^\d{4}-\d{2}-\d{2}$/;

/** Formata data; string `YYYY-MM-DD` (date do banco) não sofre deslocamento de fuso. */
export const fmtData = (d: string | null | undefined): string => {
  if (!d) return "—";
  if (DATA_PURA.test(d)) {
    const [ano, mes, dia] = d.split("-");
    return `${dia}/${mes}/${ano}`;
  }
  return new Date(d).toLocaleDateString("pt-BR");
};

export const fmtDataHora = (d: string | null | undefined): string =>
  d
    ? new Date(d).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export const ROTULO_STATUS_RIFA: Record<StatusRifa, string> = {
  rascunho: "Rascunho",
  ativa: "Ativa",
  pausada: "Pausada",
  encerrada: "Encerrada",
  sorteada: "Sorteada",
};

export const ROTULO_STATUS_PEDIDO: Record<StatusPedidoRifa, string> = {
  reservado: "Reservado",
  aguardando_validacao: "Aguardando validação",
  pago: "Pago",
  expirado: "Expirado",
  cancelado: "Cancelado",
  rejeitado: "Rejeitado",
};

export const ROTULO_METODO_SORTEIO: Record<MetodoSorteio, string> = {
  loteria_federal: "Loteria Federal (qua 20:00 · dom 11:00)",
  plataforma: "Ação entre Amigos",
  ppt: "Loteria PPT (seg–sáb 09:20)",
  ptm: "Loteria PTM — Manhã (seg–sáb 11:20)",
  pt_rio: "Loteria PT — Rio (seg–sáb 14:20)",
  ptv: "Loteria PTV — Vespertino (seg–sáb 16:20)",
  ptn: "Loteria PTN — Noite (seg–sáb 18:20)",
  corujinha: "Loteria PT — Corujinha (seg–sáb 21:20)",
};

/** Contagem regressiva amigável até a data do sorteio (date `YYYY-MM-DD`). */
export const tempoAteSorteio = (dataISO: string | null | undefined): string | null => {
  if (!dataISO) return null;
  const alvo = DATA_PURA.test(dataISO) ? new Date(`${dataISO}T23:59:59`) : new Date(dataISO);
  const diff = alvo.getTime() - Date.now();
  if (diff <= 0) return "hoje";
  const dias = Math.floor(diff / 86_400_000);
  const horas = Math.floor((diff % 86_400_000) / 3_600_000);
  if (dias > 0) return `${dias} ${dias === 1 ? "dia" : "dias"}`;
  if (horas > 0) return `${horas}h`;
  return "em instantes";
};

/** URL de vídeo? (galeria aceita mp4/webm/mov desde 2026-08-18) */
export const ehVideo = (url: string): boolean => /\.(mp4|webm|mov)(\?|$)/i.test(url);

/* ════════════════════════════════════════════════════════════════
   Numeração e agenda de sorteios (Fabrício, 25/08/2026)
   ════════════════════════════════════════════════════════════════ */

/** Faixa real da cartela: rifas "desde zero" vão de 0..total-1 (00–99 numa
 *  rifa de 100 — dezena), as demais de 1..total. `largura` é a quantidade de
 *  dígitos do MAIOR número — era calculada pelo TOTAL, o que fazia uma rifa
 *  de 100 desde-zero exibir 3 dígitos e parecer "rifa de 1000" (bug 25/08). */
export const faixaNumeros = (r: { total_numeros: number; numeracao_desde_zero?: boolean | null }) => {
  const min = r.numeracao_desde_zero ? 0 : 1;
  const max = min + r.total_numeros - 1;
  return { min, max, largura: String(max).length };
};

export const fmtNumeroRifa = (n: number, largura: number): string => String(n).padStart(largura, "0");

/** Agenda oficial dos sorteios: [diaSemana (0=dom..6=sáb), hora, minuto][] */
const SEG_A_SAB = (h: number, m: number): Array<[number, number, number]> =>
  [1, 2, 3, 4, 5, 6].map((d) => [d, h, m] as [number, number, number]);

export const AGENDA_SORTEIO: Record<string, Array<[number, number, number]>> = {
  loteria_federal: [[3, 20, 0], [0, 11, 0]], // quarta 20:00 · domingo 11:00
  ppt: SEG_A_SAB(9, 20),
  ptm: SEG_A_SAB(11, 20),
  pt_rio: SEG_A_SAB(14, 20),
  ptv: SEG_A_SAB(16, 20),
  ptn: SEG_A_SAB(18, 20),
  corujinha: SEG_A_SAB(21, 20),
};

const OFFSET_BRT_MS = 3 * 3_600_000;

/** Próxima ocorrência REAL do sorteio da loteria (parede BRT). Federal numa
 *  quinta → domingo 11:00; numa segunda → quarta 20:00. null = sem agenda
 *  fixa (sorteador da plataforma usa a data prevista). */
export const proximoSorteio = (metodo: string | null | undefined, agoraMs = Date.now()): Date | null => {
  const agenda = metodo ? AGENDA_SORTEIO[metodo] : null;
  if (!agenda || agenda.length === 0) return null;
  // "Parede BRT": getters UTC deste Date devolvem o relógio de Brasília.
  const brt = new Date(agoraMs - OFFSET_BRT_MS);
  let melhor: number | null = null;
  for (let d = 0; d < 8; d++) {
    const dia = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate() + d));
    const dow = dia.getUTCDay();
    for (const [alvoDow, h, m] of agenda) {
      if (dow !== alvoDow) continue;
      const tsBrtParede = Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), h, m);
      const tsReal = tsBrtParede + OFFSET_BRT_MS;
      if (tsReal > agoraMs && (melhor === null || tsReal < melhor)) melhor = tsReal;
    }
  }
  return melhor === null ? null : new Date(melhor);
};

const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Rótulo humano da próxima ocorrência: "qua 20:00". */
export const rotuloProximoSorteio = (metodo: string | null | undefined, agoraMs = Date.now()): string | null => {
  const alvo = proximoSorteio(metodo, agoraMs);
  if (!alvo) return null;
  const brt = new Date(alvo.getTime() - OFFSET_BRT_MS);
  const hh = String(brt.getUTCHours()).padStart(2, "0");
  const mm = String(brt.getUTCMinutes()).padStart(2, "0");
  return `${DIAS_CURTOS[brt.getUTCDay()]} ${hh}:${mm}`;
};

/** Contagem até o sorteio. Loterias: calculada até a PRÓXIMA ocorrência da
 *  agenda oficial (pedido Fabrício 25/08 — federal conta até qua 20:00 ou
 *  dom 11:00, o que vier antes). Plataforma: usa a data prevista. */
export const contagemSorteio = (
  metodo: string | null | undefined,
  dataPrevista: string | null | undefined,
  agoraMs = Date.now(),
): string | null => {
  const alvo = proximoSorteio(metodo, agoraMs);
  if (!alvo) return tempoAteSorteio(dataPrevista ?? null);
  const diffMs = alvo.getTime() - agoraMs;
  const horas = Math.ceil(diffMs / 3_600_000);
  if (horas <= 1) return "em instantes";
  if (horas < 48) return `em ${horas}h`;
  const dias = Math.floor(diffMs / 86_400_000);
  const restoH = Math.floor((diffMs % 86_400_000) / 3_600_000);
  return `em ${dias}d${restoH > 0 ? ` ${restoH}h` : ""}`;
};
