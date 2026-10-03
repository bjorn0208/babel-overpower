/**
 * EditorContrato — editor TipTap do construtor de template de contrato v2.
 *
 * Props:
 *   valor / onChange — texto-com-tokens serializado (round-trip via serializa.ts)
 *   produtosAceitos  — lista para SecaoTabs
 *   resolverNomeProduto / onAdicionarProduto — callbacks de produto
 *   secaoAtiva / onTrocarSecao — estado de seção controlado pelo pai
 *   mapClausulas — produto_id → tem cláusulas
 *   placeholder  — texto quando editor vazio
 *
 * Decisões TipTap v3:
 *   - ReactNodeViewRenderer(TokenPill/BlockPill): substitui renderHTML no editor
 *     sem afetar serializa.ts (usa tipo do nó, não HTML).
 *   - SlashCommand render(): ReactRenderer monta SlashMenu em div avulso;
 *     posicionamento nativo via clientRect() — sem tippy.
 *   - StarterKit coexiste com TokenInline (inline/atom) e BlockToken (block/atom).
 */

import {
  useEditor,
  EditorContent,
  ReactNodeViewRenderer,
  ReactRenderer,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";
import type { RefObject } from "react";

import { TokenInline } from "./extensions/token-inline";
import { BlockToken } from "./extensions/block-token";
import { SlashCommand } from "./extensions/slash-command";
import type { SlashItem } from "./extensions/slash-command";
import { TokenPill } from "./token-pill";
import { BlockPill } from "./block-pill";
import { SlashMenu } from "./slash-menu";
import type { SlashMenuRef } from "./slash-menu";
import { SecaoTabs } from "./secao-tabs";
import type { SecaoAtiva } from "./secao-tabs";
import { ToolbarContrato } from "./toolbar-contrato";
import { textoParaDoc, docParaTexto } from "./serializa";
import { posicionarSlashContainer, estilosEditor as es } from "./editor-utils";
import type { ProdutoAceito, ProseMirrorDoc } from "../tipos";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EditorContratoProps {
  valor: string;
  onChange: (texto: string) => void;
  produtosAceitos?: ProdutoAceito[];
  resolverNomeProduto?: (produto_id: string) => string;
  onAdicionarProduto?: () => void;
  secaoAtiva?: SecaoAtiva;
  onTrocarSecao?: (secao: SecaoAtiva) => void;
  mapClausulas?: Record<string, boolean>;
  placeholder?: string;
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function EditorContrato({
  valor,
  onChange,
  produtosAceitos = [],
  resolverNomeProduto,
  onAdicionarProduto,
  secaoAtiva = { tipo: "comum" },
  onTrocarSecao,
  mapClausulas = {},
  placeholder = 'Digite "/" para inserir um bloco ou token…',
}: EditorContratoProps) {
  const slashRef = useRef<{
    element: HTMLElement | null;
    renderer: ReactRenderer | null;
  }>({ element: null, renderer: null });

  // ---------------------------------------------------------------------------
  // Editor
  // ---------------------------------------------------------------------------

  const editor = useEditor({
    extensions: [
      StarterKit.configure({}),

      TokenInline.extend({
        addNodeView() {
          return ReactNodeViewRenderer(TokenPill);
        },
      }),

      BlockToken.extend({
        addNodeView() {
          return ReactNodeViewRenderer(BlockPill);
        },
      }),

      SlashCommand.configure({
        suggestion: {
          render() {
            let renderer: ReactRenderer | null = null;
            let container: HTMLElement | null = null;
            const menuRef: RefObject<SlashMenuRef | null> = { current: null };

            function limpar() {
              renderer?.destroy();
              container?.remove();
              renderer = null;
              container = null;
              slashRef.current = { element: null, renderer: null };
            }

            return {
              onStart(props) {
                container = document.createElement("div");
                container.style.cssText =
                  "position:fixed;z-index:9999;pointer-events:auto";
                document.body.appendChild(container);
                const rect = props.clientRect?.();
                if (rect) posicionarSlashContainer(container, rect);
                renderer = new ReactRenderer(SlashMenuWrapper, {
                  editor: props.editor,
                  props: { items: props.items as SlashItem[], command: props.command, menuRef },
                });
                container.appendChild(renderer.element);
                slashRef.current = { element: container, renderer };
              },

              onUpdate(props) {
                const rect = props.clientRect?.();
                if (container && rect) posicionarSlashContainer(container, rect);
                renderer?.updateProps({
                  items: props.items as SlashItem[],
                  command: props.command,
                  menuRef,
                });
              },

              onKeyDown(props) {
                if (props.event.key === "Escape") { limpar(); return true; }
                return menuRef.current?.onKeyDown(props) ?? false;
              },

              onExit() { limpar(); },
            };
          },
        },
      }),
    ],

    content: textoParaDoc(valor),

    onUpdate({ editor: ed }) {
      onChange(docParaTexto(ed.getJSON() as ProseMirrorDoc));
    },

    editorProps: {
      attributes: { class: "editor-contrato-area", spellcheck: "false" },
    },
  });

  // ---------------------------------------------------------------------------
  // Sincroniza valor externo → editor
  // ---------------------------------------------------------------------------

  const valorRef = useRef(valor);
  useEffect(() => {
    if (!editor || valor === valorRef.current) return;
    valorRef.current = valor;
    const atual = docParaTexto(editor.getJSON() as ProseMirrorDoc);
    if (atual !== valor) editor.commands.setContent(textoParaDoc(valor));
  }, [editor, valor]);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      slashRef.current.renderer?.destroy();
      slashRef.current.element?.remove();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={es.frame} data-testid="editor-contrato">
      <SecaoTabs
        produtosAceitos={produtosAceitos}
        resolverNomeProduto={resolverNomeProduto}
        secaoAtiva={secaoAtiva}
        onTrocarSecao={onTrocarSecao ?? (() => {})}
        onAdicionarProduto={onAdicionarProduto ?? (() => {})}
        mapClausulas={mapClausulas}
      />
      <ToolbarContrato editor={editor} secaoAtiva={secaoAtiva} />
      <div style={es.scroll}>
        <div style={es.papel}>
          {editor && !editor.getText() && (
            <div style={es.placeholder} aria-hidden="true">
              {placeholder}
            </div>
          )}
          <EditorContent editor={editor} style={{ outline: "none" }} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SlashMenuWrapper — bridge ReactRenderer → SlashMenu com ref
// ---------------------------------------------------------------------------

interface WrapperProps {
  items: SlashItem[];
  command: (item: SlashItem) => void;
  menuRef: RefObject<SlashMenuRef | null>;
}

function SlashMenuWrapper({ items, command, menuRef }: WrapperProps) {
  return <SlashMenu ref={menuRef} items={items} command={command} />;
}
