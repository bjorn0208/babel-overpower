// Handlers internos compartilhados entre edge functions (Onda 5 fatia 2).
// Espelha api/_lib/tools/index.ts em runtime Deno.
// Mantém uma única fonte de comportamento — refatorar aqui implica refatorar lá.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { calcularExecutarEmBRT, diaBRT, inicioJanelaBRTMs } from "./tempo-brt.ts";
import { HANDLERS_RIFA_VENDA } from "./tools-rifas.ts";
import { HANDLERS_RIFA_ADMIN } from "./tools-rifas-admin.ts";
import { carregarChavesPixTenant } from "./chaves-pix-tenant.ts";
import { fireAndForget } from "./fire-and-forget.ts";

export interface CtxFerramenta {
  tenant_id: string;
  conversa_id: string;
  telefone?: string | null;
  lead_id?: string | null;
  agente_id?: string | null;
  cargo_ativo?: string | null;
}
export interface ResultadoFerramenta {
  ok: boolean;
  // deno-lint-ignore no-explicit-any
  dados?: any;
  mensagem?: string;
  /**
   * Recusa que MESMO ASSIM traz dado lido do banco (2026-09-07, conversa 3d20e9cb).
   *
   * O motor só entrega ao Gate B1 as tools com `ok:true` — recusa não tem dado, e deixar
   * o modelo narrar em cima de uma falha é como nasceu o "[Link do Contrato]". Só que
   * `vender_numeros_rifa` recusando por falta de telefone AINDA sabe quais números estão
   * livres: o turno morria sem fonte nenhuma, o B1 reprovava a resposta certa e o lead
   * levava "vou confirmar e já te retorno" — a resposta real só chegava no turno seguinte.
   *
   * Com esta marca a tool declara "recusei a AÇÃO, mas o que está em `dados`/`mensagem`
   * eu li do banco agora" e o B1 passa a aceitar isso como fonte primária. Opt-in: quem
   * não marca segue fora, então nenhuma tool existente muda de comportamento.
   */
  fonte_confiavel?: boolean;
}
// deno-lint-ignore no-explicit-any
type Handler = (sb: SupabaseClient, ctx: CtxFerramenta, args: any) => Promise<ResultadoFerramenta>;

// Base pública do front pros links que vão pro cliente final.
// DOIS canônicos (cravado por Theus em 2026-09-03):
//   • CONTRATO  → Babel  (`CONTRATO_PUBLIC_URL`, default https://www.babel-os.com)
//   • O RESTO   → Plataforma Limpa (`APP_PUBLIC_URL`) — rifa, consulta, sala, agendar
// Antes era uma env só pra tudo, e por isso em 2026-08-04 alguém mexeu nela e 701
// links de contrato saíram com o domínio errado até 2026-09-03. Separadas, mexer
// numa marca não move a outra. Os dois domínios são alias do MESMO projeto Vercel,
// então a escolha é de marca, não de roteamento — mas precisa ser ESTÁVEL: o link
// de contrato já está no WhatsApp de centenas de clientes que voltam por ele.
// NÃO usar URL de preview/.vercel.app em nenhuma das duas (muro de login).
const APP_PUBLIC_URL = (Deno.env.get("APP_PUBLIC_URL") ?? "https://www.plataformalimpa.com.br").replace(/\/+$/, "");
const CONTRATO_PUBLIC_URL = (Deno.env.get("CONTRATO_PUBLIC_URL") ?? "https://www.babel-os.com").replace(/\/+$/, "");
function linkContrato(chave: string): string {
  return `${CONTRATO_PUBLIC_URL}/contrato/${chave}`;
}

function linkConsulta(chave: string): string {
  return `${APP_PUBLIC_URL}/consulta/${chave}`;
}

// `linkRifa` mudou de casa em 2026-09-06 → `tools-rifas.ts` (exportado de lá).


const transferir_humano: Handler = async (sb, ctx, args) => {
  const motivo = String(args?.motivo ?? "solicitação do usuário");
  // Redirecionamento (2026-09-18, Contato Babel): o agente com
  // `configuracao.redirecionamento = { ativo, texto }` NÃO passa a conversa pro humano daqui —
  // manda o lead pro número do responsável. O motor entrega `texto` LITERAL e encerra o turno
  // (o número no fim vira link no WhatsApp); a conversa segue com o agente ligado.
  if (ctx.agente_id) {
    const { data: ag } = await sb.from("agentes").select("configuracao").eq("id", ctx.agente_id).maybeSingle();
    const redir = (ag?.configuracao as Record<string, unknown> | null)?.redirecionamento as
      { ativo?: boolean; texto?: string } | undefined;
    const texto = redir?.ativo === true ? String(redir.texto ?? "").trim() : "";
    if (texto) {
      await sb.from("tickets_conversa").insert({
        tenant_id: ctx.tenant_id,
        conversation_id: ctx.conversa_id,
        origem: `redirecionamento:${motivo}`.slice(0, 200),
      });
      return {
        ok: true,
        mensagem: "Mensagem de redirecionamento com o número do responsável enviada ao lead.",
        dados: { redirecionamento_texto: texto },
      };
    }
  }
  await sb.from("conversas").update({ agent_enabled: false, status: "humano" }).eq("id", ctx.conversa_id);
  if (ctx.lead_id) await sb.from("leads").update({ precisa_humano: true }).eq("id", ctx.lead_id);
  await sb.from("tickets_conversa").insert({
    tenant_id: ctx.tenant_id,
    conversation_id: ctx.conversa_id,
    origem: `transferir_humano:${motivo}`.slice(0, 200),
  });
  return { ok: true, mensagem: `Conversa transferida para humano (${motivo}).` };
};

const escalar_supervisor: Handler = async (sb, ctx, args) => {
  const motivo = String(args?.motivo ?? "escalonamento solicitado");
  await sb.from("tickets_conversa").insert({
    tenant_id: ctx.tenant_id,
    conversation_id: ctx.conversa_id,
    origem: `supervisor:${motivo}`.slice(0, 200),
  });
  return { ok: true, mensagem: `Caso escalado ao supervisor (${motivo}).` };
};

/**
 * F3c (2026-06-11): garantia determinística pré-geração de contrato.
 * LLM pula buscar_produto/gerenciar_carrinho → contrato cai no fallback do molde e o
 * link abre SEM as opções de parcelamento do produto (smoke do tenant Renan).
 * Carrinho vazio + tenant com EXATAMENTE 1 produto ativo com preço → auto-adiciona;
 * vários produtos → devolve mensagem de recusa (fail-closed do F1); 0 → segue legado.
 * Retorna null quando pode gerar, ou a mensagem de erro pro LLM se autocorrigir.
 */
// deno-lint-ignore no-explicit-any
async function garantirCarrinhoAbastecido(sb: any, ctx: CtxFerramenta): Promise<string | null> {
  const { count } = await sb
    .from("carrinho_da_conversa")
    .select("id", { count: "exact", head: true })
    .eq("conversa_id", ctx.conversa_id);
  if (count && count > 0) return null;

  const { data: produtosAtivos } = await sb
    .from("produtos")
    .select("id, nome, preco_centavos")
    .eq("user_id", ctx.tenant_id)
    .eq("ativo", true)
    .not("preco_centavos", "is", null)
    .limit(5);
  if (!produtosAtivos || produtosAtivos.length === 0) return null; // legado: fallback do molde (telemetria registra)
  if (produtosAtivos.length === 1) {
    const p = produtosAtivos[0];
    await sb.from("carrinho_da_conversa").insert({
      conversa_id: ctx.conversa_id,
      produto_id: p.id,
      quantidade: 1,
      preco_unitario: Number(p.preco_centavos) / 100,
    });
    console.info(`[contrato] carrinho vazio — produto único "${p.nome}" auto-adicionado (conversa=${ctx.conversa_id})`);
    return null;
  }
  return `O carrinho está vazio e este vendedor tem ${produtosAtivos.length} produtos. ANTES de gerar o contrato: chame buscar_produto com o nome do que o lead fechou e depois gerenciar_carrinho pra adicionar. Produtos: ${produtosAtivos.map((q: { nome: string }) => q.nome).join(", ")}.`;
}

/**
 * Produto que não se vende por contrato (2026-09-07, pedido HS): o tenant marca
 * `produtos.metadata.sem_contrato = true` e o agente para de oferecer/gerar contrato pra ele.
 *
 * Serve pra serviço de balcão — consulta, auditoria, item avulso — onde o fechamento é
 * pagamento direto e o cadastro vem depois. É dado do tenant, não regra de nicho: qualquer
 * tenant marca o que quiser sem tocar em código.
 *
 * Só recusa quando o carrinho é INTEIRO de produto assim. Carrinho misto (uma consulta junto
 * de um serviço que tem contrato) segue gerando normalmente — senão a trava mataria a venda boa.
 * Retorna null quando pode gerar, ou a mensagem que ensina o caminho certo ao LLM.
 */
// deno-lint-ignore no-explicit-any
async function recusaProdutoSemContrato(sb: any, ctx: CtxFerramenta): Promise<string | null> {
  const { data: itens } = await sb
    .from("carrinho_da_conversa")
    .select("produto_id")
    .eq("conversa_id", ctx.conversa_id);
  const ids = ((itens ?? []) as { produto_id: string | null }[])
    .map((i) => i.produto_id).filter((x): x is string => Boolean(x));
  if (ids.length === 0) return null;

  const { data: prods } = await sb
    .from("produtos")
    .select("id, nome, metadata")
    .in("id", ids);
  const lista = ((prods ?? []) as { id: string; nome: string; metadata: Record<string, unknown> | null }[]);
  if (lista.length === 0) return null;

  const semContrato = lista.filter((p) => p.metadata?.sem_contrato === true);
  if (semContrato.length !== lista.length) return null; // carrinho misto: deixa passar

  const nomes = semContrato.map((p) => p.nome).join(", ");
  console.info(`[contrato] recusado — carrinho só tem produto sem_contrato: ${nomes} (conversa=${ctx.conversa_id})`);
  // 2026-09-11 (Easy/Naty): a recusa mandava "informe a forma de pagamento do tenant" sem dizer
  // QUAL — e o modelo inventou "[Chave PIX: 12.345.678/0001-99]". Agora a chave cadastrada vai
  // junto, literal, pra ele copiar em vez de criar.
  const pix = await carregarChavesPixTenant(sb, ctx.tenant_id);
  const linhaPix = pix.exibicao
    ? `A forma de pagamento é PIX. Chave PIX cadastrada (copie EXATAMENTE, nunca invente outra): ${pix.exibicao}` +
      (pix.titular ? ` — titular: ${pix.titular}.` : ".")
    : `O tenant NÃO tem chave PIX cadastrada: não invente chave nenhuma — diga que a equipe vai enviar os dados de pagamento e encaminhe pro humano.`;
  return `Este produto não usa contrato: ${nomes}. NÃO gere nem envie link de contrato, e não diga que vai mandar contrato. ` +
    `O fechamento é direto: ${linhaPix} Espere o comprovante e CONFIRME o pagamento; ` +
    `só depois colete os dados do cliente e chame converter_lead_em_cliente pra cadastrar. Se o lead pedir contrato, explique que ` +
    `para este serviço não há contrato a assinar.`;
}

/**
 * Achado em varredura 2026-08-29 (bug 2): a tool `gerar_contrato` aceita `dados_cliente` como
 * objeto livre (schema_zod não restringe chaves) — o LLM já inventou `nome_contratante`/
 * `cpf_contratante` em vez dos slugs canônicos do molde (`nome_completo`/`cpf`), e como
 * `hidratarCampos()` faz lookup exato por chave, o token `{{nome_completo}}` fica cru no PDF.
 * Normaliza contra `campos_cliente` do molde ANTES de gravar: casa exato, depois por sufixo
 * comum (_contratante/_cliente/_lead) removido; o que não bate é descartado (log) em vez de
 * virar chave órfã que nunca hidrata nada.
 */
// deno-lint-ignore no-explicit-any
async function normalizarDadosCliente(
  sb: any,
  tenantId: string | null | undefined,
  templateId: string | null | undefined,
  dadosBrutos: Record<string, unknown> | null | undefined,
): Promise<Record<string, unknown>> {
  if (!dadosBrutos || Object.keys(dadosBrutos).length === 0) return {};
  let query = sb.from("contratos_template").select("campos_cliente").eq("user_id", tenantId).eq("ativo", true);
  query = templateId ? query.eq("id", templateId) : query;
  const { data: molde } = await query.maybeSingle();
  // deno-lint-ignore no-explicit-any
  const slugsCanonicos: string[] = Array.isArray(molde?.campos_cliente)
    ? (molde.campos_cliente as any[]).map((c) => String(c?.slug ?? "")).filter(Boolean)
    : [];
  if (slugsCanonicos.length === 0) return dadosBrutos; // sem molde resolvido — não dá pra normalizar, segue como veio

  const sufixos = ["_contratante", "_do_contratante", "_cliente", "_do_cliente", "_lead"];
  const normalizado: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(dadosBrutos)) {
    if (slugsCanonicos.includes(chave)) { normalizado[chave] = valor; continue; }
    const semSufixo = sufixos.reduce((acc, suf) => acc.endsWith(suf) ? acc.slice(0, -suf.length) : acc, chave);
    const alvo = slugsCanonicos.find((s) => s === semSufixo);
    if (alvo) { normalizado[alvo] = valor; continue; }
    console.warn(`[gerar_contrato] dados_cliente.${chave} descartado — não bate com nenhum slug do molde (${slugsCanonicos.join(", ")})`);
  }
  return normalizado;
}

/**
 * Achado em varredura 2026-08-29: nenhum gate impedia gerar contrato novo pra lead que já
 * converteu antes (12 casos reais no banco — lead sumiu pós-venda, reengajou em conversa nova,
 * agente vendeu de novo do zero). `enviar_link_contrato` só evitava duplicar DENTRO da mesma
 * conversa. `converted_at` é gravado 1x pelo trigger `tg_contratos_marcar_convertido` e nunca
 * é limpo — é o sinal permanente de "esse lead já fechou alguma vez".
 * Retorna null quando pode gerar, ou a mensagem de recusa pro LLM se autocorrigir.
 */
// deno-lint-ignore no-explicit-any
async function recusaSeLeadJaConvertido(sb: any, ctx: CtxFerramenta): Promise<string | null> {
  if (!ctx.lead_id) return null;
  const { data: lead } = await sb.from("leads").select("converted_at").eq("id", ctx.lead_id).maybeSingle();
  if (!lead?.converted_at) return null;
  return `Esse lead já converteu em ${lead.converted_at} — não gere contrato novo automaticamente. Se ele quer contratar de novo (produto adicional, renovação), confirme com o humano/supervisor antes (enviar_para_financeiro ou escalar_supervisor).`;
}

/**
 * Trava de preço (2026-08-30, caso Malu): contrato só nasce depois que o valor do carrinho
 * foi dito na conversa pelo lado do agente. O LLM lia o "sim" ao produto como aceite e emitia
 * contrato sem nunca falar o valor (7 de 12 contratos do dia). Procura os dígitos do preço
 * (unitário e total; 1197 também como 1.197) nas `mensagens` (role human/assistant) e na fila
 * `caixa_saida_mensagens` da conversa — cobre bolha do mesmo turno ainda não entregue.
 * Carrinho vazio ou sem preço resolvível → segue (fail-open, fallback do molde como hoje).
 * Retorna null quando pode gerar, ou a recusa pro LLM se autocorrigir.
 */
