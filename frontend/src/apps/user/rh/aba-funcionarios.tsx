/**
 * Aba Funcionários — quadro da equipe com informações trabalhistas.
 * Fase visual: cards com dados demo (regime, admissão, salário, status).
 */

import { motion } from "framer-motion";
import { fadeSlideIn } from "@/os/motion/presets";
import type { Funcionario } from "./dados-demo";

const STATUS_ROTULO: Record<Funcionario["status"], { texto: string; cor: string }> = {
  ativo: { texto: "Ativo", cor: "oklch(0.72 0.18 145)" },
  ferias: { texto: "Em férias", cor: "oklch(0.75 0.16 75)" },
  experiencia: { texto: "Experiência", cor: "oklch(0.7 0.18 220)" },
};

function iniciais(nome: string): string {
  const partes = nome.split(" ").filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes[partes.length - 1]?.[0] ?? "")).toUpperCase();
}

type Props = { funcionarios: Funcionario[] };

export function AbaFuncionarios({ funcionarios }: Props) {
  return (
    <motion.div variants={fadeSlideIn} initial="hidden" animate="visible" exit="hidden">
      <div style={{ display: "flex", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { rotulo: "Pessoas na equipe", valor: String(funcionarios.length) },
          { rotulo: "Folha do mês", valor: "R$ 11.720,00" },
          { rotulo: "Próximo aniversário", valor: "Ana Beatriz — 12/08" },
        ].map((k) => (
          <div key={k.rotulo} style={{ flex: "1 1 180px", padding: "12px 14px", borderRadius: 12, background: "oklch(0.98 0 0 / 0.04)", border: "1px solid oklch(0.98 0 0 / 0.08)" }}>
            <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.5)", marginBottom: 4 }}>{k.rotulo}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "oklch(0.98 0 0 / 0.94)" }}>{k.valor}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
        {funcionarios.map((f) => {
          const st = STATUS_ROTULO[f.status];
          return (
            <div
              key={f.id}
              style={{
                padding: 16,
                borderRadius: 14,
                border: "1px solid oklch(0.98 0 0 / 0.09)",
                background: "oklch(0.98 0 0 / 0.03)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <span
                  style={{
                    display: "grid",
                    placeItems: "center",
                    width: 42,
                    height: 42,
                    borderRadius: "50%",
                    fontSize: 14,
                    fontWeight: 700,
                    color: "oklch(0.95 0.03 220)",
                    background: "linear-gradient(180deg, oklch(0.7 0.18 220 / 0.28), oklch(0.65 0.22 280 / 0.2))",
                  }}
                >
                  {iniciais(f.nome)}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "oklch(0.98 0 0)" }}>{f.nome}</div>
                  <div style={{ fontSize: 11.5, color: "oklch(0.98 0 0 / 0.55)" }}>{f.cargo}</div>
                </div>
                <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 700, color: st.cor, whiteSpace: "nowrap" }}>
                  ● {st.texto}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 14px", fontSize: 11.5 }}>
                <div><span style={{ color: "oklch(0.98 0 0 / 0.45)" }}>Regime</span><div style={{ color: "oklch(0.98 0 0 / 0.9)", fontWeight: 600 }}>{f.regime}</div></div>
                <div><span style={{ color: "oklch(0.98 0 0 / 0.45)" }}>Admissão</span><div style={{ color: "oklch(0.98 0 0 / 0.9)", fontWeight: 600 }}>{f.admissao}</div></div>
                <div><span style={{ color: "oklch(0.98 0 0 / 0.45)" }}>Salário</span><div style={{ color: "oklch(0.98 0 0 / 0.9)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{f.salario}</div></div>
                <div><span style={{ color: "oklch(0.98 0 0 / 0.45)" }}>Aniversário</span><div style={{ color: "oklch(0.98 0 0 / 0.9)", fontWeight: 600 }}>{f.aniversario}</div></div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14, fontSize: 11.5, color: "oklch(0.98 0 0 / 0.45)" }}>
        Demonstração — o quadro liga na Equipe real do sistema quando o módulo de RH for ativado.
      </div>
    </motion.div>
  );
}
