/**
 * dados-template.ts — camada de acesso Supabase para o construtor v2.
 *
 * Funções puras de I/O: carregarTemplates, carregarProdutos,
 * salvarTemplate, criarTemplate, excluirTemplate, alternarAtivo.
 *
 * DECISÃO DE ARQUITETURA (DEC-037 — INVIOLÁVEL):
 *   salvarTemplate grava AS COLUNAS LEGADAS (fonte de verdade da RPC v1)
 *   + as colunas v2 (pro futuro). Detalhes no comentário de salvarTemplate.
 *
 * Zero imports de React. Testável com mock do supabase client.
 */

import { supabase } from "@/integrations/supabase/client";
import { docParaTexto, textoParaDoc } from "./editor/serializa";
import type { TemplateV2, CampoCliente, ProdutoAceito } from "./tipos";
import type { ProseMirrorDoc, ProseMirrorNode } from "./tipos";

// Alias para contornar tipagem genérica do supabase client sem `*` no select
// (padrão do projeto — ver tipos.ts SupabaseBruto)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

// ---------------------------------------------------------------------------
// Tipos do banco (colunas legadas + v2)
// ---------------------------------------------------------------------------

/** Colunas que carregarTemplates seleciona — sem `*` em tabela grande. */
const COLUNAS_SELECT =
  "id, user_id, produto_id, nome, ativo, " +
  // Legadas (RPC v1 lê estas)
  "conteudo, campos_obrigatorios, instrucao_selfie, num_testemunhas, " +
  "chave_pix, link_parcelamento, posicao_pagamento, opcoes_parcelamento, valor_a_vista, " +
  // v2 (inertes na Fase 2 — RPC v2 lê estas na Fase 3)
  "conteudo_comum, clausulas_por_produto, campos_cliente, pagamento, provas, " +
  "jornada_ordem, produtos_aceitos";

/** Row bruto que vem do banco (colunas legadas + v2). */
interface RowBruto {
  id: string;
  user_id: string;
  produto_id: string | null;
  nome: string;
  ativo: boolean;
  // legadas
  conteudo: string | null;
  campos_obrigatorios: string[] | null;
  instrucao_selfie: string | null;
  num_testemunhas: number;
  chave_pix: string | null;
  link_parcelamento: string | null;
  posicao_pagamento: string | null;
  opcoes_parcelamento: unknown;
  valor_a_vista: number | null;
  // v2
  conteudo_comum: unknown;
  clausulas_por_produto: unknown;
  campos_cliente: unknown;
  pagamento: unknown;
  provas: unknown;
  jornada_ordem: unknown;
  produtos_aceitos: unknown;
}

/** Row bruto de produto da tabela `produtos`. */
interface ProdutoBruto {
  id: string;
  nome: string;
}

// ---------------------------------------------------------------------------
// Mapeamento banco → TemplateV2
// ---------------------------------------------------------------------------

/**
 * Converte um row bruto do banco em TemplateV2.
 *
 * Prioridade: se colunas v2 estiverem populadas (backfill da Fase 1),
 * usa elas. Senão, deriva dos campos legados pra garantir funcionar
 * mesmo em rows sem backfill.
 */
/** Detecta doc TipTap gravado como string JSON (bug pré-fix 26/07). */
function ehDocJson(valor: string): boolean {
  return valor.trimStart().startsWith('{"type":"doc"');
}

/** Parseia doc TipTap serializado como JSON; null se inválido. */
function parsearDocJson(valor: string): ProseMirrorDoc | null {
  try {
    const doc = JSON.parse(valor) as ProseMirrorDoc;
    return doc?.type === "doc" ? doc : null;
  } catch {
    return null;
  }
}