// deno-lint-ignore no-explicit-any
async function recusaSemPrecoNaConversa(sb: any, ctx: CtxFerramenta): Promise<string | null> {
  if (!ctx.conversa_id) return null;
  const { data: itens } = await sb
    .from("carrinho_da_conversa")
    .select("produto_id, preco_unitario, quantidade")
    .eq("conversa_id", ctx.conversa_id);
  if (!itens || itens.length === 0) return null;

  let total = 0;
  const valores = new Set<number>();
  for (const i of itens as Array<{ preco_unitario: unknown; quantidade: unknown }>) {
    const unit = Number(i.preco_unitario ?? 0);
    total += unit * Number(i.quantidade ?? 1);
    if (unit > 0) valores.add(Math.trunc(unit));
  }
  if (total > 0) valores.add(Math.trunc(total));
  // Opções nomeadas (2026-09-18, Fina/Giovanna, conversa 656a4a8a): produto com
  // `opcoes_pagamento` fecha por uma das opções (Exclusão: 1.920 à vista, 2.240 cartão…),
  // nunca pelo preço de tabela (3.200). A trava só aceitava o 3.200 — o lead fechou à vista
  // em 1.920, a agente tentou o contrato e foi barrada até o fim. Qualquer total, entrada ou
  // parcela de opção cadastrada dito na conversa agora conta como "valor informado".
  const idsProduto = [...new Set((itens as Array<{ produto_id: unknown }>).map((i) => i.produto_id).filter(Boolean))];
  if (idsProduto.length > 0) {
    const { data: prods } = await sb.from("produtos").select("opcoes_pagamento").in("id", idsProduto);
    for (const p of (prods ?? []) as Array<{ opcoes_pagamento: unknown }>) {
      const opcoes = Array.isArray(p.opcoes_pagamento) ? p.opcoes_pagamento : [];
      for (const o of opcoes as Array<Record<string, unknown>>) {
        for (const campo of ["total_centavos", "entrada_centavos", "valor_parcela_centavos"]) {
          const reais = Math.trunc(Number(o?.[campo] ?? 0) / 100);
          if (reais > 0) valores.add(reais);
        }
      }
    }
  }
  if (valores.size === 0) return null;

  const variantes = new Set<string>();
  for (const v of valores) {
    const cru = String(v);
    variantes.add(cru);
    if (cru.length > 3) variantes.add(`${cru.slice(0, -3)}.${cru.slice(-3)}`);
  }
  const filtroOr = [...variantes].map((p) => `content.ilike.%${p}%`).join(",");

  const { data: ditas } = await sb
    .from("mensagens")
    .select("id")
    .eq("conversation_id", ctx.conversa_id)
    .in("role", ["human", "assistant"])
    .or(filtroOr)
    .limit(1);
  if (ditas && ditas.length > 0) return null;

  const { data: fila } = await sb
    .from("caixa_saida_mensagens")
    .select("id")
    .eq("conversation_id", ctx.conversa_id)
    .or(filtroOr)
    .limit(1);
  if (fila && fila.length > 0) return null;

  const valorFmt = total > 0 ? total.toFixed(2).replace(".", ",") : String([...valores][0]);
  console.info(`[contrato] trava de preço acionada — R$ ${valorFmt} nunca dito (conversa=${ctx.conversa_id})`);
  return `TRAVA DE PREÇO: o valor do carrinho (R$ ${valorFmt}) ainda não foi informado nesta conversa. ANTES de gerar ou enviar contrato: diga o valor exato ao lead, espere ele concordar com o valor, e só então chame a ferramenta de contrato de novo.`;
}

const enviar_link_contrato: Handler = async (sb, ctx, args) => {
  // Trava também no caminho de REUSO (contrato_id explícito ou contrato antigo da conversa):
  // sem isto, um contrato criado antes de o produto virar `sem_contrato` continuaria sendo reenviado.
  const recusaSemContratoTopo = await recusaProdutoSemContrato(sb, ctx);
  if (recusaSemContratoTopo) return { ok: false, mensagem: recusaSemContratoTopo };

  const canal = (args?.canal ?? "whatsapp") as "whatsapp" | "email";
  let contratoId = args?.contrato_id as string | undefined;
  let chave: string | undefined;
  if (contratoId) {
    const { data: c } = await sb.from("contratos").select("chave_publica, status")
      .eq("id", contratoId).eq("tenant_id", ctx.tenant_id).maybeSingle();
    if (c?.status === "assinado") {
      return { ok: false, mensagem: "Esse contrato já foi assinado — não reenvie o link de assinatura. Se o lead quer contratar de novo, gere um contrato novo (gerar_contrato)." };
    }
    chave = c?.chave_publica as string | undefined;
  } else {
    // Achado 2026-08-29: reusava o contrato mais recente da conversa SEM checar
    // status — reenviava link de contrato JÁ ASSINADO (e pago) pro lead assinar
    // de novo. `neq("status","assinado")` faz cair no branch de geração abaixo,
    // que por sua vez é barrado por recusaSeLeadJaConvertido se o lead já converteu.
    const { data } = await sb.from("contratos").select("id, chave_publica")
      .eq("tenant_id", ctx.tenant_id).eq("conversa_id", ctx.conversa_id)
      .neq("status", "assinado")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data) { contratoId = data.id as string; chave = data.chave_publica as string; }
  }
  // Sem contrato ainda: gera a partir do molde do tenant + carrinho da conversa.
  if (!chave) {
    const recusaConvertido = await recusaSeLeadJaConvertido(sb, ctx);
    if (recusaConvertido) return { ok: false, mensagem: recusaConvertido };
    const recusaCarrinho = await garantirCarrinhoAbastecido(sb, ctx);
    if (recusaCarrinho) return { ok: false, mensagem: recusaCarrinho };
    const recusaSemContrato = await recusaProdutoSemContrato(sb, ctx);
    if (recusaSemContrato) return { ok: false, mensagem: recusaSemContrato };
    const recusaPreco = await recusaSemPrecoNaConversa(sb, ctx);
    if (recusaPreco) return { ok: false, mensagem: recusaPreco };
    const { data: novo, error } = await sb.rpc("gerar_contrato_do_template", {
      p_conversa_id: ctx.conversa_id,
      p_tenant_id: ctx.tenant_id,
      p_lead_id: ctx.lead_id ?? null,
      p_agente_id: ctx.agente_id ?? null,
    });
    if (error) return { ok: false, mensagem: `Não consegui gerar o contrato: ${error.message}` };
    const row = Array.isArray(novo) ? novo[0] : novo;
    if (!row?.chave_publica) return { ok: false, mensagem: "Contrato não gerado (sem chave pública)." };
    contratoId = row.contrato_id as string;
    chave = row.chave_publica as string;
  }
  const link = linkContrato(chave!);
  return { ok: true, dados: { link, canal, contrato_id: contratoId }, mensagem: `Link do contrato pro lead assinar: ${link}` };
};

// App Consulta — gera a consulta (origem=link) com a config do tenant e devolve o link pro lead.
const enviar_link_consulta: Handler = async (sb, ctx) => {
  // Fonte única do link (mesma RPC do botão do tenant). Vínculo ao lead/conversa
  // (dossiê + pós-venda) vai pela RPC; link UNIVERSAL (tipo/preço resolvem no doc).
  const { data, error } = await sb.rpc("gerar_link_consulta", {
    p_tenant_id: ctx.tenant_id,
    p_lead_id: ctx.lead_id ?? null,
    p_conversa_id: ctx.conversa_id ?? null,
    p_agente_id: ctx.agente_id ?? null,
  });
  if (error || !data?.ok) {
    return { ok: false, mensagem: `Não consegui gerar a consulta: ${error?.message ?? data?.erro ?? "erro"}` };
  }
  const link = linkConsulta(data.chave_publica as string);
  // Preço VIVO (lido do banco agora) pro agente comunicar — não vem de RAG.
  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const partes: string[] = [];
  if (data.preco_cpf != null) partes.push(`CPF ${fmt(Number(data.preco_cpf))}`);
  if (data.preco_cnpj != null) partes.push(`CNPJ ${fmt(Number(data.preco_cnpj))}`);
  const precoTxt = partes.length ? ` Valores da consulta: ${partes.join(" · ")}.` : "";
  return {
    ok: true,
    dados: { link, preco_cpf: data.preco_cpf ?? null, preco_cnpj: data.preco_cnpj ?? null },
    mensagem: `Link da consulta pro lead: ${link}.${precoTxt}`,
  };
};

// App Agenda — envia o LINK público de agendamento (decisão Theus 2026-06-11: o lead escolhe
// o horário NA PÁGINA, nunca em texto na conversa — zero margem pra erro do LLM).
const enviar_link_agenda: Handler = async (sb, ctx) => {
  if (!ctx.tenant_id) return { ok: false, mensagem: "Sem tenant no contexto." };
  const { data: cfg } = await sb.from("agenda_config_tenant")
    .select("agente_pode_agendar").eq("tenant_id", ctx.tenant_id).maybeSingle();
  if (cfg?.agente_pode_agendar !== true) {
    return { ok: false, mensagem: "Agendamento pelo agente está desativado para este tenant." };
  }
  const { data, error } = await sb.from("agendamentos_link")
    .insert({
      tenant_id: ctx.tenant_id,
      lead_id: ctx.lead_id ?? null,
      conversa_id: ctx.conversa_id ?? null,
      agente_id: ctx.agente_id ?? null,
    })
    .select("chave_publica")
    .single();
  if (error || !data?.chave_publica) {
    return { ok: false, mensagem: `Não consegui gerar o link de agendamento: ${error?.message ?? "erro"}` };
  }
  const link = `${APP_PUBLIC_URL}/agendar/${data.chave_publica}`;
  return {
    ok: true,
    dados: { link },
    mensagem: `Link de agendamento pro lead escolher o horário: ${link}`,
  };
};

// App Agenda — horários livres pro lead escolher (motor: tabela disponibilidade + RPC slots_disponiveis).
const consultar_horarios_disponiveis: Handler = async (sb, ctx, args) => {
  if (!ctx.tenant_id) return { ok: false, mensagem: "Sem tenant no contexto." };
  const { data: cfg } = await sb.from("agenda_config_tenant")
    .select("agente_pode_agendar").eq("tenant_id", ctx.tenant_id).maybeSingle();
  if (cfg?.agente_pode_agendar !== true) {
    return { ok: false, mensagem: "Agendamento pelo agente está desativado para este tenant." };
  }
  const dias = Math.min(Math.max(Number(args?.dias ?? 5), 1), 10);
  const base = args?.data && !isNaN(Date.parse(String(args.data)))
    ? new Date(String(args.data) + "T12:00:00-03:00")
    : new Date();
  const opcoes: string[] = [];
  for (let i = 0; i < dias && opcoes.length < 12; i++) {
    const d = new Date(base.getTime() + i * 86_400_000);
    const dia = d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD
    const { data: slots } = await sb.rpc("slots_disponiveis", { p_tenant_id: ctx.tenant_id, p_dia: dia });
    for (const s of (slots as Array<{ slot_inicio: string }> | null) ?? []) {
      const ini = new Date(s.slot_inicio);
      if (ini <= new Date()) continue;
      opcoes.push(ini.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) + ` (iso: ${ini.toISOString()})`);
      if (opcoes.length >= 12) break;
    }
  }
  if (!opcoes.length) {
    return { ok: true, dados: { horarios: [] }, mensagem: "Nenhum horário livre nos próximos dias — o tenant ainda não configurou a disponibilidade ou a agenda está cheia. Ofereça pedir um horário pro time confirmar." };
  }
  return { ok: true, dados: { horarios: opcoes }, mensagem: `Horários livres (ofereça 2-3 ao lead; ao agendar, use o iso do escolhido): ${opcoes.join(" · ")}` };
};

