// Helpers de horário comercial — usados por process-followups e outros cron consumers.
// Tenant define horário em user_agents.configuracao.horario (tipo '24h' | 'personalizado').
// Quando configuracao.automacoes.respeita_horario_comercial=true, automações só disparam dentro da janela.

export type Turno = {
  dia: "segunda" | "terca" | "quarta" | "quinta" | "sexta" | "sabado" | "domingo";
  ativo: boolean;
  inicio: string; // HH:mm
  fim: string;    // HH:mm
};

export type HorarioConfig = {
  tipo: "24h" | "personalizado";
  turnos: Turno[];
};

const DIAS_ORDEM: Turno["dia"][] = [
  "domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado",
];

// TZ-safe: usa Intl.DateTimeFormat com timeZone America/Sao_Paulo (BRT, UTC-3 sem horário de verão desde 2019).
const TZ = "America/Sao_Paulo";

type Parts = { weekday: number; hour: number; minute: number };

function nowInBrt(agora: Date): Parts {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(agora);
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value?.toLowerCase().slice(0, 3) || "";
  const weekdayMap: Record<string, number> = {
    "dom": 0, "seg": 1, "ter": 2, "qua": 3, "qui": 4, "sex": 5, "sáb": 6, "sab": 6,
  };
  const weekday = weekdayMap[weekdayStr] ?? agora.getDay();
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { weekday, hour, minute };
}

function parseHHMM(s: string): { h: number; m: number } {
  const [hh, mm] = s.split(":");
  return { h: Number(hh) || 0, m: Number(mm) || 0 };
}

function turnoDoDia(cfg: HorarioConfig, weekday: number): Turno | null {
  const dia = DIAS_ORDEM[weekday];
  return cfg.turnos.find((t) => t.dia === dia) || null;
}

export function checkIsWithinBusinessHours(cfg: HorarioConfig | null | undefined, agora: Date = new Date()): boolean {
  if (!cfg) return true;
  if (cfg.tipo === "24h") return true;
  if (!Array.isArray(cfg.turnos) || cfg.turnos.length === 0) return true;

  const { weekday, hour, minute } = nowInBrt(agora);
  const turno = turnoDoDia(cfg, weekday);
  if (!turno || !turno.ativo) return false;

  const ini = parseHHMM(turno.inicio);
  const fim = parseHHMM(turno.fim);
  const nowMin = hour * 60 + minute;
  const iniMin = ini.h * 60 + ini.m;
  const fimMin = fim.h * 60 + fim.m;
  return nowMin >= iniMin && nowMin < fimMin;
}

// Retorna o próximo Date (UTC) dentro da janela de horário comercial.
// Se a janela de hoje já passou, avança pro próximo dia ativo.
export function computeNextBusinessHourSlot(
  cfg: HorarioConfig | null | undefined,
  agora: Date = new Date(),
): Date {
  if (!cfg || cfg.tipo === "24h") return agora;
  if (!Array.isArray(cfg.turnos) || cfg.turnos.length === 0) return agora;

  for (let offset = 0; offset < 8; offset++) {
    const candidato = new Date(agora.getTime() + offset * 86_400_000);
    const parts = nowInBrt(candidato);
    const turno = turnoDoDia(cfg, parts.weekday);
    if (!turno || !turno.ativo) continue;

    const ini = parseHHMM(turno.inicio);
    const fim = parseHHMM(turno.fim);
    const iniMin = ini.h * 60 + ini.m;
    const fimMin = fim.h * 60 + fim.m;
    const nowMin = offset === 0 ? parts.hour * 60 + parts.minute : 0;

    if (nowMin < fimMin) {
      const alvoMin = Math.max(nowMin, iniMin);
      // Constrói Date ajustado em BRT (UTC-3): offset manual pra evitar drift de DST.
      // Δ 2026-09-15: a meia-noite vem da data em BRT, não da data UTC. Entre 21h e 24h BRT
      // a data UTC já virou o dia e o slot saía 24h depois (msg de segunda 23h → quarta 7h30).
      const [dd, mm, yyyy] = new Intl.DateTimeFormat("pt-BR", {
        timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric",
      }).format(candidato).split("/").map(Number);
      const midnightUtc = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0, 0));
      const brtOffsetMin = 3 * 60;
      const alvoUtc = new Date(midnightUtc.getTime() + (alvoMin + brtOffsetMin) * 60_000);
      // Dentro da janela o alvo é o minuto atual (sem segundos) → devolve `agora`.
      if (alvoUtc.getTime() > agora.getTime() - 60_000) return alvoUtc > agora ? alvoUtc : agora;
    }
  }
  // Fallback: 1h no futuro.
  return new Date(agora.getTime() + 3_600_000);
}

