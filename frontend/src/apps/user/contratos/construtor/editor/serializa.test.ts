/**
 * TDD — serializa.ts
 * Round-trip: texto-com-tokens → doc → texto idêntico.
 * Cobertura: {{campo}}, {TOKEN}, {BLOCO}, parágrafos, quebras de linha simples.
 */

import { describe, it, expect } from "vitest";
import { docParaTexto, textoParaDoc } from "./serializa";
import type { ProseMirrorDoc } from "../tipos";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roundTrip(texto: string): string {
  return docParaTexto(textoParaDoc(texto));
}

// Normaliza trailing whitespace pra comparação robusta
function norm(s: string): string {
  return s
    .split("\n\n")
    .map((b) => b.trim())
    .filter(Boolean)
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// textoParaDoc — parsing
// ---------------------------------------------------------------------------

describe("textoParaDoc", () => {
  it("texto simples vira parágrafo com nó text", () => {
    const doc = textoParaDoc("Olá mundo");
    expect(doc.type).toBe("doc");
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0].type).toBe("paragraph");
    const nos = doc.content[0].content ?? [];
    expect(nos[0]).toMatchObject({ type: "text", text: "Olá mundo" });
  });

  it("{{slug}} vira nó token inline", () => {
    const doc = textoParaDoc("Nome: {{nome_completo}}");
    const nos = doc.content[0].content ?? [];
    expect(nos).toContainEqual({ type: "text", text: "Nome: " });
    expect(nos).toContainEqual({ type: "token", attrs: { token: "{{nome_completo}}" } });
  });

  it("{TOKEN} sistema vira nó token inline", () => {
    const doc = textoParaDoc("Total: {TOTAL_AVISTA}");
    const nos = doc.content[0].content ?? [];
    expect(nos).toContainEqual({ type: "token", attrs: { token: "{TOTAL_AVISTA}" } });
  });

  it("token de bloco em linha isolada vira blockToken", () => {
    const doc = textoParaDoc("Cabeçalho\n\n{ITENS_CONTRATADOS}\n\nRodapé");
    expect(doc.content).toHaveLength(3);
    expect(doc.content[1]).toMatchObject({
      type: "blockToken",
      attrs: { token: "{ITENS_CONTRATADOS}" },
    });
  });

  it("todos os tokens de bloco são reconhecidos", () => {
    const blocos = [
      "{ITENS_CONTRATADOS}",
      "{CLAUSULAS_POR_PRODUTO}",
      "{COND_PAGAMENTO}",
      "{ASSINATURAS}",
    ];
    for (const token of blocos) {
      const doc = textoParaDoc(token);
      expect(doc.content[0]).toMatchObject({
        type: "blockToken",
        attrs: { token },
      });
    }
  });

  it("quebra simples \\n dentro do bloco vira hardBreak", () => {
    const doc = textoParaDoc("Linha 1\nLinha 2");
    const nos = doc.content[0].content ?? [];
    expect(nos.some((n) => n.type === "hardBreak")).toBe(true);
  });

  it("texto vazio gera doc com parágrafo vazio", () => {
    const doc = textoParaDoc("");
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0].type).toBe("paragraph");
  });

  it("múltiplos parágrafos separados por \\n\\n", () => {
    const doc = textoParaDoc("Parágrafo 1\n\nParágrafo 2");
    expect(doc.content).toHaveLength(2);
  });

  it("múltiplos tokens na mesma linha", () => {
    const doc = textoParaDoc("{{nome_completo}}, CPF {{cpf}}, total {TOTAL_AVISTA}");
    const nos = doc.content[0].content ?? [];
    const tokens = nos.filter((n) => n.type === "token").map((n) => n.attrs?.token);
    expect(tokens).toContain("{{nome_completo}}");
    expect(tokens).toContain("{{cpf}}");
    expect(tokens).toContain("{TOTAL_AVISTA}");
  });
});

// ---------------------------------------------------------------------------
// docParaTexto — serialização
// ---------------------------------------------------------------------------

