/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// tools-financeiro.ts — catálogo de ferramentas do cargo Financeiro (canal interno via WhatsApp).
//
// O dono conversa com o agente pelo número cadastrado em `financeiro_config_tenant`;
// o agente registra gastos/recebimentos em `movimentos_financeiros`, liga comprovante
// de cliente em `pagamentos_cliente` e responde resumos do caixa.
//
// Padrão espelhado de tools-curadoria.ts / tools-admin.ts: TOOLS_FINANCEIRO (schemas)
// + executarTool(nome, args, ctx) → string. Zero regra de negócio hardcoded além do
// dedup determinístico (data+valor) — o COMO decidir vem do cargo (RAG-first).

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { executarToolContas, TOOLS_FINANCEIRO_CONTAS } from "./tools-financeiro-contas.ts";
import {
  carregarArvoreCategorias,
  handlerGerenciarCategoria,
  resolverCategoria,
  rotuloCategoria,
  TOOL_GERENCIAR_CATEGORIA,
} from "./categorias-financeiro.ts";

type AnyClient = SupabaseClient<
  // deno-lint-ignore no-explicit-any
  any,
  "public",
  // deno-lint-ignore no-explicit-any
  any
>;

export type CtxFinanceiro = {
  /** Dono do caixa (tenant). */
  user_id: string;
  supabase_admin: AnyClient;
  /** Documento processado NESTE turno (setado pelo canal-financeiro ao receber mídia). */
  documento_turno_id?: string | null;
  /** Origem default dos movimentos do turno: comprovante | extrato | agente_wpp. */
  origem_turno?: string | null;
  /** Rótulo de quem enviou a mensagem do turno (autoria — carimbado em carga.enviado_por). */
  autor_turno?: string | null;
};

/** Instrução de extração estruturada usada pelo canal-financeiro ao interpretar mídia. */
export const INSTRUCAO_EXTRACAO_FINANCEIRA =
  `Você está lendo um documento financeiro (comprovante de pagamento PIX/transferência OU extrato de cartão/conta). ` +
  `Devolva APENAS um JSON válido, sem markdown, no formato: ` +
  `{"tipo_documento":"comprovante"|"extrato","lancamentos":[{"data":"YYYY-MM-DD","valor":123.45,"descricao":"...","pagador":"nome de quem pagou ou null","recebedor":"nome de quem recebeu ou null","direcao":"entrada"|"saida"|"desconhecida"}]}. ` +
  `Comprovante = 1 lançamento. Extrato = 1 lançamento por linha legível. ` +
  `Valores sempre positivos em reais. Data ausente/ilegível = null. NUNCA invente valor, data ou nome que não esteja legível no documento.`;

// ── Schemas (function-calling) ──────────────────────────────────────────────
// Catálogo = tools de caixa (abaixo) + contas a pagar/metas (tools-financeiro-contas.ts),
// mescladas no fim do arquivo.

