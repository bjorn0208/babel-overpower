/**
 * Aba Acompanhamento — solicitações com linha do tempo de etapas
 * (Recebida pela Babel → Em análise → Propostas → Liberado) e as
 * propostas dos bancos quando a etapa chega lá.
 */

import { motion } from "framer-motion";
import { fadeSlideIn } from "@/os/motion/presets";
import { ETAPAS, type SolicitacaoCredito } from "./dados-demo";

const BORDA = "1px solid oklch(0.98 0 0 / 0.09)";
const AZUL = "oklch(0.7 0.18 220)";
const VERDE = "oklch(0.72 0.18 145)";

function LinhaDoTempo({ etapa }: { etapa: SolicitacaoCredito["etapa"] }) {
  const indiceAtual = ETAPAS.findIndex((e) => e.id === etapa);
  return (
    <div style={{ display: "flex", alignItems: "flex-start", marginTop: 14 }}>
      {ETAPAS.map((e, i) => {
        const feita = i < indiceAtual;
        const atual = i === indiceAtual;
        const cor = feita ? VERDE : atual ? AZUL : "oklch(0.98 0 0 / 0.18)";
        return (
          <div key={e.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
            {i > 0 && (
              <span style={{ position: "absolute", top: 6, right: "50%", width: "100%", height: 2, background: feita || atual ? VERDE : "oklch(0.98 0 0 / 0.1)" }} />
            )}
            <span
              style={{
                width: 14, height: 14, borderRadius: "50%", zIndex: 1,
                background: feita || atual ? cor : "oklch(0.22 0.02 265)",
                border: `2px solid ${cor}`,
                boxShadow: atual ? `0 0 10px ${AZUL}` : "none",
              }}
            />
            <span style={{ fontSize: 10, marginTop: 6, textAlign: "center", maxWidth: 90, lineHeight: 1.35, color: atual ? "oklch(0.98 0 0)" : "oklch(0.98 0 0 / 0.5)", fontWeight: atual ? 700 : 500 }}>
              {e.rotulo}
            </span>
          </div>
        );
      })}
    </div>
  );
}

type Props = { solicitacoes: SolicitacaoCredito[] };

export function AbaAcompanhamento({ solicitacoes }: Props) {
  return (
    <motion.div variants={fadeSlideIn} initial="hidden" animate="visible" exit="hidden" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {solicitacoes.length === 0 && (
        <div style={{ padding: "48px 20px", textAlign: "center", fontSize: 12.5, color: "oklch(0.98 0 0 / 0.45)" }}>
          Nenhuma solicitação ainda — faça a primeira na aba Solicitar.
        </div>
      )}

      {solicitacoes.map((s) => (
        <div key={s.id} style={{ padding: "16px 18px", borderRadius: 14, border: BORDA, background: "oklch(0.98 0 0 / 0.03)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "oklch(0.98 0 0)" }}>{s.modalidade}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "oklch(0.9 0.05 220)", fontVariantNumeric: "tabular-nums" }}>{s.valor}</span>
            <span style={{ fontSize: 11.5, color: "oklch(0.98 0 0 / 0.5)" }}>· {s.prazo}</span>
            <span style={{ marginLeft: "auto", fontSize: 10.5, color: "oklch(0.98 0 0 / 0.45)" }}>enviada em {s.criadaEm}</span>
          </div>
          {s.observacao && (
            <div style={{ fontSize: 11.5, color: "oklch(0.98 0 0 / 0.6)", marginTop: 4 }}>“{s.observacao}”</div>
          )}

          <LinhaDoTempo etapa={s.etapa} />

          {s.etapa === "recebida" && (
            <div style={{ marginTop: 14, fontSize: 11.5, color: "oklch(0.98 0 0 / 0.6)" }}>
              A Babel recebeu sua solicitação e já está preparando o dossiê pros bancos.
            </div>
          )}

          {s.propostas.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "oklch(0.98 0 0)", marginBottom: 8 }}>
                Propostas capturadas pela Babel
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                {s.propostas.map((p) => (
                  <div
                    key={p.banco}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: p.destaque ? `1px solid ${VERDE}` : BORDA,
                      background: p.destaque ? "oklch(0.72 0.18 145 / 0.07)" : "oklch(0.98 0 0 / 0.03)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: "oklch(0.98 0 0)" }}>{p.banco}</span>
                      {p.destaque && <span style={{ fontSize: 9.5, fontWeight: 800, color: VERDE }}>MELHOR TAXA</span>}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: p.destaque ? VERDE : "oklch(0.98 0 0 / 0.9)", fontVariantNumeric: "tabular-nums" }}>{p.taxa}</div>
                    <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)", marginTop: 4 }}>{p.prazo} · parcela {p.parcela}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      <div style={{ fontSize: 11.5, color: "oklch(0.98 0 0 / 0.45)" }}>
        Demonstração — quando o fluxo real for ligado, cada solicitação chega na hora pro time da Babel correr os bancos.
      </div>
    </motion.div>
  );
}
