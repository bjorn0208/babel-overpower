// _shared/tools-rifas-admin.ts — pacote PODER DE DONO do app Rifas.
//
// Carregado SÓ no canal interno (Mentor, dono logado) — decisão Theus 2026-09-06.
// Nunca entra na lista de tools de conversa com lead: aqui tem sortear, aprovar
// pagamento, mudar preço, apagar rifa e mexer em dívida. Lead induzindo o agente
// a "aprovar meu comprovante" seria fraude de um turno.
//
// As escritas que dependiam de `auth.uid()` (sorteio, confirmação de pagamento)
// passam pelas RPCs espelho `*_agente(p_tenant_id, …)` — grant só pro service_role
// (Mig `rifa_rpcs_agente_escrita`). O resto escreve na tabela com filtro explícito
// de `tenant_id` (defesa em profundidade além da RLS).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type { CtxFerramenta, ResultadoFerramenta } from "./tools-internas.ts";
import { fmtCentavos, linkRifa, resolverRifa, resolverSorteio, soDigitos } from "./tools-rifas.ts";

// deno-lint-ignore no-explicit-any
type HandlerRifa = (sb: SupabaseClient, ctx: CtxFerramenta, args: any) => Promise<ResultadoFerramenta>;

const METODOS = ["loteria_federal", "plataforma", "pt_rio", "ptm", "ptn", "ptv", "ppt", "corujinha"];
const STATUS_RIFA = ["rascunho", "ativa", "pausada", "encerrada"];

const inteiro = (v: unknown): number | null => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : null;
};

/**
 * Aceita o jeito que o dono fala a hora ("19h", "19:30", "7") e devolve "HH:MM:00"
 * pro tipo `time`. Vazio explícito limpa o campo.
 */
