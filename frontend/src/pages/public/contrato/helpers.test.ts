import { describe, expect, it } from "vitest";
import { descreverOpcaoNomeada, documentoValido, extrairSocios, formatarDocumento, formatarSocios, hidratarCampos, resolverBlocoPreview, resumoEscolhaPagamento, sociosValidos } from "./helpers";
import type { DadosPagamento } from "./tipos";

const BLOCO =
  "CLÁUSULA SEXTA\n{{COND_PAG_INI}}{{VAR_AVISTA}}\nTotal de R$ 697,00 à vista.\n{{/VAR_AVISTA}}{{VAR_PARCELADO}}\n" +
  "O valor total é de {TOTAL_PARCELADO}, sendo:\n- {VALOR_ENTRADA} de entrada;\n- {NUMERO_PARCELAS} parcelas de {VALOR_PARCELA}.\n" +
  "{{/VAR_PARCELADO}}{{COND_PAG_FIM}}";

// Molde do Easy (2026-09-11): 697 à vista, ou 197 de entrada + 6× de 150 = 1.097
const dpEasy: DadosPagamento = {
  total_avista: 697,
  max_parcelas: 6,
  entrada: 197,
  valor_parcela: 150,
  parcelas: 6,
  planos: {
    junto: {
      total_centavos: 69700,
      max_parcelas: 6,
      entrada_centavos: 19700,
      opcoes: [{ parcelas: 6, entrada_centavos: 19700, valor_parcela_centavos: 15000, total_centavos: 109700, primeira_parcela_centavos: 15000 }],
    },
    separado: [],
  } as unknown as DadosPagamento["planos"],
};

describe("resolverBlocoPreview — parcelado usa entrada + parcela cravada do plano", () => {
  it("não divide o total à vista pelo nº de parcelas (bug 697 ÷ 6 = 116,17)", () => {
    const out = resolverBlocoPreview(BLOCO, { modo: "parcelado", parcelas: 6 }, dpEasy);
    expect(out).toContain("6 parcelas de R$ 150,00");
    expect(out).toContain("R$ 197,00 de entrada");
    expect(out).toContain("R$ 1.097,00");
    expect(out).not.toContain("116,17");
    expect(out).not.toContain("{VALOR_ENTRADA}");
  });

  it("sem planos, cai no parcelamento gravado em dados_pagamento", () => {
    const out = resolverBlocoPreview(BLOCO, { modo: "parcelado", parcelas: 6 }, { ...dpEasy, planos: null });
    expect(out).toContain("R$ 150,00");
    expect(out).toContain("R$ 1.097,00");
  });

  it("à vista mostra só a variante à vista", () => {
    const out = resolverBlocoPreview(BLOCO, { modo: "avista", parcelas: null }, dpEasy);
    expect(out).toContain("697,00 à vista");
    expect(out).not.toContain("entrada");
  });
});

describe("documento do contratante — CPF ou CNPJ", () => {
  it("formata CPF e CNPJ enquanto digita", () => {
    expect(formatarDocumento("CPF", "52998224725")).toBe("529.982.247-25");
    expect(formatarDocumento("CPF", "5299")).toBe("529.9");
    expect(formatarDocumento("CNPJ", "61461556000170")).toBe("61.461.556/0001-70");
    expect(formatarDocumento("CNPJ", "614615560")).toBe("61.461.556/0");
    expect(formatarDocumento("CNPJ", "6146155")).toBe("61.461.55");
  });

  it("corta no tamanho do tipo", () => {
    expect(formatarDocumento("CPF", "529982247251234")).toBe("529.982.247-25");
  });

  it("valida dígitos verificadores", () => {
    expect(documentoValido("CPF", "529.982.247-25")).toBe(true);
    expect(documentoValido("CPF", "529.982.247-24")).toBe(false);
    expect(documentoValido("CPF", "111.111.111-11")).toBe(false);
    expect(documentoValido("CNPJ", "61.461.556/0001-70")).toBe(true);
    expect(documentoValido("CNPJ", "61.461.556/0001-71")).toBe(false);
    expect(documentoValido("CNPJ", "529.982.247-25")).toBe(false);
  });
});

