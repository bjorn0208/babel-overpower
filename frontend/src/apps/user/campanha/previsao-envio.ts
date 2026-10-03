/**
 * Previsão de quando cada lead da fila vai receber a mensagem da campanha.
 *
 * Pedido do Theus (2026-09-17): "na lista mostrar que horas cada mensagem vai
 * enviar". Nada disso existe no banco — `acoes_agendadas.scheduled_at` é sempre
 * `now()` ("assim que der"), então o horário é ESTIMATIVA calculada aqui com as
 * mesmas regras do motor:
 *
 *   1. janela de horário + dias da semana (`window_start`/`window_end`/`weekdays`,
 *      BRT fixo, igual `processar-campanhas/throttle.ts` e `painel-disparo.tsx`);
 *   2. teto por hora (`throttle_per_hour`) e por dia (`throttle_per_day`), já
 *      descontando o que saiu hoje/na última hora;
 *   3. ordem da fila = `leads_campanha.entered_at ASC` (mesma ordem do
 *      `processar-campanhas/index.ts`).
 *
 * O que a estimativa NÃO sabe (e por isso é estimativa, e a tela diz isso):
 *   - o teto é do TENANT e é dividido entre as campanhas ativas;
 *   - o gate de horário comercial do agente pode empurrar o envio;
 *   - `skip_holidays` está gravado mas o motor não aplica;
 *   - elegibilidade é reavaliada a cada ciclo.
 *
 * Sem `throttle_per_hour` nem `throttle_per_day`, o motor manda tudo no primeiro
 * ciclo dentro da janela — a previsão então é "na próxima abertura" pra todos.
 */

/** Brasil sem horário de verão desde 2019 — igual ao throttle.ts do motor. */
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export interface JanelaCampanha {
  status: string;
  starts_at: string;
  ends_at: string | null;
  window_start: string;
  window_end: string;
  weekdays: number[];
  throttle_per_day: number | null;
  throttle_per_hour: number | null;
}

export interface ContagemEnvios {
  /** Quantos já receberam hoje (conta pro teto diário). */
  hoje: number;
  /** Quantos receberam na última hora (conta pro teto por hora). */
  ultimaHora: number;
}

export type MotivoSemPrevisao =
  | "campanha_pausada"
  | "campanha_rascunho"
  | "campanha_finalizada"
  | "inicio_no_futuro"
  | "janela_impossivel"
  | "disparos_pausados";

export interface PrevisaoLead {
  /** id da linha de leads_campanha */
  id: string;
  /** null quando não há previsão possível (ver `motivo`) */
  quando: Date | null;
  motivo?: MotivoSemPrevisao;
}

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function dentroDeJanela(c: JanelaCampanha, instante: Date): boolean {
  const brt = new Date(instante.getTime() - BRT_OFFSET_MS);
  const dia = brt.getUTCDay();
  const atual = brt.getUTCHours() * 60 + brt.getUTCMinutes();
  const inicio = minutos(c.window_start);
  const fim = minutos(c.window_end);
  if (fim > inicio) return c.weekdays.includes(dia) && atual >= inicio && atual < fim;
  if (fim === inicio) return false;
  // janela que vira a meia-noite (ex. 22:00 → 02:00)
  if (atual >= inicio) return c.weekdays.includes(dia);
  if (atual < fim) return c.weekdays.includes((dia + 6) % 7);
  return false;
}

/** Próximo minuto (>= base) em que a janela está aberta. Olha 8 dias à frente. */
function proximoMinutoAberto(c: JanelaCampanha, base: Date): Date | null {
  const inicio = Math.ceil(base.getTime() / 60_000) * 60_000;
  for (let i = 0; i < 8 * 24 * 60; i++) {
    const t = new Date(inicio + i * 60_000);
    if (dentroDeJanela(c, t)) return t;
  }
  return null;
}

function mesmoDiaBrt(a: Date, b: Date): boolean {
  const x = new Date(a.getTime() - BRT_OFFSET_MS);
  const y = new Date(b.getTime() - BRT_OFFSET_MS);
  return (
    x.getUTCFullYear() === y.getUTCFullYear() &&
    x.getUTCMonth() === y.getUTCMonth() &&
    x.getUTCDate() === y.getUTCDate()
  );
}

/** Motivo que impede qualquer previsão, ou null se a campanha pode disparar. */
export function motivoSemPrevisao(
  c: JanelaCampanha,
  agora: Date,
  disparosPausados = false,
): MotivoSemPrevisao | null {
  if (disparosPausados) return "disparos_pausados";
  if (c.status === "pausada") return "campanha_pausada";
  if (c.status === "rascunho") return "campanha_rascunho";
  if (c.status === "finalizada") return "campanha_finalizada";
  if (c.ends_at && new Date(c.ends_at).getTime() <= agora.getTime()) return "campanha_finalizada";
  if (c.weekdays.length === 0 || c.window_start === c.window_end) return "janela_impossivel";
  if (proximoMinutoAberto(c, agora) === null) return "janela_impossivel";
  return null;
}