function rowParaTemplate(row: RowBruto): TemplateV2 {
  // conteudo_comum (coluna TEXT): formato canônico é texto-com-tokens (DEC-037).
  // Rows antigas podem ter o doc TipTap gravado como JSON cru — detecta e converte.
  let conteudoComum: ProseMirrorDoc | null = null;
  if (typeof row.conteudo_comum === "string" && row.conteudo_comum.trim()) {
    conteudoComum = ehDocJson(row.conteudo_comum)
      ? parsearDocJson(row.conteudo_comum)
      : textoParaDoc(row.conteudo_comum);
  } else if (row.conteudo_comum && typeof row.conteudo_comum === "object") {
    // defensivo: ambiente onde a coluna venha como objeto já parseado
    conteudoComum = row.conteudo_comum as ProseMirrorDoc;
  }
  if (!conteudoComum && row.conteudo) {
    conteudoComum = textoParaDoc(row.conteudo);
  }

  // campos_cliente: prefere v2; senão deriva de campos_obrigatorios legado
  let camposCliente: CampoCliente[] = [];
  if (Array.isArray(row.campos_cliente) && row.campos_cliente.length > 0) {
    camposCliente = row.campos_cliente as CampoCliente[];
  } else {
    // Deriva dos campos_obrigatorios legados (slugs textuais)
    const slugs: string[] = Array.isArray(row.campos_obrigatorios) ? row.campos_obrigatorios : ["nome_completo"];
    camposCliente = slugs
      .filter((s) => typeof s === "string")
      .map((slug) => ({
        slug,
        rotulo: slug.replace(/_/g, " "),
        tipo: "texto" as const,
        obrigatorio: true,
        icone: "user" as const,
      }));
  }

  // produtos_aceitos: prefere v2
  const produtosAceitos: ProdutoAceito[] =
    Array.isArray(row.produtos_aceitos) ? (row.produtos_aceitos as ProdutoAceito[]) : [];

  // pagamento: prefere v2; senão deriva dos campos legados
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pagamentoV2: TemplateV2["pagamento"] =
    row.pagamento && typeof row.pagamento === "object"
      ? (row.pagamento as TemplateV2["pagamento"])
      : {
          modo: "unico" as const,
          chave_pix: row.chave_pix ?? null,
          link_parcelamento: row.link_parcelamento ?? null,
          posicao_pagamento: (row.posicao_pagamento as "before_sign" | "after_sign" | null) ?? "after_sign",
        };

  // provas: prefere v2; senão deriva dos campos legados
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provasV2: TemplateV2["provas"] =
    row.provas && typeof row.provas === "object"
      ? (row.provas as TemplateV2["provas"])
      : {
          selfie: false,
          documento: false,
          assinatura_manuscrita: true,
          testemunha: (row.num_testemunhas ?? 0) > 0,
          num_testemunhas: row.num_testemunhas ?? 0,
          instrucao_selfie: (row.instrucao_selfie ?? "") as "" | "mostrar_2_dedos" | "segurar_documento" | "documento_e_2_dedos",
        };

  // jornada_ordem: prefere v2
  const jornadaOrdem: TemplateV2["jornada_ordem"] =
    Array.isArray(row.jornada_ordem) && row.jornada_ordem.length > 0
      ? (row.jornada_ordem as TemplateV2["jornada_ordem"])
      : ["dados", "pagamento", "contrato", "comprovante", "selfie", "documento", "assinatura", "testemunha"];

  // clausulas_por_produto: canônico é texto-com-tokens por produto (a RPC injeta
  // com ->> direto no contrato); arrays de nodes são rows legadas pré-fix 26/07.
  const clausulasPorProduto: Record<string, ProseMirrorNode[]> = {};
  if (row.clausulas_por_produto && typeof row.clausulas_por_produto === "object") {
    for (const [produtoId, valor] of Object.entries(
      row.clausulas_por_produto as Record<string, unknown>,
    )) {
      if (typeof valor === "string" && valor.trim()) {
        clausulasPorProduto[produtoId] = textoParaDoc(valor).content;
      } else if (Array.isArray(valor)) {
        clausulasPorProduto[produtoId] = valor as ProseMirrorNode[];
      }
    }
  }

  return {
    id: row.id,
    user_id: row.user_id,
    nome: row.nome,
    ativo: row.ativo,
    conteudo_comum: conteudoComum,
    clausulas_por_produto: clausulasPorProduto,
    campos_cliente: camposCliente,
    produtos_aceitos: produtosAceitos,
    pagamento: pagamentoV2,
    provas: provasV2,
    jornada_ordem: jornadaOrdem,
  };
}