// App Agenda — agenda a reunião pro lead: sala do app Reunião + evento + compromisso + lembrete.
const agendar_reuniao_lead: Handler = async (sb, ctx, args) => {
  const inicio = String(args?.inicio ?? "");
  if (!inicio || isNaN(Date.parse(inicio))) {
    return { ok: false, mensagem: "inicio inválido — use o iso devolvido por consultar_horarios_disponiveis (ISO 8601)." };
  }
  const { data, error } = await sb.rpc("agendar_reuniao_lead", {
    p_tenant_id: ctx.tenant_id,
    p_conversa_id: ctx.conversa_id ?? null,
    p_lead_id: ctx.lead_id ?? null,
    p_agente_id: ctx.agente_id ?? null,
    p_inicio: inicio,
    p_titulo: args?.titulo ? String(args.titulo).slice(0, 120) : null,
  });
  if (error || !data?.ok) {
    const erro = error?.message ?? data?.erro ?? "erro";
    if (erro === "horario_indisponivel") {
      return { ok: false, mensagem: "Esse horário acabou de ficar indisponível. Consulte os horários livres de novo e ofereça outro." };
    }
    return { ok: false, mensagem: `Não consegui agendar a reunião: ${erro}` };
  }
  const link = `${APP_PUBLIC_URL}/sala/${data.chave_publica}`;
  const quando = new Date(String(data.inicio)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  // Bel 2026-08-25 · pós-agendamento: (a) e-mail do lead persistido; (b) o
  // diagnóstico da conversa vira dossiê da sala (o mentor entra na call já
  // sabendo tudo) + descrição do compromisso; (c) mentoria marcada CANCELA
  // follow-ups cadenciados pendentes (regra de roteamento: nunca os dois).
  // Tudo best-effort: falha aqui não pode derrubar um agendamento já gravado.
  try {
    const email = args?.email ? String(args.email).trim().slice(0, 200) : null;
    if (email && email.includes("@") && ctx.lead_id) {
      await sb.from("leads").update({ email }).eq("id", ctx.lead_id);
    }
    const diag = args?.diagnostico && typeof args.diagnostico === "object"
      ? (args.diagnostico as Record<string, unknown>)
      : null;
    if (diag && data.sala_id) {
      let nomeLead = "Lead";
      if (ctx.lead_id) {
        const { data: ld } = await sb.from("leads").select("name").eq("id", ctx.lead_id).maybeSingle();
        if (ld?.name) nomeLead = String(ld.name);
      }
      await sb.from("salas_reuniao_dossie").upsert({
        sala_id: data.sala_id,
        tenant_id: ctx.tenant_id,
        peer_id: `lead:${ctx.lead_id ?? "sem-id"}`,
        nome: nomeLead,
        dados: {
          empresa: diag.segmento ?? null,
          dor: diag.dor_declarada ?? null,
          ...diag,
        },
        atualizado_em: new Date().toISOString(),
      }, { onConflict: "sala_id,peer_id" });
      if (data.compromisso_id && diag.resumo) {
        await sb.from("compromissos")
          .update({ descricao: String(diag.resumo).slice(0, 1000) })
          .eq("id", data.compromisso_id);
      }
    }
    if (ctx.conversa_id) {
      await sb.from("acoes_agendadas")
        .update({ status: "cancelado" })
        .eq("conversation_id", ctx.conversa_id)
        .eq("action_type", "followup_cadenciado")
        .eq("status", "pendente");
    }
  } catch (e) {
    console.warn("[agendar_reuniao_lead] pós-agendamento falhou (não-fatal):", e);
  }

  return {
    ok: true,
    dados: { link, sala_id: data.sala_id, compromisso_id: data.compromisso_id, inicio: data.inicio, lembrete_em: data.lembrete_em ?? null },
    mensagem: `Reunião agendada pra ${quando} (BRT). Link da sala pro lead: ${link}`,
  };
};

/**
 * Follow-up cadenciado (Bel · agenda interna, 2026-08-25): marca a retomada
 * AUTOMÁTICA da conversa em acoes_agendadas — o worker processar-acompanhamentos
 * dispara [FOLLOWUP_CADENCIADO] na hora combinada e re-enfileira a cadência
 * (tentativa 1 → +1 dia · 2 → +3 dias · 3 → +7 dias · esgotou → lead base_fria).
 * Regra de uso: NUNCA aceitar "depois" sem data — propor horário, o lead
 * confirmar, e chamar esta tool. Mentoria marcada cancela follow-ups pendentes.
 */
const agendar_followup: Handler = async (sb, ctx, args) => {
  const acao = String(args?.acao ?? "criar").trim();

  if (acao === "cancelar") {
    const { error } = await sb.from("acoes_agendadas")
      .update({ status: "cancelado" })
      .eq("conversation_id", ctx.conversa_id)
      .eq("action_type", "followup_cadenciado")
      .eq("status", "pendente");
    if (error) return { ok: false, mensagem: `cancelar falhou: ${error.message}` };
    return { ok: true, mensagem: "Follow-ups pendentes desta conversa cancelados." };
  }
  if (acao !== "criar") {
    return { ok: false, mensagem: `acao inválida (use criar|cancelar). Recebido: ${acao}` };
  }

  const requestId = args?.request_id ? String(args.request_id) : null;
  if (!requestId) return { ok: false, mensagem: "request_id é obrigatório (idempotência)." };

  // Fuso BRT explícito — mesmo helper do gerenciar_compromisso (runtime é UTC).
  const rTempo = calcularExecutarEmBRT(
    {
      executar_em: typeof args?.executar_em === "string" ? args.executar_em : null,
      // deno-lint-ignore no-explicit-any
      quando_relativo: (args?.quando_relativo as any) ?? null,
    },
    Date.now(),
  );
  if (!rTempo.ok) return { ok: false, mensagem: rTempo.motivo };

  const tentativa = Math.min(9, Math.max(1, Number(args?.tentativa ?? 1) || 1));
  const carga = {
    request_id: requestId,
    motivo: args?.motivo ? String(args.motivo).slice(0, 200) : null,
    assunto: args?.assunto ? String(args.assunto).slice(0, 200) : null,
    frase_de_retomada: args?.frase_de_retomada ? String(args.frase_de_retomada).slice(0, 400) : null,
    estado_conversa: args?.estado_conversa ? String(args.estado_conversa).slice(0, 20) : null,
    tentativa,
    total_tentativas: 3,
    origem: "tool_agendar_followup",
  };

  const { data, error } = await sb.rpc("enfileirar_acao_agendada", {
    p_conversation_id: ctx.conversa_id,
    p_lead_id: ctx.lead_id ?? null,
    p_agente_id: ctx.agente_id ?? null,
    p_tenant_id: ctx.tenant_id,
    p_action_type: "followup_cadenciado",
    p_scheduled_at: rTempo.iso,
    p_carga: carga,
    p_node_name: null,
    p_template: null,
  });
  if (error) return { ok: false, mensagem: `Não consegui marcar o follow-up: ${error.message}` };

  const quandoBrt = new Date(rTempo.iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  return {
    ok: true,
    dados: { acao_id: data ?? null, executar_em: rTempo.iso, tentativa },
    mensagem: `Follow-up marcado pra ${quandoBrt} (BRT) — a conversa será retomada automaticamente. Confirme pro lead o combinado.`,
  };
};

/**
 * CRM do lead (Bel, 2026-08-25): grava o desfecho/estágio da conversa no lead.
 * status agendado|followup|base_fria → leads.fase_pipeline; descartado →
 * desfecho='desqualificado' + motivo. `diagnostico` (segmento, volume_diario,
 * tamanho_equipe, dor_declarada, resumo) é preservado em custom_fields.
 * Sempre opera no lead DA CONVERSA (ctx.lead_id) — nunca aceita id por arg.
 */
const atualizar_lead: Handler = async (sb, ctx, args) => {
  if (!ctx.lead_id) return { ok: false, mensagem: "Esta conversa não tem lead vinculado." };

  const status = String(args?.status ?? "").trim();
  const validos = ["agendado", "followup", "descartado", "base_fria"];
  if (!validos.includes(status)) {
    return { ok: false, mensagem: `status inválido (use ${validos.join("|")}). Recebido: ${status}` };
  }
  const motivo = args?.motivo ? String(args.motivo).slice(0, 300) : null;

  const patch: Record<string, unknown> = {};
  if (status === "descartado") {
    patch.fase_pipeline = "descartado";
    patch.desfecho = "desqualificado";
    patch.desfecho_motivo = motivo ?? "descartado pelo agente";
    patch.desfecho_em = new Date().toISOString();
  } else {
    patch.fase_pipeline = status;
  }

  if (args?.diagnostico && typeof args.diagnostico === "object") {
    const { data: leadAtual } = await sb.from("leads")
      .select("custom_fields").eq("id", ctx.lead_id).maybeSingle();
    const cf = (leadAtual?.custom_fields && typeof leadAtual.custom_fields === "object")
      ? leadAtual.custom_fields as Record<string, unknown>
      : {};
    patch.custom_fields = { ...cf, diagnostico_bel: args.diagnostico };
  }

  const { error } = await sb.from("leads").update(patch).eq("id", ctx.lead_id);
  if (error) return { ok: false, mensagem: `atualizar_lead falhou: ${error.message}` };
  return {
    ok: true,
    dados: { status, motivo },
    mensagem: `Lead atualizado: ${status}${motivo ? ` (${motivo})` : ""}.`,
  };
};

// App Consulta — lê as dívidas/resultado já consultados do contato (pra o agente comentar).
// Pós-venda da consulta: qual produto ofertar depois de comentar a situação do contato.
// Prioriza o produto gravado na consulta concluída (snapshot da venda); cai pro padrão do tenant.
// deno-lint-ignore no-explicit-any
async function carregarProdutoOferta(sb: any, ctx: CtxFerramenta): Promise<{ nome: string; descricao: string | null; conhecimento: string[] } | null> {
  let produtoId: string | null = null;
  if (ctx.lead_id) {
    const { data: ult } = await sb
      .from("consultas")
      .select("produto_oferta_id")
      .eq("lead_id", ctx.lead_id)
      .eq("status", "concluida")
      .not("produto_oferta_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    produtoId = (ult?.produto_oferta_id as string | null) ?? null;
  }
  if (!produtoId && ctx.tenant_id) {
    const { data: cfg } = await sb
      .from("consultas_config_tenant")
      .select("produto_oferta_id")
      .eq("tenant_id", ctx.tenant_id)
      .maybeSingle();
    produtoId = (cfg?.produto_oferta_id as string | null) ?? null;
  }
  if (!produtoId) return null;
  const { data: prod } = await sb
    .from("produtos")
    .select("nome, descricao_curta")
    .eq("id", produtoId)
    .maybeSingle();
  if (!prod) return null;
  const { data: conhec } = await sb
    .from("produto_conhecimento")
    .select("titulo, conteudo")
    .eq("produto_id", produtoId)
    .order("ordem", { ascending: true })
    .limit(8);
  return {
    nome: prod.nome as string,
    descricao: (prod.descricao_curta as string | null) ?? null,
    conhecimento: ((conhec as Array<{ titulo: string; conteudo: string }> | null) ?? []).map((c) => `${c.titulo}: ${c.conteudo}`),
  };
}

const consultar_dividas_contato: Handler = async (sb, ctx) => {
  if (!ctx.lead_id) return { ok: false, mensagem: "Não há contato vinculado a esta conversa." };
  const { data } = await sb
    .from("memoria_lead")
    .select("fato")
    .eq("lead_id", ctx.lead_id)
    .eq("categoria", "fato_financeiro")
    .eq("ativa", true)
    .order("criado_em", { ascending: false })
    .limit(20);
  if (!data?.length) {
    return { ok: true, dados: { tem_consulta: false }, mensagem: "Ainda não há consulta concluída deste contato." };
  }
  const fatos = (data as Array<{ fato: string }>).map((d) => d.fato);
  // Gancho de pós-venda: o produto a ofertar DEPOIS de comentar a situação financeira.
  const produtoOferta = await carregarProdutoOferta(sb, ctx);
  const dados: Record<string, unknown> = { tem_consulta: true, fatos };
  let mensagem = fatos.join(" | ");
  if (produtoOferta) {
    dados.produto_oferta = produtoOferta;
    mensagem += `\n\nApós comentar a situação com empatia, ofereça como solução: ${produtoOferta.nome}.`;
  }
  return { ok: true, dados, mensagem };
};

const gerar_contrato: Handler = async (sb, ctx, args) => {
  if (!ctx.conversa_id) return { ok: false, mensagem: "conversa_id ausente — não dá pra gerar contrato." };

  const recusaConvertido = await recusaSeLeadJaConvertido(sb, ctx);
  if (recusaConvertido) return { ok: false, mensagem: recusaConvertido };

  const recusaCarrinho = await garantirCarrinhoAbastecido(sb, ctx);
  if (recusaCarrinho) return { ok: false, mensagem: recusaCarrinho };

  const recusaSemContrato = await recusaProdutoSemContrato(sb, ctx);
  if (recusaSemContrato) return { ok: false, mensagem: recusaSemContrato };

  const recusaPreco = await recusaSemPrecoNaConversa(sb, ctx);
  if (recusaPreco) return { ok: false, mensagem: recusaPreco };

  const dadosClienteNormalizado = await normalizarDadosCliente(
    sb,
    ctx.tenant_id,
    (args?.template_id as string | null) ?? null,
    args?.dados_cliente as Record<string, unknown> | null,
  );
  const { data, error } = await sb.rpc("gerar_contrato_do_template", {
    p_conversa_id: ctx.conversa_id,
    p_template_id: args?.template_id ?? null,
    p_dados_cliente: dadosClienteNormalizado,
    p_tenant_id: ctx.tenant_id,
    p_lead_id: ctx.lead_id ?? null,
    p_agente_id: ctx.agente_id ?? null,
  });
  if (error) return { ok: false, mensagem: `Não consegui gerar o contrato: ${error.message}` };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.chave_publica) return { ok: false, mensagem: "Contrato não gerado (sem chave pública)." };
  const total = Number(row.total ?? 0);
  // B6 (2026-05-24) bloqueava por carrinho vazio. Fix (2026-06-02): a RPC `gerar_contrato_do_template`
  // já cai no `valor_a_vista` do molde quando o carrinho está vazio, então total>0 é contrato válido
  // mesmo com qtd_itens=0. Medir "contrato R$0" SÓ por total<=0 (molde sem preço E carrinho vazio) —
  // medir por qtd de itens barrava o link mesmo com o preço vindo do molde (bug do chat test/prod).
  if (total <= 0) {
    return { ok: false, mensagem: "Não gerei o contrato porque ele ficaria sem valor (R$ 0). Confirme o preço no molde de contrato (/agente) ou adicione o produto antes." };
  }
  const link = linkContrato(row.chave_publica as string);
  // Produto com opções nomeadas: o total da RPC é o preço de tabela, mas o cliente escolhe a
  // opção na página — citar "R$ 3.200" depois de fechar à vista em 1.920 desmente a agente.
  const { data: itensCtr } = await sb.from("carrinho_da_conversa").select("produto_id").eq("conversa_id", ctx.conversa_id);
  const idsCtr = ((itensCtr ?? []) as Array<{ produto_id: string | null }>).map((i) => i.produto_id).filter(Boolean);
  const { data: prodsCtr } = idsCtr.length
    ? await sb.from("produtos").select("opcoes_pagamento").in("id", idsCtr)
    : { data: [] };
  const temOpcoes = ((prodsCtr ?? []) as Array<{ opcoes_pagamento: unknown }>)
    .some((p) => Array.isArray(p.opcoes_pagamento) && p.opcoes_pagamento.length > 0);
  const valorTxt = temOpcoes
    ? `O lead escolhe a forma de pagamento na própria página do contrato (as opções cadastradas aparecem lá) — NÃO cite R$ ${total.toFixed(2)}; fale só da opção que ele já escolheu na conversa.`
    : `Total R$ ${total.toFixed(2)}.`;
  return {
    ok: true,
    dados: { link, contrato_id: row.contrato_id, total, itens: Number(row.qtd_itens ?? 0), molde: row.nome_template },
    mensagem: `Contrato gerado a partir do molde "${row.nome_template}". ${valorTxt} Link pro lead assinar: ${link}`,
  };
};

const agendar_compromisso: Handler = async (sb, ctx, args) => {
  const titulo = String(args?.titulo ?? "Compromisso");
  const quando = String(args?.quando ?? "");
  if (!quando || isNaN(Date.parse(quando))) return { ok: false, mensagem: "Data/hora inválida (ISO 8601)." };

  // ── Anti-duplicação: janela 30min em torno do `quando` pra evitar 5 callbacks idênticos
  // em 27min como bug histórico (lead bbaaa1b2 cancelado em 2026-05-12). ──
  const quandoMs = Date.parse(quando);
  const janelaInicio = new Date(quandoMs - 30 * 60_000).toISOString();
  const janelaFim = new Date(quandoMs + 30 * 60_000).toISOString();
  if (ctx.lead_id) {
    const { data: lead } = await sb.from("leads").select("dados_ficha").eq("id", ctx.lead_id).single();
    // deno-lint-ignore no-explicit-any
    const ficha = (lead?.dados_ficha as any) || {};
    const lista = Array.isArray(ficha.compromissos) ? ficha.compromissos : [];
    // deno-lint-ignore no-explicit-any
    const jaExiste = lista.some((c: any) => {
      if (!c?.quando) return false;
      const cMs = Date.parse(c.quando);
      if (isNaN(cMs)) return false;
      return Math.abs(cMs - quandoMs) <= 30 * 60_000;
    });
    if (jaExiste) {
      return {
        ok: true,
        dados: { titulo, quando, duplicado_ignorado: true },
        mensagem: `Compromisso ignorado (já existe um agendado em janela de 30min de ${quando}).`,
      };
    }
    lista.push({ titulo, quando, criado_em: new Date().toISOString(), conversa_id: ctx.conversa_id });
    await sb.from("leads").update({ dados_ficha: { ...ficha, compromissos: lista } }).eq("id", ctx.lead_id);
  }
  // Também tenta criar acoes_agendadas tipo 'agendamento_retorno' com partial UNIQUE
  // (uniq_acoes_agendadas_pendente_por_conv_tipo_horario). Se já existe em janela 30min, ON CONFLICT.
  if (ctx.conversa_id && ctx.tenant_id) {
    const { data: existente } = await sb.from("acoes_agendadas")
      .select("id")
      .eq("conversation_id", ctx.conversa_id)
      .eq("action_type", "agendamento_retorno")
      .eq("status", "pendente")
      .gte("scheduled_at", janelaInicio)
      .lte("scheduled_at", janelaFim)
      .limit(1).maybeSingle();
    if (!existente) {
      await sb.from("acoes_agendadas").insert({
        conversation_id: ctx.conversa_id,
        agente_id: ctx.agente_id,
        lead_id: ctx.lead_id,
        tenant_id: ctx.tenant_id,
        action_type: "agendamento_retorno",
        scheduled_at: quando,
        status: "pendente",
        carga: { titulo, origem: "agendar_compromisso", criado_em: new Date().toISOString() },
      });
    }
  }
  return { ok: true, dados: { titulo, quando }, mensagem: `Compromisso agendado: ${titulo} em ${quando}.` };
};

const query_leads_filtro: Handler = async (sb, ctx, args) => {
  // deno-lint-ignore no-explicit-any
  const filtros = (args?.filtros ?? {}) as Record<string, any>;
  const limite = Math.min(Number(args?.limite ?? 20), 100);
  let q = sb.from("leads")
    .select("id, name, phone, fase_pipeline, temperatura_lead, pontuacao, tags, updated_at")
    .eq("tenant_id", ctx.tenant_id).is("deleted_at", null)
    .order("updated_at", { ascending: false }).limit(limite);
  if (filtros.fase_pipeline) q = q.eq("fase_pipeline", String(filtros.fase_pipeline));
  if (filtros.temperatura_lead) q = q.eq("temperatura_lead", String(filtros.temperatura_lead));
  if (filtros.precisa_humano !== undefined) q = q.eq("precisa_humano", !!filtros.precisa_humano);
  if (Array.isArray(filtros.tags) && filtros.tags.length) q = q.contains("tags", filtros.tags);
  const { data, error } = await q;
  if (error) return { ok: false, mensagem: error.message };
  return { ok: true, dados: { total: data?.length ?? 0, leads: data ?? [] } };
};

const buscar_gatilhos_reativos: Handler = async (sb, ctx, args) => {
  const cenario = args?.cenario ? String(args.cenario) : null;
  const limite = Math.min(Number(args?.limite ?? 20), 50);
  const { data, error } = await sb.rpc("fn_buscar_gatilhos_reativos", {
    p_tenant_id: ctx.tenant_id,
    p_cargo_id: ctx.cargo_ativo ?? null,
    p_cenario: cenario,
    p_limite: limite,
  });
  if (error) return { ok: false, mensagem: error.message };
  return { ok: true, dados: { total: data?.length ?? 0, gatilhos: data ?? [] } };
};

// ───────────────────────────────────────────────────────────────────────────
// Helpers de embedding/rerank do provedor (Voyage voyage-4 1024d + rerank-2.5)
// ───────────────────────────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────────────────────
// CONFIG CENTRAL do provedor de embedding/rerank (provider-agnostic, override por env).
// Trocar de provedor/modelo/dimensão = mexer SÓ AQUI (ou nas envs) — nunca espalhado/hardcoded.
// Migração 2026-06-02: Cohere embed-v4/1536 → Voyage voyage-4/1024 + rerank-2.5.
// ───────────────────────────────────────────────────────────────────────────
const _envGet = (k: string): string | undefined =>
  (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(k);

/** Dimensão única do vetor — fonte da verdade pra guards e RPCs. Override por env EMBED_DIM. */
export const EMBED_DIM = Number(_envGet("EMBED_DIM") ?? "1024");
export const EMBED_MODEL = _envGet("EMBED_MODEL") ?? "voyage-4";
const RERANK_MODEL = _envGet("RERANK_MODEL") ?? "rerank-2.5";
const EMBED_BASE_URL = _envGet("EMBED_BASE_URL") ?? "https://api.voyageai.com/v1";
const EMBED_API_KEY_ENV = _envGet("EMBED_API_KEY_ENV") ?? "VOYAGE_API_KEY";
const EMBED_PROVIDER_SLUG = _envGet("EMBED_PROVIDER_SLUG") ?? "voyage";

interface CohereCreds { apiKey: string; baseUrl: string }
const cohereCache: { creds: CohereCreds | null; em: number } = { creds: null, em: 0 };

/** Credencial do provedor de embedding (env `EMBED_API_KEY_ENV` → tabela `provedores_llm` slug configurado).
 *  Nome legado `getCohereCreds` mantido pra não quebrar callers; o provedor é configurável. */
// deno-lint-ignore no-explicit-any
export async function getCohereCreds(sb: any): Promise<CohereCreds> {
  if (cohereCache.creds && Date.now() - cohereCache.em < 60_000) return cohereCache.creds;
  const env = _envGet(EMBED_API_KEY_ENV);
  if (env) {
    cohereCache.creds = { apiKey: env, baseUrl: EMBED_BASE_URL };
  } else {
    const { data } = await sb.from("provedores_llm").select("api_key, base_url")
      .eq("slug", EMBED_PROVIDER_SLUG).eq("is_active", true).maybeSingle();
    cohereCache.creds = {
      apiKey: data?.api_key || "",
      baseUrl: data?.base_url || EMBED_BASE_URL,
    };
  }
  cohereCache.em = Date.now();
  return cohereCache.creds!;
}

/** Gera embedding da QUERY (input_type=query) no provedor configurado (Voyage voyage-4 @EMBED_DIM).
 *  Exportada pra reuso em motores que embedam a query do turno e fazem múltiplas buscas semânticas. */
// deno-lint-ignore no-explicit-any
export async function gerarEmbeddingQuery(sb: any, texto: string): Promise<number[] | null> {
  const { apiKey, baseUrl } = await getCohereCreds(sb);
  if (!apiKey) return null;
  const r = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: [texto.slice(0, 8000)],
      input_type: "query",
      output_dimension: EMBED_DIM,
      output_dtype: "float",
    }),
  });
  if (!r.ok) {
    console.warn(`[embed query] ${r.status} ${(await r.text()).slice(0, 200)}`);
    return null;
  }
  // deno-lint-ignore no-explicit-any
  const j: any = await r.json();
  return j?.data?.[0]?.embedding ?? null;
}

