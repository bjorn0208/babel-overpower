/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// tools-financeiro-contas.ts — extensão do cargo Financeiro: contas a pagar
// (dívida parcelada incluída) e metas de compra/investimento.
// Mesclado ao catálogo TOOLS_FINANCEIRO em tools-financeiro.ts.

import type { CtxFinanceiro } from "./tools-financeiro.ts";

const fmtBRL = (v: number) =>
  `R$ ${v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

function dataOuHoje(data?: unknown): string {
  const hoje = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const s = typeof data === "string" ? data.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return hoje;
  // Clamp de ano (mesma regra do tools-financeiro): fora de ±1 ano → ano atual.
  const anoAtual = Number(hoje.slice(0, 4));
  const ano = Number(s.slice(0, 4));
  if (Math.abs(ano - anoAtual) > 1) return `${anoAtual}${s.slice(4)}`;
  return s;
}

function somarUmMes(data: string): string {
  const [a, m, d] = data.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + 1, Math.min(d, 28)));
  return alvo.toISOString().slice(0, 10);
}

export const TOOLS_FINANCEIRO_CONTAS = [
  {
    type: "function" as const,
    function: {
      name: "cadastrar_conta_pagar",
      description:
        "Cadastra um pagamento por fazer do dono (conta simples ou dívida parcelada). " +
        "persistencia controla o lembrete: sem_aviso (nunca avisa) · aviso_unico (avisa no vencimento) · " +
        "insistir (cobra todo dia até o pagamento com comprovante). Pergunte a persistência se o dono não disser.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "Nome da conta (ex: aluguel, fornecedor X)." },
          valor_total: { type: "number", description: "Valor total em reais (soma das parcelas, se parcelado)." },
          parcelas_total: { type: "number", description: "Quantidade de parcelas. Omita se for pagamento único." },
          vencimento: { type: "string", description: "Data do (próximo) vencimento, YYYY-MM-DD." },
          persistencia: { type: "string", enum: ["sem_aviso", "aviso_unico", "insistir"], description: "Nível de lembrete." },
        },
        required: ["titulo", "valor_total", "vencimento"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "reagendar_conta",
      description:
        "Muda a data de cobrança de uma conta aberta — use quando o dono disser que negociou " +
        "('vou pagar dia tal'). O lembrete passa a valer pra nova data e o acompanhamento continua.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "Nome (ou parte) da conta. Omita se só existe uma aberta." },
          nova_data: { type: "string", description: "Nova data combinada, YYYY-MM-DD." },
        },
        required: ["nova_data"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "registrar_pagamento_conta",
      description:
        "Marca uma parcela (ou o total) de uma conta aberta como PAGA — use quando o dono confirmar o pagamento " +
        "ou mandar o comprovante da conta. Gera o movimento de saída no caixa e, se era a última parcela, quita a conta.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "Nome (ou parte) da conta. Omita se só existe uma aberta." },
          valor: { type: "number", description: "Valor pago, se diferente da parcela padrão." },
          data: { type: "string", description: "Data do pagamento, YYYY-MM-DD. Omita pra hoje." },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "registrar_aporte_meta",
      description:
        "Registra dinheiro guardado/direcionado pra uma meta de compra ou investimento (ex: 'guardei 500 pro equipamento'). " +
        "Vale comprovante de depósito ou valor informado. Mostra o progresso até o valor alvo.",
      parameters: {
        type: "object",
        properties: {
          nome_meta: { type: "string", description: "Nome (ou parte) da meta." },
          valor: { type: "number", description: "Valor do aporte em reais." },
          data: { type: "string", description: "Data, YYYY-MM-DD. Omita pra hoje." },
        },
        required: ["nome_meta", "valor"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "consultar_contas_metas",
      description:
        "Consulta as contas a pagar abertas (vencimento, parcelas) e o progresso das metas de compra/investimento. " +
        "Use quando o dono perguntar o que tem pra pagar ou como estão as metas.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

async function acharConta(ctx: CtxFinanceiro, titulo?: unknown): Promise<{ conta?: Record<string, unknown>; erro?: string }> {
  const sb = ctx.supabase_admin;
  let q = sb
    .from("contas_a_pagar")
    .select("id, titulo, valor_total, parcelas_total, parcelas_pagas, proximo_vencimento, persistencia")
    .eq("tenant_id", ctx.user_id)
    .eq("status", "aberta")
    .is("deleted_at", null)
    .limit(5);
  const t = typeof titulo === "string" ? titulo.trim() : "";
  if (t) q = q.ilike("titulo", `%${t.replace(/[%,]/g, "")}%`);
  const { data } = await q;
  if (!data || data.length === 0) return { erro: t ? `Não achei conta aberta parecida com "${t}".` : "Nenhuma conta aberta." };
  if (data.length > 1) {
    return { erro: `Achei ${data.length} contas abertas: ${data.map((c: { titulo: string }) => c.titulo).join(", ")}. Pergunte ao dono qual delas.` };
  }
  return { conta: data[0] as Record<string, unknown> };
}

export async function executarToolContas(
  nome: string,
  args: Record<string, unknown>,
  ctx: CtxFinanceiro,
): Promise<string> {
  const sb = ctx.supabase_admin;

  if (nome === "cadastrar_conta_pagar") {
    const valor = Number(args.valor_total);
    if (!Number.isFinite(valor) || valor <= 0) return "Valor inválido — confirme com o dono.";
    const parcelas = Math.max(1, Math.trunc(Number(args.parcelas_total) || 1));
    const persistencia = ["sem_aviso", "aviso_unico", "insistir"].includes(String(args.persistencia))
      ? String(args.persistencia) : "aviso_unico";
    const { error } = await sb.from("contas_a_pagar").insert({
      tenant_id: ctx.user_id,
      titulo: String(args.titulo ?? "").slice(0, 120) || "Conta",
      valor_total: valor,
      parcelas_total: parcelas,
      proximo_vencimento: dataOuHoje(args.vencimento),
      persistencia,
    });
    if (error) return `Falha ao cadastrar: ${error.message.slice(0, 100)}`;
    const modoAviso = persistencia === "insistir"
      ? "vou cobrar todo dia até o pagamento sair"
      : persistencia === "aviso_unico" ? "aviso no vencimento" : "sem aviso";
    return `Conta "${args.titulo}" cadastrada: ${fmtBRL(valor)}${parcelas > 1 ? ` em ${parcelas}x` : ""}, vence ${dataOuHoje(args.vencimento)} — ${modoAviso}. Confirme pro dono.`;
  }

  if (nome === "reagendar_conta") {
    const { conta, erro } = await acharConta(ctx, args.titulo);
    if (!conta) return erro!;
    const novaData = dataOuHoje(args.nova_data);
    const { error } = await sb
      .from("contas_a_pagar")
      .update({ proximo_vencimento: novaData, ultimo_lembrete_em: null })
      .eq("id", conta.id);
    if (error) return `Falha ao reagendar: ${error.message.slice(0, 100)}`;
    return `Combinado: a conta "${conta.titulo}" foi reagendada pra ${novaData}. Vou lembrar o dono nessa data e seguimos o acompanhamento.`;
  }

  if (nome === "registrar_pagamento_conta") {
    const { conta, erro } = await acharConta(ctx, args.titulo);
    if (!conta) return erro!;
    const parcelasTotal = Number(conta.parcelas_total) || 1;
    const valorParcela = Number(conta.valor_total) / parcelasTotal;
    const valorPago = Number.isFinite(Number(args.valor)) && Number(args.valor) > 0 ? Number(args.valor) : valorParcela;
    const data = dataOuHoje(args.data);
    const pagasNovo = Math.min(Number(conta.parcelas_pagas) + 1, parcelasTotal);
    const quitou = pagasNovo >= parcelasTotal;

    const { error: movErr } = await sb.from("movimentos_financeiros").insert({
      owner_id: ctx.user_id,
      tipo: "saida",
      valor: valorPago,
      descricao: `${conta.titulo}${parcelasTotal > 1 ? ` — parcela ${pagasNovo}/${parcelasTotal}` : ""}`,
      categoria: "contas",
      data_movimento: data,
      origem: ctx.origem_turno ?? "agente_wpp",
      documento_id: ctx.documento_turno_id ?? null,
      conta_id: conta.id,
      carga: ctx.autor_turno ? { enviado_por: ctx.autor_turno } : {},
    });
    if (movErr) return `Falha ao lançar o pagamento: ${movErr.message.slice(0, 100)}`;

    const { error: upErr } = await sb
      .from("contas_a_pagar")
      .update(quitou
        ? { parcelas_pagas: pagasNovo, status: "quitada" }
        : { parcelas_pagas: pagasNovo, proximo_vencimento: somarUmMes(String(conta.proximo_vencimento ?? data)), ultimo_lembrete_em: null })
      .eq("id", conta.id);
    if (upErr) return `Movimento lançado, mas falhou atualizar a conta: ${upErr.message.slice(0, 100)}`;

    return quitou
      ? `Pagamento de ${fmtBRL(valorPago)} registrado — a conta "${conta.titulo}" foi QUITADA. Parabenize o dono.`
      : `Pagamento de ${fmtBRL(valorPago)} registrado (parcela ${pagasNovo}/${parcelasTotal} da "${conta.titulo}"). Próximo vencimento: ${somarUmMes(String(conta.proximo_vencimento ?? data))}.`;
  }

  if (nome === "registrar_aporte_meta") {
    const valor = Number(args.valor);
    if (!Number.isFinite(valor) || valor <= 0) return "Valor inválido — confirme com o dono.";
    const termo = String(args.nome_meta ?? "").trim().replace(/[%,]/g, "");
    const { data: metas } = await sb
      .from("metas_financeiras")
      .select("id, titulo, valor_alvo")
      .eq("tenant_id", ctx.user_id)
      .eq("status", "ativa")
      .is("deleted_at", null)
      .ilike("titulo", `%${termo}%`)
      .limit(3);
    if (!metas || metas.length === 0) return `Não achei meta ativa parecida com "${args.nome_meta}". Pergunte ao dono (ou sugira cadastrar no app Financeiro, aba Metas).`;
    if (metas.length > 1) return `Achei ${metas.length} metas: ${metas.map((m: { titulo: string }) => m.titulo).join(", ")}. Pergunte qual delas.`;
    const meta = metas[0];

    const { error } = await sb.from("movimentos_financeiros").insert({
      owner_id: ctx.user_id,
      tipo: "saida",
      valor,
      descricao: `Aporte pra meta: ${meta.titulo}`,
      categoria: "investimento",
      data_movimento: dataOuHoje(args.data),
      origem: ctx.origem_turno ?? "agente_wpp",
      documento_id: ctx.documento_turno_id ?? null,
      meta_id: meta.id,
      carga: ctx.autor_turno ? { enviado_por: ctx.autor_turno } : {},
    });
    if (error) return `Falha ao registrar o aporte: ${error.message.slice(0, 100)}`;

    const { data: aportes } = await sb
      .from("movimentos_financeiros")
      .select("valor")
      .eq("meta_id", meta.id)
      .is("deleted_at", null);
    const juntado = ((aportes ?? []) as Array<{ valor: number }>).reduce((s, a) => s + (Number(a.valor) || 0), 0);
    const alvo = Number(meta.valor_alvo);
    if (juntado >= alvo) {
      await sb.from("metas_financeiras").update({ status: "concluida" }).eq("id", meta.id);
      return `Aporte de ${fmtBRL(valor)} registrado — META "${meta.titulo}" BATIDA! Juntou ${fmtBRL(juntado)} de ${fmtBRL(alvo)}. Comemore com o dono.`;
    }
    return `Aporte de ${fmtBRL(valor)} registrado na meta "${meta.titulo}". Já juntou ${fmtBRL(juntado)} de ${fmtBRL(alvo)} (${Math.round((juntado / alvo) * 100)}%). Falta ${fmtBRL(alvo - juntado)}.`;
  }

  if (nome === "consultar_contas_metas") {
    const [{ data: contas }, { data: metas }] = await Promise.all([
      sb.from("contas_a_pagar")
        .select("titulo, valor_total, parcelas_total, parcelas_pagas, proximo_vencimento, persistencia")
        .eq("tenant_id", ctx.user_id).eq("status", "aberta").is("deleted_at", null)
        .order("proximo_vencimento", { ascending: true }).limit(20),
      sb.from("metas_financeiras")
        .select("id, titulo, valor_alvo")
        .eq("tenant_id", ctx.user_id).eq("status", "ativa").is("deleted_at", null).limit(20),
    ]);
    const linhasContas = ((contas ?? []) as Array<Record<string, unknown>>).map((c) => {
      const pt = Number(c.parcelas_total) || 1;
      const parcela = pt > 1 ? ` (parcela ${Math.min(Number(c.parcelas_pagas) + 1, pt)}/${pt} de ${fmtBRL(Number(c.valor_total) / pt)})` : ` (${fmtBRL(Number(c.valor_total))})`;
      return `- ${c.titulo}${parcela} vence ${c.proximo_vencimento}`;
    });
    const linhasMetas: string[] = [];
    for (const m of (metas ?? []) as Array<{ id: string; titulo: string; valor_alvo: number }>) {
      const { data: aportes } = await sb.from("movimentos_financeiros").select("valor").eq("meta_id", m.id).is("deleted_at", null);
      const juntado = ((aportes ?? []) as Array<{ valor: number }>).reduce((s, a) => s + (Number(a.valor) || 0), 0);
      linhasMetas.push(`- ${m.titulo}: ${fmtBRL(juntado)} de ${fmtBRL(Number(m.valor_alvo))} (${Math.round((juntado / Number(m.valor_alvo)) * 100)}%)`);
    }
    return (
      (linhasContas.length ? `Contas a pagar abertas:\n${linhasContas.join("\n")}` : "Nenhuma conta aberta.") +
      "\n\n" +
      (linhasMetas.length ? `Metas:\n${linhasMetas.join("\n")}` : "Nenhuma meta ativa.")
    );
  }

  return `Ferramenta desconhecida: ${nome}`;
}
