/**
 * Helpers DOM puros do editor WYSIWYG de contratos.
 * Portado de painel-contrato-dom.ts (front antigo) com adaptações:
 *   - Token {{campo}} (snake_case minúsculo) em vez de [CAMPO] (MAIÚSCULO)
 *   - Classes/cores OKLCH glass dark em vez de Tailwind claro
 *   - `esc()` aplicado antes de qualquer innerHTML pra evitar XSS
 */

// ---------------------------------------------------------------------------
// Segurança / escape
// ---------------------------------------------------------------------------

/** Escapa caracteres HTML antes de injetar no DOM. Defesa obrigatória contra XSS. */
export function esc(t: string): string {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Texto legível de campo
// ---------------------------------------------------------------------------

/** Converte snake_case pra texto legível. Ex: "nome_completo" -> "Nome completo" */
export function humanize(tag: string): string {
  return tag
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Extrai campos do cliente do conteúdo
// ---------------------------------------------------------------------------

/** Extrai campos únicos no formato {{campo}} do conteúdo do template. */
export function extrairCamposCliente(conteudo: string): string[] {
  const matches = conteudo.match(/\{\{([a-z0-9_]+)\}\}/g) || [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

// ---------------------------------------------------------------------------
// Converte storage (texto com tokens) para HTML renderizado no editor
// ---------------------------------------------------------------------------

/** Converte {{campo}}, {SE_A_VISTA}...{/SE_A_VISTA} e quebras de linha em HTML.
 *  SEMPRE chama esc() primeiro — nenhum dado de usuário entra cru no DOM. */
export function toHTML(texto: string): string {
  if (!texto) return "";

  // 1. Escapa o texto inteiro antes de qualquer manipulação
  let h = esc(texto);

  // 2. Seção à vista — dashed border verde OKLCH
  h = h.replace(
    /\{SE_A_VISTA\}([\s\S]*?)\{\/SE_A_VISTA\}/g,
    (_m, c: string) =>
      `<div data-section="a_vista" style="` +
      `position:relative;margin:8px 0;border-radius:10px;` +
      `border:2px dashed oklch(0.72 0.18 145 / 0.5);` +
      `background:oklch(0.72 0.18 145 / 0.06);` +
      `padding:20px 12px 10px 12px">` +
      `<span data-label contenteditable="false" style="` +
      `position:absolute;top:-10px;left:12px;display:inline-flex;align-items:center;gap:4px;` +
      `border-radius:6px;background:oklch(0.18 0.06 280);` +
      `border:1px solid oklch(0.72 0.18 145 / 0.4);` +
      `padding:2px 8px;font-size:10px;font-weight:600;` +
      `color:oklch(0.72 0.18 145);user-select:none;white-space:nowrap">` +
      `A vista` +
      `<span data-remove-section="a_vista" style="` +
      `cursor:pointer;margin-left:2px;opacity:0.7;font-size:11px;` +
      `padding:0 2px;border-radius:3px" title="Remover seção">&times;</span>` +
      `</span>${c}</div>`,
  );

  // 3. Seção parcelado — dashed border vermelho OKLCH
  h = h.replace(
    /\{SE_PARCELADO\}([\s\S]*?)\{\/SE_PARCELADO\}/g,
    (_m, c: string) =>
      `<div data-section="parcelado" style="` +
      `position:relative;margin:8px 0;border-radius:10px;` +
      `border:2px dashed oklch(0.65 0.24 25 / 0.5);` +
      `background:oklch(0.65 0.24 25 / 0.06);` +
      `padding:20px 12px 10px 12px">` +
      `<span data-label contenteditable="false" style="` +
      `position:absolute;top:-10px;left:12px;display:inline-flex;align-items:center;gap:4px;` +
      `border-radius:6px;background:oklch(0.18 0.06 280);` +
      `border:1px solid oklch(0.65 0.24 25 / 0.4);` +
      `padding:2px 8px;font-size:10px;font-weight:600;` +
      `color:oklch(0.65 0.24 25);user-select:none;white-space:nowrap">` +
      `Parcelado` +
      `<span data-remove-section="parcelado" style="` +
      `cursor:pointer;margin-left:2px;opacity:0.7;font-size:11px;` +
      `padding:0 2px;border-radius:3px" title="Remover seção">&times;</span>` +
      `</span>${c}</div>`,
  );

  // 4. Tokens {{campo}} — badges inline arrastáveis
  h = h.replace(/\{\{([a-z0-9_]+)\}\}/g, (_m, t: string) => {
    const auto = t === "data_assinatura";
    // Automático = índigo OKLCH; cliente = âmbar OKLCH
    const cor = auto
      ? "color:oklch(0.76 0.16 240);border-color:oklch(0.65 0.22 240 / 0.5);background:oklch(0.65 0.22 240 / 0.12)"
      : "color:oklch(0.82 0.18 75);border-color:oklch(0.78 0.18 75 / 0.5);background:oklch(0.78 0.18 75 / 0.12)";
    const botaoRemover = auto
      ? ""
      : `<span data-delete="${esc(t)}" style="cursor:pointer;opacity:0.6;margin-left:2px;font-size:10px;` +
        `line-height:1;padding:0 1px" title="Remover campo">&times;</span>`;
    return (
      `<span data-tag="${esc(t)}" contenteditable="false" draggable="true" style="` +
      `display:inline-flex;align-items:center;gap:2px;` +
      `border-radius:6px;border:1px solid;` +
      `padding:1px 7px 1px 5px;font-size:11px;font-weight:500;` +
      `margin:0 2px;user-select:none;cursor:grab;white-space:nowrap;` +
      `${cor}">` +
      `${esc(humanize(t))}${botaoRemover}</span>`
    );
  });

  // 5. Quebras de linha
  return h.replace(/\n/g, "<br>");
}

// ---------------------------------------------------------------------------
// Serializa HTML do editor de volta para texto com tokens
// ---------------------------------------------------------------------------

/** Percorre o DOM do editor e reconstrói o texto com {{campo}},
 *  {SE_A_VISTA}...{/SE_A_VISTA} e quebras de linha. */
export function toStorage(el: HTMLElement): string {
  let r = "";
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === Node.TEXT_NODE) {
      r += n.textContent || "";
    } else if (n.nodeType === Node.ELEMENT_NODE) {
      const e = n as HTMLElement;
      // Pula elementos não-editáveis (labels, painéis de pagamento)
      if (
        e.dataset.label !== undefined ||
        e.dataset.paymentPanel !== undefined
      ) {
        continue;
      }
      if (e.dataset.tag) {
        r += `{{${e.dataset.tag}}}`;
      } else if (e.dataset.section) {
        const tag = e.dataset.section === "a_vista" ? "SE_A_VISTA" : "SE_PARCELADO";
        r += `{${tag}}${toStorage(e)}{/${tag}}`;
      } else if (e.tagName === "BR") {
        r += "\n";
      } else if (e.tagName === "DIV" || e.tagName === "P") {
        const inner = toStorage(e);
        if (r && !r.endsWith("\n")) r += "\n";
        r += inner;
      } else {
        r += toStorage(e);
      }
    }
  }
  return r;
}

// ---------------------------------------------------------------------------
// Renderiza o editor a partir do conteúdo armazenado
// ---------------------------------------------------------------------------

/** Substitui o conteúdo do editor com HTML seguro gerado por toHTML(). */
export function renderEditor(editor: HTMLDivElement, conteudo: string): void {
  const html = toHTML(conteudo);
  editor.textContent = "";
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  editor.appendChild(tpl.content);
}

// ---------------------------------------------------------------------------
// Helpers DOM genéricos (usados pelos painéis de pagamento)
// ---------------------------------------------------------------------------

/** Cria elemento HTML com atributos e filhos. */
export function el(
  tag: string,
  attrs?: Record<string, string>,
  children?: (HTMLElement | string)[],
): HTMLElement {
  const e = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "className") e.className = v;
      else if (k === "style") e.setAttribute("style", v);
      else if (k.startsWith("data-")) e.setAttribute(k, v);
      else (e as unknown as Record<string, unknown>)[k] = v;
    }
  }
  if (children) {
    for (const c of children) {
      if (typeof c === "string") e.appendChild(document.createTextNode(c));
      else e.appendChild(c);
    }
  }
  return e;
}

/** Cria input numérico para painéis de pagamento. */
export function makeInput(
  value: string,
  placeholder: string,
  style: string,
  onChange: (v: string) => void,
): HTMLInputElement {
  const inp = document.createElement("input");
  inp.type = "number";
  inp.min = "0";
  inp.step = "0.01";
  inp.value = value;
  inp.placeholder = placeholder;
  inp.className = style;
  inp.onchange = () => onChange(inp.value);
  // Impede que eventos do input borbulhem e disparem handlers do editor
  inp.oninput = (e) => e.stopPropagation();
  inp.onkeydown = (e) => e.stopPropagation();
  return inp;
}

// ---------------------------------------------------------------------------
// Normaliza nome digitado pelo usuário para snake_case minúsculo
// ---------------------------------------------------------------------------

/** "Nome Completo" => "nome_completo"; "CPF/CNPJ" => "cpf_cnpj" */
export function normalizarCampo(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