/** Rerank no provedor configurado (Voyage rerank-2.5): reordena documentos por relevância à query.
 *  Nome legado `rerankCohere` mantido pra não quebrar callers. */
// deno-lint-ignore no-explicit-any
export async function rerankCohere(sb: any, query: string, docs: string[], topN: number): Promise<Array<{ index: number; score: number }> | null> {
  if (docs.length === 0) return [];
  const { apiKey, baseUrl } = await getCohereCreds(sb);
  if (!apiKey) return null;
  const r = await fetch(`${baseUrl}/rerank`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: RERANK_MODEL,
      query: query.slice(0, 8000),
      documents: docs.map((d) => d.slice(0, 8000)),
      top_k: Math.min(topN, docs.length),
    }),
  });
  if (!r.ok) {
    console.warn(`[rerank] ${r.status} ${(await r.text()).slice(0, 200)}`);
    return null;
  }
  // deno-lint-ignore no-explicit-any
  const j: any = await r.json();
  // Voyage retorna `data[].index/relevance_score` (Cohere usava `results`). relevance_score (0-1) = relevância pura.
  // deno-lint-ignore no-explicit-any
  return (j?.data ?? j?.results ?? []).map((x: any) => ({ index: x.index as number, score: Number(x.relevance_score ?? 0) }));
}

/**
 * Expansão de query do recall (2026-06-10): fala curta do lead ("Qual valor") embeda mal e
 * não casa com o bloco certo ("Preços e Condições") no top-k — validado em produção: 20/79
 * lacunas abertas pro Mentor eram de preço com 9-19 blocos de preço ATIVOS no agente.
 * Detecta o tema na fala e devolve termos pra engordar a busca (FTS + embedding).
 * Determinístico, zero LLM, zero latência.
 */
const TEMAS_EXPANSAO_RECALL: Array<{ padrao: RegExp; termos: string }> = [
  { padrao: /(valor|pre[çc]o|custa|quanto|caro|barato|investimento)/i, termos: "preço valor condições parcelamento formas de pagamento entrada" },
  { padrao: /(paga|pagamento|pix|boleto|cart[ãa]o de cr[ée]dito|parcel|entrada|desconto)/i, termos: "formas de pagamento parcelamento pix boleto cartão entrada condições" },
  { padrao: /(prazo|demora|quanto tempo|dias|quando fica|at[ée] quando)/i, termos: "prazo tempo duração processo etapas andamento" },
  { padrao: /(garantia|seguran[çc]a|confian[çc]a|golpe|verdade|funciona mesmo)/i, termos: "garantia segurança contrato confiança como funciona" },
  { padrao: /(contrato|assina|documento|cl[áa]usula)/i, termos: "contrato assinatura documentos necessários cláusulas" },
  { padrao: /(como funciona|processo|etapa|procedimento|andamento)/i, termos: "como funciona processo etapas procedimento serviço" },
  // Varredura 2026-06-11 (36 reprovações reais): 4 temas que existiam na base e o recall não trazia.
  { padrao: /(cnpj|raz[ãa]o social|dados da empresa|nome da empresa|empresa (é|e) confi|endereç|localiza|onde fica)/i, termos: "empresa informações CNPJ razão social endereço localização confiança" },
  { padrao: /(assinar|assinatura|selfie|reconhecimento facial|documento com foto|como assino)/i, termos: "processo de contrato assinatura digital selfie documento etapas" },
  { padrao: /(cdc|c[óo]digo de defesa|a[çc][ãa]o (judicial|jur[íi]dica)|processo judicial|juiz|advogad|lei )/i, termos: "ação judicial Código de Defesa do Consumidor base legal como funciona juridicamente" },
  { padrao: /(consulta|consultar (cpf|cnpj|nome)|ver minhas d[íi]vidas|relat[óo]rio de d[íi]vidas)/i, termos: "consulta de CPF CNPJ valor da consulta relatório dívidas como consultar" },
];

export function expandirQueryRecall(texto: string): string {
  const t = (texto || "").slice(0, 400);
  if (!t.trim()) return "";
  const partes: string[] = [];
  for (const { padrao, termos } of TEMAS_EXPANSAO_RECALL) {
    if (padrao.test(t)) partes.push(termos);
  }
  return partes.join(" ");
}

/**
 * Recall RAG-FIRST: executado AUTOMATICAMENTE antes da síntese (não via tool-call da LLM).
 * Plano consolidado RAGENTIC L35: `gatilho → percepção → recall (RAG 3 escopos) → raciocínio`.
 * Faz: embedding Cohere v4 → RPC busca_hibrida_conhecimento (FTS+halfvec+RRF) → rerank Cohere v3.5.
 */
export async function recuperarBlocosRagFirst(
  // deno-lint-ignore no-explicit-any
  sb: any,
  opts: { query: string; agente_id?: string | null; nicho_id?: string | null; limite?: number; piso?: number; categoriasBloqueadas?: string[]; categoriasBoost?: string[] },
// deno-lint-ignore no-explicit-any
): Promise<Array<{ id: string; title: string; content: string; category: string | null; tipo: string | null; escopo: string | null; rrf_score: number; rerank_score: number }>> {
  const query = (opts.query || "").trim();
  const limite = Math.min(opts.limite ?? 5, 12);
  if (!query) return [];
  const embedding = await gerarEmbeddingQuery(sb, query);
  if (!embedding || embedding.length !== EMBED_DIM) return [];
  const { data, error } = await sb.rpc("busca_hibrida_conhecimento", {
    p_query_text: query,
    p_query_embedding: embedding,
    p_agent_id: opts.agente_id ?? null,
    // NICHO: passar o nicho LIGA o escopo de nicho na RPC (sem isso o recall via só global+tenant).
    p_nicho_id: opts.nicho_id ?? null,
    p_match_count: Math.max(limite * 4, 24),
  });
  if (error) {
    console.warn(`[recall rag-first] busca_hibrida_conhecimento: ${error.message}`);
    return [];
  }
  // deno-lint-ignore no-explicit-any
  const candidatos: any[] = (data as any[]) ?? [];
  if (candidatos.length === 0) return [];
  const docs = candidatos.map((b) => `${b.title || ""}\n\n${b.content || ""}`.trim());
  // Rerank pede um pool MAIOR que `limite` pra a ponderação por escopo ter o que escolher
  // (antes o rerank cortava pra `limite` → ponderação de escopo virava quase inócua).
  const poolRerank = Math.max(limite * 3, 15);
  const ranked = await rerankCohere(sb, query, docs, poolRerank);
  // PESO de escopo: tenant cravado pelo usuário > nicho compartilhado > global. SÓ ordena entre os relevantes.
  const PESO_ESCOPO: Record<string, number> = { tenant: 1.0, nicho: 0.7, global: 0.5 };
  // PISO de relevância PURA (relevance_score Cohere 0-1), aplicado ANTES da ponderação de escopo —
  // assim um bloco universal ótimo (×0.5) não é cortado injustamente por um do tenant fraco (×1.0).
  const PISO = opts.piso ?? 0.10;
  // deno-lint-ignore no-explicit-any
  let comScore: Array<{ bloco: any; rerank: number }>;
  if (ranked && ranked.length > 0) {
    comScore = ranked.map((r) => ({ bloco: candidatos[r.index], rerank: r.score })).filter((x) => x.bloco);
  } else {
    // Sem rerank (sem credencial/erro): usa rrf_score como proxy; piso não se aplica (fallback abaixo cobre).
    comScore = candidatos.slice(0, poolRerank).map((b) => ({ bloco: b, rerank: Number(b.rrf_score ?? 0) }));
  }
  // Piso na relevância pura (igual pros 3 escopos). Fallback: se zerar, relaxa o piso — nunca deixa o agente sem contexto.
  const temRerankReal = !!(ranked && ranked.length > 0);
  let acima = temRerankReal ? comScore.filter((x) => x.rerank >= PISO) : comScore;
  if (acima.length === 0) acima = comScore;
  // FILTRO DE FASE (Onda 1B): remove categorias comerciais sensíveis quando NÃO liberadas (fecha o R$117).
  // É trava de segurança — diferente do piso, NÃO tem fallback que traga os bloqueados de volta
  // (vazar preço fora de hora é pior que responder com menos contexto).
  const bloqueadas = (opts.categoriasBloqueadas ?? []).map((c) => c.toLowerCase());
  // O rótulo comercial do bloco mora em `category` na maior parte da base, mas há tenants cujo
  // `category` é texto livre ("Material de apoio ao atendimento", "faq", "produto") e o rótulo
  // real está em `tipo` — nesses o gate de fase não filtrava NADA (2026-09-15, caso Easy: 83
  // blocos `tipo` valor/pagamento de 33 agentes passavam com o comercial fechado, e o preço
  // vazou na 1ª fala). Agora o filtro olha os dois campos. `tipo='valor'` = category 'preco'.
  const SINONIMO_TIPO: Record<string, string> = { valor: "preco" };
  // deno-lint-ignore no-explicit-any
  const rotulosDeFase = (bloco: any): string[] => {
    const tp = String(bloco?.tipo ?? "").toLowerCase().trim();
    return [String(bloco?.category ?? "").toLowerCase().trim(), tp, SINONIMO_TIPO[tp] ?? ""].filter((r) => r);
  };
  const permitidos = bloqueadas.length
    ? acima.filter((x) => !rotulosDeFase(x.bloco).some((r) => bloqueadas.includes(r)))
    : acima;
  // Ponderação de escopo SÓ pra ordenar entre os relevantes permitidos.
  // Boost de categoria (2026-06-10): turno comercial empurra blocos de preço/pagamento pro topo
  // (validado: "Qual valor" não trazia "Preços e Condições" no top-k; só reordena, não cria score).
  const boost = (opts.categoriasBoost ?? []).map((c) => c.toLowerCase());
  // deno-lint-ignore no-explicit-any
  const finais: any[] = permitidos
    .map((x) => ({
      ...x.bloco,
      _rerank: x.rerank,
      _ponderada: x.rerank * (PESO_ESCOPO[String(x.bloco.escopo ?? "global")] ?? 0.5) *
        (boost.includes(String(x.bloco.category ?? "").toLowerCase()) ? 1.25 : 1.0),
    }))
    .sort((a, b) => b._ponderada - a._ponderada)
    .slice(0, limite);
  return finais.map((b) => ({
    id: b.id,
    title: b.title,
    content: b.content,
    category: b.category ?? null,
    tipo: b.tipo ?? null,
    escopo: b.escopo ?? null,
    rrf_score: Number(b.rrf_score ?? 0),
    rerank_score: Number(b._rerank ?? 0),
  }));
}

/**
 * Onda 3C (2026-05-24) — religa a gaveta de COMPORTAMENTO no motor (estava morta: existia,
 * vetorizada, com RPC, mas o ragentic-processar-inline nunca chamava). Comportamento curado
 * (incl. reparação em ruptura) volta a influenciar o agente como CONTEÚDO retrieved — RAG-First,
 * não hardcode. Query top-down (vem enriquecida pela hipótese do Porteiro, já colorida pelo afeto).
 * Sem rerank (a RPC já ordena por rrf_score + prioridade) → custo só +1 embedding, zero LLM.
 */