// Lista de action_types que NÃO devem ser atrasadas pelo horário (respostas a ações do cliente).
export const TIPOS_FORA_DO_GATE: ReadonlySet<string> = new Set([
  "iniciar_atendimento",     // cliente saiu da fila
  "retomada_horario",        // cliente agendou hora específica
  "lembrete_retorno",        // cliente pediu lembrete com hora
]);

// =============================================================================
// DEC-017 · slot inteligente · respeita feriado + fim de semana + horário
// =============================================================================

export type SlotOpts = {
  respeitaHorarioComercial: boolean;
  pularFimSemana: boolean;
  pularFeriados: boolean;
  horarioConfig: HorarioConfig | null | undefined;
};

/** Carrega feriados nas próximas N dias do banco. Retorna Set de YYYY-MM-DD. */
export async function carregarFeriadosBrasil(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  diasFuturo = 60,
): Promise<Set<string>> {
  const hoje = new Date().toISOString().slice(0, 10);
  const limite = new Date(Date.now() + diasFuturo * 86_400_000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("feriados_brasil")
    .select("data")
    .gte("data", hoje)
    .lte("data", limite)
    .eq("ativo", true);
  // deno-lint-ignore no-explicit-any
  return new Set<string>((data as any[] | null)?.map((r) => String(r.data)) ?? []);
}

function isoDoBRT(d: Date): string {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const dd = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${dd}`;
}

/**
 * Próximo Date (UTC) que satisfaz: NÃO fim de semana (se opt) + NÃO feriado
 * (se opt) + dentro do horário comercial (se opt). Aceita start no futuro.
 *
 * Se candidato bate todos os filtros, retorna o próprio. Senão avança 1 dia.
 * Se passa do limite (30 tentativas), retorna +1h fallback.
 */
export function proximoSlotValido(
  agora: Date,
  feriados: Set<string>,
  opts: SlotOpts,
): Date {
  // Sem nenhuma restrição: retorna agora
  if (!opts.respeitaHorarioComercial && !opts.pularFimSemana && !opts.pularFeriados) {
    return agora;
  }

  for (let offset = 0; offset < 30; offset++) {
    const candidato = new Date(agora.getTime() + offset * 86_400_000);
    const parts = nowInBrt(candidato);

    // Filtro fim de semana (BRT)
    if (opts.pularFimSemana && (parts.weekday === 0 || parts.weekday === 6)) continue;

    // Filtro feriado (data BRT)
    if (opts.pularFeriados && feriados.has(isoDoBRT(candidato))) continue;

    // Filtro horário comercial · usa computeNextBusinessHourSlot pro dia
    if (opts.respeitaHorarioComercial && opts.horarioConfig && opts.horarioConfig.tipo !== "24h") {
      const slot = computeNextBusinessHourSlot(opts.horarioConfig, candidato);
      // Se computeNext caiu pra outro dia, não aceita aqui · próxima iteração pega
      if (isoDoBRT(slot) !== isoDoBRT(candidato)) continue;
      // Re-checa se slot retornado também é fim_semana/feriado (caso o helper tenha pulado)
      const slotParts = nowInBrt(slot);
      if (opts.pularFimSemana && (slotParts.weekday === 0 || slotParts.weekday === 6)) continue;
      if (opts.pularFeriados && feriados.has(isoDoBRT(slot))) continue;
      return slot;
    }

    // Sem horário comercial, mas precisa filtrar dia: usa início padrão 09:00 BRT
    if (offset > 0 || opts.respeitaHorarioComercial) {
      const midnightUtc = new Date(Date.UTC(
        candidato.getUTCFullYear(), candidato.getUTCMonth(), candidato.getUTCDate(), 0, 0, 0, 0,
      ));
      const inicio9BRT = new Date(midnightUtc.getTime() + (9 * 60 + 3 * 60) * 60_000);
      if (inicio9BRT > agora) return inicio9BRT;
    }
    return candidato;
  }
  // Fallback: 1h depois (não deveria chegar aqui)
  return new Date(agora.getTime() + 3_600_000);
}