describe("docParaTexto", () => {
  it("parágrafo simples serializa corretamente", () => {
    const doc: ProseMirrorDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Texto simples" }],
        },
      ],
    };
    expect(docParaTexto(doc).trim()).toBe("Texto simples");
  });

  it("nó token serializa como string literal", () => {
    const doc: ProseMirrorDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Nome: " },
            { type: "token", attrs: { token: "{{nome_completo}}" } },
          ],
        },
      ],
    };
    expect(docParaTexto(doc)).toContain("{{nome_completo}}");
  });

  it("blockToken serializa como string literal em linha isolada", () => {
    const doc: ProseMirrorDoc = {
      type: "doc",
      content: [
        { type: "blockToken", attrs: { token: "{ITENS_CONTRATADOS}" } },
      ],
    };
    expect(docParaTexto(doc)).toContain("{ITENS_CONTRATADOS}");
  });

  it("hardBreak serializa como \\n", () => {
    const doc: ProseMirrorDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Linha 1" },
            { type: "hardBreak" },
            { type: "text", text: "Linha 2" },
          ],
        },
      ],
    };
    const saida = docParaTexto(doc);
    expect(saida).toContain("Linha 1\nLinha 2");
  });
});

// ---------------------------------------------------------------------------
// Round-trip — texto → doc → texto idêntico
// ---------------------------------------------------------------------------

describe("round-trip", () => {
  it("texto simples", () => {
    const entrada = "Contrato de prestação de serviços.";
    expect(norm(roundTrip(entrada))).toBe(norm(entrada));
  });

  it("token de cliente inline", () => {
    const entrada = "Eu, {{nome_completo}}, CPF {{cpf}}, declaro.";
    expect(norm(roundTrip(entrada))).toBe(norm(entrada));
  });

  it("token de valor inline", () => {
    const entrada = "Valor à vista: {TOTAL_AVISTA}. Parcelas: {NUMERO_PARCELAS}x de {VALOR_PARCELA}.";
    expect(norm(roundTrip(entrada))).toBe(norm(entrada));
  });

  it("token de bloco isolado", () => {
    const entrada = "{ITENS_CONTRATADOS}";
    expect(norm(roundTrip(entrada))).toBe(norm(entrada));
  });

  it("múltiplos parágrafos com tokens", () => {
    const entrada = [
      "Este contrato é firmado por {{nome_completo}}, CPF {{cpf}}.",
      "{ITENS_CONTRATADOS}",
      "{COND_PAGAMENTO}",
      "Foro: {{cidade}}.",
      "{ASSINATURAS}",
    ].join("\n\n");
    expect(norm(roundTrip(entrada))).toBe(norm(entrada));
  });

  it("token de bloco {CLAUSULAS_POR_PRODUTO}", () => {
    const entrada = "Cláusulas gerais.\n\n{CLAUSULAS_POR_PRODUTO}\n\nDisposições finais.";
    expect(norm(roundTrip(entrada))).toBe(norm(entrada));
  });

  it("todos os quatro tokens de bloco preservados", () => {
    const entrada = [
      "{ITENS_CONTRATADOS}",
      "{CLAUSULAS_POR_PRODUTO}",
      "{COND_PAGAMENTO}",
      "{ASSINATURAS}",
    ].join("\n\n");
    const saida = norm(roundTrip(entrada));
    expect(saida).toContain("{ITENS_CONTRATADOS}");
    expect(saida).toContain("{CLAUSULAS_POR_PRODUTO}");
    expect(saida).toContain("{COND_PAGAMENTO}");
    expect(saida).toContain("{ASSINATURAS}");
  });

  it("texto sem token preservado integralmente", () => {
    const entrada = "Cláusula 1: vigência de 12 meses.\n\nCláusula 2: foro desta comarca.";
    expect(norm(roundTrip(entrada))).toBe(norm(entrada));
  });

  it("texto vazio não quebra", () => {
    expect(() => roundTrip("")).not.toThrow();
  });

  it("apenas espaços e quebras não quebra", () => {
    expect(() => roundTrip("   \n\n   ")).not.toThrow();
  });
});
