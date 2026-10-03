/**
 * PainelProvas — 4 toggles de prova + sub-config + preview textual da jornada.
 *
 * Toggles: selfie, documento, assinatura_manuscrita, testemunha.
 * Sub-config: instrucao_selfie (select) + num_testemunhas (1–3).
 * Preview: lista ordenada dos passos ativos (lê jornada_ordem do template).
 */

import type { TemplateV2, ProvasConfig, PassoJornada } from "../tipos";
import { stepAtivo, instrucaoSelfieLabel } from "./logica";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PainelProvasProps {
  template: TemplateV2;
  onPatch: (parcial: Partial<TemplateV2>) => void;
}

// ---------------------------------------------------------------------------
// Catálogo de toggles
// ---------------------------------------------------------------------------

interface ItemProva {
  chave: keyof Pick<ProvasConfig, "selfie" | "documento" | "assinatura_manuscrita" | "testemunha">;
  icone: string;
  nome: string;
  descricao: string;
}

const ITENS_PROVA: ItemProva[] = [
  {
    chave: "selfie",
    icone: "📷",
    nome: "Selfie ao vivo do contato",
    descricao: "Foto do rosto tirada na hora pela câmera do dispositivo.",
  },
  {
    chave: "documento",
    icone: "🪪",
    nome: "Foto do documento (RG/CNH)",
    descricao: "Contato anexa imagem do documento com foto.",
  },
  {
    chave: "assinatura_manuscrita",
    icone: "✍️",
    nome: "Assinatura manuscrita no canvas",
    descricao: "Contato desenha a assinatura usando o dedo ou o mouse.",
  },
  {
    chave: "testemunha",
    icone: "👥",
    nome: "Testemunha obrigatória",
    descricao: "Pede nome e CPF de quem testemunha a assinatura.",
  },
];

// ---------------------------------------------------------------------------
// Label dos passos para o preview
// ---------------------------------------------------------------------------

function labelPasso(step: PassoJornada, template: TemplateV2): string {
  const provas = template.provas;
  switch (step) {
    case "dados":        return `Preencher ${(template.campos_cliente ?? []).length} campo(s)`;
    case "pagamento":    return "Escolher forma de pagamento";
    case "contrato":     return "Ler e revisar o contrato";
    case "comprovante":  return "Enviar comprovante de pagamento";
    case "selfie": {
      const instr = instrucaoSelfieLabel(provas?.instrucao_selfie ?? "");
      return `Tirar selfie ao vivo${instr ? ` (${instr})` : ""}`;
    }
    case "documento":    return "Fotografar o documento (RG/CNH)";
    case "assinatura":   return "Assinar no canvas";
    case "testemunha":   return `Informar ${provas?.num_testemunhas || 1} testemunha(s)`;
    default:             return step;
  }
}

// ---------------------------------------------------------------------------
// Sub-componente: toggle row
// ---------------------------------------------------------------------------

