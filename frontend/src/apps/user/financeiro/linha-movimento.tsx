/**
 * Linha de leitura de um movimento na lista: data, descrição, badges,
 * valor colorido e ações (doc · editar · excluir com confirmação de 2 cliques).
 */

import { motion } from "framer-motion";
import { tapPress } from "@/os/motion/presets";
import { badgeOrigem, formatBRL, type MovimentoFinanceiro } from "./tipos";

type Props = {
  m: MovimentoFinanceiro;
  armado: boolean;
  onDoc: () => void;
  onEditar: () => void;
  onExcluir: () => void;
};

export function LinhaMovimento({ m, armado, onDoc, onEditar, onExcluir }: Props) {
  const bo = badgeOrigem(m.origem);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
      borderRadius: 10, background: "oklch(0.18 0.06 280 / 0.25)",
      border: "1px solid oklch(0.98 0 0 / 0.06)",
    }}>
      <div style={{ width: 76, fontSize: 11, color: "oklch(0.98 0 0 / 0.55)" }}>
        {m.data_movimento ? m.data_movimento.split("-").reverse().slice(0, 2).join("/") : "—"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "oklch(0.98 0 0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {m.descricao || "(sem descrição)"}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
          {m.categoria && <span style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.5)" }}>{m.categoria}</span>}
          <span style={{ fontSize: 10, padding: "1px 8px", borderRadius: 999, color: bo.cor, background: bo.fundo }}>
            {bo.rotulo}
          </span>
        </div>
      </div>
      <div style={{
        fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
        color: m.tipo === "entrada" ? "oklch(0.72 0.18 145)" : "oklch(0.65 0.24 25)",
      }}>
        {m.tipo === "entrada" ? "+" : "−"}{formatBRL(Number(m.valor))}
      </div>
      {m.documento_id && (
        <motion.button whileTap={tapPress} type="button" onClick={onDoc} title="Ver documento" style={botaoAcao}>
          doc
        </motion.button>
      )}
      <motion.button whileTap={tapPress} type="button" onClick={onEditar} title="Editar lançamento" style={botaoAcao}>
        editar
      </motion.button>
      <motion.button whileTap={tapPress} type="button" onClick={onExcluir}
        title={armado ? "Clique de novo pra confirmar" : "Excluir"}
        style={{ ...botaoAcao, color: armado ? "oklch(0.65 0.24 25)" : "oklch(0.98 0 0 / 0.55)" }}>
        {armado ? "confirmar?" : "excluir"}
      </motion.button>
    </div>
  );
}

const botaoAcao: React.CSSProperties = {
  fontSize: 10, padding: "4px 8px", borderRadius: 8,
  border: "1px solid oklch(0.98 0 0 / 0.1)", background: "transparent",
  color: "oklch(0.98 0 0 / 0.55)", cursor: "pointer", whiteSpace: "nowrap",
};