const normalizarHoraArg = (v: unknown): string | null => {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2})\s*[:hH]?\s*(\d{2})?/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`;
};

// ══════════════════════════ painel_rifa ═════════════════════════════
const painel_rifa: HandlerRifa = async (sb, ctx, args) => {
  let rifaId: string | null = String(args?.rifa_id ?? "").trim() || null;
  if (!rifaId && args?.codigo_controle) {
    const { rifa } = await resolverRifa(sb, ctx.tenant_id, args);
    rifaId = rifa?.id ?? null;
  }

  const { data, error } = await sb.rpc("rifa_painel_agente", {
    p_tenant_id: ctx.tenant_id,
    p_rifa: rifaId,
  });
  if (error) return { ok: false, mensagem: `Falha ao abrir o painel: ${error.message}` };
  if (!data?.ok) return { ok: false, mensagem: `Sem painel: ${data?.erro ?? "erro"}` };

  const r = data.rifa, p = data.progresso, f = data.financeiro;
  const fila = data.aguardando_validacao?.qtd ?? 0;

  // A RPC não devolve `hora_sorteio` — busca à parte pra montar a frase exata do
  // sorteio e avisar o dono quando a hora não está cadastrada (foi o que fez o
  // agente responder "no horário marcado" pro lead em 06/09).
  const { data: horaRow } = await sb.from("rifas")
    .select("hora_sorteio").eq("id", r.id).maybeSingle();
  const sorteio = await resolverSorteio(sb, { ...r, hora_sorteio: horaRow?.hora_sorteio ?? null });
  // deno-lint-ignore no-explicit-any
  const expirando = (data.reservas_expirando_2h ?? []) as any[];
  // deno-lint-ignore no-explicit-any
  const top = (data.top_compradores ?? []) as any[];

  const partes = [
    `Rifa "${r.titulo}" (${r.codigo_controle ?? "sem código"}) — status ${r.status}, prêmio ${r.premio_principal}, número a ${fmtCentavos(r.preco_numero_centavos)}.`,
    `Vendidos ${p.pagos} pagos + ${p.reservados} reservados de ${p.total} (${p.pct_vendido}%) · ${p.disponiveis} livres.`,
    `Arrecadado ${fmtCentavos(f.arrecadado_centavos)} · a receber ${fmtCentavos(f.a_receber_centavos)} · ${f.participantes_pagantes} participantes pagantes · ticket médio ${fmtCentavos(f.ticket_medio_centavos)}.`,
    sorteio.texto,
    !sorteio.exata && r.status === "ativa"
      ? "AVISO: a hora do sorteio não está cadastrada nesta rifa — o agente não consegue responder horário exato pro comprador. Peça pro dono cadastrar (gerenciar_rifa, campo hora_sorteio)."
      : "",
    fila > 0 ? `${fila} comprovante(s) esperando você validar.` : "Nenhum comprovante na fila.",
    expirando.length ? `${expirando.length} reserva(s) expirando nas próximas 2h: ${expirando.slice(0, 5).map((e) => `${e.nome} (${(e.numeros ?? []).join(", ")})`).join(" · ")}.` : "",
    top.length ? `Quem mais comprou: ${top.map((t) => `${t.nome} ${t.numeros} nº`).join(" · ")}.` : "",
    data.dividas_abertas?.qtd > 0 ? `Dívidas abertas no tenant: ${data.dividas_abertas.qtd} número(s), ${fmtCentavos(data.dividas_abertas.total_centavos)}.` : "",
    r.status === "sorteada" ? `Já sorteada: número ${r.numero_sorteado}, ganhador ${r.ganhador_nome ?? "sem ganhador"}.` : "",
    `Link público: ${linkRifa(r.chave_publica)}`,
  ].filter(Boolean);

  return { ok: true, dados: data, mensagem: partes.join(" ") };
};

// ══════════════════════════ listar_rifas ════════════════════════════
const listar_rifas: HandlerRifa = async (sb, ctx, args) => {
  const status = String(args?.status ?? "").trim();
  let q = sb.from("rifas")
    .select("id, codigo_controle, titulo, premio_principal, status, total_numeros, preco_numero_centavos, data_sorteio_prevista, numero_sorteado, ganhador_nome, created_at")
    .eq("tenant_id", ctx.tenant_id).is("deleted_at", null)
    .order("created_at", { ascending: false }).limit(30);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return { ok: false, mensagem: `Falha ao listar rifas: ${error.message}` };
  if (!data || data.length === 0) {
    return { ok: true, dados: [], mensagem: status ? `Nenhuma rifa com status ${status}.` : "Nenhuma rifa cadastrada ainda." };
  }

  // Vendidos por rifa em uma query só (evita N+1).
  const ids = data.map((r) => r.id);
  const { data: nums } = await sb.from("numeros_rifa").select("rifa_id, status").in("rifa_id", ids);
  const contagem = new Map<string, { pagos: number; reservados: number }>();
  // deno-lint-ignore no-explicit-any
  for (const n of (nums ?? []) as any[]) {
    const c = contagem.get(n.rifa_id) ?? { pagos: 0, reservados: 0 };
    if (n.status === "pago") c.pagos++; else c.reservados++;
    contagem.set(n.rifa_id, c);
  }

  const linhas = data.map((r) => {
    const c = contagem.get(r.id) ?? { pagos: 0, reservados: 0 };
    const sorteio = r.numero_sorteado !== null ? ` · sorteada nº ${r.numero_sorteado} (${r.ganhador_nome ?? "sem ganhador"})` : "";
    return `${r.codigo_controle ?? "—"} "${r.titulo}" [${r.status}] — ${c.pagos + c.reservados}/${r.total_numeros} vendidos, número a ${fmtCentavos(r.preco_numero_centavos)}${sorteio}`;
  });

  return { ok: true, dados: data, mensagem: `Rifas do tenant: ${linhas.join(" | ")}.` };
};

// ══════════════════════ dossie_cliente_rifa ═════════════════════════
const dossie_cliente_rifa: HandlerRifa = async (sb, ctx, args) => {
  const phone = soDigitos(String(args?.telefone ?? ""));
  if (!phone) return { ok: false, mensagem: "Informe o telefone do cliente pra montar o dossiê." };

  const { data, error } = await sb.rpc("rifa_dossie_agente", {
    p_tenant_id: ctx.tenant_id, p_phone: phone, p_lead_id: null,
  });
  if (error) return { ok: false, mensagem: `Falha no dossiê: ${error.message}` };
  if (!data?.ok) return { ok: false, mensagem: `Sem dossiê: ${data?.erro ?? "erro"}` };

  // deno-lint-ignore no-explicit-any
  const pedidos = (data.pedidos ?? []) as any[];
  // deno-lint-ignore no-explicit-any
  const dividas = ((data.dividas ?? []) as any[]).filter((d) => !d.pago);
  const r = data.resumo ?? {};
  const vitorias = pedidos.filter((p) => p.ganhou);

  return {
    ok: true,
    dados: data,
    mensagem: [
      `Dossiê ${phone}: ${pedidos.length} pedido(s) em ${r.rifas_participadas ?? 0} rifa(s), ${fmtCentavos(r.total_gasto_centavos ?? 0)} pagos, ${r.numeros_ativos ?? 0} número(s) ativos.`,
      vitorias.length ? `Já ganhou ${vitorias.length} vez(es): ${vitorias.map((v) => v.rifa_titulo).join(", ")}.` : "Nunca ganhou.",
      dividas.length ? `Dívida aberta: ${fmtCentavos(r.divida_aberta_centavos ?? 0)} em ${dividas.length} número(s).` : "Sem dívida aberta.",
      // deno-lint-ignore no-explicit-any
      ((data.numeros_fixos ?? []) as any[]).length ? `Números fixos: ${(data.numeros_fixos as any[]).map((f) => f.numero).join(", ")}.` : "",
      pedidos.slice(0, 6).map((p) => `"${p.rifa_titulo}" nº ${(p.numeros ?? []).join(",")} ${p.status}`).join(" | "),
    ].filter(Boolean).join(" "),
  };
};

// ═══════════════════════ decidir_pedido_rifa ════════════════════════
const decidir_pedido_rifa: HandlerRifa = async (sb, ctx, args) => {
  const pedidoId = String(args?.pedido_id ?? "").trim();
  const aprovar = args?.aprovar === true;
  if (!pedidoId) return { ok: false, mensagem: "Informe o pedido_id (pega no painel_rifa, na fila de validação)." };

  const { data, error } = await sb.rpc("rifa_confirmar_pagamento_agente", {
    p_tenant_id: ctx.tenant_id,
    p_pedido: pedidoId,
    p_aprovar: aprovar,
    p_motivo: args?.motivo ? String(args.motivo) : null,
  });
  if (error) return { ok: false, mensagem: `Falha ao decidir o pedido: ${error.message}` };
  if (!data?.ok) return { ok: false, mensagem: `Recusado: ${data?.erro ?? "erro"}` };

  // deno-lint-ignore no-explicit-any
  const cotas = (data.cotas_premiadas_ganhas ?? []) as any[];
  const premio = cotas.length
    ? ` O comprador bateu cota premiada: ${cotas.map((c) => `nº ${c.numero} → ${c.premio}`).join(", ")} — avise ele.`
    : "";

  return {
    ok: true,
    dados: data,
    mensagem: aprovar
      ? `Pagamento confirmado — números marcados como pagos.${premio}`
      : `Pedido rejeitado — os números voltaram pro pote e ficaram livres pra outro comprador.`,
  };
};

// ══════════════════════ sortear_rifa_agora ══════════════════════════
const sortear_rifa_agora: HandlerRifa = async (sb, ctx, args) => {
  const { rifa } = await resolverRifa(sb, ctx.tenant_id, args);
  const rifaId = String(args?.rifa_id ?? "").trim() || rifa?.id;
  if (!rifaId) return { ok: false, mensagem: "Não achei a rifa. Passe o código de controle." };

  const numeroManual = inteiro(args?.numero_sorteado);
  const numerosManuais = Array.isArray(args?.numeros_sorteados)
    ? args.numeros_sorteados.map(inteiro).filter((n: number | null) => n !== null)
    : null;

  const { data, error } = await sb.rpc("rifa_sortear_agente", {
    p_tenant_id: ctx.tenant_id,
    p_rifa: rifaId,
    p_numero_manual: numeroManual,
    p_numeros_manuais: numerosManuais && numerosManuais.length > 0 ? numerosManuais : null,
  });
  if (error) return { ok: false, mensagem: `Falha no sorteio: ${error.message}` };
  if (!data?.ok) return { ok: false, mensagem: `Sorteio recusado: ${data?.erro ?? "erro"}` };

  // deno-lint-ignore no-explicit-any
  const resultado = ((data.resultado ?? []) as any[])
    .map((x) => `${x.premio}: nº ${x.numero} → ${x.sem_ganhador ? "SEM GANHADOR (número não vendido)" : `${x.ganhador_nome} (${x.ganhador_phone ?? "sem telefone"})`}`)
    .join(" · ");

  return {
    ok: true,
    dados: data,
    mensagem: `Sorteio registrado. ${resultado}. ${data.dividas_geradas > 0 ? `${data.dividas_geradas} número(s) reservados e não pagos viraram dívida na aba Dívidas.` : "Nenhuma dívida gerada."} Use anunciar_resultado_rifa pra divulgar no Status e avisar os compradores.`,
  };
};

// ═════════════════════════ gerenciar_rifa ═══════════════════════════
const gerenciar_rifa: HandlerRifa = async (sb, ctx, args) => {
  const acao = String(args?.acao ?? "").trim();

  if (acao === "criar") {
    const titulo = String(args?.titulo ?? "").trim();
    const premio = String(args?.premio_principal ?? "").trim();
    const total = inteiro(args?.total_numeros);
    const preco = inteiro(args?.preco_numero_centavos);
    if (!titulo || !premio || !total || !preco) {
      return { ok: false, mensagem: "Pra criar preciso de: titulo, premio_principal, total_numeros e preco_numero_centavos. Pergunte ao dono o que faltar." };
    }
    if (total < 1 || total > 100000) return { ok: false, mensagem: "total_numeros tem que estar entre 1 e 100000." };
    if (preco <= 0) return { ok: false, mensagem: "preco_numero_centavos tem que ser maior que zero." };

    const metodo = METODOS.includes(String(args?.metodo_sorteio)) ? String(args.metodo_sorteio) : "loteria_federal";
    const { data, error } = await sb.from("rifas").insert({
      tenant_id: ctx.tenant_id,
      titulo, premio_principal: premio,
      descricao: args?.descricao ? String(args.descricao) : null,
      total_numeros: total, preco_numero_centavos: preco,
      metodo_sorteio: metodo,
      data_sorteio_prevista: args?.data_sorteio_prevista ? String(args.data_sorteio_prevista) : null,
      hora_sorteio: normalizarHoraArg(args?.hora_sorteio),
      // Δ 2026-09-09: mesma regra do formulário (decisão Theus 26/08) — rifa de loteria numera
      // DESDE ZERO (00–99 numa rifa de 100, pra casar com a dezena do resultado); só o sorteio
      // pela plataforma começa no 1. Antes a tool ignorava o método e criava tudo em 1..total,
      // então a "Rifa Relâmpago" (federal) saiu 1–100 e o dono estranhou com razão.
      numeracao_desde_zero: args?.numeracao_desde_zero === true ||
        (args?.numeracao_desde_zero === undefined && metodo !== "plataforma"),
      aceita_fiado: args?.aceita_fiado === true,
      status: "rascunho",
    }).select("id, codigo_controle, titulo, chave_publica").single();
    if (error) return { ok: false, mensagem: `Falha ao criar rifa: ${error.message}` };

    return {
      ok: true, dados: data,
      mensagem: `Rifa "${data.titulo}" criada como RASCUNHO (código ${data.codigo_controle}). Ela só vende depois de virar 'ativa' — use gerenciar_rifa com acao 'status'. Link: ${linkRifa(data.chave_publica)}`,
    };
  }

  const { rifa } = await resolverRifa(sb, ctx.tenant_id, args);
  const rifaId = String(args?.rifa_id ?? "").trim() || rifa?.id;
  if (!rifaId) return { ok: false, mensagem: "Não achei a rifa. Passe o código de controle." };

  if (acao === "status") {
    const novo = String(args?.status ?? "").trim();
    if (!STATUS_RIFA.includes(novo)) {
      return { ok: false, mensagem: `Status inválido. Use: ${STATUS_RIFA.join(", ")}. (Sorteada só via sortear_rifa_agora.)` };
    }
    const { error } = await sb.from("rifas").update({ status: novo, updated_at: new Date().toISOString() })
      .eq("id", rifaId).eq("tenant_id", ctx.tenant_id);
    if (error) return { ok: false, mensagem: `Falha ao mudar status: ${error.message}` };
    const extra = novo === "ativa"
      ? " Ao ativar, os números fixos do mesmo método de sorteio foram aplicados automaticamente."
      : "";
    return { ok: true, mensagem: `Rifa agora está '${novo}'.${extra}` };
  }

  if (acao === "excluir") {
    const { error } = await sb.from("rifas").update({ deleted_at: new Date().toISOString() })
      .eq("id", rifaId).eq("tenant_id", ctx.tenant_id);
    if (error) return { ok: false, mensagem: `Falha ao excluir: ${error.message}` };
    return { ok: true, mensagem: "Rifa excluída (soft delete). Os agendamentos de disparo que apontavam pra ela foram desligados e a 'rifa do dia' voltou pra automática." };
  }

  if (acao === "atualizar") {
    // deno-lint-ignore no-explicit-any
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (args?.titulo) patch.titulo = String(args.titulo);
    if (args?.descricao !== undefined) patch.descricao = args.descricao ? String(args.descricao) : null;
    if (args?.premio_principal) patch.premio_principal = String(args.premio_principal);
    if (args?.preco_numero_centavos !== undefined) {
      const p = inteiro(args.preco_numero_centavos);
      if (!p || p <= 0) return { ok: false, mensagem: "preco_numero_centavos precisa ser inteiro maior que zero." };
      patch.preco_numero_centavos = p;
    }
    if (args?.data_sorteio_prevista !== undefined) patch.data_sorteio_prevista = args.data_sorteio_prevista ? String(args.data_sorteio_prevista) : null;
    if (args?.hora_sorteio !== undefined) patch.hora_sorteio = normalizarHoraArg(args.hora_sorteio);
    if (args?.metodo_sorteio && METODOS.includes(String(args.metodo_sorteio))) patch.metodo_sorteio = String(args.metodo_sorteio);
    if (args?.aceita_fiado !== undefined) patch.aceita_fiado = args.aceita_fiado === true;
    if (args?.max_numeros_por_pedido !== undefined) patch.max_numeros_por_pedido = inteiro(args.max_numeros_por_pedido);
    if (args?.minutos_reserva !== undefined) patch.minutos_reserva = inteiro(args.minutos_reserva);
    if (Array.isArray(args?.promocoes)) patch.promocoes = args.promocoes;
    if (Array.isArray(args?.cotas_premiadas)) patch.cotas_premiadas = args.cotas_premiadas;
    if (Array.isArray(args?.premios_extras)) patch.premios_extras = args.premios_extras;

    if (Object.keys(patch).length === 1) return { ok: false, mensagem: "Nada pra atualizar — diga o que muda (preço, título, prêmio, data, promoções…)." };

    const { error } = await sb.from("rifas").update(patch).eq("id", rifaId).eq("tenant_id", ctx.tenant_id);
    if (error) return { ok: false, mensagem: `Falha ao atualizar: ${error.message}` };
    return { ok: true, mensagem: `Rifa atualizada: ${Object.keys(patch).filter((k) => k !== "updated_at").join(", ")}.` };
  }

  return { ok: false, mensagem: "Ação inválida. Use: criar, atualizar, status ou excluir." };
};

// ═════════════════ gerenciar_numeros_fixos_rifa ═════════════════════
const gerenciar_numeros_fixos_rifa: HandlerRifa = async (sb, ctx, args) => {
  const acao = String(args?.acao ?? "listar").trim();
  const metodo = String(args?.metodo_sorteio ?? "loteria_federal").trim();

  if (acao === "listar") {
    const { data, error } = await sb.from("rifa_numeros_fixos")
      .select("id, numero, nome, phone, metodo_sorteio")
      .eq("tenant_id", ctx.tenant_id).eq("metodo_sorteio", metodo).order("numero");
    if (error) return { ok: false, mensagem: `Falha ao listar fixos: ${error.message}` };
    if (!data?.length) return { ok: true, dados: [], mensagem: `Nenhum número fixo cadastrado pro método ${metodo}.` };
    return {
      ok: true, dados: data,
      mensagem: `Números fixos (${metodo}): ${data.map((f) => `${f.numero} = ${f.nome}${f.phone ? ` (${f.phone})` : " (sem telefone)"}`).join(" · ")}.`,
    };
  }

  if (acao === "adicionar") {
    const nome = String(args?.nome ?? "").trim();
    const numeros: number[] = (Array.isArray(args?.numeros) ? args.numeros : [args?.numero])
      .map(inteiro)
      .filter((n: number | null): n is number => n !== null && n >= 0);
    if (!nome || numeros.length === 0) return { ok: false, mensagem: "Pra cadastrar fixo preciso do nome e do(s) número(s)." };

    const linhas = numeros.map((numero: number) => ({
      tenant_id: ctx.tenant_id, metodo_sorteio: metodo, numero, nome,
      phone: args?.telefone ? String(args.telefone) : null,
    }));
    const { error } = await sb.from("rifa_numeros_fixos")
      .upsert(linhas, { onConflict: "tenant_id,metodo_sorteio,numero" });
    if (error) return { ok: false, mensagem: `Falha ao cadastrar fixo: ${error.message}` };

    // (2026-09-10) Fixo cadastrado numa rifa JÁ ativa não pode esperar a próxima
    // ativação pra valer — o gatilho `fn_rifa_ativada_aplica_fixos` só roda na
    // transição pra 'ativa'. Sem isto o painel mostrava o número como livre (e o
    // dono achava que "fixar" não tinha feito nada) até alguém rodar a ação
    // "sincronizar" manualmente. `vender_numeros_rifa` já lia `rifa_numeros_fixos`
    // direto pra não vender o número de ninguém, mas isso escondia o problema.
    const { data: rifasAtivas } = await sb.from("rifas")
      .select("id")
      .eq("tenant_id", ctx.tenant_id).eq("metodo_sorteio", metodo)
      .eq("status", "ativa").is("deleted_at", null);
    let sincronizadas = 0;
    for (const r of rifasAtivas ?? []) {
      const { error: erroSync } = await sb.rpc("sincronizar_numeros_fixos_rifa", { p_rifa: r.id });
      if (!erroSync) sincronizadas++;
    }

    const obsAtivas = (rifasAtivas?.length ?? 0) > 0
      ? ` Já aplicado em ${sincronizadas}/${rifasAtivas!.length} rifa(s) ativa(s) desse método.`
      : "";
    return {
      ok: true,
      mensagem: `Número(s) ${numeros.join(", ")} fixados pra ${nome} no método ${metodo}. Valem em toda rifa desse método — aplicados automaticamente ao ativar uma nova.${obsAtivas}`,
    };
  }

  if (acao === "remover") {
    const numero = inteiro(args?.numero);
    if (numero === null) return { ok: false, mensagem: "Informe o número a remover." };
    const { error } = await sb.from("rifa_numeros_fixos").delete()
      .eq("tenant_id", ctx.tenant_id).eq("metodo_sorteio", metodo).eq("numero", numero);
    if (error) return { ok: false, mensagem: `Falha ao remover: ${error.message}` };
    return { ok: true, mensagem: `Número fixo ${numero} removido do método ${metodo}. Pedidos já criados em rifas ativas continuam — remova pela grade se precisar.` };
  }

  if (acao === "sincronizar") {
    const { rifa } = await resolverRifa(sb, ctx.tenant_id, args);
    const rifaId = String(args?.rifa_id ?? "").trim() || rifa?.id;
    if (!rifaId) return { ok: false, mensagem: "Não achei a rifa pra sincronizar." };
    const { data, error } = await sb.rpc("sincronizar_numeros_fixos_rifa", { p_rifa: rifaId });
    if (error) return { ok: false, mensagem: `Falha ao sincronizar: ${error.message}` };
    return { ok: true, dados: data, mensagem: `Números fixos sincronizados na rifa: ${JSON.stringify(data)}.` };
  }

  return { ok: false, mensagem: "Ação inválida. Use: listar, adicionar, remover ou sincronizar." };
};

// ═══════════════════════ gerenciar_dividas_rifa ═════════════════════
const gerenciar_dividas_rifa: HandlerRifa = async (sb, ctx, args) => {
  const acao = String(args?.acao ?? "listar").trim();

  if (acao === "listar") {
    let q = sb.from("rifa_dividas")
      .select("id, numero, nome, phone, valor_centavos, origem, pago, sorteio_em, rifas(titulo)")
      .eq("tenant_id", ctx.tenant_id).order("sorteio_em", { ascending: false }).limit(100);
    if (args?.somente_abertas !== false) q = q.eq("pago", false);
    if (args?.telefone) q = q.eq("phone", soDigitos(String(args.telefone)));

    const { data, error } = await q;
    if (error) return { ok: false, mensagem: `Falha ao listar dívidas: ${error.message}` };
    if (!data?.length) return { ok: true, dados: [], mensagem: "Nenhuma dívida encontrada com esse filtro." };

    const total = data.reduce((s, d) => s + Number(d.valor_centavos ?? 0), 0);
    // Agrupa por pessoa — é assim que o dono cobra (a aba Dívidas faz igual).
    const porPessoa = new Map<string, { nome: string; qtd: number; total: number; phone: string | null }>();
    for (const d of data) {
      const chave = d.phone || `nome:${d.nome}`;
      const p = porPessoa.get(chave) ?? { nome: d.nome, qtd: 0, total: 0, phone: d.phone };
      p.qtd++; p.total += Number(d.valor_centavos ?? 0);
      porPessoa.set(chave, p);
    }
    const linhas = [...porPessoa.values()]
      .sort((a, b) => b.total - a.total).slice(0, 15)
      .map((p) => `${p.nome}${p.phone ? ` (${p.phone})` : ""}: ${p.qtd} nº = ${fmtCentavos(p.total)}`);

    return { ok: true, dados: data, mensagem: `${data.length} dívida(s), ${fmtCentavos(total)} no total. Por pessoa: ${linhas.join(" · ")}.` };
  }

  const dividaId = String(args?.divida_id ?? "").trim();
  if (!dividaId) return { ok: false, mensagem: "Informe o divida_id (vem na listagem)." };

  if (acao === "marcar_paga" || acao === "reabrir") {
    const { error } = await sb.from("rifa_dividas").update({ pago: acao === "marcar_paga" })
      .eq("id", dividaId).eq("tenant_id", ctx.tenant_id);
    if (error) return { ok: false, mensagem: `Falha: ${error.message}` };
    return { ok: true, mensagem: acao === "marcar_paga" ? "Dívida marcada como paga." : "Dívida reaberta." };
  }

  if (acao === "ajustar_valor") {
    const valor = inteiro(args?.valor_centavos);
    if (valor === null || valor < 0) return { ok: false, mensagem: "valor_centavos precisa ser inteiro ≥ 0." };
    const { error } = await sb.from("rifa_dividas").update({ valor_centavos: valor })
      .eq("id", dividaId).eq("tenant_id", ctx.tenant_id);
    if (error) return { ok: false, mensagem: `Falha: ${error.message}` };
    return { ok: true, mensagem: `Dívida ajustada pra ${fmtCentavos(valor)}.` };
  }

  if (acao === "excluir") {
    const { error } = await sb.from("rifa_dividas").delete().eq("id", dividaId).eq("tenant_id", ctx.tenant_id);
    if (error) return { ok: false, mensagem: `Falha: ${error.message}` };
    return { ok: true, mensagem: "Dívida excluída." };
  }

  return { ok: false, mensagem: "Ação inválida. Use: listar, marcar_paga, reabrir, ajustar_valor ou excluir." };
};

// ═══════════════════════ configurar_rifas ═══════════════════════════
const configurar_rifas: HandlerRifa = async (sb, ctx, args) => {
  if (args?.acao === "ver" || !args?.acao) {
    const { data } = await sb.from("rifas_config_tenant")
      .select("agente_pode_vender, chave_pix, postar_status_ativo, bom_dia_rifa_ativo, rifa_disparo_id")
      .eq("tenant_id", ctx.tenant_id).maybeSingle();
    const { data: perfil } = await sb.from("profiles").select("chave_pix").eq("id", ctx.tenant_id).maybeSingle();
    const pix = data?.chave_pix || perfil?.chave_pix || null;
    return {
      ok: true, dados: data ?? {},
      mensagem: `Config do app Rifas: agente pode vender = ${data?.agente_pode_vender ?? true} · chave PIX = ${pix ?? "NÃO CONFIGURADA (venda sai sem PIX!)"} · posta cartela no Status = ${data?.postar_status_ativo ?? false} · ritual bom-dia = ${data?.bom_dia_rifa_ativo ?? false} · rifa do disparo = ${data?.rifa_disparo_id ?? "automática (ativa mais recente)"}.`,
    };
  }

  // deno-lint-ignore no-explicit-any
  const patch: Record<string, any> = { tenant_id: ctx.tenant_id, updated_at: new Date().toISOString() };
  if (args?.chave_pix !== undefined) patch.chave_pix = args.chave_pix ? String(args.chave_pix) : null;
  if (args?.agente_pode_vender !== undefined) patch.agente_pode_vender = args.agente_pode_vender === true;
  if (args?.postar_status_ativo !== undefined) patch.postar_status_ativo = args.postar_status_ativo === true;
  if (args?.bom_dia_rifa_ativo !== undefined) patch.bom_dia_rifa_ativo = args.bom_dia_rifa_ativo === true;
  if (args?.rifa_disparo_id !== undefined) patch.rifa_disparo_id = args.rifa_disparo_id ? String(args.rifa_disparo_id) : null;
  if (args?.bom_dia_mensagem_saudacao !== undefined) patch.bom_dia_mensagem_saudacao = args.bom_dia_mensagem_saudacao ? String(args.bom_dia_mensagem_saudacao) : null;
  if (args?.bom_dia_mensagem_followup !== undefined) patch.bom_dia_mensagem_followup = args.bom_dia_mensagem_followup ? String(args.bom_dia_mensagem_followup) : null;

  if (Object.keys(patch).length === 2) return { ok: false, mensagem: "Nada pra configurar — diga o que muda (PIX, Status, bom-dia, rifa do disparo…)." };

  const { error } = await sb.from("rifas_config_tenant").upsert(patch, { onConflict: "tenant_id" });
  if (error) return { ok: false, mensagem: `Falha ao salvar config: ${error.message}` };
  return { ok: true, mensagem: `Config salva: ${Object.keys(patch).filter((k) => !["tenant_id", "updated_at"].includes(k)).join(", ")}.` };
};

// ═══════════════════════ gerenciar_disparo_rifa ═════════════════════
const gerenciar_disparo_rifa: HandlerRifa = async (sb, ctx, args) => {
  const acao = String(args?.acao ?? "ver").trim();

  if (acao === "ver") {
    const [ags, contatos, envios] = await Promise.all([
      sb.from("rifa_agendamentos_disparo")
        .select("id, horario, tipo_conteudo, ativo, mensagem, limite_diario, ultima_execucao_dia, rifa_id")
        .eq("tenant_id", ctx.tenant_id).order("horario"),
      sb.from("rifa_lista_disparo").select("id", { count: "exact", head: true })
        .eq("tenant_id", ctx.tenant_id).eq("marcado", true),
      sb.from("rifa_disparo_envios").select("status")
        .eq("tenant_id", ctx.tenant_id).gte("criado_em", new Date(Date.now() - 86400000).toISOString()),
    ]);

    // deno-lint-ignore no-explicit-any
    const lista = (ags.data ?? []) as any[];
    // deno-lint-ignore no-explicit-any
    const env = (envios.data ?? []) as any[];
    const ok = env.filter((e) => e.status === "enviado").length;

    return {
      ok: true,
      dados: { agendamentos: lista, contatos_marcados: contatos.count ?? 0 },
      mensagem: [
        `Lista de disparo: ${contatos.count ?? 0} contato(s) marcado(s).`,
        lista.length
          ? `Agendamentos: ${lista.map((a) => `${String(a.horario).slice(0, 5)} ${a.tipo_conteudo} [${a.ativo ? "ligado" : "desligado"}]${a.ultima_execucao_dia ? ` (rodou ${a.ultima_execucao_dia})` : ""}`).join(" · ")}.`
          : "Nenhum agendamento de disparo cadastrado.",
        `Últimas 24h: ${ok} enviado(s) de ${env.length} tentativa(s).`,
      ].join(" "),
    };
  }

  const id = String(args?.agendamento_id ?? "").trim();

  if (acao === "ligar" || acao === "desligar") {
    if (!id) return { ok: false, mensagem: "Informe o agendamento_id (vem no 'ver')." };
    const { error } = await sb.from("rifa_agendamentos_disparo")
      .update({ ativo: acao === "ligar", atualizado_em: new Date().toISOString() })
      .eq("id", id).eq("tenant_id", ctx.tenant_id);
    if (error) return { ok: false, mensagem: `Falha: ${error.message}` };
    return { ok: true, mensagem: `Agendamento ${acao === "ligar" ? "ligado" : "desligado"}.` };
  }

  if (acao === "criar") {
    const horario = String(args?.horario ?? "").trim();
    if (!/^\d{2}:\d{2}$/.test(horario)) return { ok: false, mensagem: "Informe o horário no formato HH:MM (horário de Brasília)." };
    const tipo = ["texto", "foto", "video", "foto_texto"].includes(String(args?.tipo_conteudo)) ? String(args.tipo_conteudo) : "texto";
    const { rifa } = await resolverRifa(sb, ctx.tenant_id, args);

    const { data, error } = await sb.from("rifa_agendamentos_disparo").insert({
      tenant_id: ctx.tenant_id,
      rifa_id: String(args?.rifa_id ?? "").trim() || rifa?.id || null,
      horario, tipo_conteudo: tipo,
      mensagem: args?.mensagem ? String(args.mensagem) : null,
      ativo: args?.ativo !== false,
      limite_diario: inteiro(args?.limite_diario),
    }).select("id, horario").single();
    if (error) return { ok: false, mensagem: `Falha ao criar agendamento: ${error.message}` };
    return { ok: true, dados: data, mensagem: `Disparo agendado pras ${String(data.horario).slice(0, 5)} (BRT). Ele vai pros contatos marcados na lista de disparo.` };
  }

  if (acao === "excluir") {
    if (!id) return { ok: false, mensagem: "Informe o agendamento_id." };
    const { error } = await sb.from("rifa_agendamentos_disparo").delete()
      .eq("id", id).eq("tenant_id", ctx.tenant_id);
    if (error) return { ok: false, mensagem: `Falha: ${error.message}` };
    return { ok: true, mensagem: "Agendamento de disparo excluído." };
  }

  return { ok: false, mensagem: "Ação inválida. Use: ver, criar, ligar, desligar ou excluir." };
};

// ═════════════════════ anunciar_resultado_rifa ══════════════════════
// Chama a edge que já existe (posta no Status + avisa comprador pago). Ela
// resolve o tenant pelo JWT do dono OU, desde 2026-09-06, pelo par
// service_role + tenant_id no corpo — que é o caminho do agente.
const anunciar_resultado_rifa: HandlerRifa = async (sb, ctx, args) => {
  const { rifa } = await resolverRifa(sb, ctx.tenant_id, args);
  const rifaId = String(args?.rifa_id ?? "").trim() || rifa?.id;
  if (!rifaId) return { ok: false, mensagem: "Não achei a rifa. Passe o código de controle." };

  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/anunciar-resultado-rifa`;
  const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      rifa_id: rifaId,
      tenant_id: ctx.tenant_id,
      postar_status: args?.postar_status !== false,
      avisar_compradores: args?.avisar_compradores !== false,
    }),
  });
  const corpo = await resp.json().catch(() => ({}));
  if (!resp.ok || corpo?.ok === false) {
    return { ok: false, mensagem: `Falha ao anunciar: ${corpo?.erro ?? resp.status}` };
  }
  return {
    ok: true, dados: corpo,
    mensagem: `Resultado divulgado. ${corpo?.status_postado ? "Postado no Status. " : ""}${corpo?.avisados ? `${corpo.avisados} comprador(es) avisado(s).` : ""}`,
  };
};

/** Pacote de poder — SÓ canal interno (Mentor/dono). */
export const HANDLERS_RIFA_ADMIN: Record<string, HandlerRifa> = {
  painel_rifa,
  listar_rifas,
  dossie_cliente_rifa,
  decidir_pedido_rifa,
  sortear_rifa_agora,
  gerenciar_rifa,
  gerenciar_numeros_fixos_rifa,
  gerenciar_dividas_rifa,
  configurar_rifas,
  gerenciar_disparo_rifa,
  anunciar_resultado_rifa,
};

export const TOOLS_RIFA_ADMIN = Object.keys(HANDLERS_RIFA_ADMIN);
