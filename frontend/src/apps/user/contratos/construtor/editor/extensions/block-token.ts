/**
 * Extensão TipTap — BlockToken
 *
 * Nó de bloco atômico para tokens que ocupam parágrafo inteiro no contrato.
 * Tokens de bloco suportados (spec §3):
 *   {ITENS_CONTRATADOS}     — tabela de itens do carrinho
 *   {CLAUSULAS_POR_PRODUTO} — injeta cláusulas dos produtos comprados
 *   {COND_PAGAMENTO}        — variante à vista / parcelado
 *   {ASSINATURAS}           — linhas de assinatura
 *
 * Serializa pra texto plano: "{TOKEN}\n"
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { TOKENS_BLOCO } from "../../tipos";

/** Rótulo legível por token de bloco — exibido no editor. */
const ROTULO_BLOCO: Record<string, string> = {
  "{ITENS_CONTRATADOS}":     "Tabela de itens contratados",
  "{CLAUSULAS_POR_PRODUTO}": "Cláusulas por produto",
  "{COND_PAGAMENTO}":        "Condição de pagamento",
  "{ASSINATURAS}":           "Assinaturas",
};

/** Ícone (emoji simples) por token de bloco. */
const ICONE_BLOCO: Record<string, string> = {
  "{ITENS_CONTRATADOS}":     "📋",
  "{CLAUSULAS_POR_PRODUTO}": "📄",
  "{COND_PAGAMENTO}":        "💳",
  "{ASSINATURAS}":           "✍️",
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    blockToken: {
      /** Insere um bloco-token na posição atual do cursor. */
      inserirBlocoToken: (token: string) => ReturnType;
    };
  }
}

export const BlockToken = Node.create({
  name: "blockToken",
  group: "block",
  atom: true, // não editável internamente — substitui como unidade

  addAttributes() {
    return {
      token: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-bloco-token"),
        renderHTML: (attributes) => ({
          "data-bloco-token": attributes.token,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-bloco-token]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const token = node.attrs.token as string;
    const rotulo = ROTULO_BLOCO[token] ?? token;
    const icone = ICONE_BLOCO[token] ?? "🔧";

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-bloco-token": token,
        style: [
          "display:flex",
          "align-items:center",
          "gap:8px",
          "padding:10px 14px",
          "border-radius:8px",
          "border:1px dashed oklch(0.65 0.22 280 / 0.5)",
          "background:oklch(0.65 0.22 280 / 0.07)",
          "color:oklch(0.70 0.20 270)",
          "font-size:13px",
          "font-weight:500",
          "user-select:none",
          "cursor:default",
          "margin:4px 0",
        ].join(";"),
        contenteditable: "false",
      }),
      // Ícone
      ["span", { style: "font-size:16px" }, icone],
      // Rótulo
      ["span", {}, rotulo],
      // Token técnico em monospace
      [
        "code",
        {
          style: [
            "margin-left:auto",
            "font-size:10px",
            "opacity:0.5",
            "font-family:monospace",
          ].join(";"),
        },
        token,
      ],
    ];
  },

  addCommands() {
    return {
      inserirBlocoToken:
        (token: string) =>
        ({ commands }) => {
          if (!TOKENS_BLOCO.includes(token)) {
            console.warn("[BlockToken] token de bloco desconhecido:", token);
            return false;
          }
          return commands.insertContent({
            type: "blockToken",
            attrs: { token },
          });
        },
    };
  },
});
