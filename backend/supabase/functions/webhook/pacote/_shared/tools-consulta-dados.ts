/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

/**
 * Tool universal de leitura do canal interno — `consultar_dados`.
 *
 * O "ChatGPT da empresa": a LLM escreve um SELECT sobre os dados da conta
 * (leads, clientes, financeiro, agenda, contratos, campanhas...) e o banco
 * executa com a identidade do dono — a RLS garante que ele só enxerga o que
 * é dele. Allowlist de tabelas + só-leitura validadas na RPC (server-side).
 *
 * Duas ações:
 *   - `esquema`: devolve o mapa tabela → colunas das tabelas permitidas
 *     (RPC `esquema_consulta_dados`). A LLM chama antes de montar SQL.
 *   - `consultar`: executa o SELECT (RPC `consultar_dados_leitura`, que roda
 *     como role dedicado sem privilégio de dono → RLS vale de verdade).
 *
 * Ambas as RPCs são `service_role` only — o cliente nunca chama direto.
 * Compartilhado por `tools-mentor.ts` (cargo Mentor) e `tools-admin.ts`
 * (cargo Admin): mesmo schema, mesmo executor.
 */

// deno-lint-ignore no-explicit-any
type AnyClient = any;

export interface CtxConsultaDados {
  user_id: string;
  supabase_admin: AnyClient;
  /** Conversa do canal interno — o gate de 2 turnos da exclusão precisa dela. */
  conversa_id?: string | null;
}

export const SCHEMA_CONSULTAR_DADOS = {
  type: "function" as const,
  function: {
    name: "consultar_dados",
    description:
      "Consulta QUALQUER dado da conta (leads, clientes, conversas, financeiro, agenda, contratos, produtos, " +
      "campanhas, consultas) via SQL SELECT no Postgres. Perguntas de números/listas/histórico/crescimento — " +
      "ex.: 'quantos clientes fechei esse mês?', 'quanto cresci nos últimos 6 meses?'. " +
      "Fluxo: 1) sem saber tabelas/colunas, chame acao='esquema' primeiro; 2) monte UM SELECT (JOIN/GROUP BY/" +
      "count/sum/avg/date_trunc liberados) e chame acao='consultar'. " +
      "Regras: só SELECT; nunca invente tabela/coluna (esquema primeiro se em dúvida); agregue no SQL em vez " +
      "de listar demais. " +
      "DIA EM BRT — UMA CONVERSÃO SÓ: use `(coluna AT TIME ZONE \'America/Sao_Paulo\')::date`. " +
      "NUNCA `AT TIME ZONE \'UTC\' AT TIME ZONE \'America/Sao_Paulo\'`: a coluna já é timestamptz, " +
      "então a primeira conversão a torna ingênua e a segunda SOMA 3h em vez de subtrair — o dia " +
      "passa a começar às 21h do dia anterior e venda da noite anterior entra como se fosse de hoje. " +
      "UM POR LINHA: em JOIN de um-para-muitos (lead com 2 contratos, cliente com 3 pagamentos) a " +
      "venda aparece duplicada e a soma dobra. Agregue (GROUP BY o lado \'um\', ou EXISTS em vez de " +
      "JOIN) quando a pergunta é sobre o lado \'um\'. " +
      "VENDA ≠ RECEBIMENTO: 'vendi/faturei' = leads.desfecho='convertido' (desfecho_em, valor_conversao); " +
      "'recebi/caixa' = pagamentos_cliente.status='pago' (data_pagamento) — pendente não é venda perdida. " +
      "Cliente convertido = leads.fase_cliente preenchida. Analise os números na resposta (variação %, " +
      "tendência, melhor mês). " +
      "CADA CONDIÇÃO QUE O DONO PEDIU VIRA FILTRO NO WHERE. Pediu 'com contrato e comprovante'? " +
      "`is not null` nos dois. Pediu 'validado/confirmado'? filtra o status — status pendente " +
      "(ex.: 'aguardando_validacao') NÃO é venda. Pediu 'vendas'? `desfecho='convertido'`. " +
      "Não filtrar é entregar número errado com cara de certo. " +
      "DATA DE UMA COISA É A DATA DAQUELA COISA: ao juntar tabelas, NUNCA use OR entre colunas de " +
      "data de tabelas diferentes. 'Venda do dia X' filtra a data da VENDA; contrato criado noutro " +
      "dia não entra só porque o lead fechou no dia X — OR aqui mistura os dias e traz linha que não " +
      "é do período pedido. " +
      "ZERO LINHA É RESPOSTA VÁLIDA: se o filtro correto não retorna nada, responda 'nenhum registro " +
      "atende' e mostre o filtro usado. Nunca afrouxe a condição pra fazer aparecer alguma coisa. " +
      "Ao responder, diga em uma linha quais filtros aplicou (período, status, campos exigidos).",
    parameters: {
      type: "object" as const,
      properties: {
        acao: {
          type: "string",
          enum: ["esquema", "consultar"],
          description:
            "'esquema' devolve tabelas e colunas disponíveis; 'consultar' executa o SELECT.",
        },
        sql: {
          type: "string",
          description:
            "O SELECT a executar (obrigatório quando acao='consultar'). Um único comando, sem ponto-e-vírgula.",
        },
        limite: {
          type: "number",
          description: "Máximo de linhas retornadas (padrão 100, máx 500).",
        },
      },
      required: ["acao"],
    },
  },
};

