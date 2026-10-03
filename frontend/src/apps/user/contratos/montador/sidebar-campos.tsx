/**
 * Sidebar do montador WYSIWYG — campos do cliente, criar campo,
 * campo automático e seções condicionais. Design glass dark OKLCH.
 */

import { useState } from "react";
import { Banknote, Clock, CreditCard, GripVertical, MousePointerClick, Plus, X } from "lucide-react";
import { humanize, normalizarCampo } from "./montador-dom";

type SidebarProps = {
  campos: string[];
  conteudo: string;
  onConteudoChange: (v: string) => void;
  onSidebarDragStart: (e: React.DragEvent, tag: string) => void;
  onClickInsert: (tag: string) => void;
  onInsertSection: (texto: string) => void;
};

const S = {
  wrap: { width: 200, flexShrink: 0, borderRight: "1px solid oklch(0.98 0 0 / 0.06)", overflowY: "auto", padding: "10px 10px", display: "flex", flexDirection: "column", gap: 0, background: "oklch(0.14 0.05 280 / 0.5)" } as React.CSSProperties,
  titulo: { fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "oklch(0.98 0 0 / 0.4)", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 } as React.CSSProperties,
  divisor: { borderTop: "1px solid oklch(0.98 0 0 / 0.06)", marginTop: 12, paddingTop: 12 } as React.CSSProperties,
  nota: { fontSize: 9, color: "oklch(0.98 0 0 / 0.3)", lineHeight: 1.35 } as React.CSSProperties,
  btnTransp: { flexShrink: 0, padding: 4, background: "transparent", border: "none", cursor: "pointer" } as React.CSSProperties,
  input: { width: "100%", padding: "6px 8px", fontSize: 11, background: "oklch(0.18 0.06 280 / 0.5)", color: "oklch(0.98 0 0)", border: "1px solid oklch(0.98 0 0 / 0.1)", borderRadius: 7, outline: "none", boxSizing: "border-box" } as React.CSSProperties,
};

