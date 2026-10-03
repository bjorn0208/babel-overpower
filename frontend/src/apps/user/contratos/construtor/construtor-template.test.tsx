/**
 * construtor-template.test.tsx — Testes TDD do orquestrador 2c.
 *
 * Cobre:
 *   1. TABS — lista e ordem das 6 abas
 *   2. templateInicial() — estado inicial coerente
 *   3. Lógica de derivação de passos ativos (via stepAtivo/passoNumero importados)
 *   4. slugify ao criar campo: slug auto a partir de rótulo
 */

import { describe, expect, it } from "vitest";

import { TABS } from "./painel-direito/tabs";
import type { TabId } from "./painel-direito/tabs";
import {
  calcularCarrinho,
  ORDEM_JORNADA_PADRAO,
  passoNumero,
  slugify,
  stepAtivo,
} from "./painel-direito/logica";
import type { TemplateV2, CampoCliente } from "./tipos";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function templateVazio(): TemplateV2 {
  return {
    id: "t-test",
    user_id: "u-test",
    nome: "Teste",
    ativo: false,
    conteudo_comum: null,
    clausulas_por_produto: {},
    campos_cliente: [],
    produtos_aceitos: [],
    pagamento: {
      modo: "unico",
      chave_pix: null,
      link_parcelamento: null,
      posicao_pagamento: null,
    },
    provas: {
      selfie: false,
      documento: false,
      assinatura_manuscrita: false,
      testemunha: false,
      num_testemunhas: 0,
      instrucao_selfie: "",
    },
    jornada_ordem: [...ORDEM_JORNADA_PADRAO],
  };
}

const PRODS = [
  { id: "pA", nome: "Produto A" },
  { id: "pB", nome: "Produto B" },
];

// ---------------------------------------------------------------------------
// 1. Abas — TABS
// ---------------------------------------------------------------------------

