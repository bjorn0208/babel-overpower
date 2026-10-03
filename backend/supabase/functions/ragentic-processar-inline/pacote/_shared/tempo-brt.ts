/**
 * Cálculo de `executar_em` para agendamento de compromissos, ancorado em BRT.
 *
 * As edge functions Deno rodam em UTC. Usar `Date#setHours` lá grava a hora no
 * fuso errado (15h "vira" 15h UTC = 12h BRT). Aqui o fuso é EXPLÍCITO:
 * BRT = UTC-3 fixo (o Brasil não tem horário de verão desde 2019), então
 * componho o instante somando o offset — sem depender do TZ do runtime.
 *
 * Puro de propósito (zero import Deno/Supabase) pra ser testável via tsx.
 */

const OFFSET_BRT_MS = 3 * 3600_000; // BRT = UTC-03:00 fixo
const MARGEM_MIN_MS = 60_000; // nunca gravar compromisso <= agora+1min (nasce vencido)

export type EntradaTempo = {
  executar_em?: string | null;
  quando_relativo?: {
    tipo?: string;
    em_horas?: number;
    em_minutos?: number;
    hora?: string;
    periodo?: string;
    dia_semana?: string;
  } | null;
};

export type ResultadoTempo = { ok: true; iso: string } | { ok: false; motivo: string };

function temTimezone(s: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(s.trim());
}

function parseHora(hhmm: string | undefined, defH: number, defM: number): [number, number] {
  const [h, m] = String(hhmm ?? "").split(":").map((x) => Number(x));
  return [Number.isFinite(h) ? h : defH, Number.isFinite(m) ? m : defM];
}

export function calcularExecutarEmBRT(input: EntradaTempo, agoraMs: number): ResultadoTempo {
  let alvoMs: number | null = null;

  const execStr = typeof input.executar_em === "string" ? input.executar_em.trim() : "";
  if (execStr) {
    // Sem fuso explícito → assume BRT (não UTC, que era o bug).
    const s = temTimezone(execStr) ? execStr : `${execStr.replace(" ", "T")}-03:00`;
    const ms = Date.parse(s);
    if (Number.isNaN(ms)) {
      return {
        ok: false,
        motivo: `executar_em inválido: "${execStr}". Use ISO 8601 com fuso -03:00 (ex: 2026-05-17T15:00:00-03:00).`,
      };
    }
    alvoMs = ms;
  }

  if (alvoMs === null && input.quando_relativo) {
    const qr = input.quando_relativo;
    const tipo = String(qr.tipo ?? "");
    // "Parede BRT" do agora: os getters UTC deste Date dão o relógio de Brasília.
    const brt = new Date(agoraMs - OFFSET_BRT_MS);
    const Y = brt.getUTCFullYear();
    const Mo = brt.getUTCMonth();
    const D = brt.getUTCDate();
    const dow = brt.getUTCDay();

    if (tipo === "relativo") {
      const h = Number(qr.em_horas ?? 0);
      const mi = Number(qr.em_minutos ?? 0);
      alvoMs = agoraMs + (h * 3600 + mi * 60) * 1000;
    } else if (tipo === "hoje") {
      const [h, mi] = parseHora(qr.hora, 12, 0);
      alvoMs = Date.UTC(Y, Mo, D, h, mi, 0) + OFFSET_BRT_MS;
    } else if (tipo === "amanha") {
      let h: number;
      let mi: number;
      if (qr.hora) {
        [h, mi] = parseHora(qr.hora, 9, 0);
      } else {
        const periodoMap: Record<string, number> = { manha: 9, tarde: 14, noite: 19 };
        h = periodoMap[String(qr.periodo ?? "manha")] ?? 9;
        mi = 0;
      }
      alvoMs = Date.UTC(Y, Mo, D + 1, h, mi, 0) + OFFSET_BRT_MS;
    } else if (tipo === "dia_semana") {
      const semMap: Record<string, number> = {
        domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
      };
      const alvoDow = semMap[String(qr.dia_semana ?? "")] ?? 1;
      let diff = alvoDow - dow;
      if (diff <= 0) diff += 7; // sempre o PRÓXIMO (nunca hoje/passado)
      const [h, mi] = parseHora(qr.hora, 10, 0);
      alvoMs = Date.UTC(Y, Mo, D + diff, h, mi, 0) + OFFSET_BRT_MS;
    } else {
      return {
        ok: false,
        motivo: `quando_relativo.tipo inválido: "${tipo}" (use relativo|hoje|amanha|dia_semana).`,
      };
    }
  }

  if (alvoMs === null) {
    return { ok: false, motivo: "Informe executar_em (ISO 8601 com -03:00) ou quando_relativo." };
  }

  if (alvoMs < agoraMs + MARGEM_MIN_MS) {
    const agoraBRT = new Date(agoraMs - OFFSET_BRT_MS).toISOString().slice(0, 16).replace("T", " ");
    return {
      ok: false,
      motivo:
        `Data calculada está no passado ou imediata demais. Agora é ${agoraBRT} BRT (UTC-03:00). ` +
        `Reenvie executar_em em ISO 8601 com fuso -03:00 (ex: 2026-05-17T15:00:00-03:00) ou quando_relativo correto.`,
    };
  }

  return { ok: true, iso: new Date(alvoMs).toISOString() };
}

/**
 * Chave do dia de Brasília ("YYYY-MM-DD") de um instante.
 *
 * Existe porque bucketizar gráfico por `iso.slice(0, 10)` é ler a data em UTC:
 * das 21h à meia-noite BRT o dia UTC já virou, e o ponto de "hoje" cai num balde
 * que não existe. Aqui o offset é explícito, igual ao resto deste arquivo — não
 * depende do TZ de quem roda (edge em UTC, máquina do Theus em BRT).
 *
 * Aceita ISO string, Date ou epoch ms. Entrada vazia/inválida devolve null pra
 * quem chama decidir — somar num balde errado é pior que não somar.
 */
export function diaBRT(quando: string | number | Date | null | undefined): string | null {
  if (quando === null || quando === undefined || quando === "") return null;
  const ms = quando instanceof Date ? quando.getTime() : typeof quando === "number" ? quando : Date.parse(quando);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms - OFFSET_BRT_MS).toISOString().slice(0, 10);
}

/**
 * Epoch ms da meia-noite BRT de `dias - 1` dias atrás — o começo da janela de um
 * gráfico de `dias` pontos que termina hoje. Casado com `diaBRT`: os baldes e os
 * valores passam a falar do mesmo dia.
 */
export function inicioJanelaBRTMs(agoraMs: number, dias: number): number {
  const brt = new Date(agoraMs - OFFSET_BRT_MS);
  const meiaNoiteBRT = Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate()) + OFFSET_BRT_MS;
  return meiaNoiteBRT - (dias - 1) * 86_400_000;
}
