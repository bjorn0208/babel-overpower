/**
 * Aba Solicitar — formulário de pedido de crédito.
 * O envio entrega a solicitação pra Babel (fase visual: entra na lista
 * local com etapa "recebida" e o app troca pro acompanhamento).
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { fadeSlideIn, tapPress } from "@/os/motion/presets";
import { MODALIDADES, type SolicitacaoCredito } from "./dados-demo";

const BORDA = "1px solid oklch(0.98 0 0 / 0.1)";

const campoStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontSize: 12.5,
  borderRadius: 10,
  border: BORDA,
  background: "oklch(0.98 0 0 / 0.04)",
  color: "oklch(0.98 0 0)",
  outline: "none",
};

const rotuloStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11.5,
  fontWeight: 600,
  color: "oklch(0.98 0 0 / 0.65)",
  marginBottom: 6,
};

type Props = { onEnviar: (s: SolicitacaoCredito) => void };

export function AbaSolicitar({ onEnviar }: Props) {
  const [modalidade, setModalidade] = useState(MODALIDADES[0]);
  const [valor, setValor] = useState("");
  const [prazo, setPrazo] = useState("24 meses");
  const [faturamento, setFaturamento] = useState("");
  const [garantia, setGarantia] = useState("Sem garantia");
  const [observacao, setObservacao] = useState("");

  const enviar = () => {
    if (!valor.trim()) return;
    onEnviar({
      id: `nova-${Date.now()}`,
      modalidade,
      valor: valor.trim(),
      prazo,
      etapa: "recebida",
      criadaEm: new Date().toLocaleDateString("pt-BR"),
      observacao: observacao.trim() || undefined,
      propostas: [],
    });
  };

  return (
    <motion.div variants={fadeSlideIn} initial="hidden" animate="visible" exit="hidden" style={{ maxWidth: 640 }}>
      <div
        style={{
          padding: "14px 16px",
          marginBottom: 18,
          borderRadius: 13,
          border: "1px solid oklch(0.7 0.18 220 / 0.25)",
          background: "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.1), oklch(0.65 0.22 280 / 0.06))",
          fontSize: 12.5,
          lineHeight: 1.6,
          color: "oklch(0.98 0 0 / 0.8)",
        }}
      >
        Conta o que você precisa que a <strong style={{ color: "oklch(0.98 0 0)" }}>Babel captura a solicitação</strong> e
        corre os bancos e cooperativas por você — as propostas chegam na aba Acompanhamento.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={rotuloStyle}>Modalidade</label>
          <select value={modalidade} onChange={(e) => setModalidade(e.target.value)} style={campoStyle}>
            {MODALIDADES.map((m) => <option key={m} value={m} style={{ background: "#1a1a24" }}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={rotuloStyle}>Valor desejado</label>
          <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="R$ 50.000,00" inputMode="numeric" style={campoStyle} />
        </div>
        <div>
          <label style={rotuloStyle}>Prazo pretendido</label>
          <select value={prazo} onChange={(e) => setPrazo(e.target.value)} style={campoStyle}>
            {["12 meses", "18 meses", "24 meses", "36 meses", "48 meses", "60 meses"].map((p) => (
              <option key={p} value={p} style={{ background: "#1a1a24" }}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={rotuloStyle}>Faturamento mensal médio</label>
          <input value={faturamento} onChange={(e) => setFaturamento(e.target.value)} placeholder="R$ 35.000,00" inputMode="numeric" style={campoStyle} />
        </div>
        <div>
          <label style={rotuloStyle}>Garantia</label>
          <select value={garantia} onChange={(e) => setGarantia(e.target.value)} style={campoStyle}>
            {["Sem garantia", "Imóvel", "Veículo", "Equipamento", "Recebíveis"].map((g) => (
              <option key={g} value={g} style={{ background: "#1a1a24" }}>{g}</option>
            ))}
          </select>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={rotuloStyle}>Pra que é o crédito? (opcional)</label>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={3}
            placeholder="Ex: comprar estoque pro fim de ano, trocar a máquina principal…"
            style={{ ...campoStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }}
          />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
        <motion.button
          type="button"
          whileTap={tapPress}
          onClick={enviar}
          disabled={!valor.trim()}
          style={{
            padding: "11px 26px",
            fontSize: 13,
            fontWeight: 700,
            borderRadius: 11,
            border: "none",
            cursor: valor.trim() ? "pointer" : "default",
            opacity: valor.trim() ? 1 : 0.45,
            color: "oklch(0.98 0 0)",
            background: "linear-gradient(180deg, oklch(0.7 0.18 220 / 0.4), oklch(0.65 0.22 280 / 0.3))",
          }}
        >
          Enviar pra Babel
        </motion.button>
        <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.45)" }}>
          Sem compromisso — você só decide quando as propostas chegarem.
        </span>
      </div>
    </motion.div>
  );
}
