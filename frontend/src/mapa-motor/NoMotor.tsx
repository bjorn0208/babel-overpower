// Nó customizado do grafo do motor vivo
// Exibe label + badge de canal; destaque visual ao selecionar

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { COR_CANAL, COR_CANAL_BORDA, LABEL_CANAL } from "./layout";
import type { CanalNo } from "./tipos";

interface DadosNoMotor {
  label: string;
  canal: CanalNo;
  faz: string;
  ativa_proximo: string;
  fonte_dado_real: string;
  ref: string;
}

interface PropsNoMotor {
  data: DadosNoMotor;
  selected?: boolean;
}

function NoMotor({ data, selected }: PropsNoMotor) {
  const corFundo = COR_CANAL[data.canal] ?? "oklch(0.3 0.05 240)";
  const corBorda = COR_CANAL_BORDA[data.canal] ?? "oklch(0.4 0.05 240)";
  const labelCanal = LABEL_CANAL[data.canal] ?? data.canal;

  return (
    <div
      style={{
        background: corFundo,
        border: `2px solid ${selected ? "oklch(0.9 0.15 60)" : corBorda}`,
        borderRadius: 8,
        padding: "10px 14px",
        minWidth: 220,
        maxWidth: 280,
        boxShadow: selected
          ? "0 0 0 3px oklch(0.9 0.15 60 / 0.4)"
          : "0 2px 8px oklch(0 0 0 / 0.3)",
        cursor: "pointer",
        transition: "box-shadow 150ms ease-out, border-color 150ms ease-out",
      }}
    >
      {/* Handle de entrada (topo) */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: corBorda,
          width: 8,
          height: 8,
          border: "2px solid oklch(0.9 0.02 240)",
        }}
      />

      {/* Badge de canal */}
      <div
        style={{
          display: "inline-block",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "oklch(0.95 0.03 240)",
          background: "oklch(0 0 0 / 0.25)",
          borderRadius: 4,
          padding: "2px 6px",
          marginBottom: 6,
        }}
      >
        {labelCanal}
      </div>

      {/* Label principal */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "oklch(0.97 0.01 240)",
          lineHeight: 1.35,
          wordBreak: "break-word",
        }}
      >
        {data.label}
      </div>

      {/* Handle de saída (base) */}
      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: corBorda,
          width: 8,
          height: 8,
          border: "2px solid oklch(0.9 0.02 240)",
        }}
      />
    </div>
  );
}

export default memo(NoMotor);