// ---------------------------------------------------------------------------
// montarPayloadSalvar — DECISÃO DE ARQUITETURA (DEC-037 INVIOLÁVEL)
// ---------------------------------------------------------------------------

/**
 * Monta o payload de UPDATE/INSERT que grava TANTO as colunas legadas
 * (lidas pela RPC v1 — fonte de verdade agora) QUANTO as v2 (pro futuro).
 *
 * Colunas legadas gravadas:
 *   conteudo            ← docParaTexto(conteudo_comum) — texto-com-tokens
 *   valor_a_vista       ← preco_avista do primeiro produto aceito
 *   opcoes_parcelamento ← parcelamento do primeiro produto (formato JSON legado)
 *   chave_pix             ← pagamento.chave_pix
 *   link_parcelamento    ← pagamento.link_parcelamento
 *   posicao_pagamento    ← pagamento.posicao_pagamento
 *   campos_obrigatorios     ← slugs dos campos_cliente + chaves de prova marcadas
 *   num_testemunhas     ← provas.num_testemunhas
 *   instrucao_selfie  ← provas.instrucao_selfie
 *   nome                ← template.nome
 *   ativo               ← template.ativo
 *   produto_id          ← primeiro produto aceito (compat com RPC v1 monoproduto)
 */
export function montarPayloadSalvar(template: TemplateV2): Record<string, unknown> {
  const { conteudo_comum, campos_cliente, produtos_aceitos, pagamento, provas } = template;

  // ── Coluna legada: conteudo ─────────────────────────────────────────────
  const conteudoLegado = conteudo_comum ? docParaTexto(conteudo_comum) : "";

  // ── Coluna legada: produto_id (produto de referência) ───────────────────
  // Era `produtos_aceitos[0]` cego. No template do Diego os dois primeiros itens
  // são "Novo produto" INATIVOS e sem preço, então o save gravava produto_id do
  // produto errado, `valor_a_vista = 0` e `opcoes_parcelamento` zerado — e o
  // trigger de derivação, ao ver a legada mudar, reconstruía `produtos_aceitos`
  // em cima disso. O dono digitava o preço e ele sumia.
  //
  // Agora a referência é o primeiro item que realmente tem preço configurado;
  // só cai no [0] se nenhum tiver.
  const primeiroProduto =
    produtos_aceitos.find((p) => !p.preco_pendente && (p.preco_avista ?? 0) > 0) ??
    produtos_aceitos.find((p) => (p.parcelamento?.valor_parcelado_total ?? 0) > 0) ??
    produtos_aceitos[0] ??
    null;
  const produtoId = primeiroProduto?.produto_id ?? null;

  // ── Coluna legada: valor_a_vista ────────────────────────────────────────
  const valorAvista = primeiroProduto?.preco_avista ?? null;

  // ── Coluna legada: opcoes_parcelamento ──────────────────────────────────
  // Formato legado esperado pela RPC:
  // [{ parcelas: N, valor_total: X, entrada: Y, valor_parcela: Z }]
  // valor_parcela derivado aqui — sem ele a RPC gera parcelamento sem valor
  // (incidente 11/06: auto-save do construtor apagou o curativo 5x147 do Diego).
  const opcoesParcelas = primeiroProduto?.parcelamento
    ? [
        {
          parcelas: primeiroProduto.parcelamento.max_parcelas,
          valor_total: primeiroProduto.parcelamento.valor_parcelado_total,
          entrada: primeiroProduto.parcelamento.entrada,
          valor_parcela: primeiroProduto.parcelamento.max_parcelas > 0
            ? Math.round(
                ((primeiroProduto.parcelamento.valor_parcelado_total -
                  primeiroProduto.parcelamento.entrada) /
                  primeiroProduto.parcelamento.max_parcelas) * 100,
              ) / 100
            : null,
        },
      ]
    : [];

  // ── Coluna legada: campos_obrigatorios ──────────────────────────────────────
  // Slugs dos campos do cliente + chaves de prova marcadas
  const slugsCampos = campos_cliente.map((c) => c.slug);
  const chavesProva: string[] = [];
  if (provas) {
    if (provas.selfie) chavesProva.push("selfie");
    if (provas.documento) chavesProva.push("documento");
    if (provas.assinatura_manuscrita) chavesProva.push("assinatura_manuscrita");
    if (provas.testemunha) chavesProva.push("testemunha");
  }
  const requiredFields = [...new Set([...slugsCampos, ...chavesProva])];

  return {
    // ── Colunas legadas (RPC v1 lê estas) ──────────────────────────────────
    nome:                template.nome,
    ativo:               template.ativo,
    produto_id:          produtoId,
    conteudo:            conteudoLegado,
    valor_a_vista:       valorAvista,
    opcoes_parcelamento: opcoesParcelas,
    chave_pix:             pagamento?.chave_pix ?? null,
    link_parcelamento:    pagamento?.link_parcelamento ?? null,
    posicao_pagamento:    pagamento?.posicao_pagamento ?? null,
    campos_obrigatorios:     requiredFields,
    num_testemunhas:     provas?.num_testemunhas ?? 0,
    instrucao_selfie:  provas?.instrucao_selfie ?? null,

    // ── Colunas v2 (RPC v2 lê na Fase 3; trigger tg_derivar_template_v2 também usa) ──
    // conteudo_comum é TEXT e as RPCs usam direto como texto do contrato —
    // gravar o doc TipTap cru aqui fazia o link público renderizar JSON (bug 26/07).
    conteudo_comum:        conteudoLegado || null,
    // Cláusulas gravadas como texto-com-tokens por produto (a RPC lê com ->> e
    // injeta direto no contrato — nodes crus viravam JSON no texto final; mesma
    // família do bug Diego/Renan 2026-06-11 com doc vazio).
    clausulas_por_produto: Object.fromEntries(
      Object.entries(template.clausulas_por_produto ?? {})
        .map(([produtoId, nodes]) => [
          produtoId,
          docParaTexto({ type: "doc", content: nodes ?? [] }),
        ])
        .filter(([, texto]) => (texto as string).trim() !== ""),
    ),
    campos_cliente:        campos_cliente,
    pagamento:             pagamento ?? null,
    provas:                provas ?? null,
    jornada_ordem:         template.jornada_ordem,
    produtos_aceitos:      produtos_aceitos,
  };
}

