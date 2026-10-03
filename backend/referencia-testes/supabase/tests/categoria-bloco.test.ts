import { strict as assert } from "node:assert";
import {
  categoriaEfetiva,
  ehBlocoComercial,
  inferirCategoria,
  normalizarCategoria,
  temValorMonetario,
} from "../functions/_shared/categoria-bloco.ts";

// Todos os textos abaixo saíram da base de produção (2026-09-08), com nome de lead trocado.
// O que se prova aqui é o buraco que a catraca comercial tinha: bloco sem etiqueta passava direto.

// ── 1. Valor em dinheiro, escrito de todo jeito que a base tem ──────────────────
assert.equal(temValorMonetario("a TCP está R$ 117,00"), true);
assert.equal(temValorMonetario("117,00, referente a TCP"), true, "valor sem R$ também é valor");
assert.equal(temValorMonetario("O serviço custa 597 reais"), true);
assert.equal(temValorMonetario("2x de R$ 317,00"), true);
assert.equal(temValorMonetario("5 parcelas de 147"), true);
assert.equal(temValorMonetario("O preço é 1 bilhão de reais"), true);

// Número que não é dinheiro não pode acionar a trava.
assert.equal(temValorMonetario("Segue chave do CNPJ: 61.461.556/0001-70"), false);
assert.equal(temValorMonetario("Rua Melvin Jones, 143 — CEP: 06.010-020"), false);
assert.equal(temValorMonetario("Ligue (11) 98888-7777"), false);
assert.equal(temValorMonetario("Spc, Serasa, Boa Vista e Cenprot"), false);

// ── 2. Inferência de categoria pelo texto ───────────────────────────────────────
assert.equal(inferirCategoria("Tabela de preços", "Limpa Nome custa R$ 597 à vista"), "preco");
assert.equal(inferirCategoria("Parcelamento", "TCP no ato e 5 parcelas de R$ 147 depois"), "parcelamento");
assert.equal(inferirCategoria("Pagamento", "Pode ser via Pix ou boleto"), "pagamento");
assert.equal(inferirCategoria("Prazo do processo", "de 45 a 60 dias úteis"), "prazo");
assert.equal(inferirCategoria("Garantia contratual", "se o apontamento voltar, resolvemos sem custo"), "garantia");
assert.equal(inferirCategoria(null, null), null);

// O título pesa mais que o corpo: bloco de garantia que lista "forma de pagamento" entre as
// cláusulas do contrato continua sendo de garantia (caso real da base).
assert.equal(
  inferirCategoria(
    "Garantia contratual de 1 ano — como funciona",
    "O contrato digital contém: dados do cliente, serviços a executar, forma de pagamento e foro.",
  ),
  "garantia",
);

// "Boa Vista" é birô de crédito, não "à vista" — este era um falso positivo real.
assert.notEqual(
  inferirCategoria("Quais birôs são contemplados", "Spc, Serasa, Boa Vista e Cenprot."),
  "preco",
);

// ── 3. Normalização do vocabulário que a base acumulou ──────────────────────────
assert.equal(normalizarCategoria("preco"), "preco");
assert.equal(normalizarCategoria("objecao"), "objecao_lead", "sinônimo vira canônico");
assert.equal(normalizarCategoria("Preço"), "preco");
assert.equal(normalizarCategoria("Formulário de implementação"), null, "etiqueta livre não é canônica");
assert.equal(normalizarCategoria(null), null);

// ── 4. A catraca: o que ela precisa barrar quando o turno não é comercial ───────
// O caso que motivou tudo: bloco sem etiqueta com valor no corpo.
assert.equal(
  ehBlocoComercial({
    category: null,
    title: "A lead pergunta o valor exato do diagnóstico",
    content: "Para o limpa nome paga-se a TCP que está R$ 117,00. Depois 5 boletos de R$ 147,00.",
  }),
  true,
);

// Sem número, mas com sinal comercial claro — "custo", "orçamento", "preço".
assert.equal(
  ehBlocoComercial({ category: null, title: "Serviços Bacen — tipos e custo", content: "Bacen tem custo bem mais elevado." }),
  true,
);

// Título puxa pra `empresa` (CNPJ), corpo diz "mesmo preço": não pode escapar.
assert.equal(
  ehBlocoComercial({
    category: null,
    title: "ESSE VALOR É PARA O CPF QUANTO O CNPJ",
    content: "Para limpar o CPF e CNPJ é o mesmo preço, porém precisa contratar 2 serviços.",
  }),
  true,
);

// Etiqueta canônica não-comercial manda: bloco de prazo não é barrado pela catraca comercial.
assert.equal(
  ehBlocoComercial({ category: "prazo", title: "Prazo do processo", content: "de 45 a 60 dias úteis" }),
  false,
);

// Conhecimento neutro segue passando — a trava não pode secar o contexto do agente.
assert.equal(
  ehBlocoComercial({
    category: null,
    title: "Quais birôs de crédito são contemplados",
    content: "Spc, Serasa, Boa Vista e Cenprot.",
  }),
  false,
);
assert.equal(
  ehBlocoComercial({
    category: null,
    title: "Profissão do lead não influencia",
    content: "O processo é jurídico e envolve apenas os órgãos de proteção ao crédito.",
  }),
  false,
);

// ── 5. Categoria efetiva: etiqueta declarada vence a inferência ─────────────────
assert.equal(categoriaEfetiva({ category: "faq", title: "x", content: "custa R$ 10,00" }), "faq");
assert.equal(categoriaEfetiva({ category: null, title: "Tabela", content: "R$ 597,00 à vista" }), "preco");
assert.equal(categoriaEfetiva({ category: "Formulário de implementação", title: "x", content: "y" }), null);

console.log("categoria-bloco: todos os casos passaram");
