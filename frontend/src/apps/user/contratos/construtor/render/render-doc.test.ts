/**
 * TDD — render-doc.ts
 *
 * Valida que a resolução de tokens espelha o que a RPC v1 faz em plpgsql.
 * Determinístico: sem chamadas externas, sem React, sem Supabase.
 */

import { describe, it, expect } from "vitest";
import { renderDoc, dadosExemplo, formatarBrl } from "./render-doc";
import type { DadosRender, ItemCarrinho } from "./render-doc";
import type { TemplateV2 } from "../tipos";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const templateBase: TemplateV2 = {
  id: "tpl-test",
  user_id: "uid-test",
  nome: "Template de teste",
  ativo: true,
  conteudo_comum: null,
  clausulas_por_produto: {},
  campos_cliente: [
    { slug: "nome_completo", rotulo: "Nome completo", tipo: "texto", obrigatorio: true, icone: "user" },
    { slug: "cpf", rotulo: "CPF", tipo: "cpf", obrigatorio: true, icone: "id" },
    { slug: "email", rotulo: "E-mail", tipo: "email", obrigatorio: false, icone: "mail" },
  ],
  produtos_aceitos: [
    {
      produto_id: "prod-a",
      preco_avista: 1000,
      parcelamento: { entrada: 0, max_parcelas: 12, valor_parcelado_total: 1200 },
    },
    {
      produto_id: "prod-b",
      preco_avista: 500,
      parcelamento: { entrada: 0, max_parcelas: 6, valor_parcelado_total: 600 },
    },
  ],
  pagamento: {
    modo: "unico",
    chave_pix: "12.345.678/0001-90",
    link_parcelamento: "https://pag.exemplo.com/link",
    posicao_pagamento: "after_sign",
  },
  provas: {
    selfie: true,
    documento: true,
    assinatura_manuscrita: true,
    testemunha: true,
    num_testemunhas: 2,
    instrucao_selfie: "mostrar_2_dedos",
  },
  jornada_ordem: ["dados", "pagamento", "contrato", "comprovante", "selfie", "documento", "assinatura", "testemunha"],
};

const itensExemplo: ItemCarrinho[] = [
  {
    produto_id: "prod-a",
    nome: "Mentoria 6 meses",
    quantidade: 2,
    subtotal_avista: 2000,
    subtotal_parcelado: 2400,
    max_parcelas: 12,
  },
  {
    produto_id: "prod-b",
    nome: "Aula avulsa",
    quantidade: 3,
    subtotal_avista: 1500,
    subtotal_parcelado: 1800,
    max_parcelas: 6,
  },
];

const dadosAvista: DadosRender = {
  dadosCliente: {
    nome_completo: "Maria Aparecida da Silva",
    cpf: "123.456.789-00",
    email: "maria.silva@exemplo.com",
  },
  itens: itensExemplo,
  totalAvista: 3500,
  totalParcelado: 4200,
  numeroParcelas: 6,
  modoPagamento: "avista",
};

const dadosParcelado: DadosRender = { ...dadosAvista, modoPagamento: "parcelado" };

// ---------------------------------------------------------------------------
// formatarBrl
// ---------------------------------------------------------------------------

describe("formatarBrl", () => {
  it("formata zero", () => {
    expect(formatarBrl(0)).toContain("0");
  });

  it("formata valor positivo em BRL", () => {
    const r = formatarBrl(1500);
    expect(r).toContain("1.500");
  });

  it("formata valor com centavos", () => {
    const r = formatarBrl(1234.56);
    expect(r).toContain("1.234");
  });
});

// ---------------------------------------------------------------------------
// dadosExemplo
// ---------------------------------------------------------------------------

