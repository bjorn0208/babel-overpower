// Visão "Construção da Mensagem" (modo cérebro) — tudo na mesma tela.
// Escolhe conversa → escolhe turno → percorre as 6 regiões no Próximo/Anterior,
// cada uma acende e o System Prompt cresce. Fonte: prompts_turno (motor v57+).

import { useMemo } from "react";
import SeletorConversa from "./SeletorConversa";
import RegiaoCerebro, { type EstadoRegiao } from "./RegiaoCerebro";
import PromptIncremental from "./PromptIncremental";
import MensagemLeadTurno from "./MensagemLeadTurno";
import { usePromptsTurno } from "./use-prompts-turno";
import { REGIOES } from "./regioes-mapa";

function fmtHora(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16);
  }
}

export default function VisaoConstrucao() {
  const {
    estado,
    carregarConversa,
    selecionarTurno,
    proximo,
    anterior,
    reiniciar,
    mensagensDoTurno,
    ultimoPasso,
  } = usePromptsTurno();

  const { turnos, turnoIdx, passoIdx, carregando, erro } = estado;
  const turno = turnoIdx >= 0 ? turnos[turnoIdx] : null;
  const blocos = turno?.blocos ?? null;
  const promptCompleto = turno?.prompt_completo ?? "";

  const estadoRegiao = useMemo(
    () =>
      (i: number): EstadoRegiao =>
        i < passoIdx ? "consolidada" : i === passoIdx ? "ativa" : "apagada",
    [passoIdx],
  );

  const regiaoAtual = passoIdx >= 0 && passoIdx < REGIOES.length ? REGIOES[passoIdx] : null;
  const noFim = passoIdx >= ultimoPasso;
  const msgsLead = turnoIdx >= 0 ? mensagensDoTurno(turnoIdx) : [];

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "oklch(0.10 0.02 240)",
        overflow: "hidden",
      }}
    >
      <SeletorConversa
        conversaAtual={turno?.conversa_id ?? null}
        carregando={carregando}
        aoSelecionar={carregarConversa}
      />

      {erro && (
        <div
          style={{
            margin: "10px 16px 0",
            padding: "8px 12px",
            borderRadius: 8,
            background: "oklch(0.22 0.06 60)",
            border: "1px solid oklch(0.5 0.13 60)",
            color: "oklch(0.85 0.10 60)",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          {erro}
        </div>
      )}

      {turnos.length > 0 && (
        <>
          {/* Seletor de turno */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "10px 16px 4px",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "oklch(0.55 0.06 240)",
              }}
            >
              Turno
            </span>
            {turnos.map((t, i) => (
              <button
                key={t.id}
                onClick={() => selecionarTurno(i)}
                title={`${fmtHora(t.criado_em)} · ${t.modelo_llm ?? "—"}`}
                style={{
                  background: i === turnoIdx ? "oklch(0.40 0.10 25)" : "oklch(0.17 0.02 240)",
                  border: `1px solid ${
                    i === turnoIdx ? "oklch(0.65 0.16 25)" : "oklch(0.28 0.03 240)"
                  }`,
                  borderRadius: 6,
                  color: i === turnoIdx ? "oklch(0.96 0.03 240)" : "oklch(0.6 0.03 240)",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "3px 10px",
                }}
              >
                {i + 1}
              </button>
            ))}
            <span style={{ fontSize: 11, color: "oklch(0.5 0.04 240)", marginLeft: 4 }}>
              {turno ? `${fmtHora(turno.criado_em)} · ${turno.modelo_llm ?? "—"}` : ""}
            </span>
          </div>

          {/* O que o lead enviou — a entrada que gerou este prompt */}
          <MensagemLeadTurno msgs={msgsLead} />

          {/* Faixa de regiões (cérebro) — linha do tempo esquerda→direita */}
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              gap: 0,
              padding: "12px 16px",
              overflowX: "auto",
            }}
          >
            {REGIOES.map((reg, i) => (
              <div key={reg.id} style={{ display: "flex", alignItems: "center", flex: "1 1 0" }}>
                <RegiaoCerebro
                  regiao={reg}
                  estado={estadoRegiao(i)}
                  blocos={blocos}
                  promptCompleto={promptCompleto}
                  aoClicar={() => {
                    // clicar numa região leva direto até ela
                    const delta = i - passoIdx;
                    if (delta > 0) for (let k = 0; k < delta; k++) proximo();
                    else if (delta < 0) for (let k = 0; k < -delta; k++) anterior();
                  }}
                />
                {i < REGIOES.length - 1 && (
                  <span
                    style={{
                      flexShrink: 0,
                      width: 26,
                      textAlign: "center",
                      fontSize: 16,
                      color:
                        i < passoIdx
                          ? `oklch(0.70 0.16 ${reg.hue})`
                          : "oklch(0.30 0.03 240)",
                      transition: "color 240ms ease-out",
                    }}
                  >
                    ▸
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Prompt crescendo */}
          <div style={{ flex: 1, minHeight: 0, padding: "0 16px 12px" }}>
            <PromptIncremental
              blocos={blocos}
              promptCompleto={promptCompleto}
              passoIdx={passoIdx}
            />
          </div>

          {/* Barra de navegação */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 16px",
              borderTop: "1px solid oklch(0.20 0.03 240)",
              background: "oklch(0.13 0.02 240)",
              flexShrink: 0,
            }}
          >
            <button
              onClick={anterior}
              disabled={passoIdx < 0}
              style={botao(passoIdx < 0)}
            >
              ◀ Anterior
            </button>
            <button
              onClick={proximo}
              disabled={noFim}
              style={botao(noFim, true)}
            >
              Próximo ▶
            </button>
            <button onClick={reiniciar} style={botao(false)}>
              ↺ Reiniciar
            </button>
            <span style={{ marginLeft: "auto", fontSize: 12, color: "oklch(0.7 0.04 240)" }}>
              {passoIdx < 0
                ? "Início — nada aceso ainda"
                : `${passoIdx + 1} / ${REGIOES.length} · ${regiaoAtual?.titulo ?? ""}`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function botao(desabilitado: boolean, primario = false): React.CSSProperties {
  return {
    background: desabilitado
      ? "oklch(0.18 0.02 240)"
      : primario
      ? "oklch(0.50 0.16 25)"
      : "oklch(0.22 0.03 240)",
    border: `1px solid ${desabilitado ? "oklch(0.24 0.02 240)" : "oklch(0.40 0.06 240)"}`,
    borderRadius: 7,
    color: desabilitado ? "oklch(0.40 0.02 240)" : "oklch(0.95 0.02 240)",
    cursor: desabilitado ? "not-allowed" : "pointer",
    fontSize: 12,
    fontWeight: 700,
    padding: "6px 16px",
    transition: "background 150ms ease-out",
  };
}
