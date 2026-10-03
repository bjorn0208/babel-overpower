/**
 * Passo 3 do Wizard — Entrega.
 *
 * Configura quando + como a campanha vai disparar:
 *   - duration_mode (vitalícia / prazo / periódica)
 *   - janela do dia + dias da semana + feriados
 *   - throttle por hora e por dia
 *   - desistance_silence_days (quantos dias sem resposta vira desistente)
 */

import { motion } from "framer-motion";

import { fadeSlideIn } from "@/os/motion/presets";

import { Campo, inputStyle, type ModoDuracao } from "../re-exports";

export interface EstadoStep3 {
  duration_mode: ModoDuracao;
  starts_at: string; // datetime-local string
  ends_at: string | null; // datetime-local string ou null
  window_start: string;
  window_end: string;
  weekdays: number[];
  skip_holidays: boolean;
  throttle_per_day: number | null;
  throttle_per_hour: number | null;
  desistance_silence_days: number;
}

interface Props {
  estado: EstadoStep3;
  setEstado: (e: EstadoStep3) => void;
}

const DIAS: Array<{ n: number; rotulo: string }> = [
  { n: 0, rotulo: "Dom" },
  { n: 1, rotulo: "Seg" },
  { n: 2, rotulo: "Ter" },
  { n: 3, rotulo: "Qua" },
  { n: 4, rotulo: "Qui" },
  { n: 5, rotulo: "Sex" },
  { n: 6, rotulo: "Sáb" },
];

export function Step3Entrega({ estado, setEstado }: Props) {
  const set = <K extends keyof EstadoStep3>(k: K, v: EstadoStep3[K]) =>
    setEstado({ ...estado, [k]: v });

  const alternarDia = (n: number) => {
    const novos = estado.weekdays.includes(n)
      ? estado.weekdays.filter((d) => d !== n)
      : [...estado.weekdays, n].sort();
    set("weekdays", novos);
  };

  return (
    <motion.div
      variants={fadeSlideIn}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 640 }}
    >
      {/* Duração */}
      <Campo label="Duração">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {(["vitalicia", "prazo", "periodica"] as ModoDuracao[]).map((m) => {
            const on = estado.duration_mode === m;
            const rotulo =
              m === "vitalicia"
                ? "Vitalícia"
                : m === "prazo"
                ? "Com prazo"
                : "Periódica";
            return (
              <button
                key={m}
                type="button"
                onClick={() => set("duration_mode", m)}
                style={{
                  padding: 10,
                  fontSize: 11,
                  fontWeight: 500,
                  background: on
                    ? "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.3), oklch(0.65 0.22 280 / 0.2))"
                    : "oklch(0.18 0.06 280 / 0.4)",
                  color: on ? "oklch(0.98 0 0)" : "oklch(0.98 0 0 / 0.55)",
                  border: on
                    ? "1px solid oklch(0.7 0.18 220 / 0.5)"
                    : "1px solid oklch(0.98 0 0 / 0.1)",
                  borderRadius: 10,
                  cursor: "pointer",
                }}
              >
                {rotulo}
              </button>
            );
          })}
        </div>
      </Campo>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Campo
          label="Começa em"
          hint="A partir daí, dispara só dentro da janela abaixo."
        >
          <input
            type="datetime-local"
            value={estado.starts_at}
            onChange={(e) => set("starts_at", e.target.value)}
            style={inputStyle}
          />
        </Campo>
        <Campo label="Termina em" hint={estado.duration_mode === "vitalicia" ? "Vitalícia — não usa" : undefined}>
          <input
            type="datetime-local"
            value={estado.ends_at ?? ""}
            onChange={(e) => set("ends_at", e.target.value || null)}
            disabled={estado.duration_mode === "vitalicia"}
            style={{ ...inputStyle, opacity: estado.duration_mode === "vitalicia" ? 0.4 : 1 }}
          />
        </Campo>
      </div>

      {/* Janela de horário */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Campo label="Janela início (BRT)" hint="O motor confere a cada minuto; a mensagem sai 1–2 min depois.">
          <input
            type="time"
            value={estado.window_start}
            onChange={(e) => set("window_start", e.target.value)}
            style={inputStyle}
          />
        </Campo>
        <Campo label="Janela fim (BRT)">
          <input
            type="time"
            value={estado.window_end}
            onChange={(e) => set("window_end", e.target.value)}
            style={inputStyle}
          />
        </Campo>
      </div>

      {/* Dias da semana */}
      <Campo label="Dias da semana">
        <div style={{ display: "flex", gap: 6 }}>
          {DIAS.map((d) => {
            const on = estado.weekdays.includes(d.n);
            return (
              <button
                key={d.n}
                type="button"
                onClick={() => alternarDia(d.n)}
                style={{
                  flex: 1,
                  padding: "8px 4px",
                  fontSize: 11,
                  fontWeight: 600,
                  background: on
                    ? "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.35), oklch(0.65 0.22 280 / 0.25))"
                    : "oklch(0.98 0 0 / 0.04)",
                  color: on ? "oklch(0.98 0 0)" : "oklch(0.98 0 0 / 0.45)",
                  border: on
                    ? "1px solid oklch(0.7 0.18 220 / 0.5)"
                    : "1px solid oklch(0.98 0 0 / 0.08)",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                {d.rotulo}
              </button>
            );
          })}
        </div>
      </Campo>

      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: "oklch(0.98 0 0 / 0.75)", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={estado.skip_holidays}
          onChange={(e) => set("skip_holidays", e.target.checked)}
        />
        Pular feriados nacionais
      </label>

      {/* Throttle */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Campo label="Limite por hora" hint="Vazio = sem limite">
          <input
            type="number"
            min="1"
            value={estado.throttle_per_hour ?? ""}
            onChange={(e) => set("throttle_per_hour", e.target.value ? Number(e.target.value) : null)}
            style={inputStyle}
          />
        </Campo>
        <Campo label="Limite por dia" hint="Vazio = sem limite">
          <input
            type="number"
            min="1"
            value={estado.throttle_per_day ?? ""}
            onChange={(e) => set("throttle_per_day", e.target.value ? Number(e.target.value) : null)}
            style={inputStyle}
          />
        </Campo>
      </div>

      <Campo label="Dias sem resposta = desistência" hint="Lead vira desistente automaticamente">
        <input
          type="number"
          min="1"
          max="180"
          value={estado.desistance_silence_days}
          onChange={(e) => set("desistance_silence_days", Number(e.target.value))}
          style={inputStyle}
        />
      </Campo>
    </motion.div>
  );
}
