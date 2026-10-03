/**
 * SlashMenu — UI da paleta "/" do editor de contrato.
 *
 * Integração com TipTap Suggestion:
 *   Renderizado via ReactRenderer dentro do render() do SlashCommand.
 *   Expõe SlashMenuRef.onKeyDown para o TipTap capturar ↑↓ Enter Escape.
 *
 * Grupos exibidos (pt-BR):
 *   Dados do contato · Itens e Sistema · Pagamento · Produto
 *
 * Navegação: ↑↓ movem seleção, Enter confirma, Escape passa para TipTap fechar.
 */

import {
  useState,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import type { CSSProperties } from "react";
import type { SlashItem } from "./extensions/slash-command";
import type { ClasseToken } from "../tipos";

// ---------------------------------------------------------------------------
// Constantes de agrupamento e visual
// ---------------------------------------------------------------------------

const GRUPO: Record<ClasseToken, string> = {
  cliente:     "Dados do contato",
  sistema:     "Itens e Sistema",
  valor:       "Pagamento",
  condicional: "Pagamento",
  produto:     "Produto",
};

const ORDEM: ClasseToken[] = ["cliente", "sistema", "valor", "condicional", "produto"];

const COR: Record<ClasseToken, { cor: string; fundo: string }> = {
  cliente:     { cor: "oklch(0.45 0.16 235)", fundo: "oklch(0.72 0.16 235 / 0.16)" },
  sistema:     { cor: "oklch(0.40 0.18 295)", fundo: "oklch(0.72 0.18 295 / 0.16)" },
  valor:       { cor: "oklch(0.38 0.14 150)", fundo: "oklch(0.74 0.16 150 / 0.16)" },
  condicional: { cor: "oklch(0.35 0.14 80)",  fundo: "oklch(0.80 0.16 80 / 0.16)"  },
  produto:     { cor: "oklch(0.40 0.18 50)",  fundo: "oklch(0.76 0.18 50 / 0.16)"  },
};

const ICONE: Record<ClasseToken, string> = {
  cliente: "👤", sistema: "⚙️", valor: "💰", condicional: "↔️", produto: "📦",
};

// ---------------------------------------------------------------------------
// Props e ref
// ---------------------------------------------------------------------------

export interface SlashMenuProps {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

export interface SlashMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export const SlashMenu = forwardRef<SlashMenuRef, SlashMenuProps>(
  function SlashMenu({ items, command }, ref) {
    const [sel, setSel] = useState(0);

    useEffect(() => { setSel(0); }, [items]);

    const confirmar = useCallback(
      (idx: number) => { if (items[idx]) command(items[idx]); },
      [items, command]
    );

    useImperativeHandle(ref, () => ({
      onKeyDown({ event }) {
        if (event.key === "ArrowUp")   { setSel((s) => Math.max(0, s - 1)); return true; }
        if (event.key === "ArrowDown") { setSel((s) => Math.min(items.length - 1, s + 1)); return true; }
        if (event.key === "Enter")     { confirmar(sel); return true; }
        return false;
      },
    }));

    // Agrupa itens por classe preservando ordem
    const grupos: Partial<Record<ClasseToken, SlashItem[]>> = {};
    for (const item of items) {
      const c = item.info.classe;
      (grupos[c] ??= []).push(item);
    }

    if (items.length === 0) {
      return (
        <div style={s.container}>
          <div style={s.vazio}>Nenhum bloco encontrado.</div>
        </div>
      );
    }

    let idxGlobal = 0;
    const gruposVistos = new Set<string>();

    return (
      <div style={s.container} onMouseDown={(e) => e.preventDefault()}>
        {ORDEM.map((classe) => {
          const lista = grupos[classe];
          if (!lista?.length) return null;

          const label = GRUPO[classe];
          const mostrarLabel = !gruposVistos.has(label);
          gruposVistos.add(label);

          return (
            <div key={classe}>
              {mostrarLabel && <div style={s.secao}>{label}</div>}
              {lista.map((item) => {
                const idx = idxGlobal++;
                const ativo = sel === idx;
                const { cor, fundo } = COR[item.info.classe];
                return (
                  <div
                    key={item.info.token}
                    style={{ ...s.item, ...(ativo ? s.itemAtivo : {}) }}
                    onMouseEnter={() => setSel(idx)}
                    onMouseDown={(e) => { e.preventDefault(); confirmar(idx); }}
                  >
                    <div style={{ ...s.icone, background: fundo, color: cor }}>
                      {ICONE[item.info.classe]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={s.titulo}>{item.info.rotulo}</div>
                      <div style={s.desc}>{item.info.descricao}</div>
                    </div>
                    {item.info.tipo === "bloco" && (
                      <span style={s.badge}>bloco</span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }
);

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

const s: Record<string, CSSProperties> = {
  container: {
    width: "320px",
    background: "oklch(0.235 0.03 275)",
    border: "1px solid oklch(1 0 0 / 0.10)",
    borderRadius: "14px",
    boxShadow: "0 24px 60px oklch(0 0 0 / 0.45), 0 0 0 1px oklch(1 0 0 / 0.10)",
    padding: "6px",
    maxHeight: "380px",
    overflowY: "auto",
    fontFamily: "var(--font-ui, system-ui)",
  },
  secao: {
    padding: "6px 10px 2px",
    fontSize: "9.5px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "oklch(0.97 0.005 270 / 0.42)",
  },
  item: {
    display: "flex",
    gap: "10px",
    alignItems: "flex-start",
    padding: "8px 10px",
    borderRadius: "8px",
    cursor: "pointer",
    border: "1px solid transparent",
  },
  itemAtivo: {
    background: "oklch(0.72 0.18 295 / 0.10)",
    borderColor: "oklch(0.72 0.18 295 / 0.40)",
  },
  icone: {
    width: "28px",
    height: "28px",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontSize: "14px",
  },
  titulo: {
    fontSize: "13px",
    fontWeight: 600,
    color: "oklch(0.97 0.005 270)",
    lineHeight: 1.15,
  },
  desc: {
    fontSize: "11.5px",
    color: "oklch(0.97 0.005 270 / 0.42)",
    marginTop: "2px",
    lineHeight: 1.35,
  },
  badge: {
    fontSize: "9px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    padding: "2px 6px",
    borderRadius: "999px",
    background: "oklch(0.72 0.18 295 / 0.18)",
    color: "oklch(0.72 0.18 295)",
    flexShrink: 0,
    alignSelf: "center",
  },
  vazio: {
    padding: "14px",
    fontSize: "12px",
    color: "oklch(0.97 0.005 270 / 0.42)",
    textAlign: "center",
  },
};
