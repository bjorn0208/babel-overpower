/**
 * barra-templates.tsx — chips com TODOS os templates do tenant, logo abaixo do
 * seletor do construtor.
 *
 * Antes a aba Templates abria só o template mais recente no editor e os outros
 * ficavam escondidos atrás do botão "N templates ▾". O dono do Easy achou que o
 * "Remoção Judicial / Limpa Nome" tinha sumido (só aparecia no Gerador, que lista
 * em cartões). Agora a lista fica sempre à vista; o modal continua pra criar/excluir.
 */

import React from "react";
import type { TemplateV2 } from "./tipos";

interface BarraTemplatesProps {
  templates: TemplateV2[];
  templateAtivoId: string;
  onSelecionar: (id: string) => void;
  onNovo: () => void;
}

const estilos = {
  barra: {
    display: "flex", flexWrap: "wrap" as const, gap: 6,
    padding: "6px 12px 8px", borderBottom: "1px solid oklch(0.22 0.01 270)", flexShrink: 0,
  },
  chip: {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "4px 10px", borderRadius: 99, fontSize: 12, cursor: "pointer",
    border: "1px solid oklch(0.26 0.01 270)", background: "oklch(0.16 0.01 270)",
    color: "oklch(0.80 0 0)", maxWidth: 280,
  },
  chipAtivo: {
    border: "1px solid oklch(0.72 0.22 295 / 0.7)", background: "oklch(0.72 0.22 295 / 0.14)",
    color: "oklch(0.95 0 0)", fontWeight: 600,
  },
  nome: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  ponto: (ativo: boolean) => ({
    width: 6, height: 6, borderRadius: 99, flexShrink: 0,
    background: ativo ? "oklch(0.74 0.16 150)" : "oklch(0.50 0.01 270)",
  }),
  novo: {
    border: "1px dashed oklch(0.35 0.01 270)", background: "transparent", color: "oklch(0.65 0.01 270)",
  },
};

export function BarraTemplates({ templates, templateAtivoId, onSelecionar, onNovo }: BarraTemplatesProps): React.ReactElement {
  return (
    <div style={estilos.barra} role="tablist" aria-label="Templates do tenant">
      {templates.map((t) => {
        const ativo = t.id === templateAtivoId;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={ativo}
            title={`${t.nome}${t.ativo ? " · ativo" : " · rascunho"}`}
            style={{ ...estilos.chip, ...(ativo ? estilos.chipAtivo : {}) }}
            onClick={() => onSelecionar(t.id)}
          >
            <span style={estilos.ponto(t.ativo)} aria-hidden="true" />
            <span style={estilos.nome}>{t.nome}</span>
          </button>
        );
      })}
      <button type="button" style={{ ...estilos.chip, ...estilos.novo }} onClick={onNovo} title="Criar template em branco">
        + novo
      </button>
    </div>
  );
}