export async function recuperarComportamento(
  // deno-lint-ignore no-explicit-any
  sb: any,
  opts: { query: string; tenant_id?: string | null; nicho_id?: string | null; tom?: string | null; limite?: number },
): Promise<Array<{ id: string; escopo: string | null; situacao: string; instrucao: string; prioridade: number; rrf_score: number }>> {
  const query = (opts.query || "").trim();
  const limite = Math.min(opts.limite ?? 3, 6);
  if (!query) return [];
  const embedding = await gerarEmbeddingQuery(sb, query);
  if (!embedding || embedding.length !== EMBED_DIM) return [];
  const { data, error } = await sb.rpc("busca_hibrida_comportamento", {
    p_query_text: query,
    p_query_embedding: embedding,
    p_tenant_id: opts.tenant_id ?? null,
    p_nicho_id: opts.nicho_id ?? null,
    p_match_count: Math.max(limite * 2, 8),
    p_tom: opts.tom ?? null,
  });
  if (error) {
    console.warn(`[recall comportamento] busca_hibrida_comportamento: ${error.message}`);
    return [];
  }
  // deno-lint-ignore no-explicit-any
  const linhas: any[] = (data as any[]) ?? [];
  // RPC já ordena por rrf_score DESC + prioridade. Pondera escopo (tenant>nicho>global) só pra desempate fino.
  const PESO_ESCOPO: Record<string, number> = { tenant: 1.0, produto: 1.0, nicho: 0.7, global: 0.5 };
  return linhas
    .map((b) => ({
      id: String(b.id),
      escopo: (b.escopo as string) ?? null,
      situacao: String(b.situacao_descricao ?? ""),
      instrucao: String(b.instrucao ?? ""),
      prioridade: Number(b.prioridade ?? 0),
      rrf_score: Number(b.rrf_score ?? 0),
      _ord: Number(b.rrf_score ?? 0) * (PESO_ESCOPO[String(b.escopo ?? "global")] ?? 0.5),
    }))
    .sort((a, b) => b._ord - a._ord)
    .slice(0, limite)
    .map(({ _ord: _drop, ...rest }) => rest);
}

const buscar_blocos_conhecimento: Handler = async (sb, ctx, args) => {
  const busca = args?.busca ? String(args.busca).trim() : "";
  const tipo = args?.tipo ? String(args.tipo) : null;
  const category = args?.category ? String(args.category) : null;
  const limite = Math.min(Number(args?.limite ?? 8), 20);
  if (!busca) return { ok: false, mensagem: "campo 'busca' obrigatório (texto da consulta)." };

  // 1. Embedding da query (Voyage voyage-4 1024d, input_type=query)
  const embedding = await gerarEmbeddingQuery(sb, busca);
  if (!embedding || embedding.length !== EMBED_DIM) {
    return { ok: false, mensagem: "falha ao gerar embedding Cohere — verifique provedor." };
  }

  // 2. Busca híbrida: FTS Postgres + vetor halfvec + RRF (server-side)
  const { data, error } = await sb.rpc("busca_hibrida_conhecimento", {
    p_query_text: busca,
    p_query_embedding: embedding,
    p_agent_id: ctx.agente_id ?? null,
    p_tipo: tipo,
    p_category: category,
    p_match_count: Math.max(limite * 2, 20),
  });
  if (error) return { ok: false, mensagem: `busca_hibrida_conhecimento: ${error.message}` };
  // deno-lint-ignore no-explicit-any
  const candidatos: any[] = (data as any[]) ?? [];
  if (candidatos.length === 0) {
    return { ok: true, dados: { total: 0, blocos: [], rag_modo: "hibrida_vazia" }, mensagem: "Nenhum bloco encontrado." };
  }

  // 3. Rerank Cohere v3.5 nos top candidatos (reordena por relevância pura)
  const docs = candidatos.map((b) => `${b.title || ""}\n\n${b.content || ""}`.trim());
  const ranked = await rerankCohere(sb, busca, docs, limite);
  // deno-lint-ignore no-explicit-any
  let finais: any[];
  let rag_modo: string;
  if (ranked && ranked.length > 0) {
    finais = ranked.map((r) => candidatos[r.index]).filter(Boolean).slice(0, limite);
    rag_modo = "hibrida_rrf_mais_rerank_cohere";
  } else {
    finais = candidatos.slice(0, limite);
    rag_modo = "hibrida_rrf_apenas";
  }

  return {
    ok: true,
    dados: {
      total: finais.length,
      blocos: finais.map((b) => ({
        id: b.id, title: b.title, content: b.content, category: b.category,
        tipo: b.tipo, tags: b.tags, escopo: b.escopo, rrf_score: b.rrf_score,
      })),
      rag_modo,
    },
    mensagem: `${finais.length} bloco(s) encontrados (modo: ${rag_modo}).`,
  };
};

const atualizar_prancheta: Handler = async (sb, ctx, args) => {
  const campos = (args?.campos ?? {}) as Record<string, unknown>;
  if (!campos || typeof campos !== "object") return { ok: false, mensagem: "campos obrigatório" };
  const resumo = args?.resumo_agente ? String(args.resumo_agente) : null;
  const { data: atual } = await sb.from("crenca_conversa")
    .select("id, belief").eq("conversation_id", ctx.conversa_id).maybeSingle();
  const beliefAtual = (atual?.belief as Record<string, unknown>) || {};
  const beliefNovo = { ...beliefAtual, ...campos };
  if (atual?.id) {
    const { error } = await sb.from("crenca_conversa")
      .update({ belief: beliefNovo, ...(resumo ? { resumo_agente: resumo } : {}), updated_at: new Date().toISOString() })
      .eq("id", atual.id);
    if (error) return { ok: false, mensagem: error.message };
  } else {
    const { error } = await sb.from("crenca_conversa").insert({
      conversation_id: ctx.conversa_id, tenant_id: ctx.tenant_id, belief: beliefNovo, resumo_agente: resumo,
    });
    if (error) return { ok: false, mensagem: error.message };
  }
  return { ok: true, dados: { campos_atualizados: Object.keys(campos).length }, mensagem: "Prancheta atualizada." };
};

// ── Handlers do cargo Mentor (Agente Mestre que fala com o dono do tenant) ──

const mostrar_kpi: Handler = async (sb, ctx, args) => {
  const metrica = String(args?.metrica ?? "leads_quentes");
  const periodo = String(args?.periodo ?? "30d");
  const diasMap: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
  const dias = diasMap[periodo] ?? 30;
  // Janela ancorada na meia-noite BRT, não em "agora menos N dias": o gráfico é por
  // DIA, então o primeiro ponto tem que começar no começo de um dia.
  const inicioMs = inicioJanelaBRTMs(Date.now(), dias);
  const desde = new Date(inicioMs).toISOString();

  // Esqueleto do período em dia BRT — dia sem movimento vira 0 de verdade.
  const balde = new Map<string, number>();
  for (let i = 0; i < dias; i++) balde.set(diaBRT(inicioMs + i * 86_400_000)!, 0);
  const somar = (quando: string | null | undefined, quanto: number): void => {
    const chave = diaBRT(quando);
    if (chave && balde.has(chave)) balde.set(chave, (balde.get(chave) ?? 0) + quanto);
  };

  let valor = 0;
  if (metrica === "leads_quentes") {
    const { data } = await sb.from("leads")
      .select("id, updated_at")
      .eq("tenant_id", ctx.tenant_id).is("deleted_at", null)
      .eq("temperatura_lead", "quente").gte("updated_at", desde);
    for (const linha of data ?? []) somar(linha.updated_at as string | null, 1);
    valor = (data ?? []).length;
  } else if (metrica === "conversoes_mes") {
    // Mês corrente em BRT — `setDate(1)/setHours(0)` era o dia 1 do fuso de quem roda,
    // e a edge roda em UTC: virava 1º às 00h UTC = dia 30 às 21h BRT.
    const hojeBRT = diaBRT(Date.now())!;
    const inicioMesMs = Date.parse(`${hojeBRT.slice(0, 7)}-01T00:00:00-03:00`);
    const { data } = await sb.from("leads")
      .select("id, updated_at")
      .eq("tenant_id", ctx.tenant_id).is("deleted_at", null)
      .not("fase_cliente", "is", null).gte("updated_at", new Date(inicioMesMs).toISOString());
    for (const linha of data ?? []) somar(linha.updated_at as string | null, 1);
    valor = (data ?? []).length;
  } else if (metrica === "taxa_conversao") {
    const { count: total } = await sb.from("leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", ctx.tenant_id).is("deleted_at", null).gte("created_at", desde);
    const { data: convertidos } = await sb.from("leads")
      .select("id, created_at")
      .eq("tenant_id", ctx.tenant_id).is("deleted_at", null)
      .not("fase_cliente", "is", null).gte("created_at", desde);
    for (const linha of convertidos ?? []) somar(linha.created_at as string | null, 1);
    valor = total && total > 0 ? Math.round((((convertidos ?? []).length) / total) * 100) : 0;
  }

  // A série é o balde, e só. Até 2026-09-07 os pontos eram fabricados com
  // `valor * (0.6 + Math.random() * 0.8)` e só o último recebia o número real —
  // recarregar a tela desenhava outro gráfico do mesmo dado. Dado inventado num
  // painel é pior que painel vazio: o dono decide em cima dele.
  const serie = [...balde.entries()].map(([data, val]) => ({ data, valor: Math.round(val * 100) / 100 }));

  return {
    ok: true,
    dados: { tipo: "grafico_kpi", metrica, periodo, valor, serie_temporal: serie, variacao_pct: null },
    mensagem: `Métrica ${metrica} no período ${periodo}: ${valor}${metrica === "taxa_conversao" ? "%" : ""}.`,
  };
};

const listar_leads_recentes: Handler = async (sb, ctx, args) => {
  const filtro = String(args?.filtro ?? "");
  const limite = Math.min(Number(args?.limite ?? 10), 50);
  let q = sb.from("leads")
    .select("id, name, phone, temperatura_lead, fase_pipeline, updated_at")
    .eq("tenant_id", ctx.tenant_id).is("deleted_at", null)
    .order("updated_at", { ascending: false }).limit(limite);
  if (filtro === "quente") q = q.eq("temperatura_lead", "quente");
  else if (filtro === "frio") q = q.eq("temperatura_lead", "frio");
  else if (filtro === "novo") q = q.gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  else if (filtro === "inativo") q = q.lte("updated_at", new Date(Date.now() - 6 * 86_400_000).toISOString());
  const { data, error } = await q;
  if (error) return { ok: false, mensagem: error.message };
  return {
    ok: true,
    dados: { tipo: "lista_leads", leads: data ?? [] },
    mensagem: `${(data ?? []).length} lead(s) encontrado(s).`,
  };
};

const dashboard_resumo: Handler = async (sb, ctx, _args) => {
  const uid = ctx.tenant_id;
  const inicioDia = new Date(); inicioDia.setHours(0,0,0,0);
  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0,0,0,0);
  const [
    { count: totalLeads },
    { count: leadsQuentes },
    { count: conversasAtivas },
    { count: msgsDia },
    { count: conversoesMes },
  ] = await Promise.all([
    sb.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", uid).is("deleted_at", null),
    sb.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", uid).is("deleted_at", null).eq("temperatura_lead", "quente"),
    sb.from("conversas").select("id", { count: "exact", head: true }).eq("tenant_id", uid).eq("status", "ativa"),
    sb.from("mensagens").select("id", { count: "exact", head: true }).gte("created_at", inicioDia.toISOString()),
    sb.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", uid).is("deleted_at", null).not("fase_cliente", "is", null).gte("updated_at", inicioMes.toISOString()),
  ]);
  const cards = [
    { titulo: "Total de leads", valor: totalLeads ?? 0, icone: "Users" },
    { titulo: "Leads quentes", valor: leadsQuentes ?? 0, icone: "Flame" },
    { titulo: "Conversas ativas", valor: conversasAtivas ?? 0, icone: "MessageCircle" },
    { titulo: "Msgs hoje", valor: msgsDia ?? 0, icone: "Zap" },
    { titulo: "Conversões no mês", valor: conversoesMes ?? 0, icone: "TrendingUp" },
  ];
  return {
    ok: true,
    dados: { tipo: "dashboard", cards },
    mensagem: `Dashboard: ${totalLeads ?? 0} leads, ${leadsQuentes ?? 0} quentes, ${conversasAtivas ?? 0} conversas ativas.`,
  };
};

const abrir_app: Handler = (_sb, _ctx, args) => {
  const slug = String(args?.slug ?? "").trim();
  if (!slug) return Promise.resolve({ ok: false, mensagem: "slug do app não informado." });
  return Promise.resolve({
    ok: true,
    dados: { tipo: "acao_os", acao: "abrir_app", slug },
    mensagem: `App ${slug} aberto.`,
  });
};

const mostrar_desktop: Handler = (_sb, _ctx, _args) => {
  return Promise.resolve({
    ok: true,
    dados: { tipo: "acao_os", acao: "mostrar_desktop" },
    mensagem: "Desktop visível.",
  });
};

const criar_anotacao_mentor: Handler = async (sb, ctx, args) => {
  const conteudo = String(args?.conteudo ?? "").trim();
  if (!conteudo) return { ok: false, mensagem: "conteudo da anotação é obrigatório." };
  const tags = Array.isArray(args?.tags) ? (args.tags as unknown[]).map(String) : [];
  const { data, error } = await sb.from("mentor_anotacoes")
    .insert({ tenant_id: ctx.tenant_id, conteudo, tags })
    .select("id").single();
  if (error) return { ok: false, mensagem: error.message };
  return {
    ok: true,
    dados: { tipo: "confirmacao", acao: "anotacao_criada", id: data?.id },
    mensagem: "Anotação salva.",
  };
};

/**
 * gerenciar_compromisso (Onda 2 EMA — Companion 12, 2026-05-14).
 * Cria/atualiza/cancela compromisso (acoes_agendadas) com:
 *  - Idempotência por request_id (UNIQUE INDEX acoes_idempotencia_request_id)
 *  - Soft-check janela ±4h pra evitar duplicata semântica
 *  - Suporte a quando_relativo (em_minutos/em_horas/hoje/amanha/dia_semana) ou executar_em ISO
 *
 * O LLM deve sempre consultar <compromissos_ativos_do_lead> no prompt ANTES de chamar.
 */
const gerenciar_compromisso: Handler = async (sb, ctx, args) => {
  const acao = String(args?.acao ?? "").trim();
  const requestId = args?.request_id ? String(args.request_id) : null;
  const refId = args?.ref_id ? String(args.ref_id) : null;
  const titulo = args?.titulo ? String(args.titulo).slice(0, 200) : "Compromisso";

  if (!["criar", "atualizar", "cancelar"].includes(acao)) {
    return { ok: false, mensagem: `acao inválida (use criar|atualizar|cancelar). Recebido: ${acao}` };
  }
  if (!requestId) {
    return { ok: false, mensagem: "request_id é obrigatório (idempotência)." };
  }

  // CANCELAR: marca acoes_agendadas.status='cancelado'
  if (acao === "cancelar") {
    if (!refId) return { ok: false, mensagem: "ref_id obrigatório pra cancelar." };
    const { error } = await sb.from("acoes_agendadas")
      .update({ status: "cancelado", tentativas: 0 })
      .eq("id", refId)
      .eq("conversation_id", ctx.conversa_id);
    if (error) return { ok: false, mensagem: `cancelar falhou: ${error.message}` };
    return { ok: true, dados: { ref_id: refId }, mensagem: "Compromisso cancelado." };
  }

  // Calcular executar_em com fuso BRT EXPLÍCITO (UTC-3) + validação de
  // coerência (nunca grava compromisso no passado/imediato). Lógica pura e
  // testável em _shared/tempo-brt.ts (tests/tempo-brt.test.ts, TZ=UTC).
  // Antes: `d.setHours()` no runtime Deno (UTC) → hora -3h e compromisso
  // nascia vencido (lead 35d58b25, 2026-05-16: "amanhã 15h" virou +6min).
  const rTempo = calcularExecutarEmBRT(
    {
      executar_em: typeof args?.executar_em === "string" ? args.executar_em : null,
      // deno-lint-ignore no-explicit-any
      quando_relativo: (args?.quando_relativo as any) ?? null,
    },
    Date.now(),
  );
  if (!rTempo.ok) {
    return { ok: false, mensagem: rTempo.motivo };
  }
  const executarEm: string = rTempo.iso;

  // ATUALIZAR: muda data + titulo de um compromisso existente
  if (acao === "atualizar") {
    if (!refId) return { ok: false, mensagem: "ref_id obrigatório pra atualizar." };
    const { error } = await sb.from("acoes_agendadas")
      .update({
        scheduled_at: executarEm,
        carga: { titulo, request_id: requestId, atualizado_em: new Date().toISOString() },
      })
      .eq("id", refId)
      .eq("conversation_id", ctx.conversa_id);
    if (error) return { ok: false, mensagem: `atualizar falhou: ${error.message}` };
    return { ok: true, dados: { ref_id: refId, executar_em: executarEm }, mensagem: `Compromisso atualizado para ${executarEm}.` };
  }

  // CRIAR: soft-check janela ±4h ANTES de inserir
  const ms = Date.parse(executarEm);
  const janelaIni = new Date(ms - 4 * 3600_000).toISOString();
  const janelaFim = new Date(ms + 4 * 3600_000).toISOString();
  const { data: existente } = await sb.from("acoes_agendadas")
    .select("id, scheduled_at, carga")
    .eq("conversation_id", ctx.conversa_id)
    .eq("status", "pendente")
    .gte("scheduled_at", janelaIni)
    .lte("scheduled_at", janelaFim)
    .limit(1).maybeSingle();
  if (existente?.id) {
    return {
      ok: false,
      mensagem: `Já existe compromisso pendente em janela de ±4h (id=${existente.id}, em=${existente.scheduled_at}). Use acao=atualizar com ref_id=${existente.id} OU desista de criar outro.`,
      dados: {
        codigo: "ja_existe_pendente",
        ref_id: existente.id,
        existente_executar_em: existente.scheduled_at,
        sugestao: { acao: "atualizar", ref_id: existente.id },
      },
    };
  }

  // INSERT com idempotência por request_id (UNIQUE INDEX trata duplo-disparo)
  const { data: novo, error } = await sb.from("acoes_agendadas")
    .insert({
      conversation_id: ctx.conversa_id,
      agente_id: ctx.agente_id,
      lead_id: ctx.lead_id,
      tenant_id: ctx.tenant_id,
      action_type: "agendar_compromisso",
      scheduled_at: executarEm,
      status: "pendente",
      carga: { titulo, request_id: requestId, origem: "gerenciar_compromisso" },
    })
    .select("id")
    .single();
  if (error) {
    // 23505 = unique_violation no request_id (duplo-disparo). Retorna ok=true porque a primeira já criou.
    if (String(error.message).toLowerCase().includes("acoes_idempotencia_request_id")) {
      return { ok: true, dados: { duplicado_ignorado: true }, mensagem: "Compromisso já criado (idempotência via request_id)." };
    }
    return { ok: false, mensagem: `criar falhou: ${error.message}` };
  }
  return {
    ok: true,
    dados: { ref_id: novo?.id, executar_em: executarEm, titulo },
    mensagem: `Compromisso criado: "${titulo}" em ${executarEm}.`,
  };
};