// Opções nomeadas (Fina, 2026-09-17): cada opção tem total próprio.
const OPCOES_FINA = [
  { id: "avista", rotulo: "À vista (40% de desconto)", total_centavos: 192000, entrada_centavos: 0, parcelas: 1, valor_parcela_centavos: 192000, observacao: null },
  { id: "cartao", rotulo: "Cartão de crédito (30% de desconto)", total_centavos: 224000, entrada_centavos: 0, parcelas: 8, valor_parcela_centavos: 28000, observacao: null },
  { id: "boleto_entrada", rotulo: "Boleto com entrada (25% de desconto de pontualidade)", total_centavos: 240000, entrada_centavos: 72000, parcelas: 5, valor_parcela_centavos: 33600, observacao: "Desconto válido pagando cada boleto até o vencimento." },
];
const dpFina = {
  total_avista: 3200,
  max_parcelas: 8,
  planos: {
    junto: { total_centavos: 320000, entrada_centavos: 72000, max_parcelas: 8, opcoes: [], opcoes_nomeadas: OPCOES_FINA },
    separado: [],
  },
} as unknown as DadosPagamento;

describe("descreverOpcaoNomeada — espelho de public.descrever_opcao_pagamento", () => {
  it("pagamento único", () => {
    expect(descreverOpcaoNomeada(OPCOES_FINA[0])).toBe(
      "Forma de pagamento escolhida: À vista (40% de desconto). Valor total de R$ 1920,00, em pagamento único.",
    );
  });
  it("parcelado sem entrada", () => {
    expect(descreverOpcaoNomeada(OPCOES_FINA[1])).toBe(
      "Forma de pagamento escolhida: Cartão de crédito (30% de desconto). Valor total de R$ 2240,00, em 8 parcelas de R$ 280,00.",
    );
  });
  it("entrada + parcelas + observação", () => {
    expect(descreverOpcaoNomeada(OPCOES_FINA[2])).toBe(
      "Forma de pagamento escolhida: Boleto com entrada (25% de desconto de pontualidade). Valor total de R$ 2400,00, sendo entrada de R$ 720,00 + 5 parcelas de R$ 336,00. Desconto válido pagando cada boleto até o vencimento.",
    );
  });
});

describe("resolverBlocoPreview — modo opcao", () => {
  it("troca o bloco inteiro pela opção escolhida", () => {
    const out = resolverBlocoPreview(BLOCO, { modo: "opcao", opcao_id: "cartao", parcelas: null }, dpFina);
    expect(out).toContain("Cartão de crédito (30% de desconto)");
    expect(out).not.toContain("697");
    expect(out).not.toContain("{{");
  });
  it("id desconhecido não inventa valor", () => {
    const out = resolverBlocoPreview(BLOCO, { modo: "opcao", opcao_id: "nao_existe", parcelas: null }, dpFina);
    expect(out).toContain("será inserida após sua escolha");
  });
  it("resumo mostra rótulo e total da opção", () => {
    const linhas = resumoEscolhaPagamento(dpFina, { modo: "opcao", opcao_id: "boleto_entrada", parcelas: null });
    expect(linhas?.map((l) => l.replace(/\s/g, " "))).toEqual([
      "Boleto com entrada (25% de desconto de pontualidade): R$ 2.400,00",
    ]);
  });
});

describe("sócios adicionais", () => {
  const dados = {
    socio_1_nome: "Fulana de Tal",
    socio_1_cpf: "529.982.247-25",
    socio_2_nome: "Belano",
    socio_2_cpf: "529.982.247-25",
  };

  it("extrai e ordena sócios", () => {
    expect(extrairSocios(dados).map((s) => s.nome)).toEqual(["Fulana de Tal", "Belano"]);
  });

  it("formata o token para o contrato", () => {
    expect(formatarSocios(dados)).toContain("Fulana de Tal — CPF 529.982.247-25");
    expect(hidratarCampos("Sócios: {{socios_adicionais}}", dados)).toContain("SÓCIOS ADICIONAIS:");
  });

  it("aceita lista vazia e rejeita CPF inválido preenchido", () => {
    expect(sociosValidos({})).toBe(true);
    expect(sociosValidos({ socio_1_nome: "Fulana", socio_1_cpf: "111.111.111-11" })).toBe(false);
  });
});
