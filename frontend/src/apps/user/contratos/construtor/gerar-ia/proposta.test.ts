/**
 * proposta.test.ts — Testes da validação pura da proposta da IA (F3c).
 */

import { describe, it, expect } from "vitest";
import {
  validarProposta,
  extrairPlaceholders,
  preSelecionarProduto,
  type PropostaEstrutura,
} from "./proposta";

function propostaBase(parcial?: Partial<PropostaEstrutura>): PropostaEstrutura {
  return {
    moldura:
      "CONTRATANTE: {{nome_completo}}, CPF {{cpf}}.\n{CLAUSULAS_POR_PRODUTO}\nForo da comarca. Assinado em {{data_assinatura}}.",
    miolo: "CLÁUSULA 1 — O serviço consiste na regularização cadastral.",
    campos: [
      { slug: "nome_completo", rotulo: "Nome completo", tipo: "texto", obrigatorio: true, icone: "user" },
      { slug: "cpf", rotulo: "CPF", tipo: "cpf", obrigatorio: true, icone: "id" },
    ],
    exigencias: { selfie: false, num_testemunhas: 0, instrucao_selfie: "", documento: false, assinatura_manuscrita: true },
    nome_produto_detectado: "Limpa Nome",
    ...parcial,
  };
}

describe("extrairPlaceholders", () => {
  it("acha placeholders minúsculos e ignora tokens automáticos e de sistema", () => {
    const texto = "Olá {{nome_completo}} ({{cpf}}) — {CLAUSULAS_POR_PRODUTO} em {{data_assinatura}}";
    expect(extrairPlaceholders(texto).sort()).toEqual(["cpf", "nome_completo"]);
  });

  it("não duplica placeholder repetido", () => {
    expect(extrairPlaceholders("{{cpf}} e de novo {{cpf}}")).toEqual(["cpf"]);
  });
});

describe("validarProposta", () => {
  it("proposta coerente passa sem erros", () => {
    const v = validarProposta(propostaBase());
    expect(v.erros).toEqual([]);
  });

  it("placeholder órfão vira erro bloqueante", () => {
    const v = validarProposta(propostaBase({ campos: propostaBase().campos.slice(0, 1) }));
    expect(v.erros.some((e) => e.includes("{{cpf}}"))).toBe(true);
  });

  it("campo sem placeholder vira aviso, não erro", () => {
    const p = propostaBase();
    p.campos.push({ slug: "telefone", rotulo: "Telefone", tipo: "telefone", obrigatorio: false, icone: "phone" });
    const v = validarProposta(p);
    expect(v.erros).toEqual([]);
    expect(v.avisos.some((a) => a.includes("Telefone"))).toBe(true);
  });

  it("moldura vazia é erro", () => {
    const v = validarProposta(propostaBase({ moldura: "  " }));
    expect(v.erros.length).toBeGreaterThan(0);
  });

  it("slug duplicado é erro", () => {
    const p = propostaBase();
    p.campos.push({ ...p.campos[0] });
    const v = validarProposta(p);
    expect(v.erros.some((e) => e.includes("repetido"))).toBe(true);
  });

  it("moldura sem token de cláusulas gera aviso (anexa ao fim)", () => {
    const v = validarProposta(
      propostaBase({ moldura: "CONTRATANTE: {{nome_completo}}, CPF {{cpf}}. Foro da comarca." }),
    );
    expect(v.erros).toEqual([]);
    expect(v.avisos.some((a) => a.includes("CLAUSULAS_POR_PRODUTO"))).toBe(true);
  });
});

describe("preSelecionarProduto", () => {
  const produtos = [
    { id: "a", nome: "Limpa Nome Padrão" },
    { id: "b", nome: "Diagnóstico CPF" },
  ];

  it("casa por inclusão sem acento", () => {
    expect(preSelecionarProduto("limpa nome", produtos)).toBe("a");
    expect(preSelecionarProduto("Diagnostico CPF completo", produtos)).toBe("b");
  });

  it("ambíguo ou ausente devolve null", () => {
    expect(preSelecionarProduto(null, produtos)).toBeNull();
    expect(preSelecionarProduto("nada a ver", produtos)).toBeNull();
  });
});