/**
 * Onda 4 (2026-05-14): Handoff explícito entre cargos (Companion 12).
 * Helper interno usado pelos 3 handlers de handoff (jurídico, financeiro, pós-venda).
 * Resolve cargo destino via tipologia/nome, UPDATE conversas.cargo_ativo_id, INSERT trace de auditoria.
 */
async function executarHandoff(
  // deno-lint-ignore no-explicit-any
  sb: SupabaseClient,
  ctx: CtxFerramenta,
  destino: { tipologia: string; nomes: string[]; rotulo: string },
  motivo: string,
): Promise<ResultadoFerramenta> {
  if (!ctx.conversa_id || !ctx.tenant_id) {
    return { ok: false, mensagem: "contexto sem conversa/tenant pra handoff." };
  }
  // Acha cargo destino: tenant primeiro (por nome), fallback global (por nome).
  // Tipologia do enum tem só 4 valores (atendimento|mentor|face_cliente|admin),
  // então jurídico/financeiro/pós-venda são face_cliente diferenciados pelo nome.
  let cargoDestinoId: string | null = null;
  for (const escopo of ["tenant", "global"] as const) {
    if (cargoDestinoId) break;
    for (const nome of destino.nomes) {
      // deno-lint-ignore no-explicit-any
      let q = (sb as any).from("cargos").select("id").eq("escopo", escopo)
        .ilike("nome", nome).eq("ativo", true);
      if (escopo === "tenant") q = q.eq("tenant_id", ctx.tenant_id);
      const { data } = await q.limit(1).maybeSingle();
      if (data?.id) { cargoDestinoId = data.id as string; break; }
    }
  }
  if (!cargoDestinoId) {
    return {
      ok: false,
      mensagem: `Cargo destino "${destino.rotulo}" não encontrado pra este tenant nem como global. Avise o lead que vai transferir e marque follow-up manualmente.`,
    };
  }
  // UPDATE conversa pra novo cargo
  // deno-lint-ignore no-explicit-any
  const { error: errUpd } = await (sb as any).from("conversas")
    .update({ cargo_ativo_id: cargoDestinoId, updated_at: new Date().toISOString() })
    .eq("id", ctx.conversa_id);
  if (errUpd) return { ok: false, mensagem: `UPDATE conversa falhou: ${errUpd.message}` };

  // Trace de auditoria (traces_do_turno)
  // deno-lint-ignore no-explicit-any
  await (sb as any).from("traces_do_turno").insert({
    conversa_id: ctx.conversa_id,
    tipo: `handoff_para_${destino.tipologia}`,
    carga: {
      cargo_destino_id: cargoDestinoId,
      cargo_destino_rotulo: destino.rotulo,
      cargo_origem: ctx.cargo_ativo ?? null,
      motivo: motivo || null,
      origem_tool: `enviar_para_${destino.tipologia}`,
    },
  }).then(() => undefined, () => undefined);

  return {
    ok: true,
    dados: { cargo_destino_id: cargoDestinoId, cargo_destino: destino.rotulo },
    mensagem: `Conversa transferida pro cargo ${destino.rotulo}.`,
  };
}

/**
 * F1 (blueprint v3 §3, 2026-06-10): buscar_produto — o LLM NUNCA digita UUID.
 * Busca fuzzy (pg_trgm via RPC buscar_produto_fuzzy) por nome/slug/palavras-chave
 * no catálogo do tenant e devolve os candidatos REAIS (id + nome + preço quando
 * houver). O produto_id retornado aqui é o único aceito pelo gerenciar_carrinho.
 */
const buscar_produto: Handler = async (sb, ctx, args) => {
  const termo = String(args?.nome ?? args?.query ?? args?.termo ?? "").trim();
  if (!termo) return { ok: false, mensagem: "Informe o nome (ou parte) do produto que o lead quer." };
  // deno-lint-ignore no-explicit-any
  const { data, error } = await (sb as any).rpc("buscar_produto_fuzzy", {
    p_tenant_id: ctx.tenant_id,
    p_termo: termo,
  });
  if (error) return { ok: false, mensagem: `busca falhou: ${error.message}` };
  // deno-lint-ignore no-explicit-any
  const candidatos = ((data as any[]) ?? []).filter((c) => Number(c.pontuacao ?? 0) > 0.05);
  if (!candidatos.length) {
    return { ok: false, mensagem: `Nenhum produto parecido com "${termo}" no catálogo. Pergunte ao lead qual produto ele quer; NÃO invente produto nem id.` };
  }
  // Preço: F2 — fonte única é produtos.preco_centavos; molde/metadata são fallback
  // de convivência (corte 2b remove quando a telemetria mostrar 0 usos).
  const enriquecidos: Array<{ produto_id: string; nome: string; descricao: string | null; preco: number | null }> = [];
  for (const c of candidatos) {
    // deno-lint-ignore no-explicit-any
    const { data: prodPreco } = await (sb as any).from("produtos")
      .select("preco_centavos, metadata").eq("id", c.id).maybeSingle();
    let preco: number | null = prodPreco?.preco_centavos != null ? Number(prodPreco.preco_centavos) / 100 : null;
    if (preco == null) {
      // deno-lint-ignore no-explicit-any
      const { data: tpl } = await (sb as any).from("contratos_template")
        .select("valor_a_vista").eq("user_id", ctx.tenant_id).eq("produto_id", c.id)
        .eq("ativo", true).limit(1).maybeSingle();
      preco = tpl?.valor_a_vista != null ? Number(tpl.valor_a_vista) : null;
    }
    if (preco == null) {
      const mp = (prodPreco?.metadata as Record<string, unknown> | null)?.preco;
      preco = mp != null && Number(mp) > 0 ? Number(mp) : null;
    }
    enriquecidos.push({ produto_id: c.id, nome: c.nome, descricao: c.descricao_curta ?? null, preco });
  }
  const linhas = enriquecidos
    .map((p) => `- ${p.nome} (produto_id: ${p.produto_id})${p.preco != null ? ` — R$ ${p.preco.toFixed(2)}` : ""}`)
    .join("\n");
  return {
    ok: true,
    dados: { candidatos: enriquecidos },
    mensagem: `Produto(s) reais do catálogo:\n${linhas}\nUse EXATAMENTE o produto_id acima ao chamar gerenciar_carrinho.`,
  };
};

/**
 * Onda 5 (2026-05-14): Vendedor 4 fases (Companion 12).
 * gerenciar_carrinho — adiciona/remove/lista produtos do carrinho da conversa.
 */
const gerenciar_carrinho: Handler = async (sb, ctx, args) => {
  const acao = String(args?.acao ?? "").trim();
  if (!ctx.conversa_id) return { ok: false, mensagem: "conversa_id ausente." };

  if (acao === "listar") {
    // deno-lint-ignore no-explicit-any
    const { data, error } = await (sb as any).from("carrinho_da_conversa")
      .select("id, produto_id, quantidade, preco_unitario, adicionado_em, produtos:produto_id(nome)")
      .eq("conversa_id", ctx.conversa_id)
      .order("adicionado_em", { ascending: true });
    if (error) return { ok: false, mensagem: `listar carrinho: ${error.message}` };
    // deno-lint-ignore no-explicit-any
    const itens = ((data as any[]) ?? []).map((r) => ({
      id: r.id,
      produto_id: r.produto_id,
      nome: r.produtos?.nome ?? "(produto removido)",
      quantidade: Number(r.quantidade ?? 1),
      preco_unitario: Number(r.preco_unitario ?? 0),
      subtotal: Number(r.quantidade ?? 1) * Number(r.preco_unitario ?? 0),
    }));
    const total = itens.reduce((s, i) => s + i.subtotal, 0);
    return { ok: true, dados: { itens, total }, mensagem: `Carrinho com ${itens.length} item(ns), total R$ ${total.toFixed(2)}.` };
  }

  const produtoId = args?.produto_id ? String(args.produto_id) : null;
  if (!produtoId) return { ok: false, mensagem: "produto_id obrigatório pra adicionar/remover." };

  if (acao === "adicionar") {
    const quantidade = Math.max(1, Number(args?.quantidade ?? 1));
    // F1 (blueprint v3 §3): valida que o id é UUID real E do tenant. Id alucinado
    // (slug inventado — ~25 falhas/4d em prod) → fail-closed INSTRUTIVO: roda a
    // busca fuzzy com o texto recebido e devolve os candidatos reais pro LLM corrigir.
    const ehUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(produtoId);
    // deno-lint-ignore no-explicit-any
    const { data: prod } = ehUuid
      ? await (sb as any).from("produtos")
        .select("nome, metadata, preco_centavos").eq("id", produtoId).eq("user_id", ctx.tenant_id).maybeSingle()
      : { data: null };
    if (!prod) {
      // Número de rifa caindo no carrinho (2026-09-07, conversa 9a30c57e): o lead mandou
      // "oo,04,25,26,77,76,88,96,99,55", o Porteiro leu como ajuste de pedido e forçou
      // `gerenciar_carrinho`. Vieram 10 chamadas com produto_id "00", "04", "25"… todas
      // recusadas com "use buscar_produto" — endereço errado. O turno acabou sem fonte
      // nenhuma e o modelo escreveu de cabeça que 00, 26 e 77 estavam indisponíveis,
      // contradizendo a lista que ele mesmo tinha dado dois minutos antes (00 estava LIVRE).
      // A recusa agora aponta pra tool certa em vez de mandar procurar produto que não existe.
      if (/^\d{1,4}$/.test(produtoId)) {
        return {
          ok: false,
          mensagem: `"${produtoId}" não é produto do catálogo — isso é NÚMERO DE RIFA. ` +
            `O carrinho não guarda número de rifa. Use \`consultar_numeros_rifa\` (com a lista completa ` +
            `de números que o lead citou) pra saber quais estão livres, e \`vender_numeros_rifa\` pra reservar. ` +
            `NÃO afirme se um número está livre ou ocupado sem o resultado dessas ferramentas nesta resposta.`,
        };
      }
      // UUID inventado (2026-09-18, Giovanna): a busca fuzzy com os hex do id devolvia 3
      // produtos quaisquer — a lista "real" nem tinha a Exclusão Judicial que o lead fechou.
      // Id com cara de UUID não tem texto pra buscar: devolve o catálogo inteiro do tenant.
      // deno-lint-ignore no-explicit-any
      const { data: cand } = ehUuid
        ? await (sb as any).from("produtos").select("id, nome").eq("user_id", ctx.tenant_id).order("nome").limit(20)
        : await (sb as any).rpc("buscar_produto_fuzzy", {
          p_tenant_id: ctx.tenant_id,
          p_termo: produtoId.replace(/[-_]/g, " "),
        });
      // deno-lint-ignore no-explicit-any
      const lista = ((cand as any[]) ?? []).map((c) => `- ${c.nome} (produto_id: ${c.id})`).join("\n");
      return {
        ok: false,
        mensagem: `produto_id "${produtoId}" inválido — NUNCA invente id. ${
          lista
            ? `Candidatos reais do catálogo:\n${lista}\nChame gerenciar_carrinho de novo com o produto_id EXATO acima.`
            : `Use a ferramenta buscar_produto com o nome do produto pra obter o id real.`
        }`,
      };
    }
    // Preço (F2): produtos.preco_centavos é a FONTE ÚNICA; LLM nunca dita preço.
    // Fallbacks de convivência (molde > metadata) só enquanto o produto não tem preço — corte 2b remove.
    let precoUnit = prod.preco_centavos != null ? Number(prod.preco_centavos) / 100 : 0;
    if (!(precoUnit > 0)) precoUnit = Number(args?.preco_unitario ?? 0);
    if (!(precoUnit > 0)) {
      // deno-lint-ignore no-explicit-any
      const { data: tpl } = await (sb as any).from("contratos_template")
        .select("valor_a_vista").eq("user_id", ctx.tenant_id).eq("produto_id", produtoId)
        .eq("ativo", true).limit(1).maybeSingle();
      precoUnit = Number(tpl?.valor_a_vista ?? (prod.metadata as Record<string, unknown>)?.preco ?? 0);
    }
    // Soft-check: já existe esse produto no carrinho?
    // deno-lint-ignore no-explicit-any
    const { data: existente } = await (sb as any).from("carrinho_da_conversa")
      .select("id, quantidade").eq("conversa_id", ctx.conversa_id).eq("produto_id", produtoId)
      .maybeSingle();
    if (existente?.id) {
      // deno-lint-ignore no-explicit-any
      const { error } = await (sb as any).from("carrinho_da_conversa")
        .update({ quantidade: Number(existente.quantidade ?? 1) + quantidade })
        .eq("id", existente.id);
      if (error) return { ok: false, mensagem: `update carrinho: ${error.message}` };
      return { ok: true, dados: { item_id: existente.id, somado: quantidade }, mensagem: `Quantidade somada: agora ${Number(existente.quantidade ?? 1) + quantidade}x ${prod.nome}.` };
    }
    // deno-lint-ignore no-explicit-any
    const { data: novo, error } = await (sb as any).from("carrinho_da_conversa")
      .insert({ conversa_id: ctx.conversa_id, produto_id: produtoId, quantidade, preco_unitario: precoUnit })
      .select("id").single();
    if (error) return { ok: false, mensagem: `adicionar carrinho: ${error.message}` };
    return { ok: true, dados: { item_id: novo?.id, produto: prod.nome, quantidade, preco_unitario: precoUnit }, mensagem: `Adicionado: ${quantidade}x ${prod.nome} (R$ ${precoUnit.toFixed(2)} cada).` };
  }

  if (acao === "remover") {
    // deno-lint-ignore no-explicit-any
    const { error } = await (sb as any).from("carrinho_da_conversa")
      .delete().eq("conversa_id", ctx.conversa_id).eq("produto_id", produtoId);
    if (error) return { ok: false, mensagem: `remover carrinho: ${error.message}` };
    return { ok: true, dados: { produto_id: produtoId }, mensagem: "Item removido do carrinho." };
  }

  return { ok: false, mensagem: `acao "${acao}" inválida. Use adicionar | remover | listar.` };
};