export const SCHEMA_ATUALIZAR_DADOS = {
  type: "function" as const,
  function: {
    name: "atualizar_dados",
    description:
      "Altera/cria dados da conta (produtos, preços, prazos, empresa, financeiro, agenda, leads) com UM " +
      "UPDATE ou INSERT. FLUXO: 1) ache o registro com consultar_dados (pegue o id); 2) MOSTRE ao usuário o " +
      "antes→depois e SÓ EXECUTE após confirmação na conversa; 3) UM comando por alteração, filtrando por id. " +
      "Regras: UPDATE exige WHERE; não existe DELETE (apagar = UPDATE de deleted_at/ativo); sem RETURNING; " +
      "acima de 50 linhas nada muda — refine o WHERE ou repita com confirmar_em_massa=true (só após confirmação " +
      "EXPLÍCITA). Preço em centavos (preco_centavos: R$ 297 = 29700). Use só colunas vistas no esquema/consulta " +
      "— erro de nome devolve as colunas reais pra corrigir. Produto com preço/prazo alterado: atualize TAMBÉM " +
      "o texto em produto_conhecimento e blocos_conhecimento (nesta, acrescente embedding_status='pendente' no " +
      "mesmo UPDATE pra reindexar), senão o agente fala o valor velho pro lead.",
    parameters: {
      type: "object" as const,
      properties: {
        sql: {
          type: "string",
          description: "O comando UPDATE ou INSERT (um único, sem ponto-e-vírgula, sem RETURNING).",
        },
        confirmar_em_massa: {
          type: "boolean",
          description: "true SÓ quando o usuário confirmou explicitamente alteração acima de 50 linhas.",
        },
      },
      required: ["sql"],
    },
  },
};

export const SCHEMA_EXCLUIR_DADOS = {
  type: "function" as const,
  function: {
    name: "excluir_dados",
    description:
      "Exclui DE VERDADE registros (some do banco e do conhecimento do agente). SEMPRE 2 turnos, servidor " +
      "cobra: 1) acao='preparar' com o DELETE — recebe bilhete, contagem e amostra; MOSTRE ao usuário e " +
      "PERGUNTE se confirma; 2) só após ELE confirmar, chame acao='confirmar' com o mesmo bilhete (confirmar " +
      "no mesmo turno é recusado). DELETE exige WHERE, teto 200 registros; nem toda tabela aceita exclusão " +
      "(as demais desativam via atualizar_dados). Excluídos vão pra lixeira de 30 dias. Use quando o usuário " +
      "quiser REMOVER de verdade — produto descontinuado, conhecimento errado, compromisso cancelado.",
    parameters: {
      type: "object" as const,
      properties: {
        acao: {
          type: "string",
          enum: ["preparar", "confirmar"],
          description: "'preparar' mostra o que será apagado; 'confirmar' executa após o usuário aprovar.",
        },
        sql: {
          type: "string",
          description: "O DELETE FROM ... WHERE ... (obrigatório quando acao='preparar').",
        },
        bilhete: {
          type: "string",
          description: "O bilhete devolvido no preparar (obrigatório quando acao='confirmar').",
        },
      },
      required: ["acao"],
    },
  },
};

