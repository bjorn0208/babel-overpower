/**
 * TDD — editor-contrato.tsx (camada de dados)
 *
 * @testing-library/react não está instalado no projeto — testes de DOM
 * são feitos manualmente no browser. Aqui cobrimos:
 *
 *   1. Regressão round-trip serializa.ts (garante que 2b não quebrou 2a)
 *   2. Contratos de tipo do EditorContrato (compilação = aprovação)
 *   3. Lógica pura de SecaoTabs (tipos e valores)
 *   4. Invariantes do CATALOGO_TOKENS (usados pelo SlashMenu e editor)
 *   5. docParaTexto com nós de token inseridos programaticamente
 *
 * Critério de aprovação: serializa 23/23 + novos casos verdes.
 */

import { describe, it, expect } from "vitest";
import { textoParaDoc, docParaTexto } from "./serializa";
import type { ProseMirrorDoc } from "../tipos";
import { CATALOGO_TOKENS } from "../tipos";
import type { SecaoAtiva } from "./secao-tabs";

// ---------------------------------------------------------------------------
// Regressão — serializa.ts round-trip (garante que 2b não quebrou 2a)
// ---------------------------------------------------------------------------

describe("round-trip serializa (regressão 2b)", () => {
  function roundTrip(texto: string): string {
    return docParaTexto(textoParaDoc(texto));
  }
  function norm(s: string): string {
    return s
      .split("\n\n")
      .map((b) => b.trim())
      .filter(Boolean)
      .join("\n\n");
  }

  it("texto simples", () => {
    expect(norm(roundTrip("Texto simples."))).toBe("Texto simples.");
  });

  it("token inline cliente {{nome_completo}}", () => {
    const entrada = "Eu, {{nome_completo}}, declaro.";
    expect(norm(roundTrip(entrada))).toBe(norm(entrada));
  });

  it("token inline sistema {TOTAL_AVISTA}", () => {
    const entrada = "Valor: {TOTAL_AVISTA}.";
    expect(norm(roundTrip(entrada))).toBe(norm(entrada));
  });

  it("token de bloco {ITENS_CONTRATADOS} isolado", () => {
    expect(norm(roundTrip("{ITENS_CONTRATADOS}"))).toBe("{ITENS_CONTRATADOS}");
  });

  it("token de bloco {CLAUSULAS_POR_PRODUTO} isolado", () => {
    expect(norm(roundTrip("{CLAUSULAS_POR_PRODUTO}"))).toBe(
      "{CLAUSULAS_POR_PRODUTO}"
    );
  });

  it("token de bloco {COND_PAGAMENTO} isolado", () => {
    expect(norm(roundTrip("{COND_PAGAMENTO}"))).toBe("{COND_PAGAMENTO}");
  });

  it("token de bloco {ASSINATURAS} isolado", () => {
    expect(norm(roundTrip("{ASSINATURAS}"))).toBe("{ASSINATURAS}");
  });

  it("múltiplos parágrafos com tokens", () => {
    const entrada = [
      "Contrato firmado por {{nome_completo}}.",
      "{ITENS_CONTRATADOS}",
      "{COND_PAGAMENTO}",
      "Foro: {{cidade}}.",
      "{ASSINATURAS}",
    ].join("\n\n");
    expect(norm(roundTrip(entrada))).toBe(norm(entrada));
  });

  it("texto vazio não quebra", () => {
    expect(() => roundTrip("")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// docParaTexto — nós de token inseridos programaticamente
// ---------------------------------------------------------------------------

describe("docParaTexto com nós de token (simulação de inserção via comando)", () => {
  it("nó token inline serializa como literal", () => {
    const doc: ProseMirrorDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Nome: " },
            { type: "token", attrs: { token: "{{nome_completo}}" } },
            { type: "text", text: ", CPF " },
            { type: "token", attrs: { token: "{{cpf}}" } },
          ],
        },
      ],
    };
    const texto = docParaTexto(doc);
    expect(texto).toContain("{{nome_completo}}");
    expect(texto).toContain("{{cpf}}");
    expect(texto).toContain("Nome: ");
    expect(texto).toContain(", CPF ");
  });

  it("nó blockToken serializa como linha isolada", () => {
    const doc: ProseMirrorDoc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Intro." }] },
        { type: "blockToken", attrs: { token: "{ASSINATURAS}" } },
      ],
    };
    const texto = docParaTexto(doc);
    expect(texto).toContain("Intro.");
    expect(texto).toContain("{ASSINATURAS}");
  });

  it("doc com todos os quatro tokens de bloco serializa todos", () => {
    const doc: ProseMirrorDoc = {
      type: "doc",
      content: [
        { type: "blockToken", attrs: { token: "{ITENS_CONTRATADOS}" } },
        { type: "blockToken", attrs: { token: "{CLAUSULAS_POR_PRODUTO}" } },
        { type: "blockToken", attrs: { token: "{COND_PAGAMENTO}" } },
        { type: "blockToken", attrs: { token: "{ASSINATURAS}" } },
      ],
    };
    const texto = docParaTexto(doc);
    expect(texto).toContain("{ITENS_CONTRATADOS}");
    expect(texto).toContain("{CLAUSULAS_POR_PRODUTO}");
    expect(texto).toContain("{COND_PAGAMENTO}");
    expect(texto).toContain("{ASSINATURAS}");
  });
});

