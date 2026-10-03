/**
 * Campo Personalidade da aba Identidade — bloco expansível.
 * Fechado: cabeçalho clicável com prévia de 1 linha. Aberto: a seta gira e o
 * texto inteiro aparece numa textarea que cresce com o conteúdo (sem scroll interno).
 * `ResumoPrompt` é a categoria separada que mostra como tudo vai pro prompt do agente.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function CampoPersonalidade({
  valor,
  aoMudar,
}: {
  valor: string;
  aoMudar: (texto: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const previa = valor.trim().replace(/\s+/g, " ");
  const linhas = Math.max(3, valor.split("\n").length + Math.ceil(valor.length / 90));

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          className="muted tiny"
          style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, flexShrink: 0 }}
        >
          Personalidade (1-3 frases)
        </span>
        {!aberto && (
          <span
            className="muted small"
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontStyle: previa ? "normal" : "italic",
            }}
          >
            {previa || "toque pra escrever o jeitão do agente"}
          </span>
        )}
        <ChevronDown
          size={14}
          aria-hidden="true"
          style={{
            marginLeft: "auto",
            flexShrink: 0,
            opacity: 0.55,
            transform: aberto ? "rotate(180deg)" : "none",
            transition: "transform 0.18s ease-out",
          }}
        />
      </button>

      {aberto && (
        <div style={{ padding: "0 12px 12px" }}>
          <textarea
            className="input"
            autoFocus
            value={valor}
            rows={linhas}
            onChange={(e) => aoMudar(e.target.value)}
            placeholder="Quem o agente é, o jeitão. Vai direto pro system prompt."
            style={{ resize: "none", overflow: "hidden" }}
          />
        </div>
      )}
    </div>
  );
}

export function ResumoPrompt({
  nome,
  cargo,
  personalidade,
  tom,
}: {
  nome: string;
  cargo: string;
  personalidade: string;
  tom: string;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          className="muted tiny"
          style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          Como vai pro prompt do agente
        </span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          style={{
            marginLeft: "auto",
            flexShrink: 0,
            opacity: 0.55,
            transform: aberto ? "rotate(180deg)" : "none",
            transition: "transform 0.18s ease-out",
          }}
        />
      </button>

      {aberto && (
        <p className="muted small" style={{ margin: 0, padding: "0 12px 12px", lineHeight: 1.55 }}>
          <em>
            "Você é {nome || "Nome"}
            {cargo ? `, ${cargo}` : ""}.{personalidade ? ` ${personalidade}` : ""} Tom de voz:{" "}
            {tom || "espelhado"}."
          </em>
        </p>
      )}
    </div>
  );
}