export function SidebarCampos(p: SidebarProps) {
  const [novoCampo, setNovoCampo] = useState("");

  function criarCampo() {
    const norm = normalizarCampo(novoCampo);
    if (!norm) return;
    p.onConteudoChange(p.conteudo + ` {{${norm}}}`);
    setNovoCampo("");
  }

  function removerCampo(tag: string) {
    p.onConteudoChange(p.conteudo.replace(new RegExp(`\\s*\\{\\{${tag}\\}\\}`, "g"), ""));
  }

  return (
    <div style={S.wrap}>
      {/* ---- Campos do cliente ---- */}
      <div>
        <div style={S.titulo}>Campos do cliente</div>
        {p.campos.length === 0 ? (
          <p style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.35)", lineHeight: 1.4 }}>
            Crie campos abaixo e arraste para o contrato
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {p.campos.map((tag) => (
              <div key={tag} style={{ display: "flex", alignItems: "center", gap: 2, borderRadius: 7, border: "1px solid oklch(0.78 0.18 75 / 0.35)", background: "oklch(0.78 0.18 75 / 0.08)" }}>
                <div draggable onDragStart={(e) => p.onSidebarDragStart(e, tag)} style={{ display: "flex", flex: 1, alignItems: "center", gap: 4, padding: "5px 6px", cursor: "grab", minWidth: 0 }}>
                  <GripVertical size={11} style={{ flexShrink: 0, color: "oklch(0.78 0.18 75 / 0.5)" }} />
                  <span style={{ flex: 1, fontSize: 11, fontWeight: 500, color: "oklch(0.82 0.18 75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {humanize(tag)}
                  </span>
                </div>
                <button type="button" title="Inserir na posição do cursor" onClick={() => p.onClickInsert(tag)} style={{ ...S.btnTransp, color: "oklch(0.78 0.18 75 / 0.6)" }}>
                  <MousePointerClick size={11} />
                </button>
                <button type="button" title="Remover campo do contrato" onClick={() => removerCampo(tag)} style={{ ...S.btnTransp, color: "oklch(0.65 0.24 25 / 0.5)" }}>
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
        <p style={{ ...S.nota, marginTop: 6 }}>
          Arraste ou clique <MousePointerClick size={9} style={{ display: "inline", verticalAlign: -1 }} /> para inserir
        </p>
      </div>

      {/* ---- Criar campo ---- */}
      <div style={S.divisor}>
        <div style={S.titulo}><Plus size={9} /> Criar campo</div>
        <input value={novoCampo} onChange={(e) => setNovoCampo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") criarCampo(); }} placeholder="Ex: Nome Completo" style={S.input} />
        <button type="button" onClick={criarCampo} disabled={!novoCampo.trim()} style={{ marginTop: 5, width: "100%", padding: "5px 8px", fontSize: 10, fontWeight: 600, background: novoCampo.trim() ? "linear-gradient(135deg, oklch(0.7 0.18 220), oklch(0.65 0.22 280))" : "oklch(0.98 0 0 / 0.06)", color: novoCampo.trim() ? "oklch(0.98 0 0)" : "oklch(0.98 0 0 / 0.3)", border: "none", borderRadius: 7, cursor: novoCampo.trim() ? "pointer" : "default" }}>
          Criar e inserir
        </button>
        <p style={{ ...S.nota, marginTop: 5 }}>
          Vira snake_case: "Nome Completo" fica <code style={{ fontSize: 9 }}>{`{{nome_completo}}`}</code>
        </p>
      </div>

      {/* ---- Campo automático ---- */}
      <div style={S.divisor}>
        <div style={S.titulo}><Clock size={9} /> Automatico</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div draggable onDragStart={(e) => p.onSidebarDragStart(e, "data_assinatura")} style={{ flex: 1, display: "flex", alignItems: "center", gap: 4, borderRadius: 7, border: "1px solid oklch(0.65 0.22 240 / 0.4)", background: "oklch(0.65 0.22 240 / 0.1)", padding: "5px 7px", cursor: "grab" }}>
            <GripVertical size={11} style={{ flexShrink: 0, color: "oklch(0.65 0.22 240 / 0.5)" }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: "oklch(0.76 0.16 240)" }}>Data da assinatura</span>
          </div>
          <button type="button" title="Inserir data_assinatura no cursor" onClick={() => p.onClickInsert("data_assinatura")} style={{ ...S.btnTransp, color: "oklch(0.65 0.22 240 / 0.6)" }}>
            <MousePointerClick size={11} />
          </button>
        </div>
        <p style={{ ...S.nota, marginTop: 5 }}>Preenchido pelo sistema na assinatura</p>
      </div>

      {/* ---- Seções condicionais ---- */}
      <div style={S.divisor}>
        <div style={S.titulo}><Banknote size={9} /> Variacoes de pagamento</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <button type="button" onClick={() => p.onInsertSection("\n{SE_A_VISTA}\n\n{/SE_A_VISTA}\n")} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "6px 8px", fontSize: 10, fontWeight: 600, color: "oklch(0.72 0.18 145)", background: "oklch(0.72 0.18 145 / 0.08)", border: "1px solid oklch(0.72 0.18 145 / 0.3)", borderRadius: 7, cursor: "pointer", textAlign: "left" }}>
            <Banknote size={11} style={{ flexShrink: 0 }} /> Secao a vista
          </button>
          <button type="button" onClick={() => p.onInsertSection("\n{SE_PARCELADO}\n\n{/SE_PARCELADO}\n")} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "6px 8px", fontSize: 10, fontWeight: 600, color: "oklch(0.65 0.24 25)", background: "oklch(0.65 0.24 25 / 0.08)", border: "1px solid oklch(0.65 0.24 25 / 0.3)", borderRadius: 7, cursor: "pointer", textAlign: "left" }}>
            <CreditCard size={11} style={{ flexShrink: 0 }} /> Secao parcelado
          </button>
        </div>
        <p style={{ ...S.nota, marginTop: 5 }}>Insere bloco condicional. Configure os valores dentro da secao.</p>
      </div>
    </div>
  );
}
