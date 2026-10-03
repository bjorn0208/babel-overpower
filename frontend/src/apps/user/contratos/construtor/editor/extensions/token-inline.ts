/**
 * Extensão TipTap — TokenInline
 *
 * Nó inline atômico que representa um token de substituição no texto do contrato.
 * Serializa pra texto plano: {{slug}} pra tokens de cliente, {TOKEN} pra sistema/valor.
 *
 * Spec §3 — Extension TokenInline:
 *   { "type": "token", "attrs": { "token": "{{cpf}}" | "{TOTAL_AVISTA}" | ... } }
 *
 * Cores por classe (spec §4):
 *   cliente   → {{slug}}       — verde-azulado
 *   valor     → {TOTAL_*}      — âmbar
 *   sistema   → {TOKEN}        — índigo
 *   condicional → {COND_*}     — roxo
 *   produto   → {PRODUTO_*}    — laranja
 */

import { Node, mergeAttributes } from "@tiptap/core";

export type ClasseTokenInline =
  | "cliente"
  | "sistema"
  | "valor"
  | "condicional"
  | "produto";

/** Detecta a classe de um token pelo seu formato. */
export function detectarClasseToken(token: string): ClasseTokenInline {
  if (token.startsWith("{{") && token.endsWith("}}")) return "cliente";
  if (token.startsWith("{COND_")) return "condicional";
  if (
    token === "{PRODUTO_NOME}" ||
    token === "{PRODUTO_QTD}" ||
    token === "{PRODUTO_PRECO_AVISTA}" ||
    token === "{PRODUTO_PRECO_PARCELADO}"
  )
    return "produto";
  if (
    token.startsWith("{TOTAL_") ||
    token === "{NUMERO_PARCELAS}" ||
    token === "{VALOR_PARCELA}"
  )
    return "valor";
  return "sistema";
}

/** CSS inline por classe de token (OKLch alinhado ao design glass dark). */
export const COR_TOKEN: Record<ClasseTokenInline, { cor: string; fundo: string }> = {
  cliente:     { cor: "oklch(0.75 0.18 190)", fundo: "oklch(0.75 0.18 190 / 0.15)" },
  valor:       { cor: "oklch(0.80 0.18 80)",  fundo: "oklch(0.80 0.18 80 / 0.15)"  },
  sistema:     { cor: "oklch(0.70 0.20 270)", fundo: "oklch(0.70 0.20 270 / 0.15)" },
  condicional: { cor: "oklch(0.68 0.22 300)", fundo: "oklch(0.68 0.22 300 / 0.15)" },
  produto:     { cor: "oklch(0.76 0.18 50)",  fundo: "oklch(0.76 0.18 50 / 0.15)"  },
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tokenInline: {
      /** Insere um token inline na posição atual do cursor. */
      inserirToken: (token: string) => ReturnType;
    };
  }
}

export const TokenInline = Node.create({
  name: "token",
  group: "inline",
  inline: true,
  atom: true, // não editável internamente — substitui como unidade

  addAttributes() {
    return {
      token: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-token"),
        renderHTML: (attributes) => ({ "data-token": attributes.token }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-token]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const token = node.attrs.token as string;
    const classe = detectarClasseToken(token);
    const { cor, fundo } = COR_TOKEN[classe];

    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-token": token,
        "data-classe": classe,
        style: [
          `color:${cor}`,
          `background:${fundo}`,
          "border-radius:4px",
          "padding:1px 5px",
          "font-size:0.8em",
          "font-weight:500",
          "font-family:monospace",
          "white-space:nowrap",
          "user-select:none",
          "cursor:default",
        ].join(";"),
        contenteditable: "false",
      }),
      token,
    ];
  },

  addCommands() {
    return {
      inserirToken:
        (token: string) =>
        ({ commands }) => {
          return commands.insertContent({
            type: "token",
            attrs: { token },
          });
        },
    };
  },
});