/**
 * funil_de_vendas — agregação inline RPC-less.
 * Etapas: interesse (carrinho aberto) → negociação (contrato emitido) → ganho (contrato assinado).
 * Componente UI renderiza glassmorphism com KPIs.
 */
const funil_de_vendas: Handler = async (sb, ctx, args) => {
  const dias = Math.max(1, Math.min(365, Number(args?.dias ?? 30)));
  const desdeIso = new Date(Date.now() - dias * 86_400_000).toISOString();

  // Conta carrinhos ativos (interesse), contratos emitidos (proposto), assinados (ganho)
  const [carRes, contEmRes, contAssRes] = await Promise.all([
    // deno-lint-ignore no-explicit-any
    (sb as any).from("carrinho_da_conversa").select("id, adicionado_em, conversa_id, produto_id, preco_unitario, quantidade")
      .gte("adicionado_em", desdeIso),
    // deno-lint-ignore no-explicit-any
    (sb as any).from("contratos").select("id, created_at, lead_id")
      .gte("created_at", desdeIso).eq("tenant_id", ctx.tenant_id).in("status", ["emitido", "enviado"]),
    // deno-lint-ignore no-explicit-any
    (sb as any).from("contratos").select("id, created_at, lead_id")
      .gte("created_at", desdeIso).eq("tenant_id", ctx.tenant_id).in("status", ["assinado", "pago", "assinado_pendente_pagto"]),
  ]);
  // deno-lint-ignore no-explicit-any
  const carrinhos = (carRes.data as any[]) ?? [];
  // deno-lint-ignore no-explicit-any
  const contratosEmit = (contEmRes.data as any[]) ?? [];
  // deno-lint-ignore no-explicit-any
  const contratosAss = (contAssRes.data as any[]) ?? [];

  const totalReceita = carrinhos.reduce((s, c) => s + Number(c.quantidade ?? 1) * Number(c.preco_unitario ?? 0), 0);
  const totais = {
    interesse: new Set(carrinhos.map((c) => c.conversa_id)).size,
    negociacao: carrinhos.length,
    proposto: contratosEmit.length,
    ganho: contratosAss.length,
    receita_potencial: totalReceita,
    taxa_conversao_pct: carrinhos.length > 0 ? Math.round((contratosAss.length / carrinhos.length) * 100) : 0,
  };
  return {
    ok: true,
    dados: { ui_tipo: "funil_de_vendas", payload: { dias, totais } },
    mensagem: `Funil dos últimos ${dias} dias: ${totais.interesse} conversa(s) com interesse → ${totais.proposto} proposta(s) → ${totais.ganho} ganho(s) (taxa ${totais.taxa_conversao_pct}%).`,
  };
};

/**
 * converter_lead_em_cliente — fecha venda SEM contrato: insere em `clientes` (a aba Clientes)
 * e carimba `leads.desfecho='convertido'`.
 *
 * A tool existia em `ferramentas_dinamicas` (ativa, 3 cargos, 17 agentes) desde antes, mas
 * NUNCA teve handler aqui: o despacho caía em `handler '...' não registrado` e a tabela
 * `clientes` estava zerada na plataforma inteira. Implementada em 2026-09-07.
 *
 * Idempotente por (owner_id, telefone): rechamar não duplica cliente.
 *
 * `dados_cliente` carrega o que foi coletado DEPOIS do pagamento confirmado — nome, cpf,
 * cnpj e, na auditoria de empresa com mais de um sócio, a lista de sócios.
 */
const converter_lead_em_cliente: Handler = async (sb, ctx, args) => {
  const leadId = ctx.lead_id ?? null;
  const produto = args?.produto ? String(args.produto).trim() : null;
  const valorConversao = args?.valor_conversao !== undefined && args?.valor_conversao !== null
    ? Number(args.valor_conversao)
    : null;

  // deno-lint-ignore no-explicit-any
  const dadosArg = (args?.dados_cliente ?? {}) as any;
  const soNumeros = (v: unknown) => String(v ?? "").replace(/\D/g, "");
  const cpf = soNumeros(dadosArg.cpf) || null;
  const cnpj = soNumeros(dadosArg.cnpj) || null;
  // deno-lint-ignore no-explicit-any
  const socios = Array.isArray(dadosArg.socios)
    ? (dadosArg.socios as any[])
        .map((s) => ({ nome: String(s?.nome ?? "").trim(), cpf: soNumeros(s?.cpf) || null }))
        .filter((s) => s.nome || s.cpf)
    : [];

  // Lead é a fonte do contato; o que o LLM coletou vence o que estava no cadastro.
  // deno-lint-ignore no-explicit-any
  let lead: any = null;
  if (leadId) {
    // deno-lint-ignore no-explicit-any
    const { data } = await (sb as any).from("leads")
      .select("id, name, nome_exibicao, phone, email, tags, desfecho")
      .eq("id", leadId).eq("tenant_id", ctx.tenant_id).maybeSingle();
    lead = data ?? null;
  }

  const nome = String(dadosArg.nome ?? "").trim() || lead?.name || lead?.nome_exibicao || "";
  const telefone = String(dadosArg.telefone ?? "").trim() || lead?.phone || ctx.telefone || null;
  const email = String(dadosArg.email ?? "").trim() || lead?.email || null;

  if (!nome && !telefone) {
    return { ok: false, mensagem: "Sem nome nem telefone pra cadastrar o cliente. Colete o nome antes de chamar esta tool." };
  }

  // Idempotência: mesmo telefone no mesmo tenant = mesmo cliente.
  if (telefone) {
    // deno-lint-ignore no-explicit-any
    const { data: jaExiste } = await (sb as any).from("clientes")
      .select("id, nome")
      .eq("owner_id", ctx.tenant_id)
      .eq("telefone", telefone)
      .is("deleted_at", null)
      .maybeSingle();
    if (jaExiste) {
      return {
        ok: true,
        dados: { cliente_id: jaExiste.id, ja_era_cliente: true },
        mensagem: `${jaExiste.nome || "Esse contato"} já está na aba Clientes — não cadastrei de novo.`,
      };
    }
  }

  const dados: Record<string, unknown> = {
    lead_id: leadId,
    conversa_id: ctx.conversa_id ?? null,
    convertido_em: new Date().toISOString(),
  };
  if (produto) dados.plano = produto;              // a aba Clientes lê `dados.plano` como o produto
  if (valorConversao != null) dados.ltv = valorConversao;
  if (cpf) dados.cpf = cpf;
  if (cnpj) dados.cnpj = cnpj;
  if (socios.length > 0) dados.socios = socios;

  // deno-lint-ignore no-explicit-any
  const { data: novo, error } = await (sb as any).from("clientes")
    .insert({
      owner_id: ctx.tenant_id,
      agente_id: ctx.agente_id ?? null,
      nome: nome || "Sem nome",
      telefone,
      email,
      fonte: "agente",
      tags: Array.isArray(lead?.tags) ? lead.tags : [],
      dados,
    })
    .select("id").single();
  if (error) return { ok: false, mensagem: `Não consegui cadastrar o cliente: ${error.message}` };

  // Carimba o desfecho no lead, só se ainda estava aberto.
  // Lead aberto tem `desfecho` NULL, não "em_aberto": o CHECK da coluna só aceita
  // convertido | recusado | sumido | desqualificado | outro. O `marcar_contrato_assinado`
  // filtra por .eq("desfecho","em_aberto") e por isso nunca casa — ali o trigger
  // `tg_contratos_marcar_convertido` salva a pátria, mas venda SEM contrato não tem trigger
  // nenhum, então aqui o filtro precisa estar certo. (achado 2026-09-07)
  if (leadId) {
    try {
      // deno-lint-ignore no-explicit-any
      await (sb as any).from("leads")
        .update({
          desfecho: "convertido",
          desfecho_em: new Date().toISOString(),
          valor_conversao: valorConversao,
        })
        .eq("id", leadId).eq("tenant_id", ctx.tenant_id).is("desfecho", null);
    } catch (e) {
      console.warn("[converter_lead_em_cliente] desfecho do lead:", e instanceof Error ? e.message : String(e));
    }
  }

  const faltando: string[] = [];
  if (!cpf && !cnpj) faltando.push("CPF/CNPJ");
  const aviso = faltando.length > 0 ? ` Ainda falta coletar: ${faltando.join(", ")}.` : "";
  return {
    ok: true,
    dados: { cliente_id: novo.id, lead_id: leadId, socios: socios.length },
    mensagem: `${nome || "Contato"} entrou na aba Clientes.${aviso}`,
  };
};

/**
 * marcar_contrato_assinado — UPDATE contratos.status='assinado' + leads.desfecho='convertido' + valor_conversao.
 * Onda 15.2 (B1 completo): grava também desfecho no lead (antes só atualizava contrato).
 * Idempotente.
 */
const marcar_contrato_assinado: Handler = async (sb, ctx, args) => {
  const contratoId = args?.contrato_id ? String(args.contrato_id) : null;
  if (!contratoId) return { ok: false, mensagem: "contrato_id obrigatório." };
  const valorConversao = args?.valor_conversao !== undefined && args?.valor_conversao !== null
    ? Number(args.valor_conversao)
    : null;
  // deno-lint-ignore no-explicit-any
  const { data: atual, error: errBusca } = await (sb as any).from("contratos")
    .select("id, status, lead_id").eq("id", contratoId).eq("tenant_id", ctx.tenant_id).maybeSingle();
  if (errBusca) return { ok: false, mensagem: `erro ao buscar contrato ${contratoId}: ${errBusca.message}` };
  if (!atual) return { ok: false, mensagem: `contrato ${contratoId} não encontrado pra este tenant.` };
  if (atual.status === "assinado") {
    return { ok: true, dados: { contrato_id: contratoId, ja_assinado: true }, mensagem: "Contrato já estava assinado." };
  }
  // deno-lint-ignore no-explicit-any
  const { error } = await (sb as any).from("contratos")
    .update({ status: "assinado" }).eq("id", contratoId).eq("tenant_id", ctx.tenant_id);
  if (error) return { ok: false, mensagem: `marcar assinado: ${error.message}` };

  // Onda 15.2: grava desfecho='convertido' + valor_conversao em leads
  // valor_total nunca existiu em `contratos` (colunas reais de preço vivem em opcoes_pagamento/
  // detalhes_pagamento, com chaves inconsistentes por tenant) — não inventar fallback, só usa
  // o que o próprio LLM informou.
  const leadIdAtualizar = atual.lead_id ?? ctx.lead_id ?? null;
  const valorFinal = valorConversao;
  if (leadIdAtualizar) {
    try {
      // deno-lint-ignore no-explicit-any
      await (sb as any).from("leads")
        .update({
          desfecho: "convertido",
          desfecho_em: new Date().toISOString(),
          valor_conversao: valorFinal,
        })
        .eq("id", leadIdAtualizar)
        .eq("tenant_id", ctx.tenant_id)
        .eq("desfecho", "em_aberto");  // só se ainda estava aberto (idempotente)
    } catch (e) {
      console.warn("[marcar_contrato_assinado] erro ao gravar desfecho no lead:", e instanceof Error ? e.message : String(e));
    }
  }

  return {
    ok: true,
    dados: { contrato_id: contratoId, lead_id: leadIdAtualizar, valor_conversao: valorFinal },
    mensagem: "Contrato marcado como assinado e lead convertido."
  };
};

const enviar_para_juridico: Handler = (sb, ctx, args) =>
  executarHandoff(sb, ctx, { tipologia: "juridico", nomes: ["Jurídico", "Juridico"], rotulo: "Jurídico" }, String(args?.motivo ?? ""));

const enviar_para_financeiro: Handler = (sb, ctx, args) =>
  executarHandoff(sb, ctx, { tipologia: "financeiro", nomes: ["Financeiro"], rotulo: "Financeiro" }, String(args?.motivo ?? ""));

const enviar_para_pos_venda: Handler = (sb, ctx, args) =>
  executarHandoff(sb, ctx, { tipologia: "suporte", nomes: ["Pós-venda", "Pos-venda", "Suporte"], rotulo: "Pós-venda" }, String(args?.motivo ?? ""));

const perguntar_ao_dono: Handler = async (sb, ctx, args) => {
  const pergunta = String(args?.pergunta_para_dono ?? args?.pergunta ?? "").trim();
  if (!pergunta) {
    return { ok: false, mensagem: "Informe a pergunta que você quer fazer ao responsável (campo pergunta_para_dono)." };
  }
  const contexto = String(args?.contexto ?? "").trim();
  try {
    const { registrarPerguntaConsciente } = await import("./loop-mentor.ts");
    const r = await registrarPerguntaConsciente(sb, {
      tenantId: ctx.tenant_id,
      conversaId: ctx.conversa_id,
      leadId: ctx.lead_id ?? null,
      agenteId: ctx.agente_id ?? null,
      perguntaFormulada: pergunta,
      contextoResumido: contexto,
    });
    if (!r.pergunta_id) {
      return { ok: false, mensagem: "Não consegui registrar a pergunta agora. Responda o lead com naturalidade e siga; NÃO invente a informação." };
    }
    return {
      ok: true,
      dados: { tipo: "pergunta_registrada", pergunta_id: r.pergunta_id, ja_existia: r.ja_existia },
      mensagem: r.ja_existia
        ? "Você já tinha uma pergunta em aberto nesta conversa — o responsável vai responder. Avise o lead, no SEU tom, que está confirmando e retorna em breve. NÃO invente a resposta."
        : "Pergunta enviada ao responsável. Agora avise o lead, no SEU tom e com naturalidade, que você vai confirmar isso e já retorna. NÃO invente a resposta nem crave prazo exato.",
    };
  } catch (e) {
    return { ok: false, mensagem: `falha ao registrar pergunta: ${(e as Error).message}` };
  }
};

// ═══════════ App Rifas — agente controla o app inteiro (2026-09-06) ═══════════
// As tools de rifa saíram deste arquivo pra dois módulos, por causa da divisão de
// canal cravada pelo Theus em 2026-09-06:
//   • `tools-rifas.ts`       — venda/consulta. Vale nos dois canais (lead + dono).
//   • `tools-rifas-admin.ts` — poder de dono (sortear, aprovar pagamento, mudar
//     preço, dívidas, disparo, config). O motor só carrega no canal INTERNO.
// Catraca de app (`rifa_pode_vender`) continua valendo pros dois pacotes.
const HANDLERS: Record<string, Handler> = {
  transferir_humano, escalar_supervisor, enviar_link_contrato, gerar_contrato, agendar_compromisso, gerenciar_compromisso,
  enviar_link_consulta, consultar_dividas_contato,
  enviar_link_agenda, consultar_horarios_disponiveis, agendar_reuniao_lead,
  agendar_followup, atualizar_lead,
  ...HANDLERS_RIFA_VENDA, ...HANDLERS_RIFA_ADMIN,
  enviar_para_juridico, enviar_para_financeiro, enviar_para_pos_venda,
  buscar_produto, gerenciar_carrinho, funil_de_vendas, marcar_contrato_assinado, converter_lead_em_cliente,
  query_leads_filtro, buscar_gatilhos_reativos, buscar_blocos_conhecimento, atualizar_prancheta,
  mostrar_kpi, listar_leads_recentes, dashboard_resumo, abrir_app, mostrar_desktop, criar_anotacao_mentor,
  perguntar_ao_dono,
};

/**
 * Δ 2026-09-24 · Derivador determinístico de nome de ferramenta pra telemetria
 * (invocacoes_ferramenta.tool_name / ferramentas_log.nome_ferramenta):
 *   • internal://X    → "X"              (nome do handler interno)
 *   • rag://Y         → "rag:Y"          (identificador da busca semântica)
 *   • https://host/p  → hostname         (declara "qual ferramenta de fora rodou")
 *   • qualquer outra  → string bruta cortada em 120 (fallback defensivo)
 */
