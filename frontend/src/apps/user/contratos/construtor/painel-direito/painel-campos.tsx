/**
 * PainelCampos — CRUD ilimitado de campos do contato.
 *
 * Cada campo vira:
 *   - token {{slug}} disponível na paleta / do editor
 *   - campo no formulário que o lead preenche (Fase 3)
 *
 * Slug: derivado automaticamente do rótulo (sem acento/espaço).
 * Edição manual do slug possível — flag _slug_manual evita sobrescrever.
 */

import { useState } from "react";
import type { TemplateV2, CampoCliente, TipoCampoCliente, IconeCampoCliente } from "../tipos";
import { slugify } from "./logica";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PainelCamposProps {
  template: TemplateV2;
  onPatch: (parcial: Partial<TemplateV2>) => void;
}

// ---------------------------------------------------------------------------
// Campo com flag de slug manual (só existe em runtime, não persiste)
// ---------------------------------------------------------------------------

interface CampoRuntime extends CampoCliente {
  /** Se true, edição manual do slug → não sobrescrever ao mudar rótulo */
  _slug_manual?: boolean;
}

// ---------------------------------------------------------------------------
// Sub-componente: editor de um campo
// ---------------------------------------------------------------------------

function CampoEditor({
  campo,
  onChange,
  onRemover,
  onUp,
  onDown,
  isPrimeiro,
  isUltimo,
}: {
  campo: CampoRuntime;
  onChange: (mut: (c: CampoRuntime) => CampoRuntime) => void;
  onRemover: () => void;
  onUp: () => void;
  onDown: () => void;
  isPrimeiro: boolean;
  isUltimo: boolean;
}) {
  const [expandido, setExpandido] = useState(false);

  const TIPOS: { value: TipoCampoCliente; label: string }[] = [
    { value: "texto", label: "Texto curto" },
    { value: "texto_longo", label: "Texto longo" },
    { value: "email", label: "E-mail" },
    { value: "telefone", label: "Telefone" },
    { value: "cpf", label: "CPF" },
    { value: "cnpj", label: "CNPJ" },
    { value: "data", label: "Data" },
    { value: "numero", label: "Número" },
  ];

  const ICONES: { value: IconeCampoCliente; label: string }[] = [
    { value: "user", label: "Pessoa" },
    { value: "id", label: "Documento" },
    { value: "mail", label: "E-mail" },
    { value: "phone", label: "Telefone" },
    { value: "map", label: "Endereço" },
    { value: "hash", label: "Número" },
  ];

  return (
    <div style={estilos.campoCard}>
      {/* Linha principal */}
      <div style={estilos.campoLinha}>
        {/* Ícone indicativo do tipo */}
        <div style={estilos.campoIcone} aria-hidden="true">
          {ICONES.find((i) => i.value === campo.icone)?.label.slice(0, 1) ?? "•"}
        </div>

        {/* Rótulo editável */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            style={estilos.inputRotulo}
            value={campo.rotulo}
            placeholder="Nome do campo"
            aria-label="Rótulo do campo"
            onChange={(e) =>
              onChange((c) => ({
                ...c,
                rotulo: e.target.value,
                slug: c._slug_manual ? c.slug : slugify(e.target.value),
              }))
            }
          />
          <div style={estilos.slugPreview} aria-label="Token gerado">
            {`{{${campo.slug || "campo"}}}`}
            {campo.obrigatorio && (
              <span style={estilos.tagObrig}>obrigatório</span>
            )}
          </div>
        </div>

        {/* Ações */}
        <button
          style={estilos.btnIcone}
          onClick={() => setExpandido((v) => !v)}
          title={expandido ? "Recolher" : "Configurar tipo, ícone e opções"}
          aria-label="Configurar campo"
          aria-expanded={expandido}
        >
          {expandido ? "▴" : "⚙"}
        </button>
        <button
          style={{ ...estilos.btnIcone, opacity: isPrimeiro ? 0.3 : 1 }}
          onClick={onUp}
          disabled={isPrimeiro}
          title="Mover para cima"
          aria-label="Mover campo para cima"
        >
          ▲
        </button>
        <button
          style={{ ...estilos.btnIcone, opacity: isUltimo ? 0.3 : 1 }}
          onClick={onDown}
          disabled={isUltimo}
          title="Mover para baixo"
          aria-label="Mover campo para baixo"
        >
          ▼
        </button>
        <button
          style={{ ...estilos.btnIcone, color: "oklch(0.65 0.12 15)" }}
          onClick={onRemover}
          title="Remover campo"
          aria-label={`Remover campo ${campo.rotulo}`}
        >
          ✕
        </button>
      </div>

      {/* Painel expandido: slug, tipo, ícone, obrigatório */}
      {expandido && (
        <div style={estilos.campoConfig}>
          <div>
            <label style={estilos.label}>Slug (identificador técnico)</label>
            <input
              style={{ ...estilos.input, fontFamily: "var(--font-mono, monospace)", fontSize: 11.5 }}
              value={campo.slug}
              placeholder="slug_do_campo"
              aria-label="Slug do campo"
              onChange={(e) =>
                onChange((c) => ({
                  ...c,
                  slug: slugify(e.target.value),
                  _slug_manual: true,
                }))
              }
            />
            <div style={estilos.hint}>
              Token gerado: <code style={{ fontSize: 11 }}>{`{{${campo.slug || "campo"}}}`}</code>
            </div>
          </div>
          <div>
            <label style={estilos.label}>Tipo</label>
            <select
              style={estilos.select}
              value={campo.tipo}
              aria-label="Tipo do campo"
              onChange={(e) => onChange((c) => ({ ...c, tipo: e.target.value as TipoCampoCliente }))}
            >
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={estilos.label}>Ícone</label>
            <select
              style={estilos.select}
              value={campo.icone}
              aria-label="Ícone do campo"
              onChange={(e) => onChange((c) => ({ ...c, icone: e.target.value as IconeCampoCliente }))}
            >
              {ICONES.map((i) => (
                <option key={i.value} value={i.value}>{i.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "oklch(0.75 0.01 270)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={campo.obrigatorio}
                aria-label="Campo obrigatório"
                onChange={(e) => onChange((c) => ({ ...c, obrigatorio: e.target.checked }))}
              />
              Obrigatório
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function PainelCampos({ template, onPatch }: PainelCamposProps) {
  const campos = (template.campos_cliente ?? []) as CampoRuntime[];

  function addCampo() {
    const idx = campos.length + 1;
    const novo: CampoRuntime = {
      slug: `campo_${idx}`,
      rotulo: "Novo campo",
      tipo: "texto",
      obrigatorio: false,
      icone: "user",
    };
    onPatch({ campos_cliente: [...campos, novo] });
  }

  function patchCampo(idx: number, mut: (c: CampoRuntime) => CampoRuntime) {
    const novos = campos.slice();
    novos[idx] = mut(novos[idx]);
    onPatch({ campos_cliente: novos });
  }

  function removerCampo(idx: number) {
    onPatch({ campos_cliente: campos.filter((_, i) => i !== idx) });
  }

  function moverCampo(idx: number, dir: -1 | 1) {
    const dest = idx + dir;
    if (dest < 0 || dest >= campos.length) return;
    const novos = campos.slice();
    [novos[idx], novos[dest]] = [novos[dest], novos[idx]];
    onPatch({ campos_cliente: novos });
  }

  return (
    <div style={estilos.container}>
      <h3 style={estilos.titulo}>Campos do contato</h3>
      <p style={estilos.subtitulo}>
        Crie quantos campos quiser. Cada um vira um token{" "}
        <code style={{ fontSize: 11, color: "oklch(0.72 0.16 235)" }}>{"{{slug}}"}</code>{" "}
        disponível na paleta <kbd style={estilos.kbd}>/</kbd> do editor, e um campo no
        formulário que o lead preenche antes de assinar.
      </p>

      {campos.length === 0 && (
        <div style={estilos.vazio}>
          Nenhum campo criado. Clique em "Adicionar campo" para começar.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {campos.map((c, idx) => (
          <CampoEditor
            key={idx}
            campo={c}
            onChange={(mut) => patchCampo(idx, mut)}
            onRemover={() => removerCampo(idx)}
            onUp={() => moverCampo(idx, -1)}
            onDown={() => moverCampo(idx, 1)}
            isPrimeiro={idx === 0}
            isUltimo={idx === campos.length - 1}
          />
        ))}
      </div>

      <button style={estilos.btnAdicionar} onClick={addCampo}>
        + Adicionar campo
      </button>

      <div style={estilos.dica}>
        <strong>Dica:</strong> o slug é o identificador técnico (sem espaço, sem acento) usado no
        token. Mude o rótulo livremente — o que o lead vê é o rótulo.
      </div>
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
  vazio: {
    padding: 16, textAlign: "center" as const, color: "oklch(0.55 0.01 270)", fontSize: 12,
    background: "oklch(0.20 0.02 275)", border: "1px dashed oklch(1 0 0 / 0.10)", borderRadius: 10,
    marginBottom: 10,
  } as React.CSSProperties,
  campoCard: {
    background: "oklch(0.20 0.02 275)", border: "1px solid oklch(1 0 0 / 0.08)", borderRadius: 10, overflow: "hidden",
  } as React.CSSProperties,
  campoLinha: { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" } as React.CSSProperties,
  campoIcone: {
    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
    background: "oklch(0.72 0.16 235 / 0.15)", color: "oklch(0.72 0.16 235)",
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700,
  } as React.CSSProperties,
  inputRotulo: {
    display: "block", width: "100%", padding: "4px 8px", fontSize: 13, fontWeight: 600,
    background: "transparent", border: "1px solid transparent", borderRadius: 6, outline: "none",
    color: "oklch(0.97 0.005 270)",
  } as React.CSSProperties,
  slugPreview: {
    fontSize: 10.5, color: "oklch(0.55 0.01 270)", fontFamily: "var(--font-mono, monospace)",
    padding: "0 8px", display: "flex", alignItems: "center", gap: 6,
  } as React.CSSProperties,
  tagObrig: {
    fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const,
    padding: "1px 5px", borderRadius: 999,
    background: "oklch(0.65 0.18 15 / 0.15)", color: "oklch(0.65 0.18 15)",
    border: "1px solid oklch(0.65 0.18 15 / 0.25)",
  } as React.CSSProperties,
  campoConfig: {
    padding: "0 10px 10px",
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
    borderTop: "1px solid oklch(1 0 0 / 0.06)",
  } as React.CSSProperties,
  label: { display: "block", fontSize: 11, fontWeight: 600, color: "oklch(0.65 0.01 270)", marginBottom: 4 } as React.CSSProperties,
  input: {
    width: "100%", boxSizing: "border-box" as const, padding: "7px 10px", fontSize: 13,
    background: "oklch(0.16 0.02 275)", border: "1px solid oklch(1 0 0 / 0.10)",
    borderRadius: 8, color: "oklch(0.97 0.005 270)", outline: "none",
  } as React.CSSProperties,
  select: {
    width: "100%", padding: "7px 10px", fontSize: 13,
    background: "oklch(0.16 0.02 275)", border: "1px solid oklch(1 0 0 / 0.10)",
    borderRadius: 8, color: "oklch(0.97 0.005 270)", outline: "none", cursor: "pointer",
  } as React.CSSProperties,
  hint: { fontSize: 10.5, color: "oklch(0.55 0.01 270)", marginTop: 4 } as React.CSSProperties,
  kbd: {
    padding: "1px 5px", fontSize: 10, background: "oklch(0.16 0.02 275)",
    border: "1px solid oklch(1 0 0 / 0.15)", borderRadius: 4, color: "oklch(0.75 0.01 270)",
  } as React.CSSProperties,
  btnAdicionar: {
    display: "flex", alignItems: "center", gap: 6, width: "100%", justifyContent: "center",
    marginTop: 10, padding: "9px 12px", fontSize: 12, fontWeight: 500, cursor: "pointer",
    background: "oklch(0.72 0.18 295 / 0.08)", border: "1px solid oklch(0.72 0.18 295 / 0.25)",
    borderRadius: 8, color: "oklch(0.85 0.10 295)",
  } as React.CSSProperties,
  dica: {
    marginTop: 12, padding: "10px 12px", fontSize: 11, color: "oklch(0.70 0.01 270)",
    background: "oklch(0.72 0.16 235 / 0.08)", border: "1px solid oklch(0.72 0.16 235 / 0.20)",
    borderRadius: 10, lineHeight: 1.5,
  } as React.CSSProperties,
  btnIcone: {
    background: "transparent", border: "none", cursor: "pointer", padding: "4px 6px",
    fontSize: 11, color: "oklch(0.55 0.01 270)", borderRadius: 6, flexShrink: 0,
  } as React.CSSProperties,
};
