/**
 * TDD — dados-template.ts
 *
 * Foca em montarPayloadSalvar: valida que o payload legado + v2 é montado
 * corretamente conforme a DECISÃO DE ARQUITETURA (DEC-037).
 *
 * Funções de I/O (carregarTemplates, salvarTemplate, etc.) não são testadas
 * aqui porque dependem do supabase client (integração); o payload é a parte
 * crítica de validar.
 */

import { describe, it, expect } from "vitest";
import { montarPayloadSalvar } from "./dados-template";
import { textoParaDoc, docParaTexto } from "./editor/serializa";
import type { TemplateV2 } from "./tipos";

// ---------------------------------------------------------------------------
// Fixture base
// ---------------------------------------------------------------------------

const templateCompleto: TemplateV2 = {
  id: "tpl-001",
  user_id: "uid-001",
  nome: "Contrato Mentoria",
  ativo: true,
  conteudo_comum: textoParaDoc(
    "Eu, {{nome_completo}}, CPF {{cpf}}, contrato os serviços abaixo.\n\n" +
    "{ITENS_CONTRATADOS}\n\n" +
    "{COND_PAGAMENTO}\n\n" +
    "{ASSINATURAS}"
  ),
  clausulas_por_produto: {
    "prod-a": [{ type: "paragraph", content: [{ type: "text", text: "Cláusula de mentoria." }] }],
  },
  campos_cliente: [
    { slug: "nome_completo", rotulo: "Nome completo", tipo: "texto", obrigatorio: true, icone: "user" },
    { slug: "cpf", rotulo: "CPF", tipo: "cpf", obrigatorio: true, icone: "id" },
    { slug: "email", rotulo: "E-mail", tipo: "email", obrigatorio: false, icone: "mail" },
  ],
  produtos_aceitos: [
    {
      produto_id: "prod-a",
      preco_avista: 1500,
      parcelamento: { entrada: 0, max_parcelas: 12, valor_parcelado_total: 1800 },
    },
    {
      produto_id: "prod-b",
      preco_avista: 800,
      parcelamento: { entrada: 100, max_parcelas: 6, valor_parcelado_total: 950 },
    },
  ],
  pagamento: {
    modo: "unico",
    chave_pix: "contato@empresa.com",
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

// ---------------------------------------------------------------------------
// Colunas legadas — existência e tipos
// ---------------------------------------------------------------------------

describe("montarPayloadSalvar — colunas legadas presentes", () => {
  it("inclui 'nome' corretamente", () => {
    const payload = montarPayloadSalvar(templateCompleto);
    expect(payload.nome).toBe("Contrato Mentoria");
  });

  it("inclui 'ativo' corretamente", () => {
    const payload = montarPayloadSalvar(templateCompleto);
    expect(payload.ativo).toBe(true);
  });

  it("inclui 'conteudo' como texto-com-tokens serializado", () => {
    const payload = montarPayloadSalvar(templateCompleto);
    expect(typeof payload.conteudo).toBe("string");
    const conteudo = payload.conteudo as string;
    expect(conteudo).toContain("{{nome_completo}}");
    expect(conteudo).toContain("{{cpf}}");
    expect(conteudo).toContain("{ITENS_CONTRATADOS}");
    expect(conteudo).toContain("{COND_PAGAMENTO}");
    expect(conteudo).toContain("{ASSINATURAS}");
  });

  it("produto_id aponta pro primeiro produto aceito", () => {
    const payload = montarPayloadSalvar(templateCompleto);
    expect(payload.produto_id).toBe("prod-a");
  });

  it("valor_a_vista é o preco_avista do primeiro produto", () => {
    const payload = montarPayloadSalvar(templateCompleto);
    expect(payload.valor_a_vista).toBe(1500);
  });

  it("opcoes_parcelamento tem estrutura esperada (parcelas/valor_total/entrada)", () => {
    const payload = montarPayloadSalvar(templateCompleto);
    expect(Array.isArray(payload.opcoes_parcelamento)).toBe(true);
    const opts = payload.opcoes_parcelamento as Array<Record<string, unknown>>;
    expect(opts).toHaveLength(1);
    expect(opts[0]).toMatchObject({
      parcelas: 12,
      valor_total: 1800,
      entrada: 0,
    });
  });

  it("chave_pix vem do pagamento.chave_pix", () => {
    const payload = montarPayloadSalvar(templateCompleto);
    expect(payload.chave_pix).toBe("contato@empresa.com");
  });

  it("link_parcelamento vem do pagamento.link_parcelamento", () => {
    const payload = montarPayloadSalvar(templateCompleto);
    expect(payload.link_parcelamento).toBe("https://pag.exemplo.com/link");
  });

  it("posicao_pagamento vem do pagamento.posicao_pagamento", () => {
    const payload = montarPayloadSalvar(templateCompleto);
    expect(payload.posicao_pagamento).toBe("after_sign");
  });

  it("campos_obrigatorios contém slugs dos campos_cliente", () => {
    const payload = montarPayloadSalvar(templateCompleto);
    const rf = payload.campos_obrigatorios as string[];
    expect(rf).toContain("nome_completo");
    expect(rf).toContain("cpf");
    expect(rf).toContain("email");
  });

  it("campos_obrigatorios inclui chaves de prova marcadas", () => {
    const payload = montarPayloadSalvar(templateCompleto);
    const rf = payload.campos_obrigatorios as string[];
    expect(rf).toContain("selfie");
    expect(rf).toContain("documento");
    expect(rf).toContain("assinatura_manuscrita");
    expect(rf).toContain("testemunha");
  });

  it("campos_obrigatorios sem duplicatas", () => {
    // nome_completo pode aparecer como campo E como slug — não deve duplicar
    const payload = montarPayloadSalvar(templateCompleto);
    const rf = payload.campos_obrigatorios as string[];
    const uniq = [...new Set(rf)];
    expect(rf).toHaveLength(uniq.length);
  });

  it("num_testemunhas vem de provas.num_testemunhas", () => {
    const payload = montarPayloadSalvar(templateCompleto);
    expect(payload.num_testemunhas).toBe(2);
  });

  it("instrucao_selfie vem de provas.instrucao_selfie", () => {
    const payload = montarPayloadSalvar(templateCompleto);
    expect(payload.instrucao_selfie).toBe("mostrar_2_dedos");
  });
});

// ---------------------------------------------------------------------------
// Colunas v2 — existência
// ---------------------------------------------------------------------------

describe("montarPayloadSalvar — colunas v2 presentes", () => {
  it("inclui 'conteudo_comum' como texto-com-tokens (nunca doc JSON — bug 26/07)", () => {
    const payload = montarPayloadSalvar(templateCompleto);
    expect(payload.conteudo_comum).not.toBeNull();
    expect(typeof payload.conteudo_comum).toBe("string");
    expect(payload.conteudo_comum as string).not.toContain('{"type":"doc"');
    // espelho exato da coluna legada `conteudo`
    expect(payload.conteudo_comum).toBe(payload.conteudo);
  });

  it("inclui 'clausulas_por_produto' como texto por produto (a RPC injeta com ->>)", () => {
    const payload = montarPayloadSalvar(templateCompleto);
    expect(payload.clausulas_por_produto).toMatchObject({
      "prod-a": expect.any(String),
    });
  });

  it("inclui 'campos_cliente' com todos os campos", () => {
    const payload = montarPayloadSalvar(templateCompleto);
    const campos = payload.campos_cliente as Array<{ slug: string }>;
    expect(campos.map((c) => c.slug)).toContain("nome_completo");
    expect(campos.map((c) => c.slug)).toContain("cpf");
    expect(campos.map((c) => c.slug)).toContain("email");
  });

  it("inclui 'pagamento' como objeto", () => {
    const payload = montarPayloadSalvar(templateCompleto);
    expect(payload.pagamento).toMatchObject({ modo: "unico", chave_pix: "contato@empresa.com" });
  });

  it("inclui 'provas' como objeto", () => {
    const payload = montarPayloadSalvar(templateCompleto);
    expect(payload.provas).toMatchObject({ selfie: true, num_testemunhas: 2 });
  });

  it("inclui 'jornada_ordem' como array", () => {
    const payload = montarPayloadSalvar(templateCompleto);
    expect(Array.isArray(payload.jornada_ordem)).toBe(true);
    const ordem = payload.jornada_ordem as string[];
    expect(ordem).toContain("dados");
    expect(ordem).toContain("contrato");
  });

  it("inclui 'produtos_aceitos' com os dois produtos", () => {
    const payload = montarPayloadSalvar(templateCompleto);
    const prods = payload.produtos_aceitos as Array<{ produto_id: string }>;
    expect(prods).toHaveLength(2);
    expect(prods[0].produto_id).toBe("prod-a");
    expect(prods[1].produto_id).toBe("prod-b");
  });
});

// ---------------------------------------------------------------------------
// Casos de borda
// ---------------------------------------------------------------------------

describe("montarPayloadSalvar — casos de borda", () => {
  it("template sem produtos_aceitos: produto_id null, valor_a_vista null", () => {
    const tpl: TemplateV2 = { ...templateCompleto, produtos_aceitos: [] };
    const payload = montarPayloadSalvar(tpl);
    expect(payload.produto_id).toBeNull();
    expect(payload.valor_a_vista).toBeNull();
    expect(Array.isArray(payload.opcoes_parcelamento)).toBe(true);
    expect((payload.opcoes_parcelamento as unknown[]).length).toBe(0);
  });

  it("template sem conteudo_comum: conteudo legado é string vazia", () => {
    const tpl: TemplateV2 = { ...templateCompleto, conteudo_comum: null };
    const payload = montarPayloadSalvar(tpl);
    expect(payload.conteudo).toBe("");
    expect(payload.conteudo_comum).toBeNull();
  });

  it("template sem pagamento: chave_pix null, link_parcelamento null", () => {
    const tpl: TemplateV2 = { ...templateCompleto, pagamento: null };
    const payload = montarPayloadSalvar(tpl);
    expect(payload.chave_pix).toBeNull();
    expect(payload.link_parcelamento).toBeNull();
    expect(payload.posicao_pagamento).toBeNull();
  });

  it("template sem provas: num_testemunhas 0, instrucao_selfie null, chaves não incluídas", () => {
    const tpl: TemplateV2 = { ...templateCompleto, provas: null };
    const payload = montarPayloadSalvar(tpl);
    expect(payload.num_testemunhas).toBe(0);
    expect(payload.instrucao_selfie).toBeNull();
    const rf = payload.campos_obrigatorios as string[];
    expect(rf).not.toContain("selfie");
    expect(rf).not.toContain("testemunha");
  });

  it("conteudo serializado é round-trip consistente", () => {
    const textoOriginal =
      "Cláusulas gerais.\n\n{ITENS_CONTRATADOS}\n\n{COND_PAGAMENTO}\n\nForo: {{cidade}}.\n\n{ASSINATURAS}";
    const tpl: TemplateV2 = {
      ...templateCompleto,
      conteudo_comum: textoParaDoc(textoOriginal),
    };
    const payload = montarPayloadSalvar(tpl);
    const conteudoRecuperado = payload.conteudo as string;

    // Os tokens principais devem sobreviver ao round-trip
    expect(conteudoRecuperado).toContain("{ITENS_CONTRATADOS}");
    expect(conteudoRecuperado).toContain("{COND_PAGAMENTO}");
    expect(conteudoRecuperado).toContain("{ASSINATURAS}");
    expect(conteudoRecuperado).toContain("{{cidade}}");

    // Verificação de round-trip via serializa
    const docReconstituido = textoParaDoc(conteudoRecuperado);
    const textoReconstituido = docParaTexto(docReconstituido);

    // Tokens devem se manter depois de dois round-trips
    expect(textoReconstituido).toContain("{ITENS_CONTRATADOS}");
    expect(textoReconstituido).toContain("{COND_PAGAMENTO}");
  });

  it("provas com todos os toggles false: nenhuma chave de prova em campos_obrigatorios", () => {
    const tpl: TemplateV2 = {
      ...templateCompleto,
      provas: {
        selfie: false,
        documento: false,
        assinatura_manuscrita: false,
        testemunha: false,
        num_testemunhas: 0,
        instrucao_selfie: "",
      },
    };
    const payload = montarPayloadSalvar(tpl);
    const rf = payload.campos_obrigatorios as string[];
    expect(rf).not.toContain("selfie");
    expect(rf).not.toContain("documento");
    expect(rf).not.toContain("assinatura_manuscrita");
    expect(rf).not.toContain("testemunha");
  });

  it("campos_cliente vazio: campos_obrigatorios é apenas chaves de prova", () => {
    const tpl: TemplateV2 = {
      ...templateCompleto,
      campos_cliente: [],
      provas: { ...templateCompleto.provas!, selfie: true, documento: false, assinatura_manuscrita: false, testemunha: false },
    };
    const payload = montarPayloadSalvar(tpl);
    const rf = payload.campos_obrigatorios as string[];
    expect(rf).toContain("selfie");
    expect(rf).not.toContain("documento");
  });
});
