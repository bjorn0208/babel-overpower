/**
 * Editor WYSIWYG do montador de contratos.
 * Portado de painel-contrato.tsx (front antigo) com:
 *   - Token {{campo}} em vez de [CAMPO]
 *   - Design glass dark OKLCH (sem classes Tailwind claro)
 *   - Indicador de caret animado ao arrastar
 *   - Inserção e remoção de seções {SE_A_VISTA}/{SE_PARCELADO}
 *   - Painéis inline de pagamento (buildAVistaPanel / buildParceladoPanel)
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { buildAVistaPanel, buildParceladoPanel } from "./paineis-pagamento";
import { SidebarCampos } from "./sidebar-campos";
import {
  extrairCamposCliente,
  normalizarCampo,
  renderEditor,
  toStorage,
} from "./montador-dom";
import type { OpcaoParcelamento, TemplateContrato } from "../tipos";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type PainelMontadorProps = {
  template: TemplateContrato;
  onConteudoChange: (valor: string) => void;
  onUpdate: <K extends keyof TemplateContrato>(campo: K, valor: TemplateContrato[K]) => void;
};

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function PainelMontador({ template, onConteudoChange, onUpdate }: PainelMontadorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const indRef = useRef<HTMLDivElement>(null);
  const dragSrc = useRef<HTMLElement | null>(null);
  const lastContent = useRef(template.conteudo);

  // Campos detectados no conteúdo atual
  const campos = useMemo(
    () => extrairCamposCliente(template.conteudo),
    [template.conteudo],
  );

  // Renderização inicial
  useEffect(() => {
    if (editorRef.current) {
      renderEditor(editorRef.current, template.conteudo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-renderiza somente quando conteúdo muda externamente
  useEffect(() => {
    if (editorRef.current && template.conteudo !== lastContent.current) {
      lastContent.current = template.conteudo;
      renderEditor(editorRef.current, template.conteudo);
    }
  }, [template.conteudo]);

  // Injeta painéis de pagamento dentro das seções sempre que o DOM atualiza
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;

    const sectionAVista = ed.querySelector('[data-section="a_vista"]') as HTMLElement | null;
    if (sectionAVista) {
      let panel = sectionAVista.querySelector("[data-payment-panel]") as HTMLElement | null;
      if (!panel) {
        panel = document.createElement("div");
        panel.dataset.paymentPanel = "a_vista";
        panel.contentEditable = "false";
        const labelEl = sectionAVista.querySelector("[data-label]");
        if (labelEl?.nextSibling) sectionAVista.insertBefore(panel, labelEl.nextSibling);
        else sectionAVista.prepend(panel);
      }
      buildAVistaPanel(panel, template.valor_a_vista, (campo, valor) =>
        onUpdate(campo as keyof TemplateContrato, valor as TemplateContrato[keyof TemplateContrato]),
      );
    }

    const sectionParcelado = ed.querySelector('[data-section="parcelado"]') as HTMLElement | null;
    if (sectionParcelado) {
      let panel = sectionParcelado.querySelector("[data-payment-panel]") as HTMLElement | null;
      if (!panel) {
        panel = document.createElement("div");
        panel.dataset.paymentPanel = "parcelado";
        panel.contentEditable = "false";
        const labelEl = sectionParcelado.querySelector("[data-label]");
        if (labelEl?.nextSibling) sectionParcelado.insertBefore(panel, labelEl.nextSibling);
        else sectionParcelado.prepend(panel);
      }
      buildParceladoPanel(
        panel,
        (template.opcoes_parcelamento as unknown as OpcaoParcelamento[]) || [],
        (campo, valor) =>
          onUpdate(campo as keyof TemplateContrato, valor as TemplateContrato[keyof TemplateContrato]),
      );
    }
  });

  // ---------------------------------------------------------------------------
  // Helpers de indicador de caret
  // ---------------------------------------------------------------------------

  function esconderInd() {
    if (indRef.current) indRef.current.style.display = "none";
  }

  // ---------------------------------------------------------------------------
  // Handlers do editor
  // ---------------------------------------------------------------------------

  const onInput = useCallback(() => {
    if (!editorRef.current) return;
    const s = toStorage(editorRef.current);
    lastContent.current = s;
    onConteudoChange(s);
  }, [onConteudoChange]);

  // Cola apenas texto plano — sem HTML externo no DOM
  const onPaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
  }, []);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      const t = e.target as HTMLElement;

      // Remover seção
      const rs =
        t.dataset?.removeSection ||
        t.closest?.("[data-remove-section]")?.getAttribute("data-remove-section");
      if (rs) {
        e.preventDefault();
        e.stopPropagation();
        const tag = rs === "a_vista" ? "SE_A_VISTA" : "SE_PARCELADO";
        onConteudoChange(
          template.conteudo.replace(
            new RegExp(`\\n?\\{${tag}\\}[\\s\\S]*?\\{/${tag}\\}\\n?`, "g"),
            "",
          ),
        );
        return;
      }

      // Remover campo {{tag}}
      const d =
        t.dataset?.delete ||
        t.closest?.("[data-delete]")?.getAttribute("data-delete");
      if (d) {
        e.preventDefault();
        e.stopPropagation();
        onConteudoChange(
          template.conteudo.replace(
            new RegExp(`\\s*\\{\\{${d}\\}\\}`, "g"),
            "",
          ),
        );
      }
    },
    [template.conteudo, onConteudoChange],
  );

  // ---------------------------------------------------------------------------
  // Drag & drop dentro do editor (reposicionar badge)
  // ---------------------------------------------------------------------------

  function onEditorDragStart(e: React.DragEvent) {
    const badge = (e.target as HTMLElement).closest?.("[data-tag]") as HTMLElement | null;
    if (badge?.dataset.tag) {
      dragSrc.current = badge;
      e.dataTransfer.setData("text/plain", badge.dataset.tag);
      e.dataTransfer.effectAllowed = "move";
      badge.style.opacity = "0.3";
    }
  }

  function onEditorDragEnd() {
    if (dragSrc.current) {
      dragSrc.current.style.opacity = "1";
      dragSrc.current = null;
    }
    esconderInd();
  }

  function onEditorDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = dragSrc.current ? "move" : "copy";
    // Mostra indicador de caret na posição do cursor
    const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (range && indRef.current) {
      const rect = range.getBoundingClientRect();
      Object.assign(indRef.current.style, {
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        height: `${Math.max(rect.height, 18)}px`,
        display: "block",
      });
    }
  }

  function onEditorDrop(e: React.DragEvent) {
    e.preventDefault();
    esconderInd();
    const tag = e.dataTransfer.getData("text/plain");
    if (!tag || !editorRef.current) return;
    // Remove badge da posição original se estava no editor
    if (dragSrc.current && editorRef.current.contains(dragSrc.current)) {
      dragSrc.current.remove();
      dragSrc.current = null;
    }
    const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (range) {
      range.insertNode(document.createTextNode(`{{${tag}}}`));
    } else {
      editorRef.current.appendChild(document.createTextNode(` {{${tag}}}`));
    }
    onConteudoChange(toStorage(editorRef.current));
  }

  // ---------------------------------------------------------------------------
  // Drag da sidebar para o editor
  // ---------------------------------------------------------------------------

  function sidebarDragStart(e: React.DragEvent, tag: string) {
    dragSrc.current = null;
    e.dataTransfer.setData("text/plain", tag);
    e.dataTransfer.effectAllowed = "copy";
  }

  // ---------------------------------------------------------------------------
  // Inserir campo no cursor (clique na sidebar)
  // ---------------------------------------------------------------------------

  function clickInsert(tag: string) {
    const ed = editorRef.current;
    if (!ed) return;
    ed.focus();
    const sel = window.getSelection();
    const token = `{{${tag}}}`;
    if (sel?.rangeCount && ed.contains(sel.anchorNode)) {
      sel.getRangeAt(0).insertNode(document.createTextNode(token));
      sel.collapseToEnd();
    } else {
      ed.appendChild(document.createTextNode(` ${token}`));
    }
    onConteudoChange(toStorage(ed));
  }

  // ---------------------------------------------------------------------------
  // Criar campo novo a partir da sidebar
  // ---------------------------------------------------------------------------

  function handleNovoCampo(nome: string) {
    const norm = normalizarCampo(nome);
    if (!norm) return;
    onConteudoChange(template.conteudo + ` {{${norm}}}`);
  }

  // ---------------------------------------------------------------------------
  // Inserir seção condicional na posição do cursor
  // ---------------------------------------------------------------------------

  function insertSectionAtCursor(sectionText: string) {
    const ed = editorRef.current;
    if (!ed) return;
    const current = toStorage(ed);
    const sel = window.getSelection();
    if (sel?.rangeCount && ed.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      const preRange = document.createRange();
      preRange.setStart(ed, 0);
      preRange.setEnd(range.startContainer, range.startOffset);
      const tmpDiv = document.createElement("div");
      tmpDiv.appendChild(preRange.cloneContents());
      const preText = toStorage(tmpDiv);
      const pos = Math.min(preText.length, current.length);
      onConteudoChange(current.slice(0, pos) + sectionText + current.slice(pos));
    } else {
      onConteudoChange(current + sectionText);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={{ display: "flex", minHeight: 380, flex: 1 }}>
      {/* Indicador de caret ao arrastar — fixed pra ficar sobre qualquer conteúdo */}
      <div
        ref={indRef}
        style={{
          position: "fixed",
          zIndex: 50,
          width: 2,
          borderRadius: 9999,
          background: "oklch(0.7 0.18 220)",
          boxShadow: "0 0 6px oklch(0.7 0.18 220 / 0.7)",
          pointerEvents: "none",
          display: "none",
        }}
      />

      {/* Sidebar */}
      <SidebarCampos
        campos={campos}
        conteudo={template.conteudo}
        onConteudoChange={onConteudoChange}
        onSidebarDragStart={sidebarDragStart}
        onClickInsert={clickInsert}
        onInsertSection={insertSectionAtCursor}
      />

      {/* Área do editor */}
      <div style={{ position: "relative", display: "flex", flex: 1, flexDirection: "column" }}>
        {/* Placeholder quando vazio */}
        {!template.conteudo && (
          <div
            style={{
              pointerEvents: "none",
              position: "absolute",
              inset: 0,
              padding: "14px 16px",
              fontSize: 12,
              lineHeight: 1.7,
              whiteSpace: "pre-wrap",
              color: "oklch(0.98 0 0 / 0.2)",
            }}
          >
            {
              "Cole ou escreva o texto do contrato aqui.\n\n" +
              "Os dados da sua empresa escreva normalmente.\n\n" +
              "Para dados do cliente, crie campos na lateral\n" +
              "e arraste ou clique para inserir na posicao desejada.\n\n" +
              'Ex: O Sr(a). {{nome_completo}}, portador do CPF {{cpf}}...'
            }
          </div>
        )}

        {/* Editor contentEditable */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={onInput}
          onPaste={onPaste}
          onClick={onClick}
          onDragStart={onEditorDragStart}
          onDragEnd={onEditorDragEnd}
          onDragOver={onEditorDragOver}
          onDragLeave={esconderInd}
          onDrop={onEditorDrop}
          spellCheck
          style={{
            flex: 1,
            minHeight: 340,
            padding: "14px 16px",
            fontSize: 13,
            lineHeight: 1.75,
            color: "oklch(0.95 0 0)",
            background: "transparent",
            outline: "none",
            border: "none",
            overflowY: "auto",
            wordBreak: "break-word",
          }}
        />
      </div>
    </div>
  );
}
