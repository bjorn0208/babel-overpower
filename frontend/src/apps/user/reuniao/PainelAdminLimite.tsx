// @ts-nocheck
/**
 * PainelAdminLimite — seção exclusiva para platform_admin no app Reunião.
 *
 * Permite alterar o teto global de participantes por sala
 * (config_plataforma.reuniao_limite_participantes).
 * RLS bloqueia qualquer não-admin no banco — este painel só aparece
 * se useRole().isAdmin = true (detecção via profiles.system_role).
 */

import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Props = {
  configId: string;
  tetoAtual: number;
  onTetoAtualizado: (novoTeto: number) => void;
};

// ─── Estilos ─────────────────────────────────────────────────────────────────

const s = {
  secao: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
    borderTop: "1px solid oklch(0.5 0.18 50 / 0.25)",
    paddingTop: 16,
  },
  cabecalho: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  titulo: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "oklch(0.72 0.12 50)",
    textTransform: "uppercase" as const,
  },
  badgeAdmin: {
    fontSize: 9,
    fontWeight: 700,
    padding: "2px 6px",
    borderRadius: 999,
    background: "oklch(0.28 0.08 50 / 0.35)",
    color: "oklch(0.78 0.14 50)",
    border: "1px solid oklch(0.5 0.12 50 / 0.4)",
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
  },
  card: {
    background: "oklch(0.16 0.03 264 / 0.8)",
    border: "1px solid oklch(0.5 0.12 50 / 0.25)",
    borderRadius: 14,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 12,
  },
  descricao: {
    fontSize: 12,
    color: "oklch(0.62 0.03 264)",
    lineHeight: 1.5,
  },
  linha: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap" as const,
  },
  inputNumero: {
    width: 80,
    background: "oklch(0.18 0.03 264)",
    border: "1px solid oklch(0.35 0.06 264 / 0.6)",
    borderRadius: 8,
    padding: "7px 10px",
    color: "oklch(0.88 0.02 264)",
    fontSize: 14,
    fontWeight: 600,
    textAlign: "center" as const,
    outline: "none",
  },
  label: {
    fontSize: 12,
    color: "oklch(0.65 0.03 264)",
  },
  btnSalvar: {
    padding: "8px 18px",
    background: "oklch(0.48 0.14 50)",
    border: "none",
    borderRadius: 999,
    color: "#fff",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    transition: "opacity 0.15s",
  },
  aviso: {
    fontSize: 11,
    color: "oklch(0.62 0.08 50)",
    fontStyle: "italic" as const,
  },
} as const;

// ─── Componente ──────────────────────────────────────────────────────────────

export default function PainelAdminLimite({ configId, tetoAtual, onTetoAtualizado }: Props) {
  const [valor, setValor] = useState(tetoAtual);
  const [salvando, setSalvando] = useState(false);

  // Sincroniza campo quando tetoAtual muda externamente
  // (ex.: quando o boot termina de carregar)
  const valorSeguro = Math.min(50, Math.max(2, valor));

  async function handleSalvar() {
    const novoTeto = Math.min(50, Math.max(2, valorSeguro));
    if (novoTeto === tetoAtual) {
      toast.info("O limite já está com esse valor.");
      return;
    }
    setSalvando(true);
    try {
      const { error } = await supabase
        .from("config_plataforma")
        .update({ reuniao_limite_participantes: novoTeto })
        .eq("id", configId);
      if (error) throw error;
      onTetoAtualizado(novoTeto);
      toast.success(`Limite atualizado para ${novoTeto} participantes por sala.`);
    } catch (err) {
      console.error("[Reunião/Admin] salvar teto", err);
      toast.error("Não foi possível salvar. Verifique suas permissões.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={s.secao}>
      <div style={s.cabecalho}>
        <span style={s.titulo}>Limite de participantes</span>
        <span style={s.badgeAdmin}>Admin</span>
      </div>

      <div style={s.card}>
        <p style={s.descricao}>
          Teto global de participantes por sala. Todas as salas novas respeitam este limite. Salas
          já criadas não são afetadas retroativamente.
        </p>

        <div style={s.linha}>
          <label style={s.label} htmlFor="input-teto-reuniao">
            Máximo por sala
          </label>
          <input
            id="input-teto-reuniao"
            type="number"
            min={2}
            max={50}
            value={valor}
            onChange={(e) => setValor(Number(e.target.value))}
            onBlur={() => setValor(Math.min(50, Math.max(2, valor)))}
            style={s.inputNumero}
            aria-label="Limite máximo de participantes por sala"
          />
          <button
            type="button"
            className="reu-btn"
            onClick={() => void handleSalvar()}
            disabled={salvando}
            style={s.btnSalvar}
          >
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>

        <span style={s.aviso}>Intervalo permitido: 2 a 50 participantes.</span>
      </div>
    </div>
  );
}