const TOOLS_CAIXA = [
  {
    type: "function" as const,
    function: {
      name: "registrar_movimentos",
      description:
        "Registra um ou mais movimentos no caixa do dono (gasto = saida, recebimento = entrada). " +
        "Use após ler comprovante/extrato do PRÓPRIO dono ou quando ele relatar gasto/recebimento em texto. " +
        "NÃO use para pagamento recebido de cliente — para isso use registrar_pagamento_cliente. " +
        "Duplicatas (mesma data + mesmo valor já registrados) são puladas automaticamente.",
      parameters: {
        type: "object",
        properties: {
          movimentos: {
            type: "array",
            description: "Lançamentos a registrar.",
            items: {
              type: "object",
              properties: {
                tipo: { type: "string", enum: ["entrada", "saida"], description: "entrada = dinheiro entrou; saida = gasto." },
                valor: { type: "number", description: "Valor em reais, positivo." },
                data: { type: "string", description: "Data real do movimento, YYYY-MM-DD. Omita se desconhecida (usa hoje)." },
                descricao: { type: "string", description: "Descrição curta (estabelecimento, motivo)." },
                categoria: { type: "string", description: "Categoria simples em pt-BR: mercado, transporte, alimentação, contas, salário, venda, outros…" },
              },
              required: ["tipo", "valor", "descricao"],
            },
          },
          confirmar_repetido: {
            type: "boolean",
            description:
              "true SOMENTE quando um registro foi bloqueado por duplicata e o dono CONFIRMOU em seguida que é outro gasto igual de verdade. Nunca use true por conta própria.",
          },
        },
        required: ["movimentos"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "registrar_pagamento_cliente",
      description:
        "Registra um pagamento RECEBIDO DE CLIENTE (comprovante que o dono encaminhou dizendo/indicando que é de cliente, " +
        "ou quando o pagador do comprovante casa com uma cobrança em aberto). Liga ao cliente certo e, se houver cobrança " +
        "pendente com o mesmo valor, marca ela como paga em vez de criar registro novo.",
      parameters: {
        type: "object",
        properties: {
          valor: { type: "number", description: "Valor em reais, positivo." },
          data: { type: "string", description: "Data do pagamento, YYYY-MM-DD. Omita se desconhecida (usa hoje)." },
          nome_cliente: { type: "string", description: "Nome do cliente/lead como o dono falou ou como está no comprovante." },
          descricao: { type: "string", description: "Descrição curta (ex: 'PIX comprovante — entrada do serviço')." },
        },
        required: ["valor", "nome_cliente"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "reclassificar_movimento",
      description:
        "Corrige o ÚLTIMO movimento registrado (ou o que casar com valor informado) quando o dono explicar depois o que era: " +
        "mudar tipo (entrada/saida), data, categoria, descrição, ou transformar em pagamento de cliente (informe nome_cliente). " +
        "SEMPRE use esta ferramenta pra corrigir lançamento já feito — NUNCA registre de novo (criaria duplicata).",
      parameters: {
        type: "object",
        properties: {
          valor: { type: "number", description: "Valor do movimento a corrigir (ajuda a achar o certo). Omita para pegar o último." },
          novo_tipo: { type: "string", enum: ["entrada", "saida"], description: "Novo tipo, se mudou." },
          nova_data: { type: "string", description: "Data correta do movimento, YYYY-MM-DD (ex: dono disse 'foi ontem')." },
          nova_categoria: { type: "string", description: "Nova categoria, se mudou." },
          nova_descricao: { type: "string", description: "Nova descrição, se mudou." },
          virar_pagamento_cliente: { type: "boolean", description: "true = esse movimento era pagamento de cliente." },
          nome_cliente: { type: "string", description: "Obrigatório quando virar_pagamento_cliente=true." },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "consultar_resumo_financeiro",
      description:
        "Consulta o caixa do dono: totais de entrada/saída, saldo e gastos por categoria de um mês. " +
        "Use quando o dono perguntar 'quanto gastei', 'quanto entrou', 'como tá o caixa'.",
      parameters: {
        type: "object",
        properties: {
          mes: { type: "string", description: "Mês no formato YYYY-MM. Omita para o mês atual." },
        },
        required: [],
      },
    },
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  `R$ ${v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

function dataOuHoje(data?: unknown): string {
  // Hoje em BRT (UTC-3) — o dono fala do fuso dele, não de UTC.
  const hoje = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const s = typeof data === "string" ? data.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return hoje;
  // Clamp de ano: o dono fala "04/07" sem ano e o LLM às vezes chuta 2024 —
  // lançamento com ano errado some do app (filtro por mês). Fora de ±1 ano → ano atual.
  const anoAtual = Number(hoje.slice(0, 4));
  const ano = Number(s.slice(0, 4));
  if (Math.abs(ano - anoAtual) > 1) return `${anoAtual}${s.slice(4)}`;
  return s;
}

// ── Handlers ────────────────────────────────────────────────────────────────

async function handlerRegistrarMovimentos(args: Record<string, unknown>, ctx: CtxFinanceiro): Promise<string> {
  const lista = Array.isArray(args.movimentos) ? args.movimentos as Array<Record<string, unknown>> : [];
  if (lista.length === 0) return "Nenhum movimento informado — nada registrado.";

  const sb = ctx.supabase_admin;
  const confirmarRepetido = args.confirmar_repetido === true;
  const arvore = await carregarArvoreCategorias(sb, ctx.user_id);
  let inseridos = 0;
  let entradas = 0, saidas = 0;
  const pulados: string[] = [];
  let houveDuplicata = false;

  for (const m of lista.slice(0, 60)) {
    const tipo = m.tipo === "entrada" ? "entrada" : "saida";
    const valor = Number(m.valor);
    if (!Number.isFinite(valor) || valor <= 0) {
      pulados.push(`valor inválido (${String(m.valor)})`);
      continue;
    }
    const data = dataOuHoje(m.data);
    // Dedup determinístico: mesmo dono + mesma data + mesmo valor vivo = duplicata.
    // `confirmar_repetido=true` (dono confirmou gasto igual de verdade) pula o check.
    if (!confirmarRepetido) {
      const { data: dup } = await sb
        .from("movimentos_financeiros")
        .select("id, descricao")
        .eq("owner_id", ctx.user_id)
        .eq("data_movimento", data)
        .eq("valor", valor)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (dup?.id) {
        houveDuplicata = true;
        pulados.push(`${fmtBRL(valor)} em ${data} (já registrado: ${dup.descricao ?? "sem descrição"})`);
        continue;
      }
    }
    // Categoria: resolve contra a árvore do tenant (rótulo "Raiz > Sub"); sem match → texto livre.
    const catResolvida = resolverCategoria(arvore, m.categoria as string | undefined);
    const { error } = await sb.from("movimentos_financeiros").insert({
      owner_id: ctx.user_id,
      tipo,
      valor,
      descricao: String(m.descricao ?? "").slice(0, 300) || null,
      categoria: catResolvida
        ? rotuloCategoria(arvore, catResolvida)
        : (m.categoria ? String(m.categoria).toLowerCase().slice(0, 60) : null),
      categoria_id: catResolvida?.id ?? null,
      data_movimento: data,
      origem: ctx.origem_turno ?? "agente_wpp",
      documento_id: ctx.documento_turno_id ?? null,
      carga: ctx.autor_turno ? { enviado_por: ctx.autor_turno } : {},
    });
    if (error) {
      pulados.push(`${fmtBRL(valor)} (${error.message.slice(0, 80)})`);
      continue;
    }
    inseridos++;
    if (tipo === "entrada") entradas += valor;
    else saidas += valor;
  }

  const partes = [`Registrados ${inseridos} movimento(s)`];
  if (entradas > 0) partes.push(`entradas ${fmtBRL(entradas)}`);
  if (saidas > 0) partes.push(`saídas ${fmtBRL(saidas)}`);
  if (pulados.length) partes.push(`NÃO registrados (${pulados.length}): ${pulados.join(" · ")}`);
  let instrucaoFinal = ". Avise o dono do que foi registrado (e do que foi pulado por duplicata, se houver).";
  if (houveDuplicata) {
    instrucaoFinal =
      ". REGRA INVIOLÁVEL: NÃO tente registrar de novo com valor ou data diferentes pra contornar a duplicata — isso corromperia o caixa. " +
      "Pergunte ao dono se é realmente OUTRO gasto igual; só se ele confirmar, chame registrar_movimentos de novo com confirmar_repetido=true e o MESMO valor.";
  }
  return partes.join(" · ") + instrucaoFinal;
}

async function handlerRegistrarPagamentoCliente(args: Record<string, unknown>, ctx: CtxFinanceiro): Promise<string> {
  const sb = ctx.supabase_admin;
  const valor = Number(args.valor);
  if (!Number.isFinite(valor) || valor <= 0) return "Valor inválido — não registrei. Confirme o valor com o dono.";
  const nome = String(args.nome_cliente ?? "").trim();
  if (!nome) return "Faltou o nome do cliente — pergunte ao dono de quem é esse pagamento.";
  const data = dataOuHoje(args.data);

  // 1) Resolver o lead por nome (fuzzy leve: ilike nas duas colunas de nome).
  const { data: leads } = await sb
    .from("leads")
    .select("id, name, nome_exibicao")
    .eq("tenant_id", ctx.user_id)
    .is("deleted_at", null)
    .or(`name.ilike.%${nome.replace(/[%,]/g, "")}%,nome_exibicao.ilike.%${nome.replace(/[%,]/g, "")}%`)
    .limit(3);

  if (!leads || leads.length === 0) {
    return `Não achei cliente com nome parecido com "${nome}" na base. Pergunte ao dono o nome exato — NÃO registre por conta própria.`;
  }
  if (leads.length > 1) {
    const nomes = leads.map((l: { name: string | null; nome_exibicao: string | null }) => l.name || l.nome_exibicao).filter(Boolean).join(", ");
    return `Achei ${leads.length} clientes parecidos: ${nomes}. Pergunte ao dono qual deles é antes de registrar.`;
  }
  const lead = leads[0];
  const nomeLead = lead.name || lead.nome_exibicao || nome;

  // 2) Cobrança pendente com o mesmo valor → marca paga (não cria registro novo).
  const { data: cobranca } = await sb
    .from("pagamentos_cliente")
    .select("id, descricao, valor")
    .eq("tenant_id", ctx.user_id)
    .eq("lead_id", lead.id)
    .eq("status", "pendente")
    .gte("valor", valor - 0.01)
    .lte("valor", valor + 0.01)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cobranca?.id) {
    const { error } = await sb
      .from("pagamentos_cliente")
      .update({ status: "pago", data_pagamento: data, metodo_pagamento: "pix" })
      .eq("id", cobranca.id);
    if (error) return `Falha ao baixar a cobrança: ${error.message.slice(0, 100)}`;
    return `Cobrança de ${fmtBRL(Number(cobranca.valor))} do cliente ${nomeLead} marcada como PAGA em ${data}. Confirme pro dono.`;
  }

  // 3) Sem cobrança aberta → registra pagamento avulso já pago.
  const { error: insErr } = await sb.from("pagamentos_cliente").insert({
    tenant_id: ctx.user_id,
    lead_id: lead.id,
    descricao: String(args.descricao ?? `Pagamento recebido via comprovante (assistente financeiro)`).slice(0, 300),
    valor,
    data_vencimento: data,
    data_pagamento: data,
    status: "pago",
    metodo_pagamento: "pix",
    observacao: ctx.autor_turno ? `Comprovante enviado por ${ctx.autor_turno} (assistente financeiro)` : null,
  });
  if (insErr) return `Falha ao registrar: ${insErr.message.slice(0, 100)}`;
  return `Pagamento de ${fmtBRL(valor)} do cliente ${nomeLead} registrado como PAGO em ${data} (sem cobrança aberta correspondente — criado avulso). Confirme pro dono.`;
}

async function handlerReclassificarMovimento(args: Record<string, unknown>, ctx: CtxFinanceiro): Promise<string> {
  const sb = ctx.supabase_admin;
  let q = sb
    .from("movimentos_financeiros")
    .select("id, tipo, valor, descricao, categoria, data_movimento")
    .eq("owner_id", ctx.user_id)
    .is("deleted_at", null)
    .order("criado_em", { ascending: false })
    .limit(1);
  const valor = Number(args.valor);
  if (Number.isFinite(valor) && valor > 0) {
    q = sb
      .from("movimentos_financeiros")
      .select("id, tipo, valor, descricao, categoria, data_movimento")
      .eq("owner_id", ctx.user_id)
      .is("deleted_at", null)
      .gte("valor", valor - 0.01)
      .lte("valor", valor + 0.01)
      .order("criado_em", { ascending: false })
      .limit(1);
  }
  const { data: mov } = await q.maybeSingle();
  if (!mov?.id) return "Não achei movimento pra corrigir. Pergunte ao dono qual valor/lançamento ele quer ajustar.";

  // Virar pagamento de cliente: tira do caixa e registra no fluxo de clientes.
  if (args.virar_pagamento_cliente === true) {
    const nome = String(args.nome_cliente ?? "").trim();
    if (!nome) return "Pra transformar em pagamento de cliente preciso do nome do cliente — pergunte ao dono.";
    const resultado = await handlerRegistrarPagamentoCliente(
      { valor: mov.valor, data: mov.data_movimento, nome_cliente: nome, descricao: mov.descricao },
      ctx,
    );
    // Só remove do caixa se o registro do lado do cliente deu certo.
    if (/registrado como PAGO|marcada como PAGA/.test(resultado)) {
      await sb.from("movimentos_financeiros").update({ deleted_at: new Date().toISOString() }).eq("id", mov.id);
      return `Movimento de ${fmtBRL(Number(mov.valor))} movido pro financeiro de clientes. ${resultado}`;
    }
    return resultado;
  }

  const patch: Record<string, unknown> = {};
  if (args.novo_tipo === "entrada" || args.novo_tipo === "saida") patch.tipo = args.novo_tipo;
  if (typeof args.nova_data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.nova_data.trim())) patch.data_movimento = dataOuHoje(args.nova_data.trim());
  if (typeof args.nova_categoria === "string" && args.nova_categoria.trim()) {
    const arvore = await carregarArvoreCategorias(sb, ctx.user_id);
    const catNova = resolverCategoria(arvore, args.nova_categoria);
    patch.categoria = catNova ? rotuloCategoria(arvore, catNova) : args.nova_categoria.toLowerCase().slice(0, 60);
    patch.categoria_id = catNova?.id ?? null;
  }
  if (typeof args.nova_descricao === "string" && args.nova_descricao.trim()) patch.descricao = args.nova_descricao.slice(0, 300);
  if (Object.keys(patch).length === 0) return "Nada pra mudar — pergunte ao dono o que ele quer corrigir nesse lançamento.";

  const { error } = await sb.from("movimentos_financeiros").update(patch).eq("id", mov.id);
  if (error) return `Falha ao corrigir: ${error.message.slice(0, 100)}`;
  return `Corrigido: ${mov.descricao ?? "movimento"} de ${fmtBRL(Number(mov.valor))} (${mov.data_movimento}) → ${JSON.stringify(patch)}. Confirme pro dono.`;
}

async function handlerConsultarResumo(args: Record<string, unknown>, ctx: CtxFinanceiro): Promise<string> {
  const sb = ctx.supabase_admin;
  const mesArg = typeof args.mes === "string" && /^\d{4}-\d{2}$/.test(args.mes) ? args.mes : dataOuHoje().slice(0, 7);
  const inicio = `${mesArg}-01`;
  const [ano, mes] = mesArg.split("-").map(Number);
  const fim = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10); // 1º dia do mês seguinte

  const { data: movs } = await sb
    .from("movimentos_financeiros")
    .select("tipo, valor, categoria")
    .eq("owner_id", ctx.user_id)
    .is("deleted_at", null)
    .gte("data_movimento", inicio)
    .lt("data_movimento", fim)
    .limit(2000);

  const lista = (movs ?? []) as Array<{ tipo: string; valor: number; categoria: string | null }>;
  if (lista.length === 0) return `Nenhum movimento registrado em ${mesArg}.`;

  let entradas = 0, saidas = 0;
  const porCategoria = new Map<string, number>();
  for (const m of lista) {
    const v = Number(m.valor) || 0;
    if (m.tipo === "entrada") entradas += v;
    else {
      saidas += v;
      const cat = m.categoria || "sem categoria";
      porCategoria.set(cat, (porCategoria.get(cat) ?? 0) + v);
    }
  }
  const topCat = [...porCategoria.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c, v]) => `${c} ${fmtBRL(v)}`)
    .join(" · ");

  // Recebimentos de clientes do mês (informativo, fluxo separado).
  const { data: pgs } = await sb
    .from("pagamentos_cliente")
    .select("valor")
    .eq("tenant_id", ctx.user_id)
    .eq("status", "pago")
    .gte("data_pagamento", inicio)
    .lt("data_pagamento", fim)
    .limit(2000);
  const recebidoClientes = ((pgs ?? []) as Array<{ valor: number }>).reduce((s, p) => s + (Number(p.valor) || 0), 0);

  return (
    `Resumo ${mesArg}: ${lista.length} movimentos · entradas ${fmtBRL(entradas)} · saídas ${fmtBRL(saidas)} · saldo ${fmtBRL(entradas - saidas)}.` +
    (topCat ? ` Maiores gastos por categoria: ${topCat}.` : "") +
    (recebidoClientes > 0 ? ` Recebido de clientes no mês (fluxo separado): ${fmtBRL(recebidoClientes)}.` : "")
  );
}

// ── Catálogo completo + despacho ────────────────────────────────────────────

export const TOOLS_FINANCEIRO = [...TOOLS_CAIXA, ...TOOLS_FINANCEIRO_CONTAS, TOOL_GERENCIAR_CATEGORIA];

export async function executarTool(
  nome: string,
  args: Record<string, unknown>,
  ctx: CtxFinanceiro,
): Promise<string> {
  try {
    switch (nome) {
      case "registrar_movimentos":
        return await handlerRegistrarMovimentos(args, ctx);
      case "registrar_pagamento_cliente":
        return await handlerRegistrarPagamentoCliente(args, ctx);
      case "reclassificar_movimento":
        return await handlerReclassificarMovimento(args, ctx);
      case "consultar_resumo_financeiro":
        return await handlerConsultarResumo(args, ctx);
      case "gerenciar_categoria":
        return await handlerGerenciarCategoria(ctx.supabase_admin, ctx.user_id, args);
      default:
        // Contas a pagar + metas (tools-financeiro-contas.ts)
        return await executarToolContas(nome, args, ctx);
    }
  } catch (e) {
    return `Erro na ferramenta ${nome}: ${(e as Error).message.slice(0, 120)}`;
  }
}