export async function handlerExcluirDados(
  args: Record<string, unknown>,
  ctx: CtxConsultaDados,
): Promise<string> {
  if (!ctx.conversa_id) {
    return "✗ Exclusão indisponível neste canal (sem conversa associada).";
  }
  const acao = String(args.acao ?? "preparar");

  if (acao === "preparar") {
    const sql = String(args.sql ?? "").trim();
    if (!sql) return "✗ Informe o campo sql com o DELETE FROM ... WHERE ...";
    const { data, error } = await ctx.supabase_admin.rpc("preparar_exclusao_dados", {
      p_owner: ctx.user_id,
      p_conversa: ctx.conversa_id,
      p_sql: sql,
    });
    if (error) return `✗ Erro ao preparar exclusão: ${error.message}`;
    if (!data?.ok) return `✗ ${String(data?.erro ?? "preparação recusada")}`;
    // JSON com `dados.tipo` → o commandbar renderiza o card com os botões
    // Confirmar/Cancelar (Gen UI). O clique manda a fala de confirmação,
    // que é o que o gate de 2 turnos do banco exige.
    return JSON.stringify({
      ok: true,
      dados: {
        tipo: "confirmar_exclusao",
        bilhete: data.bilhete,
        tabela: data.tabela,
        linhas_previstas: data.linhas_previstas,
        amostra: data.amostra ?? [],
      },
      mensagem:
        `Exclusão preparada (nada foi apagado ainda): ${data.linhas_previstas} registro(s) de '${data.tabela}'. ` +
        "Diga em 1 frase o que será apagado e avise que ele pode confirmar ou cancelar no card. " +
        "NÃO chame confirmar neste turno.",
    });
  }

  const bilhete = String(args.bilhete ?? "").trim();
  if (!bilhete) return "✗ Informe o bilhete recebido no preparar.";
  const { data, error } = await ctx.supabase_admin.rpc("confirmar_exclusao_dados", {
    p_owner: ctx.user_id,
    p_conversa: ctx.conversa_id,
    p_bilhete: bilhete,
  });
  if (error) return `✗ Erro ao excluir: ${error.message}`;
  if (!data?.ok) return `✗ ${String(data?.erro ?? "exclusão recusada")}`;
  return `Excluído de '${data.tabela}': ${data.linhas_excluidas} registro(s). Some do sistema e do conhecimento do agente (guardado em lixeira interna por 30 dias). Confirme ao usuário em linguagem natural.`;
}

export async function handlerAtualizarDados(
  args: Record<string, unknown>,
  ctx: CtxConsultaDados,
): Promise<string> {
  const sql = String(args.sql ?? "").trim();
  if (!sql) return "✗ Informe o campo sql com o UPDATE ou INSERT.";
  // Mesma trava da leitura: filtro de data torto aqui ALTERA a linha errada.
  const recusa = recusaPorFusoDuplo(sql);
  if (recusa) return recusa;

  const { data, error } = await ctx.supabase_admin.rpc("atualizar_dados_escrita", {
    p_owner: ctx.user_id,
    p_sql: sql,
    p_confirmar_em_massa: args.confirmar_em_massa === true,
  });
  if (error) return `✗ Erro na alteração: ${error.message}`;
  if (!data?.ok) {
    const motivo = String(data?.erro ?? "alteração recusada");
    // Erro que ensina: nome de coluna errado devolve as colunas reais da tabela
    // pra LLM refazer o comando no mesmo turno (em vez de desistir).
    if (/column .* does not exist|não existe a coluna/i.test(motivo)) {
      const alvo = (sql.match(/^\s*update\s+(?:only\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/i)
        ?? sql.match(/^\s*insert\s+into\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?/i))?.[1];
      if (alvo) {
        const { data: colunas } = await ctx.supabase_admin.rpc("colunas_da_tabela", { p_tabela: alvo });
        if (Array.isArray(colunas) && colunas.length > 0) {
          return `✗ ${motivo}\nColunas reais de '${alvo}': ${JSON.stringify(colunas)}\nRefaça o comando usando só essas colunas.`;
        }
      }
    }
    return `✗ ${motivo} — corrija e tente de novo.`;
  }

  return [
    `Alteração feita em '${data.tabela}': ${data.linhas_afetadas} linha(s).`,
    JSON.stringify(data.linhas ?? []),
    "Confirme ao usuário o que ficou (valores novos, em linguagem natural). Se mudou preço/prazo de produto, cheque se os blocos de conhecimento também foram atualizados.",
  ].join("\n");
}

/**
 * Dupla conversão de fuso: `coluna AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'`.
 *
 * A coluna já é `timestamptz`. A 1ª conversão a torna ingênua em UTC; a 2ª lê
 * essa hora ingênua como se fosse BRT e SOMA 3h em vez de subtrair — o dia
 * passa a começar às 21h do dia anterior, e venda da noite anterior entra como
 * se fosse de hoje. Apareceu em 38 dos 242 SELECTs do Mentor em 30 dias, e
 * continuou aparecendo depois de virar regra escrita na descrição da tool.
 * Por isso a trava é aqui: regra de prompt é aposta, servidor é garantia.
 */
const DUPLA_CONVERSAO_FUSO =
  /at\s+time\s+zone\s+'utc'\s*\)?\s*at\s+time\s+zone\s+'america\/sao_paulo'/i;