function ToggleRow({
  item,
  ligado,
  onToggle,
  children,
}: {
  item: ItemProva;
  ligado: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{ ...estilos.provaRow, ...(ligado ? estilos.provaRowAtiva : {}) }}
        onClick={onToggle}
        role="switch"
        aria-checked={ligado}
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onToggle()}
      >
        <span style={estilos.provaIcone} aria-hidden="true">{item.icone}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={estilos.provaNome}>{item.nome}</div>
          <div style={estilos.provaDesc}>{item.descricao}</div>
        </div>
        {/* Toggle visual */}
        <button
          style={{ ...estilos.toggle, ...(ligado ? estilos.toggleAtivo : {}) }}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          aria-label={`${ligado ? "Desligar" : "Ligar"} ${item.nome}`}
          tabIndex={-1}
        >
          <span
            style={{
              ...estilos.toggleThumb,
              transform: ligado ? "translateX(18px)" : "translateX(2px)",
            }}
          />
        </button>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function PainelProvas({ template, onPatch }: PainelProvasProps) {
  const provas: ProvasConfig = template.provas ?? {
    selfie: false,
    documento: false,
    assinatura_manuscrita: false,
    testemunha: false,
    num_testemunhas: 1,
    instrucao_selfie: "",
  };

  function patchProva<K extends keyof ProvasConfig>(k: K, v: ProvasConfig[K]) {
    onPatch({ provas: { ...provas, [k]: v } });
  }

  function alternarSelfie() {
    const ligar = !provas.selfie;
    onPatch({
      provas: {
        ...provas,
        selfie: ligar,
        instrucao_selfie: ligar ? provas.instrucao_selfie : "",
      },
    });
  }

  function alternarTestemunha() {
    const ligar = !provas.testemunha;
    onPatch({
      provas: {
        ...provas,
        testemunha: ligar,
        num_testemunhas: ligar ? Math.max(1, provas.num_testemunhas || 1) : 0,
      },
    });
  }

  // Passos ativos na ordem configurada
  const ordem: PassoJornada[] = template.jornada_ordem ?? [
    "dados", "pagamento", "contrato", "comprovante",
    "selfie", "documento", "assinatura", "testemunha",
  ];
  const passosAtivos = ordem.filter((s) => stepAtivo(s, template));

  return (
    <div style={estilos.container}>
      <h3 style={estilos.titulo}>Provas exigidas na assinatura</h3>
      <p style={estilos.subtitulo}>
        Provas dão <strong>validade jurídica</strong> ao aceite: identificam o contato e
        registram que ele leu e concordou. Cada item ligado vira um passo na jornada —
        a ordem você define na aba <strong>Pagamento</strong>.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Selfie */}
        <ToggleRow item={ITENS_PROVA[0]} ligado={provas.selfie} onToggle={alternarSelfie}>
          {provas.selfie && (
            <div style={estilos.subConfig}>
              <label style={estilos.label} htmlFor="instrucao-selfie">Instrução da selfie</label>
              <select
                id="instrucao-selfie"
                style={estilos.select}
                value={provas.instrucao_selfie ?? ""}
                onChange={(e) => patchProva("instrucao_selfie", e.target.value as ProvasConfig["instrucao_selfie"])}
              >
                <option value="">Sem instrução específica</option>
                <option value="mostrar_2_dedos">Mostrar 2 dedos na selfie</option>
                <option value="segurar_documento">Segurar o documento na selfie</option>
                <option value="documento_e_2_dedos">Segurar documento e mostrar 2 dedos</option>
              </select>
            </div>
          )}
        </ToggleRow>

        {/* Documento */}
        <ToggleRow
          item={ITENS_PROVA[1]}
          ligado={provas.documento}
          onToggle={() => patchProva("documento", !provas.documento)}
        />

        {/* Assinatura manuscrita */}
        <ToggleRow
          item={ITENS_PROVA[2]}
          ligado={provas.assinatura_manuscrita}
          onToggle={() => patchProva("assinatura_manuscrita", !provas.assinatura_manuscrita)}
        />

        {/* Testemunha */}
        <ToggleRow item={ITENS_PROVA[3]} ligado={provas.testemunha} onToggle={alternarTestemunha}>
          {provas.testemunha && (
            <div style={{ ...estilos.subConfig, maxWidth: 220 }}>
              <label style={estilos.label} htmlFor="num-testemunhas">Quantas testemunhas (1 a 3)</label>
              <input
                id="num-testemunhas"
                style={estilos.input}
                type="number"
                min={1}
                max={3}
                value={provas.num_testemunhas || 1}
                onChange={(e) =>
                  patchProva("num_testemunhas", Math.max(1, Math.min(3, Number(e.target.value) || 1)))
                }
              />
            </div>
          )}
        </ToggleRow>
      </div>

      {/* Preview textual da jornada */}
      {passosAtivos.length > 0 && (
        <div style={estilos.previewJornada}>
          <div style={estilos.previewTitulo}>Jornada do lead (prévia)</div>
          <ol style={estilos.previewLista}>
            {passosAtivos.map((step) => (
              <li key={step} style={estilos.previewItem}>
                {labelPasso(step, template)}
              </li>
            ))}
          </ol>
          <div style={estilos.hint}>
            Reordene os passos na aba <strong>Pagamento</strong>.
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

const estilos = {
  container: { padding: "16px 14px" } as React.CSSProperties,
  titulo: { margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "oklch(0.97 0.005 270)" } as React.CSSProperties,
  subtitulo: { margin: "0 0 12px", fontSize: 11.5, color: "oklch(0.65 0.01 270)", lineHeight: 1.5 } as React.CSSProperties,
  label: { display: "block", fontSize: 11, fontWeight: 600, color: "oklch(0.65 0.01 270)", marginBottom: 4 } as React.CSSProperties,
  select: {
    width: "100%", padding: "7px 10px", fontSize: 13,
    background: "oklch(0.16 0.02 275)", border: "1px solid oklch(1 0 0 / 0.10)",
    borderRadius: 8, color: "oklch(0.97 0.005 270)", outline: "none", cursor: "pointer",
  } as React.CSSProperties,
  input: {
    width: "100%", boxSizing: "border-box" as const, padding: "7px 10px", fontSize: 13,
    background: "oklch(0.16 0.02 275)", border: "1px solid oklch(1 0 0 / 0.10)",
    borderRadius: 8, color: "oklch(0.97 0.005 270)", outline: "none",
  } as React.CSSProperties,
  hint: { fontSize: 10.5, color: "oklch(0.55 0.01 270)", marginTop: 6 } as React.CSSProperties,
  provaRow: {
    display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10,
    cursor: "pointer", userSelect: "none" as const,
    background: "oklch(0.20 0.02 275)", border: "1px solid oklch(1 0 0 / 0.08)",
    transition: "background 120ms ease, border-color 120ms ease",
  } as React.CSSProperties,
  provaRowAtiva: {
    background: "oklch(0.72 0.18 295 / 0.08)", border: "1px solid oklch(0.72 0.18 295 / 0.30)",
  } as React.CSSProperties,
  provaIcone: { fontSize: 18, flexShrink: 0 } as React.CSSProperties,
  provaNome: { fontSize: 13, fontWeight: 600, color: "oklch(0.97 0.005 270)" } as React.CSSProperties,
  provaDesc: { fontSize: 11, color: "oklch(0.65 0.01 270)", marginTop: 2, lineHeight: 1.4 } as React.CSSProperties,
  toggle: {
    width: 38, height: 22, borderRadius: 999, flexShrink: 0, cursor: "pointer",
    background: "oklch(0.30 0.02 275)", border: "none", padding: 0, position: "relative" as const,
    transition: "background 200ms ease",
  } as React.CSSProperties,
  toggleAtivo: {
    background: "oklch(0.72 0.18 295)",
  } as React.CSSProperties,
  toggleThumb: {
    position: "absolute" as const, top: 2, width: 18, height: 18, borderRadius: "50%",
    background: "oklch(0.97 0 0)", transition: "transform 200ms ease",
    boxShadow: "0 1px 3px oklch(0 0 0 / 0.3)",
  } as React.CSSProperties,
  subConfig: {
    padding: "8px 12px 8px 44px",
    borderTop: "1px solid oklch(1 0 0 / 0.06)",
  } as React.CSSProperties,
  previewJornada: {
    marginTop: 16, padding: "12px 14px",
    background: "oklch(0.18 0.02 275)", border: "1px solid oklch(1 0 0 / 0.08)", borderRadius: 10,
  } as React.CSSProperties,
  previewTitulo: { fontSize: 11, fontWeight: 700, color: "oklch(0.70 0.01 270)", marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: "0.05em" } as React.CSSProperties,
  previewLista: { margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column" as const, gap: 4 } as React.CSSProperties,
  previewItem: { fontSize: 12, color: "oklch(0.85 0.005 270)", lineHeight: 1.4 } as React.CSSProperties,
};