// ---------------------------------------------------------------------------
// carregarTemplates
// ---------------------------------------------------------------------------

/**
 * Carrega todos os templates do tenant (ordenados por created_at desc).
 * Retorna array vazio em caso de erro (sem throw — UI trata).
 */
export async function carregarTemplates(userId: string): Promise<TemplateV2[]> {
  const { data, error } = await (supabase as Sb)
    .from("contratos_template")
    .select(COLUNAS_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[dados-template] carregarTemplates:", error.message);
    return [];
  }

  return ((data ?? []) as RowBruto[]).map(rowParaTemplate);
}

// ---------------------------------------------------------------------------
// carregarProdutos
// ---------------------------------------------------------------------------

/**
 * Carrega os produtos ativos do tenant.
 * Retorna apenas id + nome (sem `*` em tabela grande).
 */
export async function carregarProdutos(
  userId: string
): Promise<Array<{ id: string; nome: string }>> {
  const { data, error } = await (supabase as Sb)
    .from("produtos")
    .select("id, nome")
    .eq("user_id", userId)
    .eq("ativo", true)
    .order("nome", { ascending: true });

  if (error) {
    console.error("[dados-template] carregarProdutos:", error.message);
    return [];
  }

  return (data ?? []) as ProdutoBruto[];
}

// ---------------------------------------------------------------------------
// salvarTemplate
// ---------------------------------------------------------------------------

/**
 * Salva (UPDATE) um template existente.
 * Grava legado + v2 conforme a DECISÃO DE ARQUITETURA (DEC-037).
 * Retorna true se OK, false se erro.
 */