/**
 * Distribui a fila nos horários em que o motor conseguiria mandar.
 *
 * `filaOrdenada` = ids de `leads_campanha` em `phase='aguardando'`, ordenados por
 * `entered_at ASC` (a mesma ordem que o motor usa pra escolher quem sai).
 */
export function preverEnvios(
  c: JanelaCampanha,
  filaOrdenada: string[],
  enviados: ContagemEnvios,
  agora: Date = new Date(),
  disparosPausados = false,
): PrevisaoLead[] {
  const motivo = motivoSemPrevisao(c, agora, disparosPausados);
  if (motivo) return filaOrdenada.map((id) => ({ id, quando: null, motivo }));

  const inicioCampanha = new Date(c.starts_at);
  const base = inicioCampanha.getTime() > agora.getTime() ? inicioCampanha : agora;

  const porHora = c.throttle_per_hour ?? Infinity;
  const porDia = c.throttle_per_day ?? Infinity;

  let instante = proximoMinutoAberto(c, base);
  if (!instante) return filaOrdenada.map((id) => ({ id, quando: null, motivo: "janela_impossivel" }));

  // Consumo já gasto: só vale enquanto a estimativa estiver no mesmo dia/hora de agora.
  let usadosNaHora = mesmoDiaBrt(instante, agora) ? enviados.ultimaHora : 0;
  let usadosNoDia = mesmoDiaBrt(instante, agora) ? enviados.hoje : 0;
  let horaCorrente = Math.floor(instante.getTime() / 3_600_000);
  let diaCorrente = new Date(instante.getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10);

  const saida: PrevisaoLead[] = [];

  for (const id of filaOrdenada) {
    // avança até achar um instante com vaga na hora e no dia
    for (let guarda = 0; guarda < 8 * 24 * 60; guarda++) {
      const hora = Math.floor(instante.getTime() / 3_600_000);
      const dia = new Date(instante.getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10);
      if (hora !== horaCorrente) {
        horaCorrente = hora;
        usadosNaHora = 0;
      }
      if (dia !== diaCorrente) {
        diaCorrente = dia;
        usadosNoDia = 0;
        usadosNaHora = 0;
      }
      if (usadosNaHora < porHora && usadosNoDia < porDia) break;

      // sem vaga: pula pra próxima hora (ou próximo dia, se o teto diário fechou)
      const proximo =
        usadosNoDia >= porDia
          ? new Date(
              Date.UTC(
                new Date(instante.getTime() - BRT_OFFSET_MS).getUTCFullYear(),
                new Date(instante.getTime() - BRT_OFFSET_MS).getUTCMonth(),
                new Date(instante.getTime() - BRT_OFFSET_MS).getUTCDate() + 1,
              ) + BRT_OFFSET_MS,
            )
          : new Date(Math.floor(instante.getTime() / 3_600_000) * 3_600_000 + 3_600_000);
      const aberto = proximoMinutoAberto(c, proximo);
      if (!aberto) {
        saida.push({ id, quando: null, motivo: "janela_impossivel" });
        break;
      }
      instante = aberto;
    }

    if (saida.length && saida[saida.length - 1].id === id) continue; // já resolvido como sem previsão
    saida.push({ id, quando: instante });
    usadosNaHora += 1;
    usadosNoDia += 1;
  }

  return saida;
}

/** "hoje 14:20" · "sex 19/09 09:00" — sempre em horário de Brasília. */
export function rotuloQuando(d: Date, agora: Date = new Date()): string {
  const brt = new Date(d.getTime() - BRT_OFFSET_MS);
  const hora = `${String(brt.getUTCHours()).padStart(2, "0")}:${String(brt.getUTCMinutes()).padStart(2, "0")}`;
  if (mesmoDiaBrt(d, agora)) return `hoje ${hora}`;
  const amanha = new Date(agora.getTime() + 86_400_000);
  if (mesmoDiaBrt(d, amanha)) return `amanhã ${hora}`;
  const data = `${String(brt.getUTCDate()).padStart(2, "0")}/${String(brt.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${DIAS_CURTOS[brt.getUTCDay()]} ${data} ${hora}`;
}

export const TEXTO_SEM_PREVISAO: Record<MotivoSemPrevisao, string> = {
  disparos_pausados: "envios pausados",
  campanha_pausada: "campanha pausada",
  campanha_rascunho: "aguardando ativar",
  campanha_finalizada: "campanha encerrada",
  inicio_no_futuro: "aguardando a data de início",
  janela_impossivel: "sem janela de horário configurada",
};
