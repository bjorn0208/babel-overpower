/**
 * Drag da janela vs. seleção de texto.
 *
 * A janela arrasta agarrando em QUALQUER parte (decisão 2026-05-13). Mas se
 * o ponteiro está sobre TEXTO selecionável, o usuário quer copiar — não
 * mover a janela. Aqui mora a decisão.
 *
 * `ehTextoSelecionavel` é puro (testado em `selecaoTexto.test.ts`).
 * `pontoSobreTextoSelecionavel` é a cola de DOM (caret API + estilo).
 */

export interface ArgsTextoSelecionavel {
  ehTextNode: boolean;
  texto: string;
  userSelect: string;
}

export function ehTextoSelecionavel(a: ArgsTextoSelecionavel): boolean {
  if (!a.ehTextNode) return false;
  if (a.texto.trim().length === 0) return false; // só whitespace = arrasta
  if (a.userSelect === "none") return false; // chrome do sistema
  return true;
}

type DocComCaret = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

/** Nó de texto exatamente sob (x, y), cross-browser. */
function noDoPonto(x: number, y: number): Node | null {
  const d = document as DocComCaret;
  if (typeof d.caretPositionFromPoint === "function") {
    const p = d.caretPositionFromPoint(x, y);
    return p ? p.offsetNode : null;
  }
  if (typeof d.caretRangeFromPoint === "function") {
    const r = d.caretRangeFromPoint(x, y);
    return r ? r.startContainer : null;
  }
  return null;
}

/**
 * Há texto selecionável sob (x, y) dentro do container da janela?
 * Se sim, o pointerdown NÃO deve iniciar drag (deixa a seleção nativa).
 */
export function pontoSobreTextoSelecionavel(
  x: number,
  y: number,
  container: HTMLElement,
): boolean {
  const node = noDoPonto(x, y);
  if (!node || node.nodeType !== Node.TEXT_NODE) return false;

  const elTexto = node.parentElement;
  if (!elTexto || !container.contains(elTexto)) return false;

  const cs = window.getComputedStyle(elTexto);
  const userSelect =
    cs.userSelect ||
    (cs as CSSStyleDeclaration & { webkitUserSelect?: string })
      .webkitUserSelect ||
    "";

  return ehTextoSelecionavel({
    ehTextNode: true,
    texto: node.textContent ?? "",
    userSelect,
  });
}
