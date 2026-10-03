/**
 * Modal de criar/editar um bloco próprio (escopo Você) de uma gaveta.
 * Form dirigido pelo descritor `gaveta.campos`. Visual glass da casa.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Gaveta } from "./gavetas";
import type { ValoresBloco } from "./acoes-gaveta";
import { Campo, BotaoPrimario, estiloInput } from "./ui-hub";
import { MelhorarPrompt } from "./MelhorarPrompt";

export function ModalBloco({
  gaveta,
  inicial,
  onFechar,
  onSalvar,
}: {
  gaveta: Gaveta;
  inicial: ValoresBloco | null;
  onFechar: () => void;
  onSalvar: (valores: ValoresBloco) => Promise<void>;
}) {
  const [valores, setValores] = useState<ValoresBloco>(() => {
    const base: ValoresBloco = {};
    for (const c of gaveta.campos) base[c.chave] = inicial?.[c.chave] ?? "";
    return base;
  });
  const [salvando, setSalvando] = useState(false);

  const podeSalvar = gaveta.campos.every((c) => (valores[c.chave] ?? "").trim() !== "");

  // Escape fecha o modal (padrão de saída sempre disponível).
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  async function salvar() {
    if (!podeSalvar || salvando) return;
    setSalvando(true);
    try {
      await onSalvar(valores);
      onFechar();
    } finally {
      setSalvando(false);
    }
  }

  return createPortal(
    <div
      onClick={onFechar}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "oklch(0.1 0.03 280 / 0.6)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          maxHeight: "85vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          padding: 20,
          borderRadius: 16,
          background: "oklch(0.18 0.06 280 / 0.95)",
          border: "1px solid oklch(0.7 0.18 280 / 0.25)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "oklch(0.98 0 0)" }}>
              {inicial ? "Editar bloco" : "Novo bloco"} · {gaveta.rotulo}
            </span>
            <span style={{ fontSize: 10.5, color: "oklch(0.98 0 0 / 0.5)" }}>
              O agente passa a usar assim que você salvar.
            </span>
          </div>
          <button
            type="button"
            onClick={onFechar}
            title="Fechar"
            style={{ background: "transparent", border: "none", color: "oklch(0.98 0 0 / 0.55)", cursor: "pointer" }}
          >
            <X size={18} />
          </button>
        </div>

        {gaveta.campos.map((c, i) => (
          <Campo key={c.chave} label={c.rotulo}>
            {c.tipo === "area" ? (
              <textarea
                rows={4}
                autoFocus={i === 0}
                value={valores[c.chave]}
                onChange={(e) => setValores((v) => ({ ...v, [c.chave]: e.target.value }))}
                style={estiloInput}
              />
            ) : (
              <input
                type="text"
                autoFocus={i === 0}
                value={valores[c.chave]}
                onChange={(e) => setValores((v) => ({ ...v, [c.chave]: e.target.value }))}
                style={estiloInput}
              />
            )}
          </Campo>
        ))}
        {gaveta.id === "conhecimento" && (
          <MelhorarPrompt
            titulo={valores["title"] ?? ""}
            conteudo={valores["content"] ?? ""}
            onAplicar={(texto) => setValores((v) => ({ ...v, content: texto }))}
          />
        )}

        {!podeSalvar && (
          <span style={{ fontSize: 10.5, color: "oklch(0.98 0 0 / 0.45)" }}>
            Preencha todos os campos pra liberar o salvar.
          </span>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={onFechar}
            style={{
              padding: "8px 16px",
              fontSize: 12,
              fontWeight: 500,
              color: "oklch(0.98 0 0 / 0.65)",
              background: "transparent",
              border: "1px solid oklch(0.98 0 0 / 0.12)",
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          <BotaoPrimario onClick={salvar}>{salvando ? "Salvando…" : "Salvar"}</BotaoPrimario>
        </div>
      </div>
    </div>,
    document.body,
  );
}