describe("dadosExemplo", () => {
  it("mapeia campos do template para dados fictícios", () => {
    const dados = dadosExemplo(templateBase);
    expect(dados).toHaveProperty("nome_completo");
    expect(dados).toHaveProperty("cpf");
    expect(dados).toHaveProperty("email");
  });

  it("campo sem exemplo padrão vira [rotulo]", () => {
    const tpl: TemplateV2 = {
      ...templateBase,
      campos_cliente: [{ slug: "numero_contrato", rotulo: "Nº do contrato", tipo: "texto", obrigatorio: true, icone: "hash" }],
    };
    const dados = dadosExemplo(tpl);
    expect(dados["numero_contrato"]).toBe("[Nº do contrato]");
  });

  it("template sem campos retorna objeto vazio", () => {
    const tpl: TemplateV2 = { ...templateBase, campos_cliente: [] };
    expect(dadosExemplo(tpl)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// renderDoc — tokens de cliente
// ---------------------------------------------------------------------------

describe("renderDoc — tokens de cliente", () => {
  it("resolve {{nome_completo}} no texto", () => {
    const html = renderDoc("Eu, {{nome_completo}}, declaro.", dadosAvista, templateBase);
    expect(html).toContain("Maria Aparecida da Silva");
    expect(html).not.toContain("{{nome_completo}}");
  });

  it("resolve múltiplos campos na mesma linha", () => {
    const html = renderDoc("{{nome_completo}}, CPF {{cpf}}.", dadosAvista, templateBase);
    expect(html).toContain("Maria Aparecida da Silva");
    expect(html).toContain("123.456.789-00");
  });

  it("token de campo não configurado fica literal", () => {
    const html = renderDoc("Cidade: {{cidade_natal}}.", dadosAvista, templateBase);
    expect(html).toContain("{{cidade_natal}}");
  });
});

// ---------------------------------------------------------------------------
// renderDoc — tokens de valor
// ---------------------------------------------------------------------------

describe("renderDoc — tokens de valor", () => {
  it("resolve {TOTAL_AVISTA}", () => {
    const html = renderDoc("Total: {TOTAL_AVISTA}.", dadosAvista, templateBase);
    expect(html).toContain("3.500");
    expect(html).not.toContain("{TOTAL_AVISTA}");
  });

  it("resolve {TOTAL_PARCELADO}", () => {
    const html = renderDoc("Parcelado: {TOTAL_PARCELADO}.", dadosAvista, templateBase);
    expect(html).toContain("4.200");
    expect(html).not.toContain("{TOTAL_PARCELADO}");
  });

  it("resolve {NUMERO_PARCELAS}", () => {
    const html = renderDoc("Parcelas: {NUMERO_PARCELAS}x.", dadosAvista, templateBase);
    expect(html).toContain("6");
    expect(html).not.toContain("{NUMERO_PARCELAS}");
  });

  it("resolve {VALOR_PARCELA}", () => {
    // 4200 / 6 = 700
    const html = renderDoc("Parcela: {VALOR_PARCELA}.", dadosAvista, templateBase);
    expect(html).toContain("700");
    expect(html).not.toContain("{VALOR_PARCELA}");
  });

  it("resolve {PRODUTO_NOME} com primeiro item do carrinho", () => {
    const html = renderDoc("{PRODUTO_NOME}", dadosAvista, templateBase);
    expect(html).toContain("Mentoria 6 meses");
  });

  it("resolve {PRODUTO_QTD} com quantidade do primeiro item", () => {
    const html = renderDoc("{PRODUTO_QTD}", dadosAvista, templateBase);
    expect(html).toContain("2");
  });

  it("resolve {PRODUTO_PRECO_AVISTA}", () => {
    const html = renderDoc("{PRODUTO_PRECO_AVISTA}", dadosAvista, templateBase);
    expect(html).toContain("2.000");
  });
});

// ---------------------------------------------------------------------------
// renderDoc — tokens de bloco: {ITENS_CONTRATADOS}
// ---------------------------------------------------------------------------

describe("renderDoc — {ITENS_CONTRATADOS}", () => {
  it("gera tabela HTML com itens do carrinho", () => {
    const html = renderDoc("{ITENS_CONTRATADOS}", dadosAvista, templateBase);
    expect(html).toContain("<table");
    expect(html).toContain("Mentoria 6 meses");
    expect(html).toContain("Aula avulsa");
    expect(html).not.toContain("{ITENS_CONTRATADOS}");
  });

  it("modo avista usa subtotais à vista", () => {
    const html = renderDoc("{ITENS_CONTRATADOS}", dadosAvista, templateBase);
    expect(html).toContain("2.000");
    expect(html).toContain("1.500");
  });

  it("modo parcelado usa subtotais parcelados", () => {
    const html = renderDoc("{ITENS_CONTRATADOS}", dadosParcelado, templateBase);
    expect(html).toContain("2.400");
    expect(html).toContain("1.800");
  });

  it("carrinho vazio gera mensagem adequada", () => {
    const dadosVazio: DadosRender = { ...dadosAvista, itens: [] };
    const html = renderDoc("{ITENS_CONTRATADOS}", dadosVazio, templateBase);
    expect(html).toContain("nenhum produto");
  });

  it("total da tabela é calculado corretamente (modo avista)", () => {
    const html = renderDoc("{ITENS_CONTRATADOS}", dadosAvista, templateBase);
    // 2000 + 1500 = 3500
    expect(html).toContain("3.500");
  });
});

// ---------------------------------------------------------------------------
// renderDoc — tokens de bloco: {COND_PAGAMENTO}
// ---------------------------------------------------------------------------

describe("renderDoc — {COND_PAGAMENTO}", () => {
  it("modo avista inclui valor à vista e chave PIX", () => {
    const html = renderDoc("{COND_PAGAMENTO}", dadosAvista, templateBase);
    expect(html).toContain("à vista");
    expect(html).toContain("3.500");
    expect(html).toContain("PIX");
    expect(html).toContain("12.345.678/0001-90");
    expect(html).not.toContain("{COND_PAGAMENTO}");
  });

  it("modo parcelado inclui valor parcelado, parcelas e link", () => {
    const html = renderDoc("{COND_PAGAMENTO}", dadosParcelado, templateBase);
    expect(html).toContain("4.200");
    expect(html).toContain("6×");
    expect(html).toContain("700");
    expect(html).not.toContain("{COND_PAGAMENTO}");
  });

  it("sem chave PIX omite referência a PIX", () => {
    const tplSemPix: TemplateV2 = {
      ...templateBase,
      pagamento: { ...templateBase.pagamento!, chave_pix: null },
    };
    const html = renderDoc("{COND_PAGAMENTO}", dadosAvista, tplSemPix);
    expect(html).not.toContain("PIX");
  });
});

// ---------------------------------------------------------------------------
// renderDoc — tokens de bloco: {CLAUSULAS_POR_PRODUTO}
// ---------------------------------------------------------------------------

describe("renderDoc — {CLAUSULAS_POR_PRODUTO}", () => {
  it("gera cláusulas de cada produto com seu título", () => {
    const clausulas: Record<string, string> = {
      "prod-a": "<p>Cláusula exclusiva da Mentoria.</p>",
      "prod-b": "<p>Cláusula exclusiva da Aula.</p>",
    };
    const html = renderDoc("{CLAUSULAS_POR_PRODUTO}", dadosAvista, templateBase, clausulas);
    expect(html).toContain("Mentoria 6 meses");
    expect(html).toContain("Cláusula exclusiva da Mentoria");
    expect(html).toContain("Aula avulsa");
    expect(html).toContain("Cláusula exclusiva da Aula");
    expect(html).not.toContain("{CLAUSULAS_POR_PRODUTO}");
  });

  it("produto sem cláusula não aparece no bloco", () => {
    const clausulas: Record<string, string> = {
      "prod-a": "<p>Cláusula de A.</p>",
    };
    const html = renderDoc("{CLAUSULAS_POR_PRODUTO}", dadosAvista, templateBase, clausulas);
    expect(html).toContain("Cláusula de A");
    // prod-b sem cláusula não gera seção vazia
    expect(html).not.toContain("Aula avulsa");
  });

  it("sem cláusulas configuradas gera mensagem adequada", () => {
    const html = renderDoc("{CLAUSULAS_POR_PRODUTO}", dadosAvista, templateBase, {});
    expect(html).toContain("nenhuma cláusula");
  });
});

// ---------------------------------------------------------------------------
// renderDoc — tokens de bloco: {ASSINATURAS}
// ---------------------------------------------------------------------------

describe("renderDoc — {ASSINATURAS}", () => {
  it("inclui linha de assinatura do contratante", () => {
    const html = renderDoc("{ASSINATURAS}", dadosAvista, templateBase);
    expect(html).toContain("Maria Aparecida da Silva");
    expect(html).not.toContain("{ASSINATURAS}");
  });

  it("inclui linhas de testemunhas conforme num_testemunhas", () => {
    const html = renderDoc("{ASSINATURAS}", dadosAvista, templateBase);
    expect(html).toContain("Testemunha 1");
    expect(html).toContain("Testemunha 2");
  });

  it("zero testemunhas não adiciona linhas de testemunha", () => {
    const tplSemTestemunha: TemplateV2 = {
      ...templateBase,
      provas: { ...templateBase.provas!, num_testemunhas: 0, testemunha: false },
    };
    const html = renderDoc("{ASSINATURAS}", dadosAvista, tplSemTestemunha);
    expect(html).not.toContain("Testemunha");
  });
});

// ---------------------------------------------------------------------------
// renderDoc — headings e parágrafos
// ---------------------------------------------------------------------------

describe("renderDoc — estrutura HTML", () => {
  it("heading # vira h1 centralizado", () => {
    const html = renderDoc("# CONTRATO DE PRESTAÇÃO", dadosAvista, templateBase);
    expect(html).toContain("<h1");
    expect(html).toContain("CONTRATO DE PRESTAÇÃO");
  });

  it("heading ## vira h2", () => {
    const html = renderDoc("## Cláusula 1", dadosAvista, templateBase);
    expect(html).toContain("<h2");
    expect(html).toContain("Cláusula 1");
  });

  it("heading ### vira h3", () => {
    const html = renderDoc("### Sub-cláusula", dadosAvista, templateBase);
    expect(html).toContain("<h3");
  });

  it("texto normal vira parágrafo", () => {
    const html = renderDoc("Texto normal.", dadosAvista, templateBase);
    expect(html).toContain("<p");
    expect(html).toContain("Texto normal.");
  });

  it("quebra simples \\n vira <br>", () => {
    const html = renderDoc("Linha 1\nLinha 2", dadosAvista, templateBase);
    expect(html).toContain("<br>");
    expect(html).toContain("Linha 1");
    expect(html).toContain("Linha 2");
  });

  it("texto vazio não gera HTML", () => {
    const html = renderDoc("", dadosAvista, templateBase);
    expect(html).toBe("");
  });
});

// ---------------------------------------------------------------------------
// renderDoc — contrato completo (smoke)
// ---------------------------------------------------------------------------

describe("renderDoc — contrato completo", () => {
  it("resolve todos os tipos de token num contrato real", () => {
    const texto = [
      "# CONTRATO DE PRESTAÇÃO DE SERVIÇOS",
      "Contratante: {{nome_completo}}, CPF {{cpf}}.",
      "{ITENS_CONTRATADOS}",
      "{CLAUSULAS_POR_PRODUTO}",
      "{COND_PAGAMENTO}",
      "{ASSINATURAS}",
    ].join("\n\n");

    const clausulas = { "prod-a": "<p>Termo de mentoria.</p>" };
    const html = renderDoc(texto, dadosAvista, templateBase, clausulas);

    // Não deve sobrar nenhum token não-resolvido do tipo {TOKEN}
    const tokensNaoResolvidos = html.match(/\{[A-Z_][A-Z0-9_]*\}/g) ?? [];
    expect(tokensNaoResolvidos).toHaveLength(0);

    // Deve conter conteúdo dos dados de exemplo
    expect(html).toContain("Maria Aparecida da Silva");
    expect(html).toContain("Mentoria 6 meses");
    expect(html).toContain("à vista");
  });

  it("não explode com template sem provas configuradas", () => {
    const tplSemProvas: TemplateV2 = { ...templateBase, provas: null };
    expect(() =>
      renderDoc("{ASSINATURAS}", dadosAvista, tplSemProvas)
    ).not.toThrow();
  });

  it("não explode com carrinho vazio em contrato completo", () => {
    const dadosVazio: DadosRender = { ...dadosAvista, itens: [], totalAvista: 0, totalParcelado: 0, numeroParcelas: 1 };
    const texto = "{ITENS_CONTRATADOS}\n\n{COND_PAGAMENTO}\n\n{ASSINATURAS}";
    expect(() => renderDoc(texto, dadosVazio, templateBase)).not.toThrow();
  });
});