// ---------------------------------------------------------------------------
// CATALOGO_TOKENS — invariantes (usados pelo SlashMenu e editor)
// ---------------------------------------------------------------------------

describe("CATALOGO_TOKENS — invariantes", () => {
  it("todos os tokens têm rotulo e descricao não-vazios", () => {
    for (const t of CATALOGO_TOKENS) {
      expect(t.rotulo, `token ${t.token} sem rotulo`).toBeTruthy();
      expect(t.descricao, `token ${t.token} sem descricao`).toBeTruthy();
    }
  });

  it("tokens de bloco são exatamente 4", () => {
    const blocos = CATALOGO_TOKENS.filter((t) => t.tipo === "bloco");
    expect(blocos).toHaveLength(4);
  });

  it("tokens inline são 8", () => {
    const inline = CATALOGO_TOKENS.filter((t) => t.tipo === "inline");
    expect(inline).toHaveLength(8);
  });

  it("tokens de produto têm apenas_em_produto = true", () => {
    const produto = CATALOGO_TOKENS.filter((t) => t.classe === "produto");
    for (const t of produto) {
      expect(
        t.apenas_em_produto,
        `${t.token} deveria ter apenas_em_produto`
      ).toBe(true);
    }
  });

  it("todos os tokens têm formato válido: {{slug}} ou {TOKEN}", () => {
    const reCliente = /^{{[^}]+}}$/;
    const reSistema = /^\{[A-Z_][A-Z0-9_]*\}$/;
    for (const t of CATALOGO_TOKENS) {
      const valido = reCliente.test(t.token) || reSistema.test(t.token);
      expect(valido, `formato inválido: ${t.token}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// SecaoAtiva — contrato de tipo (compilação = aprovação)
// ---------------------------------------------------------------------------

describe("SecaoAtiva — contrato de tipo", () => {
  it("tipo 'comum' é válido", () => {
    const secao: SecaoAtiva = { tipo: "comum" };
    expect(secao.tipo).toBe("comum");
  });

  it("tipo 'produto' com produto_id é válido", () => {
    const secao: SecaoAtiva = { tipo: "produto", produto_id: "prod-123" };
    expect(secao.tipo).toBe("produto");
    if (secao.tipo === "produto") {
      expect(secao.produto_id).toBe("prod-123");
    }
  });

  it("discriminated union — narrowing funciona", () => {
    function descricaoSecao(s: SecaoAtiva): string {
      if (s.tipo === "comum") return "comum";
      return `produto:${s.produto_id}`;
    }
    expect(descricaoSecao({ tipo: "comum" })).toBe("comum");
    expect(descricaoSecao({ tipo: "produto", produto_id: "abc" })).toBe(
      "produto:abc"
    );
  });
});