export async function salvarTemplate(template: TemplateV2): Promise<boolean> {
  const payload = montarPayloadSalvar(template);

  const { error } = await (supabase as Sb)
    .from("contratos_template")
    .update(payload)
    .eq("id", template.id);

  if (error) {
    console.error("[dados-template] salvarTemplate:", error.message);
    return false;
  }

  // ── CONTORNO (2026-09-08) — remover quando a migration entrar ────────────
  //
  // O trigger `tg_derivar_template_v2` dispara sempre que uma coluna legada muda
  // (inclusive `conteudo`, ou seja: a cada tecla no editor de contrato) e chama
  // `derivar_template_v2`, que RECONSTRÓI `produtos_aceitos` do zero — com todos
  // os produtos ativos do tenant e `parcelamento` hardcoded
  // `{entrada: 0, max_parcelas: 12, total_parcelado: 0}`. Resultado: o dono
  // configura entrada de 117 + 5× de 147, digita qualquer coisa no texto, e os
  // preços voltam a R$ 0,00 com os produtos duplicados de volta.
  //
  // A correção de verdade é na função do banco (preservar curadoria em vez de
  // sobrescrever) e está escrita em
  // `supabase/migrations/20260908_derivar_template_v2_preserva_produtos_aceitos.sql`,
  // aguardando a senha nova do Postgres pra ser aplicada.
  //
  // Enquanto isso: um segundo UPDATE só com `produtos_aceitos`. Como ele não
  // toca em nenhuma coluna legada, o guard do trigger não dispara e o valor
  // sobrevive. É contorno, não conserto — a raiz continua lá.
  const { error: erroReaplicar } = await (supabase as Sb)
    .from("contratos_template")
    .update({ produtos_aceitos: template.produtos_aceitos })
    .eq("id", template.id);

  if (erroReaplicar) {
    console.error("[dados-template] reaplicar produtos_aceitos:", erroReaplicar.message);
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// criarTemplate
// ---------------------------------------------------------------------------

/**
 * Cria (INSERT) um novo template em branco.
 * Retorna o TemplateV2 criado (com id do banco) ou null se erro.
 */
export async function criarTemplate(userId: string, nome: string = "Novo template"): Promise<TemplateV2 | null> {
  const { data, error } = await (supabase as Sb)
    .from("contratos_template")
    .insert({
      user_id: userId,
      nome,
      conteudo: "",
      campos_obrigatorios: ["nome_completo"],
      num_testemunhas: 0,
      ativo: false,
      // v2 defaults — trigger vai derivar o restante
      conteudo_comum: null,
      clausulas_por_produto: {},
      campos_cliente: [
        { slug: "nome_completo", rotulo: "Nome completo", tipo: "texto", obrigatorio: true, icone: "user" },
        { slug: "cpf", rotulo: "CPF", tipo: "cpf", obrigatorio: true, icone: "id" },
      ],
      pagamento: { modo: "unico", chave_pix: null, link_parcelamento: null, posicao_pagamento: "after_sign" },
      provas: { selfie: true, documento: true, assinatura_manuscrita: true, testemunha: false, num_testemunhas: 0, instrucao_selfie: "" },
      jornada_ordem: ["dados", "pagamento", "contrato", "comprovante", "selfie", "documento", "assinatura"],
      produtos_aceitos: [],
    })
    .select(COLUNAS_SELECT)
    .single();

  if (error || !data) {
    console.error("[dados-template] criarTemplate:", error?.message);
    return null;
  }

  return rowParaTemplate(data as RowBruto);
}

// ---------------------------------------------------------------------------
// excluirTemplate
// ---------------------------------------------------------------------------

/**
 * Exclui (DELETE) um template.
 * Retorna true se OK.
 */
export async function excluirTemplate(templateId: string): Promise<boolean> {
  const { error } = await (supabase as Sb)
    .from("contratos_template")
    .delete()
    .eq("id", templateId);

  if (error) {
    console.error("[dados-template] excluirTemplate:", error.message);
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// alternarAtivo
// ---------------------------------------------------------------------------

/**
 * Alterna o campo `ativo` de um template.
 * Retorna true se OK.
 */
export async function alternarAtivo(templateId: string, novoAtivo: boolean): Promise<boolean> {
  const { error } = await (supabase as Sb)
    .from("contratos_template")
    .update({ ativo: novoAtivo })
    .eq("id", templateId);

  if (error) {
    console.error("[dados-template] alternarAtivo:", error.message);
    return false;
  }

  return true;
}
