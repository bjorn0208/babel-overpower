/**
 * Aba Currículos — banco de talentos com aderência à vaga.
 * Fase visual: lista demo com filtro por vaga, barra de aderência e status
 * do processo (novo → entrevista → finalista → arquivado).
 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { fadeSlideIn, tapPress } from "@/os/motion/presets";
import type { Curriculo } from "./dados-demo";

const STATUS_ROTULO: Record<Curriculo["status"], { texto: string; cor: string }> = {
  novo: { texto: "Novo", cor: "oklch(0.7 0.18 220)" },
  entrevista: { texto: "Entrevista", cor: "oklch(0.75 0.16 75)" },
  finalista: { texto: "Finalista", cor: "oklch(0.72 0.18 145)" },
  arquivado: { texto: "Arquivado", cor: "oklch(0.98 0 0 / 0.4)" },
};

function corAderencia(p: number): string {
  if (p >= 80) return "oklch(0.72 0.18 145)";
  if (p >= 60) return "oklch(0.75 0.16 75)";
  return "oklch(0.65 0.24 25)";
}

type Props = { curriculos: Curriculo[] };

export function AbaCurriculos({ curriculos }: Props) {
  const vagas = useMemo(() => ["Todas", ...Array.from(new Set(curriculos.map((c) => c.vaga)))], [curriculos]);
  const [vaga, setVaga] = useState("Todas");
  const filtrados = vaga === "Todas" ? curriculos : curriculos.filter((c) => c.vaga === vaga);

  return (
    <motion.div variants={fadeSlideIn} initial="hidden" animate="visible" exit="hidden">
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {vagas.map((v) => {
          const ativa = vaga === v;
          return (
            <motion.button
              key={v}
              type="button"
              whileTap={tapPress}
              onClick={() => setVaga(v)}
              style={{
                padding: "6px 14px",
                fontSize: 11.5,
                fontWeight: ativa ? 700 : 500,
                borderRadius: 999,
                border: `1px solid ${ativa ? "oklch(0.7 0.18 220 / 0.5)" : "oklch(0.98 0 0 / 0.12)"}`,
                background: ativa ? "oklch(0.7 0.18 220 / 0.14)" : "transparent",
                color: ativa ? "oklch(0.98 0 0)" : "oklch(0.98 0 0 / 0.6)",
                cursor: "pointer",
              }}
            >
              {v}
            </motion.button>
          );
        })}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtrados.map((c) => {
          const st = STATUS_ROTULO[c.status];
          return (
            <div
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "13px 16px",
                borderRadius: 13,
                border: "1px solid oklch(0.98 0 0 / 0.09)",
                background: "oklch(0.98 0 0 / 0.03)",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.98 0 0)" }}>{c.nome}</div>
                <div style={{ fontSize: 11.5, color: "oklch(0.98 0 0 / 0.55)", marginTop: 2 }}>
                  {c.vaga} · {c.cidade} · recebido {c.recebidoEm}
                </div>
              </div>
              <div style={{ flex: "0 0 150px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, marginBottom: 4 }}>
                  <span style={{ color: "oklch(0.98 0 0 / 0.5)" }}>Aderência</span>
                  <span style={{ color: corAderencia(c.aderencia), fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{c.aderencia}%</span>
                </div>
                <div style={{ height: 5, borderRadius: 999, background: "oklch(0.98 0 0 / 0.08)", overflow: "hidden" }}>
                  <div style={{ width: `${c.aderencia}%`, height: "100%", borderRadius: 999, background: corAderencia(c.aderencia) }} />
                </div>
              </div>
              <div style={{ flex: "0 0 110px", fontSize: 11.5, color: "oklch(0.98 0 0 / 0.75)", fontVariantNumeric: "tabular-nums" }}>
                {c.pretensao}
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: st.cor, whiteSpace: "nowrap" }}>● {st.texto}</span>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14, fontSize: 11.5, color: "oklch(0.98 0 0 / 0.45)" }}>
        Demonstração — currículos reais chegam pelo formulário público de vagas quando o RH for ativado.
      </div>
    </motion.div>
  );
}
