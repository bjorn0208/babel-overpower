/**
 * painel-lead-provas.tsx — Steps de prova da jornada do lead (mock visual).
 *
 * Extraído de painel-lead-steps.tsx para manter cada arquivo ≤ 300 linhas.
 * Exporta: StepProvaGenerica, StepAssinatura, StepTestemunha.
 */

import React from "react";

import { estilosStep } from "./painel-lead-steps";

// ---------------------------------------------------------------------------
// StepProvaGenerica (selfie / documento)
// ---------------------------------------------------------------------------

export function StepProvaGenerica({
  titulo,
  descricao,
  onNext,
}: {
  titulo: string;
  descricao: string;
  onNext: () => void;
}): React.ReactElement {
  return (
    <>
      <div style={estilosStep.cabecalho}>{titulo}</div>
      <div style={estilosStep.subtitulo}>{descricao}</div>
      <div
        style={{
          padding: 30,
          textAlign: "center",
          border: "2px dashed oklch(0.7 0.01 270)",
          borderRadius: 12,
          background: "oklch(0.97 0.005 270)",
          margin: "10px 0",
          color: "oklch(0.5 0.01 270)",
          fontSize: 12,
        }}
      >
        📷 Toque para abrir a câmera
      </div>
      <button style={estilosStep.btnAvancar} onClick={onNext}>
        Continuar →
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// StepAssinatura
// ---------------------------------------------------------------------------

export function StepAssinatura({
  onNext,
}: {
  onNext: () => void;
}): React.ReactElement {
  return (
    <>
      <div style={estilosStep.cabecalho}>Assine aqui</div>
      <div style={estilosStep.subtitulo}>
        Use o dedo (ou o mouse) para desenhar sua assinatura.
      </div>
      <div
        style={{
          height: 160,
          border: "2px solid oklch(0.75 0.01 270)",
          borderRadius: 10,
          background: "oklch(1 0 0)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          margin: "10px 0",
        }}
      >
        <div
          style={{
            borderTop: "1px solid oklch(0.5 0.005 270)",
            width: "80%",
            padding: "4px 0",
            textAlign: "center",
            fontSize: 10,
            color: "oklch(0.5 0.01 270)",
          }}
        >
          assinar acima da linha
        </div>
      </div>
      <button style={estilosStep.btnAvancar} onClick={onNext}>
        Concluir assinatura →
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// StepTestemunha
// ---------------------------------------------------------------------------

export function StepTestemunha({
  num,
  onNext,
}: {
  num: number;
  onNext: () => void;
}): React.ReactElement {
  return (
    <>
      <div style={estilosStep.cabecalho}>
        Testemunha{num > 1 ? "s" : ""}
      </div>
      <div style={estilosStep.subtitulo}>
        Informe o nome e CPF{" "}
        {num > 1
          ? `das ${num} pessoas que testemunharam`
          : "de quem testemunhou"}{" "}
        a assinatura.
      </div>
      {Array.from({ length: num }, (_, i) => (
        <div
          key={i}
          style={{
            padding: 10,
            border: "1px solid oklch(0.85 0.005 270)",
            borderRadius: 10,
            background: "oklch(1 0 0)",
            marginBottom: 8,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>
            Testemunha {i + 1}
          </div>
          <div style={estilosStep.campo}>
            <label style={estilosStep.label}>Nome completo</label>
            <input
              type="text"
              style={estilosStep.input}
              placeholder="Nome da testemunha"
              readOnly
            />
          </div>
          <div style={estilosStep.campo}>
            <label style={estilosStep.label}>CPF</label>
            <input
              type="text"
              style={estilosStep.input}
              placeholder="000.000.000-00"
              readOnly
            />
          </div>
        </div>
      ))}
      <button style={estilosStep.btnAvancar} onClick={onNext}>
        Concluir →
      </button>
    </>
  );
}
