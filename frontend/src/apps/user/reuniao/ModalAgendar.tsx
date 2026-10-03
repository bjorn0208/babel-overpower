// @ts-nocheck
/**
 * Modal de agendamento de reunião — extraído de Reuniao.tsx para manter ≤300 linhas.
 * Aceita `maxParticipantes` (teto global de config_plataforma) para limitar o input.
 */

import { useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, X } from "lucide-react";
import { cor, estiloInput } from "./reuniao-ui";

const s = {
  rotulo: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
    fontSize: 12.5,
    fontWeight: 500,
    color: cor.texto2,
  },
  input: { ...estiloInput, padding: "10px 12px", fontSize: 13.5 },
} as const;

type Props = {
  onSalvar: (
    titulo: string,
    dataHora: string,
    duracao: number,
    max: number,
    exigeAprovacao: boolean,
  ) => Promise<void>;
  onFechar: () => void;
  /** Teto global lido de config_plataforma. Limita o input de máx. participantes. */
  maxParticipantes?: number;
};

export default function ModalAgendar({ onSalvar, onFechar, maxParticipantes = 6 }: Props) {
  const [titulo, setTitulo] = useState("");
  const [dataHora, setDataHora] = useState("");
  const [duracao, setDuracao] = useState(60);
  // Valor inicial = mínimo entre 6 e o teto (não inicializa acima do teto)
  const [max, setMax] = useState(Math.min(maxParticipantes, 6));
  const [exigeAprovacao, setExigeAprovacao] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function handleSalvar() {
    if (!titulo.trim() || !dataHora) {
      toast.warning("Preencha o título e a data/hora da reunião.");
      return;
    }
    // Dupla defesa: clamp antes de chamar onSalvar
    const maxSeguro = Math.min(max, maxParticipantes);
    setSalvando(true);
    try {
      await onSalvar(
        titulo.trim(),
        new Date(dataHora).toISOString(),
        duracao,
        maxSeguro,
        exigeAprovacao,
      );
      onFechar();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "oklch(0.05 0.01 264 / 0.6)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div
        className="reu-surgir"
        role="dialog"
        aria-label="Agendar reunião"
        style={{
          background: "oklch(0.15 0.03 264)",
          border: `1px solid ${cor.borda}`,
          borderRadius: 18,
          padding: 24,
          width: "100%",
          maxWidth: 420,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          boxShadow: "0 16px 40px oklch(0.04 0.01 264 / 0.6)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              color: cor.texto1,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <CalendarPlus size={18} aria-hidden color={cor.texto2} />
            Agendar reunião
          </h3>
          <button
            type="button"
            className="reu-btn reu-btn-fantasma"
            onClick={onFechar}
            title="Fechar"
            aria-label="Fechar"
            style={{ width: 34, height: 34 }}
          >
            <X size={17} />
          </button>
        </div>

        <label style={s.rotulo}>
          Título
          <input
            type="text"
            className="reu-input"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex.: Alinhamento semanal"
            style={s.input}
            maxLength={100}
            autoFocus
          />
        </label>

        <label style={s.rotulo}>
          Data e hora
          <input
            type="datetime-local"
            className="reu-input"
            value={dataHora}
            onChange={(e) => setDataHora(e.target.value)}
            style={{ ...s.input, colorScheme: "dark" }}
          />
        </label>

        <div style={{ display: "flex", gap: 12 }}>
          <label style={{ ...s.rotulo, flex: 1 }}>
            Duração (min)
            <input
              type="number"
              className="reu-input"
              min={10}
              max={480}
              value={duracao}
              onChange={(e) => setDuracao(Number(e.target.value))}
              style={s.input}
            />
          </label>
          <label style={{ ...s.rotulo, flex: 1 }}>
            Máx. participantes
            <input
              type="number"
              className="reu-input"
              min={2}
              max={maxParticipantes}
              value={max}
              onChange={(e) => setMax(Math.min(Number(e.target.value), maxParticipantes))}
              style={s.input}
            />
          </label>
        </div>

        {maxParticipantes < 50 && (
          <span style={{ fontSize: 11.5, color: cor.texto3 }}>
            Limite da plataforma: {maxParticipantes} participantes por sala.
          </span>
        )}

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 12.5,
            color: cor.texto2,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={exigeAprovacao}
            onChange={(e) => setExigeAprovacao(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: cor.primario }}
          />
          Aprovar quem entra pelo link (sala de espera)
        </label>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 2 }}>
          <button type="button" className="reu-btn reu-btn-secundario" onClick={onFechar}>
            Cancelar
          </button>
          <button
            type="button"
            className="reu-btn reu-btn-primario"
            onClick={() => void handleSalvar()}
            disabled={salvando}
          >
            {salvando ? "Agendando…" : "Agendar"}
          </button>
        </div>
      </div>
    </div>
  );
}