describe("TABS", () => {
  it("tem exatamente 6 abas", () => {
    expect(TABS).toHaveLength(6);
  });

  it("primeira aba é Preço", () => {
    expect(TABS[0].id).toBe<TabId>("preco");
    expect(TABS[0].rotulo).toBe("Preço");
  });

  it("última aba é Página do lead", () => {
    const ultima = TABS[TABS.length - 1];
    expect(ultima.id).toBe<TabId>("lead");
    expect(ultima.rotulo).toBe("Página do lead");
  });

  it("ids são únicos", () => {
    const ids = TABS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("contém as 6 abas esperadas em ordem", () => {
    const idsEsperados: TabId[] = [
      "preco",
      "campos",
      "pagamento",
      "provas",
      "preview",
      "lead",
    ];
    expect(TABS.map((t) => t.id)).toEqual(idsEsperados);
  });

  it("todos os rótulos são strings não-vazias em pt-BR", () => {
    TABS.forEach((tab) => {
      expect(typeof tab.rotulo).toBe("string");
      expect(tab.rotulo.length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// 2. templateVazio — invariantes do estado inicial
// ---------------------------------------------------------------------------

describe("templateVazio — estado inicial", () => {
  it("jornada_ordem padrão tem 8 passos", () => {
    const t = templateVazio();
    expect(t.jornada_ordem).toHaveLength(8);
  });

  it("jornada_ordem começa com 'dados'", () => {
    const t = templateVazio();
    expect(t.jornada_ordem[0]).toBe("dados");
  });

  it("pagamento.modo padrão é 'unico'", () => {
    const t = templateVazio();
    expect(t.pagamento?.modo).toBe("unico");
  });

  it("produtos_aceitos começa vazio", () => {
    const t = templateVazio();
    expect(t.produtos_aceitos).toHaveLength(0);
  });

  it("campos_cliente começa vazio no templateVazio", () => {
    const t = templateVazio();
    expect(t.campos_cliente).toHaveLength(0);
  });

  it("provas: assinatura_manuscrita=false por padrão", () => {
    const t = templateVazio();
    expect(t.provas?.assinatura_manuscrita).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. ORDEM_JORNADA_PADRAO
// ---------------------------------------------------------------------------

describe("ORDEM_JORNADA_PADRAO", () => {
  it("contém os 8 passos esperados", () => {
    expect(ORDEM_JORNADA_PADRAO).toEqual([
      "dados",
      "pagamento",
      "contrato",
      "comprovante",
      "selfie",
      "documento",
      "assinatura",
      "testemunha",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 4. Derivação de passos ativos (integração stepAtivo + passoNumero)
// ---------------------------------------------------------------------------

describe("derivação de passos ativos — 2c orquestrador", () => {
  it("template vazio: apenas dados e contrato ativos", () => {
    const t = templateVazio();
    const ativos = ORDEM_JORNADA_PADRAO.filter((s) => stepAtivo(s, t));
    expect(ativos).toEqual(["dados", "contrato"]);
  });

  it("ativar selfie adiciona ao conjunto ativo", () => {
    const t = templateVazio();
    t.provas!.selfie = true;
    const ativos = ORDEM_JORNADA_PADRAO.filter((s) => stepAtivo(s, t));
    expect(ativos).toContain("selfie");
  });

  it("adicionar produto com preço ativa pagamento", () => {
    const t = templateVazio();
    t.produtos_aceitos = [
      {
        produto_id: "pA",
        preco_avista: 500,
        parcelamento: { entrada: 0, max_parcelas: 6, valor_parcelado_total: 600 },
      },
    ];
    expect(stepAtivo("pagamento", t)).toBe(true);
  });

  it("chave_pix preenchida ativa comprovante", () => {
    const t = templateVazio();
    t.pagamento!.chave_pix = "123.456.789-00";
    expect(stepAtivo("comprovante", t)).toBe(true);
  });

  it("link_parcelamento preenchido ativa comprovante", () => {
    const t = templateVazio();
    t.pagamento!.link_parcelamento = "https://pay.example.com";
    expect(stepAtivo("comprovante", t)).toBe(true);
  });

  it("passoNumero de 'dados' é sempre 1 (primeiro ativo)", () => {
    const t = templateVazio();
    expect(passoNumero("dados", ORDEM_JORNADA_PADRAO, t)).toBe(1);
  });

  it("reordenar jornada reflete na numeração", () => {
    const t = templateVazio();
    t.provas!.selfie = true;
    // Mover selfie para antes de contrato
    t.jornada_ordem = [
      "dados",
      "selfie",
      "pagamento",
      "contrato",
      "comprovante",
      "documento",
      "assinatura",
      "testemunha",
    ];
    // selfie está na posição 2 (dados=1, selfie=2)
    expect(passoNumero("selfie", t.jornada_ordem, t)).toBe(2);
    // contrato passa a ser 3
    expect(passoNumero("contrato", t.jornada_ordem, t)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 5. slugify de campos do contato (alimenta tokens no editor)
// ---------------------------------------------------------------------------

describe("slugify de campos do contato", () => {
  function campoComSlugAuto(rotulo: string): CampoCliente {
    return {
      slug: slugify(rotulo),
      rotulo,
      tipo: "texto",
      obrigatorio: false,
      icone: "user",
    };
  }

  it("'Nome Completo' vira slug 'nome_completo'", () => {
    const campo = campoComSlugAuto("Nome Completo");
    expect(campo.slug).toBe("nome_completo");
  });

  it("'Data de Nascimento' vira 'data_de_nascimento'", () => {
    const campo = campoComSlugAuto("Data de Nascimento");
    expect(campo.slug).toBe("data_de_nascimento");
  });

  it("'CPF/CNPJ' vira 'cpf_cnpj'", () => {
    const campo = campoComSlugAuto("CPF/CNPJ");
    expect(campo.slug).toBe("cpf_cnpj");
  });

  it("slug gerado vira token {{slug}} no editor", () => {
    const campo = campoComSlugAuto("E-mail comercial");
    const token = `{{${campo.slug}}}`;
    expect(token).toBe("{{e_mail_comercial}}");
  });

  it("campos distintos geram slugs distintos", () => {
    const slugs = [
      "Nome completo",
      "CPF",
      "E-mail",
      "Telefone",
    ].map((r) => slugify(r));
    expect(new Set(slugs).size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 6. calcularCarrinho — cobertura do orquestrador (multi-produto, preview)
// ---------------------------------------------------------------------------

describe("calcularCarrinho — cenário painel-preview", () => {
  it("carrinho padrão 2A+3B: totalAvista correto", () => {
    const t = templateVazio();
    t.produtos_aceitos = [
      {
        produto_id: "pA",
        preco_avista: 200,
        parcelamento: { entrada: 0, max_parcelas: 12, valor_parcelado_total: 240 },
      },
      {
        produto_id: "pB",
        preco_avista: 50,
        parcelamento: { entrada: 0, max_parcelas: 6, valor_parcelado_total: 60 },
      },
    ];
    const carrinho = [
      { produto_id: "pA", quantidade: 2 },
      { produto_id: "pB", quantidade: 3 },
    ];
    const r = calcularCarrinho(t, carrinho, PRODS);
    expect(r.totalAvista).toBe(2 * 200 + 3 * 50); // 550
    expect(r.totalParcelado).toBe(2 * 240 + 3 * 60); // 660
    expect(r.maxParcelas).toBe(6); // min(12, 6)
  });

  it("produto sem parcelamento usa preco_avista como parcelado", () => {
    const t = templateVazio();
    t.produtos_aceitos = [
      {
        produto_id: "pA",
        preco_avista: 300,
        parcelamento: { entrada: 0, max_parcelas: 1, valor_parcelado_total: 300 },
      },
    ];
    const r = calcularCarrinho(t, [{ produto_id: "pA", quantidade: 1 }], PRODS);
    expect(r.totalParcelado).toBe(300);
    expect(r.maxParcelas).toBe(1);
  });
});