function derivarNomeFerramenta(endpoint_url: string): string {
  const mInv = endpoint_url.match(/^internal:\/\/(.+)$/);
  if (mInv) return mInv[1].trim();
  const mRag = endpoint_url.match(/^rag:\/\/(.+)$/);
  if (mRag) return `rag:${mRag[1].trim()}`;
  try {
    return new URL(endpoint_url).hostname;
  } catch {
    return endpoint_url.slice(0, 120);
  }
}

/**
 * Despacha ferramenta seja via handler interno (`internal://X`) ou via HTTPS externo
 * (`https://host/path`). Externo passa por sandbox: HTTPS only, allowlist de domínios,
 * timeout 10s, retry 1x em 5xx/network, validação leve de args contra schema_zod.
 *
 * Δ 2026-09-24 · Telemetria de ferramentas (pendência plataforma item 6 — MÉDIA).
 * As tabelas `invocacoes_ferramenta` e `ferramentas_log` já existiam no banco (FKs,
 * policies, índices) mas nenhum código gravava nelas. Este é o PONTO ÚNICO de despacho
 * (todos os canos passam aqui: ragentic-processar-inline e ragentic-tick), então é o
 * lugar certo pra alimentá-las. Regra dura: telemetria NUNCA derruba nem atrasa a tool.
 *   • invocacoes_ferramenta: insert `registrada` ANTES do side-effect (audit trail do
 *     design; aguardado, mas falha é engolida com console.warn — tool prossegue normal).
 *   • update pós-resultado e ferramentas_log: fireAndForget (waitUntil em edge runtime).
 *   • `resultado`/`mensagem`/latência são plain objects/numbers — JSON-safe pro jsonb.
 */
export async function despacharFerramenta(
  // deno-lint-ignore no-explicit-any
  sb: SupabaseClient,
  endpoint_url: string,
  ctx: CtxFerramenta,
  // deno-lint-ignore no-explicit-any
  args: any,
  // deno-lint-ignore no-explicit-any
  ferramentaConfig?: { metodo?: string; dominio_allowlist?: string; schema_zod?: any },
): Promise<ResultadoFerramenta> {
  // Latência TOTAL do despacho (inclui retry externo) — primeiro `Date.now()` da função.
  const t0Despacho = Date.now();
  const nomeFerramenta = derivarNomeFerramenta(endpoint_url);
  const inputValidado = args ?? {};
  // Audit trail ANTES do side-effect (modo seguro do design). Aguardado de propósito,
  // mas nunca pode derrubar a tool: qualquer falha aqui vira console.warn e segue.
  let invocacaoId: string | undefined;
  try {
    const { data: invocReg } = await sb.from("invocacoes_ferramenta").insert({
      conversation_id: ctx.conversa_id,
      tenant_id: ctx.tenant_id,
      tool_name: nomeFerramenta,
      input_validado: inputValidado,
      status: "registrada",
    }).select("id").maybeSingle();
    // deno-lint-ignore no-explicit-any
    invocacaoId = (invocReg as any)?.id ?? undefined;
  } catch (e) {
    console.warn(`[ferramenta_log] insert 'registrada' falhou (não-fatal): ${(e as Error).message}`);
  }

  // Corpo de despacho — mesmo comportamento/efeito/returns de antes, isolado em IIFE
  // só pra capturar o resultado e a latência nos logs abaixo sem tocar na semântica.
  const resultado = await (async (): Promise<ResultadoFerramenta> => {
    // Handler interno
    const m = endpoint_url.match(/^internal:\/\/(.+)$/);
    if (m) {
      const h = HANDLERS[m[1]];
      if (!h) return { ok: false, mensagem: `handler '${m[1]}' não registrado` };
      try { return await h(sb, ctx, args ?? {}); }
      catch (e) { return { ok: false, mensagem: (e as Error).message }; }
    }
    // FERRAMENTA DE AÇÃO SEMÂNTICA — rag://<busca_hibrida_X> (técnica 4)
    // Embeda args.busca -> RPC busca_hibrida -> rerank Cohere -> blocos.
    // Despacho genérico em ./tools-rag.ts (mesmo cano do canal interno).
    const mRag = endpoint_url.match(/^rag:\/\/(.+)$/);
    if (mRag) {
      const { despacharToolRag } = await import("./tools-rag.ts");
      const json = await despacharToolRag(sb, mRag[1].trim(), args ?? {}, {
        tenant_id: ctx.tenant_id,
        nicho_id: null,
        agente_id: ctx.agente_id ?? null,
        lead_id: ctx.lead_id ?? null,
      });
      try {
        // deno-lint-ignore no-explicit-any
        const parsed: any = JSON.parse(json);
        return { ok: parsed?.ok !== false, dados: parsed?.dados, mensagem: parsed?.mensagem ?? "" };
      } catch {
        return { ok: true, dados: json, mensagem: "Busca semântica executada." };
      }
    }

    // HTTPS externo — sandbox
    if (!endpoint_url.startsWith("https://")) {
      return { ok: false, mensagem: `endpoint inválido: somente HTTPS aceito (${endpoint_url.slice(0, 80)})` };
    }
    // Validação allowlist de domínio
    let hostAlvo = "";
    try { hostAlvo = new URL(endpoint_url).host; } catch { return { ok: false, mensagem: "URL malformada" }; }
    const allowlist = (ferramentaConfig?.dominio_allowlist || "")
      .split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (allowlist.length > 0 && allowlist[0] !== "internal") {
      const permitido = allowlist.some((d) => hostAlvo === d || hostAlvo.endsWith("." + d));
      if (!permitido) {
        return { ok: false, mensagem: `domínio '${hostAlvo}' não está na allowlist (${allowlist.join(", ")})` };
      }
    }
    // Validação leve dos args contra schema_zod (JSON Schema). Confere campos required.
    // deno-lint-ignore no-explicit-any
    const schema = ferramentaConfig?.schema_zod as any;
    if (schema && Array.isArray(schema.required)) {
      const argsObj = (args && typeof args === "object") ? args : {};
      const faltando = schema.required.filter((k: string) => !(k in argsObj));
      if (faltando.length > 0) {
        return { ok: false, mensagem: `args obrigatórios faltando: ${faltando.join(", ")}` };
      }
    }
    const metodo = (ferramentaConfig?.metodo || "POST").toUpperCase();
    const corpo = JSON.stringify({
      args: args ?? {},
      contexto: {
        tenant_id: ctx.tenant_id, conversa_id: ctx.conversa_id,
        lead_id: ctx.lead_id, agente_id: ctx.agente_id, cargo_ativo: ctx.cargo_ativo,
      },
    });
    // Executa com timeout + retry 1x
    // deno-lint-ignore no-explicit-any
    async function tentar(): Promise<{ ok: boolean; status: number; body: any; latencia: number; erro?: string }> {
      const t0 = Date.now();
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 10_000);
        const r = await fetch(endpoint_url, {
          method: metodo,
          headers: {
            "Content-Type": "application/json",
            "X-Ragentic-Tenant": ctx.tenant_id || "",
            "X-Ragentic-Conversa": ctx.conversa_id || "",
          },
          body: metodo === "GET" ? undefined : corpo,
          signal: ctl.signal,
        });
        clearTimeout(timer);
        const latencia = Date.now() - t0;
        const txt = await r.text();
        // deno-lint-ignore no-explicit-any
        let body: any = txt;
        try { body = JSON.parse(txt); } catch { /* mantém texto */ }
        return { ok: r.ok, status: r.status, body, latencia };
      } catch (e) {
        return { ok: false, status: 0, body: null, latencia: Date.now() - t0, erro: (e as Error).message };
      }
    }
    let res = await tentar();
    if (!res.ok && (res.status >= 500 || res.status === 0)) {
      res = await tentar(); // retry 1x
    }
    // Auditoria em traces_do_turno
    if (ctx.conversa_id) {
      await sb.from("traces_do_turno").insert({
        conversa_id: ctx.conversa_id,
        tipo: "ferramenta_externa_executada",
        carga: {
          endpoint_url, host: hostAlvo, metodo, status: res.status,
          latencia_ms: res.latencia, ok: res.ok, erro: res.erro,
          body_preview: typeof res.body === "string" ? String(res.body).slice(0, 300) : res.body,
        },
      }).then(() => undefined, () => undefined);
    }
    if (!res.ok) {
      return { ok: false, mensagem: `chamada externa falhou (${res.status}${res.erro ? ` ${res.erro}` : ""})` };
    }
    return { ok: true, dados: res.body, mensagem: `Ferramenta externa executada (${hostAlvo}, ${res.latencia}ms).` };
  })();

  // ── Pós-resultado: telemetria best-effort (fire-and-forget, nunca bloqueia) ──
  const latenciaMs = Date.now() - t0Despacho;

  // 1) Fecha o ciclo do audit trail: registrada → executada|falhou (com motivo e resultado).
  if (invocacaoId) {
    fireAndForget(
      sb.from("invocacoes_ferramenta").update({
        status: resultado.ok ? "executada" : "falhou",
        resultado: resultado,
        motivo: resultado.ok ? null : (resultado.mensagem ?? null),
        executado_em: new Date().toISOString(),
      }).eq("id", invocacaoId),
      "ferramenta_log:update_invocacao",
    );
  }

  // 2) Linha histórica em ferramentas_log (entrada + saída + status + latência).
  // `status` usa SÓ sucesso|erro hoje: `precisa_aprovacao` não é lido em nenhum ponto
  // do fluxo (nem chega no `_config` — ver carregarFerramentasDoCargo) e não existe
  // estado 'pendente_aprovacao' no despacho. Se um dia o aprovador nascer, entra aqui.
  fireAndForget(
    sb.from("ferramentas_log").insert({
      tenant_id: ctx.tenant_id,
      agente_id: ctx.agente_id ?? null,
      nome_ferramenta: nomeFerramenta,
      entrada: inputValidado,
      saida: resultado,
      status: resultado.ok ? "sucesso" : "erro",
      erro_msg: resultado.ok ? null : (resultado.mensagem ?? null),
      latencia_ms: latenciaMs,
    }),
    "ferramenta_log:insert",
  );
  return resultado;
}

/**
 * DEC-038: carrega TODAS as ferramentas registradas nos cargos do tenant (sem schema).
 * Pro Porteiro saber o que existe ANTES de decidir cargo_alvo — só nome + descricao,
 * sem ruído de schema_zod / endpoint. 1 query agregada (cargos → cargo_ferramentas →
 * ferramentas_dinamicas), distinct por nome_tool (mesma tool pode estar em N cargos).
 * Retorna [] se tenant não tem nada (Porteiro segue sem campo `tool_alvo`).
 */
export async function carregarFerramentasDoTenant(
  sb: SupabaseClient,
  tenant_id: string,
): Promise<Array<{ nome_tool: string; descricao: string }>> {
  const { data, error } = await sb
    .from("cargos")
    .select("cargo_ferramentas!inner(ferramentas_dinamicas!inner(nome_tool, descricao, ativo))")
    .eq("tenant_id", tenant_id)
    .eq("ativo", true);
  if (error) throw new Error(`carregarFerramentasDoTenant: ${error.message}`);
  const mapa = new Map<string, string>();
  // deno-lint-ignore no-explicit-any
  for (const cargo of (data ?? []) as any[]) {
    // deno-lint-ignore no-explicit-any
    for (const cf of (cargo.cargo_ferramentas ?? []) as any[]) {
      const f = cf.ferramentas_dinamicas;
      if (f?.ativo && typeof f.nome_tool === "string" && !mapa.has(f.nome_tool)) {
        mapa.set(f.nome_tool, typeof f.descricao === "string" ? f.descricao : "");
      }
    }
  }
  return Array.from(mapa.entries()).map(([nome_tool, descricao]) => ({ nome_tool, descricao }));
}

// deno-lint-ignore no-explicit-any
export async function carregarFerramentasDoCargo(sb: SupabaseClient, cargo_id: string) {
  const { data, error } = await sb
    .from("cargo_ferramentas")
    .select("ordem, ferramentas_dinamicas!inner(nome_tool, descricao, schema_zod, endpoint_url, metodo, dominio_allowlist, ativo)")
    .eq("cargo_id", cargo_id).order("ordem", { ascending: true });
  if (error) throw new Error(`carregarFerramentasDoCargo: ${error.message}`);
  return (data ?? [])
    // deno-lint-ignore no-explicit-any
    .map((r: any) => r.ferramentas_dinamicas)
    // deno-lint-ignore no-explicit-any
    .filter((f: any) => f && f.ativo)
    // deno-lint-ignore no-explicit-any
    .map((f: any) => ({
      type: "function" as const,
      function: {
        name: f.nome_tool,
        description: f.descricao || "",
        parameters: f.schema_zod || { type: "object", properties: {} },
      },
      _endpoint: f.endpoint_url as string,
      _config: {
        metodo: f.metodo as string | undefined,
        dominio_allowlist: f.dominio_allowlist as string | undefined,
        schema_zod: f.schema_zod,
      },
    }));
}

/**
 * Resolve cargo_id pelo nome/tipologia. Prioridade:
 *   1. Cargo do TENANT (escopo='tenant' AND tenant_id=X) — custom do tenant vence sempre
 *   2. Cargo GLOBAL (escopo='global') — catálogo padrão
 *   3. Fallback: cargo global 'atendimento'
 *
 * Confere `nome` exato primeiro, depois `tipologia` (caso o Porteiro retorne tipologia).
 */
// deno-lint-ignore no-explicit-any
export async function resolverCargoIdPorAlvo(
  sb: SupabaseClient,
  alvo: string,
  tenant_id?: string | null,
): Promise<string | null> {
  // NOTA (2026-09-07): a comparação de `nome` é case-SENSITIVE e o Porteiro emite os dois
  // casos — "Vendedor" 9859× e "vendedor" 1209× em 30 dias. A minúscula não casa com o cargo
  // "Vendedor" e cai no fallback, então o mesmo tenant usa conjuntos de ferramenta diferentes
  // conforme o case que o LLM sorteou. NÃO troquei por ILIKE aqui de propósito: hoje há
  // tenants com cargo próprio VAZIO (Tríade tem Vendedor/Atendimento/Suporte com 0
  // ferramentas) e outros com menos que o global (verifik 9 contra 24), e a correção os faria
  // perder ferramenta nos turnos minúsculos. O conserto certo é preencher esses cargos antes.
  const tentativa = async (escopo: "tenant" | "global", col: "nome" | "tipologia", val: string) => {
    let q = sb.from("cargos").select("id").eq("escopo", escopo).eq("ativo", true).eq(col, val);
    if (escopo === "tenant" && tenant_id) q = q.eq("tenant_id", tenant_id);
    const { data } = await q.limit(1).maybeSingle();
    return data?.id ?? null;
  };
  // tenant primeiro (custom vence), depois global
  if (tenant_id) {
    const idTenant = (await tentativa("tenant", "nome", alvo)) || (await tentativa("tenant", "tipologia", alvo));
    if (idTenant) return idTenant;
  }
  // Fallback para alvo que não casa com nada (o Porteiro já emitiu "Vendas", "RH", ...).
  // Vai por TIPOLOGIA, que é o valor canônico minúsculo: o fallback antigo procurava o NOME
  // "atendimento" e o cargo se chama "Atendimento" — nunca casava, e o turno entrava com
  // ZERO ferramenta. E tenta o cargo do tenant antes do global, senão quem customizou perde a
  // customização justamente no fallback. (achado 2026-09-07, caso Lucy/rifas)
  return (await tentativa("global", "nome", alvo))
    || (await tentativa("global", "tipologia", alvo))
    || (tenant_id ? await tentativa("tenant", "tipologia", "atendimento") : null)
    || (await tentativa("global", "tipologia", "atendimento"))
    || (await tentativa("global", "nome", "atendimento"));
}