export function recusaPorFusoDuplo(sql: string): string | null {
  if (!DUPLA_CONVERSAO_FUSO.test(sql)) return null;
  return [
    "✗ SQL recusado: dupla conversão de fuso.",
    "`AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'` numa coluna timestamptz SOMA 3h",
    "em vez de subtrair — o dia começa às 21h do dia anterior e venda da noite anterior",
    "entra no dia seguinte.",
    "Use UMA conversão só: `(coluna AT TIME ZONE 'America/Sao_Paulo')::date`.",
    "Refaça o SELECT com esse idioma e chame de novo.",
  ].join(" ");
}

export async function handlerConsultarDados(
  args: Record<string, unknown>,
  ctx: CtxConsultaDados,
): Promise<string> {
  const acao = String(args.acao ?? "consultar");

  if (acao === "esquema") {
    const { data, error } = await ctx.supabase_admin.rpc("esquema_consulta_dados");
    if (error) return `✗ Erro ao carregar esquema: ${error.message}`;
    return [
      "Esquema das tabelas disponíveis (tabela → descrição + colunas). Monte o SELECT só com o que está aqui:",
      JSON.stringify(data),
    ].join("\n");
  }

  const sql = String(args.sql ?? "").trim();
  if (!sql) {
    return "✗ Informe o campo sql com o SELECT (ou chame com acao='esquema' pra ver as tabelas).";
  }
  const recusa = recusaPorFusoDuplo(sql);
  if (recusa) return recusa;
  const limite = Number(args.limite ?? 100);

  const { data, error } = await ctx.supabase_admin.rpc("consultar_dados_leitura", {
    p_owner: ctx.user_id,
    p_sql: sql,
    p_limite: Number.isFinite(limite) ? Math.trunc(limite) : 100,
  });
  if (error) return `✗ Erro na consulta: ${error.message}`;
  if (!data?.ok) {
    return `✗ ${String(data?.erro ?? "consulta recusada")} — corrija o SQL e tente de novo.`;
  }

  const linhas = data.linhas ?? [];
  const aviso = data.truncado
    ? ` (TRUNCADO em ${data.total_retornado} linhas — agregue com count/group by pra ver o total)`
    : "";
  const dup = avisoDeDuplicacao(sql, linhas);
  return [
    `Resultado (${data.total_retornado} linha(s)${aviso}):`,
    JSON.stringify(linhas),
    ...(dup ? [dup] : []),
    "Analise os números e responda em linguagem natural — calcule variações e destaque o que importa.",
  ].join("\n");
}

/**
 * Aviso de multiplicação por JOIN um-para-muitos.
 *
 * Caso real (2026-09-07 11:11): "vendas do dia 02/09 com contrato e comprovante"
 * fez `leads JOIN contratos` sem agregar. Um lead tinha 2 contratos com
 * comprovante, então a consulta devolveu 4 linhas somando R$ 3.582,00 quando a
 * resposta era 3 vendas e R$ 2.388,00. O Mentor deduplicou de cabeça e ACERTOU
 * o número — mas ninguém garantiu que ele acerte na próxima, e o número
 * entregue não veio da consulta.
 *
 * A regra "UM POR LINHA" já estava na descrição da tool e foi ignorada. Este
 * aviso é determinístico: sai no resultado, antes de a LLM escrever a resposta.
 */
// deno-lint-ignore no-explicit-any
export function avisoDeDuplicacao(sql: string, linhas: any[]): string | null {
  if (!/\bjoin\b/i.test(sql) || !Array.isArray(linhas) || linhas.length < 2) return null;
  if (/\bgroup\s+by\b|\bdistinct\b|\bexists\s*\(/i.test(sql)) return null;

  const colunas = Object.keys(linhas[0] ?? {});
  for (const col of colunas) {
    const valores = linhas.map((l) => l?.[col]).filter((v) => v !== null && v !== undefined && v !== "");
    if (valores.length < linhas.length) continue;
    const contagem = new Map<string, number>();
    for (const v of valores) {
      const k = String(v);
      contagem.set(k, (contagem.get(k) ?? 0) + 1);
    }
    const repetido = [...contagem.entries()].find(([, n]) => n > 1);
    // Coluna com TODOS os valores iguais é constante do filtro (ex.: a data),
    // não duplicação — só interessa quando há variação e repetição junto.
    if (repetido && contagem.size > 1) {
      return `⚠ POSSÍVEL DUPLICAÇÃO POR JOIN: a coluna '${col}' repete o valor ` +
        `'${repetido[0]}' em ${repetido[1]} linhas. Se a pergunta é sobre o lado 'um' ` +
        "(um lead com vários contratos, um cliente com vários pagamentos), contar ou somar " +
        "estas linhas INFLA o número. Refaça com GROUP BY no lado 'um' (ou EXISTS em vez de " +
        "JOIN) e use o resultado da consulta corrigida — não conserte de cabeça na resposta.";
    }
  }
  return null;
}
