/**
 * Barra de filtros — pílulas no topo da tela Conversas.
 *
 * Pílula = vista sobre o mesmo pool (skill impeccable distill).
 * Quando o cargo da conversa muda, ela migra entre pílulas — funil em movimento.
 *
 * Mapeamento:
 *  - Todas       → sem filtro
 *  - Atendimento → cargo.tipologia = atendimento
 *  - Vendas      → cargo.nome = "Vendedor"
 *  - Clientes    → estado IN (cliente, cliente_em_campanha) · location='cliente'
 *  - Contratos assinados → lead com contratos.assinado_em preenchido
 */

import { Download } from "lucide-react";
import { motion } from "framer-motion";
import { duration, easing, tapPress } from "@/os/motion/presets";
import type { FiltroPilula } from "./tipos";

interface BarraFiltrosProps {
  filtro: FiltroPilula;
  contadores: Record<FiltroPilula, number>;
  onMudar: (f: FiltroPilula) => void;
  /** Estado do toggle de IA geral — alinhado com as pílulas */
  iaGeralAtiva?: boolean;
  /** Callback do toggle */
  onToggleIAGeral?: () => void;
  onExportar?: () => void;
  exportando?: boolean;
}

interface PilulaConfig {
  id: FiltroPilula;
  rotulo: string;
  icone: string;
}

const PILULAS: readonly PilulaConfig[] = [
  { id: "todas", rotulo: "Todas", icone: "●" },
  { id: "atendimento", rotulo: "Atendimento", icone: "👋" },
  { id: "vendas", rotulo: "Vendas", icone: "💼" },
  { id: "clientes", rotulo: "Clientes", icone: "✅" },
  { id: "contratos", rotulo: "Contratos assinados", icone: "✍️" },
  { id: "instagram", rotulo: "Instagram", icone: "📷" },
];

export function BarraFiltros({ filtro, contadores, onMudar, iaGeralAtiva, onToggleIAGeral, onExportar, exportando }: BarraFiltrosProps) {
  return (
    <div
      role="tablist"
      aria-label="Filtrar conversas por modo"
      style={{
        display: "flex",
        gap: 6,
        padding: "10px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      {PILULAS.filter((p) => p.id !== "instagram" || (contadores.instagram ?? 0) > 0 || filtro === "instagram").map((p) => {
        const ativo = filtro === p.id;
        const count = contadores[p.id] ?? 0;
        return (
          <motion.button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={ativo}
            aria-label={`${p.rotulo} · ${count} ${count === 1 ? "conversa" : "conversas"}`}
            onClick={() => onMudar(p.id)}
            whileHover={{ scale: 1.04, transition: { duration: duration.fast, ease: easing.outExpo } }}
            whileTap={tapPress}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              borderRadius: 999,
              border: ativo
                ? "1px solid oklch(0.7 0.18 220 / 0.6)"
                : "1px solid rgba(255,255,255,0.08)",
              background: ativo
                ? "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.18), oklch(0.65 0.22 280 / 0.18))"
                : "rgba(255,255,255,0.03)",
              color: ativo ? "var(--txt-1)" : "var(--txt-3)",
              fontSize: 12,
              fontWeight: ativo ? 600 : 500,
              cursor: "pointer",
              transition: "background 220ms cubic-bezier(0.16, 1, 0.3, 1), border-color 220ms",
              boxShadow: ativo ? "0 0 12px oklch(0.7 0.18 220 / 0.18)" : "none",
            }}
          >
            <span aria-hidden="true">{p.icone}</span>
            <span>{p.rotulo}</span>
            <span
              className="mono"
              style={{
                fontSize: 10,
                opacity: 0.75,
                padding: "1px 6px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.06)",
                marginLeft: 2,
              }}
            >
              {count}
            </span>
          </motion.button>
        );
      })}

      {onExportar && (
        <motion.button
          type="button"
          onClick={onExportar}
          disabled={exportando}
          aria-busy={exportando}
          whileHover={{ scale: 1.04, transition: { duration: duration.fast, ease: easing.outExpo } }}
          whileTap={tapPress}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 12px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.03)",
            color: "var(--txt-3)",
            fontSize: 12,
            fontWeight: 500,
            cursor: exportando ? "wait" : "pointer",
            opacity: exportando ? 0.6 : 1,
          }}
        >
          <Download size={13} aria-hidden="true" />
          {exportando ? "Exportando…" : "Exportar XLS"}
        </motion.button>
      )}

      {onToggleIAGeral && <div style={{ flex: 1 }} />}

      {onToggleIAGeral && (
          <motion.button
            type="button"
            onClick={onToggleIAGeral}
            aria-pressed={!!iaGeralAtiva}
            aria-label={iaGeralAtiva ? "Pausar IA em todas as conversas" : "Ligar IA em todas as conversas"}
            whileHover={{ scale: 1.04, transition: { duration: duration.fast, ease: easing.outExpo } }}
            whileTap={tapPress}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              borderRadius: 999,
              border: iaGeralAtiva
                ? "1px solid oklch(0.78 0.18 80 / 0.45)"
                : "1px solid oklch(0.72 0.20 145 / 0.45)",
              background: iaGeralAtiva
                ? "oklch(0.78 0.18 80 / 0.10)"
                : "oklch(0.72 0.20 145 / 0.12)",
              color: iaGeralAtiva ? "oklch(0.88 0.18 80)" : "oklch(0.85 0.20 145)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: iaGeralAtiva ? "oklch(0.78 0.18 80)" : "oklch(0.72 0.20 145)",
                boxShadow: iaGeralAtiva
                  ? "0 0 6px oklch(0.78 0.18 80 / 0.7)"
                  : "0 0 6px oklch(0.72 0.20 145 / 0.7)",
              }}
            />
            <span>{iaGeralAtiva ? "Pausar IA geral" : "Ligar IA geral"}</span>
          </motion.button>
      )}
    </div>
  );
}
