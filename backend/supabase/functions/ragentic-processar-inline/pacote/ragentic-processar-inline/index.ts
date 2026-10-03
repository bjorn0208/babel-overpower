// Edge function — `ragentic-processar-inline`
// Substitui o motor `chat` v260 mantendo o webhook antigo intacto.
// Processa 1 conversa síncrona: Porteiro (gemma-4-31b-it) → Síntese (gemini-3.1-flash-lite)
// → tools dinâmicas via `cargo_ferramentas` → bolhas em `caixa_saida_mensagens` (process-followups envia).
// Grava `traces` (decisao_porteiro, tool_call, sintese).
// Retorno compatível com `chat` antigo: { reply, mensagens, conversation_id, media_descricao?, error? }.
//
// Fluxo: WhatsApp → Z-API → webhook (v65) → ragentic-processar-inline → caixa_saida_mensagens
//        → process-followups → Z-API → WhatsApp.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { montarBlocoRifaDoDia } from "../_shared/tools-rifas.ts";
import {
  carregarFerramentasDoCargo,
  carregarFerramentasDoTenant,
  despacharFerramenta,
  resolverCargoIdPorAlvo,
  recuperarBlocosRagFirst,
  expandirQueryRecall,
  recuperarComportamento,
  gerarEmbeddingQuery,
  type CtxFerramenta,
} from "../_shared/tools-internas.ts";
import { carregarRecursosAgente } from "../_shared/apps-agente.ts";
import {
  carregarPacotesAgente,
  montarBlocoPacotesFixos,
  montarTrechoPacotesRelevantes,
  recuperarBlocosPacotes,
  type BlocoPacoteRelevante,
} from "../_shared/pacotes-conhecimento.ts";
import { calcularEngajamento } from "../_shared/engajamento.ts";
import { recuperarMemoriaLead } from "../_shared/recall-memoria.ts";
import { avaliarFatosAntiDup, persistirFatos, type FatoCandidato } from "../_shared/memoria-anti-dup.ts";
import { canalElegivel, derivarCanalConversa } from "../_shared/canal-conversa.ts";
import { detectarDonoLogado } from "../_shared/identidade-interna.ts";
import { quebrarEmBolhas } from "../_shared/bolhas.ts";
import { temLinkContratoFantasma, temPlaceholderNaoResolvido } from "../_shared/guards-link-contrato.ts";
import { conferirChavePix, RE_FALA_PIX } from "../_shared/guards-pix.ts";
import { carregarChavesPixTenant } from "../_shared/chaves-pix-tenant.ts";
import {
  carregarConversaPadrao,
  type ConversaPadraoAtiva,
  detectarProdutoMencionado,
  montarBlocoConversaPadrao,
  type ProdutoCatalogo,
} from "../_shared/produto-foco.ts";
import {
  type DesfechoTool,
  MAX_REFORCO_TOOL_ALVO,
  precisaRetomarToolAlvo,
  resumoToolAlvo,
} from "../_shared/retomada-tool-alvo.ts";
import { getConfigChamada } from "../_shared/config-chamadas.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// Fallback hardcoded — usado se RPC obter_config_chamada_llm falhar OU USAR_CONFIG_CHAMADAS_LLM=false.
// Onda 7A (2026-05-28): motor passou a ler config viva via helper getConfigChamada.
// Constantes mantidas como degradação graciosa.
const MODELO_PORTEIRO = "google/gemma-4-31b-it";
const MODELO_SINTESE = "google/gemini-3.1-flash-lite";
// B3 (2026-05-24): interpretação de mídia (áudio/imagem/PDF). gemini-2.5-flash aceita
// input de áudio/imagem/file nativo (confirmado na OpenRouter models API).
const MODELO_MIDIA = "google/gemini-2.5-flash";
// Fallback de mídia: se o modelo primário (config "sintese") esgotar as tentativas,
// interpretarMidia tenta este. gemini-3.5-flash aceita áudio/imagem/PDF nativo
// (ogg validado na doc oficial) e tem qualidade acima do flash-lite.
const MODELO_MIDIA_FALLBACK = "google/gemini-3.5-flash";
const MAX_ITER_TOOL_CALLING = 3;

/**
 * Linha de FONTE que o Gate B1 recebe por ferramenta executada no turno.
 *
 * Os cortes existem pra uma tool tagarela não empurrar o prompt do juiz; foram de 600/300
 * pra 1200/900 em 2026-09-07, quando `consultar_numeros_rifa` passou a devolver TODOS os
 * livres. Com o corte antigo, uma rifa de 100 números entregava a lista pela metade e o
 * B1 reprovava a resposta certa por "número sem fonte" — o mesmo buraco que a marca
 * `fonte_confiavel` acabou de fechar. Listas grandes saem em faixas ("8-22"), então a
 * mensagem cabe inteira mesmo em rifa de mil números.
 */
// deno-lint-ignore no-explicit-any
function fonteDaTool(nome: string, resultado: any): string {
  // Δ 2026-09-09: o corte em 900 caracteres estava ENGOLINDO A PROVA. A mensagem de
  // `consultar_rifa` passa disso e a frase do sorteio fica no fim — o Gate B1 recebeu a fonte
  // truncada, não achou o horário "20:00" (que está em `rifas.hora_sorteio`) e reprovou a
  // resposta certa como invenção, jogando o turno no fluxo de curiosidade. Fonte de tool é
  // prova: cortar prova faz o juiz condenar inocente.
  return `[${nome}] ${JSON.stringify(resultado?.dados ?? {}).slice(0, 1500)} ${String(resultado?.mensagem ?? "").slice(0, 2500)}`;
}
const HISTORICO_TURNOS = 20;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

// ===== LLM via OpenRouter (credenciais em provedores_llm) =====
const provCache = new Map<string, { url: string; key: string; em: number }>();
async function provedor(slug: string) {
  const c = provCache.get(slug);
  if (c && Date.now() - c.em < 60_000) return c;
  const { data, error } = await supabase
    .from("provedores_llm")
    .select("base_url, api_key")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  if (error || !data?.api_key) throw new Error(`provedor ${slug} ausente`);
  const novo = { url: data.base_url, key: data.api_key, em: Date.now() };
  provCache.set(slug, novo);
  return novo;
}

interface ChamadaLLM {
  modelo: string;
  mensagens: Array<{ role: string; content: string | null; tool_calls?: unknown; tool_call_id?: string; name?: string }>;
  temperatura?: number;
  max_tokens?: number;
  json_mode?: boolean;
  // deno-lint-ignore no-explicit-any
  tools?: any[];
  // DEC-038: roteamento de tool_choice condicional (sem hardcoded).
  // Default "auto" mantém comportamento atual. "required" força tool_call OU falha.
  // Objeto {type:"function", function:{name}} força tool específica — usado quando
  // Porteiro classifica intent claro de tool (anti-placeholder vazando como texto).
  tool_choice?: "auto" | "required" | { type: "function"; function: { name: string } };
}

async function chamarLLM(opts: ChamadaLLM) {
  const p = await provedor("openrouter");
  const inicio = Date.now();
  // deno-lint-ignore no-explicit-any
  const corpo: any = {
    model: opts.modelo,
    messages: opts.mensagens,
    temperature: opts.temperatura ?? 0.4,
    max_tokens: opts.max_tokens ?? 1024,
  };
  if (opts.json_mode) corpo.response_format = { type: "json_object" };
  if (opts.tools?.length) {
    // deno-lint-ignore no-explicit-any
    corpo.tools = opts.tools.map((t: any) => ({ type: t.type, function: t.function }));
    corpo.tool_choice = opts.tool_choice ?? "auto";
  }
  const r = await fetch(`${p.url}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${p.key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://ragentic.app",
      "X-Title": "Ragentic LLM-OS · inline",
    },
    body: JSON.stringify(corpo),
  });
  const latencia_ms = Date.now() - inicio;
  if (!r.ok) throw new Error(`chat ${opts.modelo} ${r.status} ${(await r.text()).slice(0, 300)}`);
  // deno-lint-ignore no-explicit-any
  const j: any = await r.json();
  const msg = j.choices?.[0]?.message ?? {};
  return {
    texto: (msg.content as string) ?? "",
    tool_calls: msg.tool_calls ?? null,
    tokens_entrada: j.usage?.prompt_tokens ?? 0,
    tokens_saida: j.usage?.completion_tokens ?? 0,
    latencia_ms,
  };
}

// ===== Outbox simples (delay humanizado por comprimento, sem engagement-driven ainda) =====
async function enfileirarBolha(input: {
  tenant_id: string;
  conversation_id: string;
  content: string;
  ordem: number;
  t0_ms: number;
  gerada_ate: string | null;
  blocos_acionados?: string[] | null;
  // Cérebro único de retomada (2026-06-13): horário ISO em que a bolha deve SAIR (engatilhada).
  // Quando passado, a bolha fica pendente na caixa de saída até esse instante (peça de saída
  // já respeita scheduled_at). O motor gera 1x agora; a fala só sai no horário que o agente ajustou.
  agendar_para?: string | null;
}) {
  const baseMs = Math.min(8000, Math.max(800, input.content.length * 50));
  const jitter = baseMs * (0.8 + Math.random() * 0.4);
  const delay = Math.round(jitter);
  const typingMs = Math.min(delay, 15000);
  const filaMs = Math.max(0, delay - typingMs);
  // Engatilhado: sai no horário escolhido (+ delay de digitação por bolha pra ordem natural).
  // Normal: sai agora + delay.
  const _agendado = input.agendar_para ? new Date(input.agendar_para).getTime() : null;
  const _baseSaida = _agendado && !isNaN(_agendado) && _agendado > Date.now() ? _agendado : input.t0_ms;
  const scheduledAt = new Date(_baseSaida + filaMs).toISOString();

  // BUG-02: blocos_acionados vai pra carga; webhook reconcilia eco em prod.
  const carga: Record<string, unknown> = {
    typing_ms: typingMs,
    origem: "ragentic-processar-inline",
    gerada_ate: input.gerada_ate,
  };
  if (input.blocos_acionados && input.blocos_acionados.length > 0) {
    carga.blocos_acionados = input.blocos_acionados;
  }

  await supabase.from("caixa_saida_mensagens").insert({
    tenant_id: input.tenant_id,
    conversation_id: input.conversation_id,
    status: "pendente",
    content: input.content,
    bubble_order: input.ordem,
    scheduled_at: scheduledAt,
    delay_calculado_ms: delay,
    engagement_level: "morno",
    carga,
  });
}

// F1 Rifas (2026-09-08): comprovante mandado NA CONVERSA vale igual ao da página pública.
// A página chama `enviar_comprovante_rifa_publico`, que zera `expira_em` e joga o pedido em
// `aguardando_validacao`. Quem mandava o print no WhatsApp ficava de fora: o agente respondia
// "recebi", o cron `expirar_reservas_rifa` (*/5min) rodava e os números voltavam pro pote.
// Aqui a imagem que PARECE comprovante congela a reserva sozinha — determinístico, sem gastar
// tool e sem depender de a LLM lembrar de chamar alguma coisa.
const PISTAS_COMPROVANTE = /comprovante|pix|transfer|pagamento|pagou|paguei|recibo|banco|boleto|r\$|valor pago/i;

async function congelarReservaComComprovante(input: {
  tenant_id: string;
  phone: string;
  media_url: string;
  media_type?: string | null;
  descricao: string;
}): Promise<string> {
  // Só imagem/PDF: áudio e vídeo nunca são comprovante.
  const tipo = (input.media_type ?? "").toLowerCase();
  if (tipo && !tipo.startsWith("image") && !tipo.includes("pdf")) return "";
  // Sem descrição legível (Gemini falhou) não dá pra afirmar que é comprovante — não age.
  if (!PISTAS_COMPROVANTE.test(input.descricao)) return "";

  const phoneDigitos = (input.phone ?? "").replace(/\D/g, "");
  if (!phoneDigitos) return "";

  const { data: pedido } = await supabase
    .from("pedidos_rifa")
    .select("chave_publica, numeros, valor_centavos")
    .eq("tenant_id", input.tenant_id)
    .eq("phone", phoneDigitos)
    .eq("status", "reservado")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pedido?.chave_publica) return "";

  const { data: r, error } = await supabase.rpc("enviar_comprovante_rifa_publico", {
    p_token: pedido.chave_publica,
    p_url: input.media_url,
  });
  // deno-lint-ignore no-explicit-any
  if (error || !(r as any)?.ok) {
    console.warn("[rifa comprovante]", error?.message ?? JSON.stringify(r));
    return "";
  }

  const numeros = ((pedido.numeros as number[] | null) ?? []).join(", ");
  const valor = (Number(pedido.valor_centavos ?? 0) / 100)
    .toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return `[sistema] Comprovante anexado ao pedido de rifa deste contato${numeros ? ` (números ${numeros}` : ""}${numeros ? `, ${valor})` : ""}. ` +
    `A reserva foi congelada e o pedido entrou na fila de validação do dono. ` +
    `Confirme o recebimento ao lead e avise que o dono confere e retorna. ` +
    `NÃO diga que o pagamento já foi aprovado — quem aprova é o dono.`;
}

// F0 universal (2026-06-11): rotas públicas da plataforma cujos links têm entrega garantida.
// Tool nova que devolver `dados.link` numa dessas rotas já nasce com o carteiro.
// Δ 2026-09-09 (Theus): `/rifa/` SAIU desta lista. Entrou em 08/09 pra garantir a entrega do
// link do pedido quando o Gate B1 derruba o texto — e no dia seguinte a regra virou o contrário:
// rifa não manda link nenhum na conversa, porque link tira o lead do chat, que é onde a agente
// fecha a venda. O comprovante mandado aqui já congela a reserva sozinho, então o link do pedido
// deixou de ser necessário. Se um dia voltar, é só recolocar `/rifa/` aqui e o rótulo abaixo.
const ROTAS_PUBLICAS_LINK = ["/contrato/", "/consulta/", "/sala/"] as const;

function ehLinkPlataforma(link: string): boolean {
  return link.startsWith("http") && ROTAS_PUBLICAS_LINK.some((r) => link.includes(r));
}

// Bolha de contexto que acompanha o link quando o Gate B1 derruba o texto do LLM.
function rotuloDoLink(link: string): string {
  if (link.includes("/contrato/")) return "Segue o link do seu contrato:";
  if (link.includes("/consulta/")) return "Segue o link da sua consulta:";
  if (link.includes("/sala/")) return "Segue o link da sua reunião:";
  // Rifa não entra aqui desde 09/09 (ver ROTAS_PUBLICAS_LINK) — o rótulo fica de guarda pro dia
  // em que voltar, mas hoje nenhum link de rifa chega neste caminho.
  if (link.includes("/rifa/")) {
    return link.includes("pedido=")
      ? "Segue o link do seu pedido — nele tem o PIX e é por ele que você manda o comprovante:"
      : "Segue o link da rifa:";
  }
  return "Segue o seu link:";
}

// F0 (blueprint v3 §4): bolha-do-link de contrato — entrega determinística.
// Conteúdo = URL pura (nunca começa com "[" — defesa anti-token do despachante).
// inviolavel=true → barge-in (substituir_caixa_saida_pendentes) não cancela.
// gerada_ate=null → fura o guard de obsolescência do outbox-consumer.
// Dedup: 1 bolha viva por contrato_id na caixa (pendente/processando/enviada).
async function enfileirarBolhaLinkContrato(input: {
  tenant_id: string;
  conversation_id: string;
  link: string;
  contrato_id: string | null;
  ordem: number;
  t0_ms: number;
}): Promise<boolean> {
  if (input.contrato_id) {
    const { data: jaTem } = await supabase.from("caixa_saida_mensagens")
      .select("id")
      .eq("conversation_id", input.conversation_id)
      .in("status", ["pendente", "processando", "enviada"])
      .eq("carga->>contrato_id", input.contrato_id)
      .limit(1).maybeSingle();
    if (jaTem) return false;
  }
  await supabase.from("caixa_saida_mensagens").insert({
    tenant_id: input.tenant_id,
    conversation_id: input.conversation_id,
    status: "pendente",
    content: input.link,
    bubble_order: input.ordem,
    scheduled_at: new Date(input.t0_ms + 2000).toISOString(),
    delay_calculado_ms: 0,
    engagement_level: "morno",
    carga: { typing_ms: 0, origem: "contrato_link", contrato_id: input.contrato_id, inviolavel: true, gerada_ate: null },
  });
  return true;
}

// Δ 2026-09-24 (item 3 auditoria) ── VETO na entrega ──
// ÚNICA implementação da verificação "nenhum trecho reprovado pelo B1 sai pro lead". Usada pelas
// portas que chegam à caixa de saída: entrega final (cobre também o proativo aprovado, que enfileira
// pelo fluxo comum) e o ramo de curiosidade — mesma função, duas portas. Normaliza minúsculas/sem
// acento/espaços (mesma técnica da contraprova do auditor) e derruba a bolha que ainda contenha
// (a) índice reprovado — rede contra a cirurgia ter falhado — ou (b) uma afirmação listada em
// `afirmacoes_sem_suporte`, o trecho exato que o juiz agarrou.
// As afirmações saem DO PRÓPRIO TEXTO da resposta, então match literal é sinal forte; a janela de
// 30 chars exige trecho substancial antes de derrubar (falso positivo vira bolha derrubada, custo
// aceito em nome da garantia de envio: o dono é avisado e a pergunta vira lacuna pra ele).
function normalizarTrechoB1(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function vetarTrechosReprovadosB1(
  textos: string[],
  blocos: string[][],
  reprovados: { bolhasIdx: number[]; trechos: string[] } | null,
): { textos: string[]; blocos: string[][]; vetou: boolean } {
  if (!reprovados) return { textos, blocos, vetou: false };
  const cortadosIdx = new Set(reprovados.bolhasIdx);
  const trechosNorm = (reprovados.trechos || [])
    .map((t) => normalizarTrechoB1(t))
    .filter((t) => t.length >= 25);
  if (cortadosIdx.size === 0 && trechosNorm.length === 0) return { textos, blocos, vetou: false };
  const normTextos = textos.map((t) => normalizarTrechoB1(t));
  const textosLimpos: string[] = [];
  const blocosLimpos: string[][] = [];
  let vetou = false;
  const MIN_JANELA = 30;
  for (let i = 0; i < textos.length; i++) {
    let reprovado = cortadosIdx.has(i);
    if (!reprovado && trechosNorm.length > 0 && normTextos[i]) {
      const t = normTextos[i];
      reprovado = trechosNorm.some((tn) => {
        if (t.includes(tn)) return true;
        if (t.length >= MIN_JANELA) {
          for (let j = 0; j + MIN_JANELA <= tn.length; j += 15) {
            if (t.includes(tn.slice(j, j + MIN_JANELA))) return true;
          }
        }
        return false;
      });
    }
    if (reprovado) {
      vetou = true;
      continue;
    }
    textosLimpos.push(textos[i]);
    blocosLimpos.push(blocos[i] ?? []);
  }
  return { textos: textosLimpos, blocos: blocosLimpos, vetou };
}

// Aviso ao dono (anti-dupe diário, mesmo padrão do gate 402 ~L600): no máximo 1 notificação por
// tipo+título por tenant a cada 24h — conversas diferentes no mesmo dia entram numa só.
async function avisarDonoBloqueioAuditoria(
  tenantId: string,
  convId: string | null,
  perguntaCurta: string,
): Promise<void> {
  try {
    const _titulo = "Resposta bloqueada pela auditoria de groundedness";
    const { data: _jaAvisado } = await supabase
      .from("notificacoes")
      .select("id")
      .eq("user_id", tenantId)
      .eq("tipo", "auditoria_groundedness")
      .eq("titulo", _titulo)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle();
    if (_jaAvisado) return;
    await supabase.from("notificacoes").insert({
      user_id: tenantId,
      tipo: "auditoria_groundedness",
      icone: "alert",
      titulo: _titulo,
      mensagem: [
        "Uma resposta do agente foi bloqueada pela auditoria de groundedness e a conversa ficou sem resposta.",
        convId ? `Conversa: ${convId}.` : "",
        perguntaCurta ? `O lead perguntou: "${perguntaCurta}".` : "",
      ].filter(Boolean).join(" ").slice(0, 500),
      acao: "conversas",
      acao_label: "Abrir conversas",
    });
  } catch (e) {
    console.error(`[gate_b1] aviso de bloqueio por auditoria falhou: ${(e as Error).message}`);
  }
}

// B1 (2026-05-24): o flash-lite às vezes EMITE a tool como TEXTO (em vez de function-calling nativo).
// Formas vistas em prod: <function_calls>{"name":..,"arguments":{..}}</function_calls> e <tool_code>{"acao":..}</tool_code>.
// parseToolEmTexto extrai a intenção pra reexecutar; striparArtefatosTool garante que nada vaze pro lead.
function parseToolEmTexto(texto: string): { nome: string | null; args: Record<string, unknown> } | null {
  if (!texto) return null;
  // B2 (2026-06-06): modelos emitem a tool como TEXTO em variações de <declaration>:
  //   (a) <declaration><nome_tool attr="v" .../></declaration>
  //   (b) <declaration:default_api:nome_tool attr="v" ...>  (estilo Gemini, com namespace)
  // Extrai a 1ª tag mapeável + atributos; o re-prompt do chamador pega as demais numa próxima
  // iteração. Sem isso, o bloco vazava pro lead e a ação não executava.
  const lerAttrs = (s: string): Record<string, unknown> => {
    const args: Record<string, unknown> = {};
    const re = /([a-z_][a-z0-9_]*)\s*=\s*"([^"]*)"/gi;
    let a: RegExpExecArray | null;
    while ((a = re.exec(s)) !== null) args[a[1]] = a[2];
    return args;
  };
  const declNs = texto.match(/<declaration:(?:[a-z0-9_]+:)*([a-z_][a-z0-9_]*)\b([^>]*)>/i);
  if (declNs) return { nome: declNs[1], args: lerAttrs(declNs[2] ?? "") };
  const declBloco = texto.match(/<declaration>\s*([\s\S]*?)\s*(?:<\/declaration>|$)/i);
  if (declBloco && declBloco[1]) {
    const tag = declBloco[1].match(/<\s*([a-z_][a-z0-9_]*)\b([^>]*?)\/?>/i);
    if (tag) return { nome: tag[1], args: lerAttrs(tag[2] ?? "") };
  }
  const m =
    texto.match(/<function_calls>\s*([\s\S]*?)\s*(?:<\/function_calls>|$)/i) ||
    texto.match(/<tool_code>\s*([\s\S]*?)\s*(?:<\/tool_code>|$)/i) ||
    texto.match(/```json\s*([\s\S]*?)\s*```/i);
  let bruto = m ? m[1].trim() : null;
  if (!bruto) {
    const j = texto.match(/\{[\s\S]*\}/);
    if (j && /("name"\s*:|"arguments"\s*:|"acao"\s*:|"executar_em"\s*:|"request_id"\s*:)/.test(j[0])) bruto = j[0];
  }
  if (!bruto) return null;
  try {
    const obj = JSON.parse(bruto) as Record<string, unknown>;
    if (typeof obj.name === "string") {
      const args = obj.arguments && typeof obj.arguments === "object" ? (obj.arguments as Record<string, unknown>) : {};
      return { nome: obj.name, args };
    }
    return { nome: null, args: obj };
  } catch {
    return { nome: null, args: {} };
  }
}

function striparArtefatosTool(texto: string): string {
  return (texto || "")
    .replace(/<declaration\b[\s\S]*?<\/declaration>/gi, "")
    .replace(/<declaration:[\s\S]*?>/gi, "")
    .replace(/<\/?declaration\b[^>]*>/gi, "")
    .replace(/<function_calls>[\s\S]*?(?:<\/function_calls>|$)/gi, "")
    .replace(/<tool_code>[\s\S]*?(?:<\/tool_code>|$)/gi, "")
    .replace(/```json\s*[\s\S]*?```/gi, "")
    .trim();
}

// N1 (2026-05-24): defesa em profundidade contra placeholder de nome cru ("[Nome do Lead]",
// "[nome]", "[Nome do Lead, se souber, ou "então"]") que o flash-lite ecoava pro lead. Colchetes
// nunca são saída válida; remove o token e limpa pontuação/espaço órfãos ("Olha, [nome], te" → "Olha, te").
function striparPlaceholders(texto: string): string {
  if (!texto) return texto;
  return texto
    // remove ", [..nome..]" / " [..nome..]" / "[..nome..]" (com vírgula/espaço anterior)
    .replace(/\s*,?\s*\[[^\]]*\bnome\b[^\]]*\]/gi, "")
    // sobrou começo de frase com vírgula/espaço órfão ("  , me deixa" → "me deixa")
    .replace(/(^|\n)\s*,\s*/g, "$1")
    // colapsa espaço duplo e " ," / " ." órfãos
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return jsonResp({ error: "method_not_allowed" }, 405);

  try {
    const body = await req.json();
    // `phone` é `let` (não `const`) porque a defesa abaixo (2026-05-26 22:13 BRT) pode
    // resolvê-lo via `conversation_id` quando vier vazio — fix da esteira do cron
    // `processar-acompanhamentos` que não passava phone e quebrava 100% dos
    // `agendar_compromisso`. Mantém `message`/`agente_id` const (sem fallback aqui).
    let phone: string | undefined;
    const {
      message,
      agente_id,
      phone: phoneInbound,
      media_url,
      media_type,
      // channel e source vêm do webhook mas Ragentic v1 ignora (só whatsapp por enquanto)
      inbound_persistida = false,
      conversation_id: convIdInbound,
      // corte_em: instante em que o webhook reivindicou o buffer e chamou o
      // motor. Msg do lead com created_at > corte_em chegou DEPOIS que esta
      // resposta começou → resposta obsoleta (guard no outbox-consumer).
      corte_em = null,
      // modo_teste: usado pelo Chat de Teste do dono do tenant.
      // Quando true: NÃO insere user msg em `mensagens`, NÃO enfileira bolhas em
      // `caixa_saida_mensagens` (evita disparo Z-API). Mantém traces pra observabilidade.
      // Retorno HTTP traz as bolhas em `mensagens` direto.
      modo_teste = false,
    } = body ?? {};

    // Fusão C1 · Fase 3c.3 — branch do CANAL INTERNO (dono no commandbar).
    // Detecta forma Mentor (conversa_id+mensagem, sem agente_id/phone) + dono logado
    // server-side. Externo (Z-API sem JWT → dono=null; Chat-Teste → modo_teste) NUNCA
    // entra aqui → fluxo externo byte-equivalente. cargo_tipologia eliminado (D1):
    // nível vem de profiles.system_role server-side, nunca do cliente.
    const ehFormatoInterno = !agente_id && !phone && typeof body?.conversa_id === "string" && typeof body?.mensagem === "string";
    // canal='curadoria' (Onda 2C.8) também entra aqui mesmo com modo_teste=true,
    // porque o app /admin/curadoria envia modo_teste=true por construção (não
    // dispara Z-API — é canal interno do platform_admin). Default 'mentor'
    // preserva comportamento histórico (modo_teste=true → fluxo externo).
    const canalRequisitado: "mentor" | "curadoria" | "rifas" =
      body?.canal === "curadoria" ? "curadoria" : body?.canal === "rifas" ? "rifas" : "mentor";
    const deveEntrarCanalInterno = ehFormatoInterno && (!modo_teste || canalRequisitado === "curadoria");
    if (deveEntrarCanalInterno) {
      const dono = await detectarDonoLogado(req);
      if (dono) {
        const admin = supabase; // service_role já instanciado (L25)
        const { data: perfil } = await admin
          .from("profiles").select("system_role, parent_user_id").eq("id", dono.userId).maybeSingle();
        const ehAdmin = perfil?.system_role === "platform_admin";
        const tenantId = (perfil?.parent_user_id as string | null) ?? dono.userId;

        // Canal Curadoria exige platform_admin (cargo Curadoria é invisível
        // ao tenant). Se outro user pedir, cai pro fluxo Mentor padrão.
        // Bricio (canal 'rifas', 2026-09-06): agente dedicado ao app Rifas. Só sobe
        // se o tenant TEM o app — sem isso ele apareceria sem nenhuma ferramenta e
        // ficaria dando resposta vazia sobre uma rifa que não existe. Catraca fechada
        // cai pro Mentor, que sabe dizer que o app está fora.
        //
        // Catraca é `rifa_app_instalado`, não `rifa_pode_vender` (Theus 2026-09-07):
        // "o Bricio é o agente dentro da Rifa". `agente_pode_vender` governa o agente
        // falando com o LEAD; pendurar o canal do DONO nele cegava o dono do próprio
        // painel — com a venda desligada, a aba Bricio caía pro Mentor em silêncio e
        // ele não conseguia nem perguntar quanto vendeu. Foi por isso que o Bricio
        // não rodou UM turno entre 06/09 e 07/09.
        let canalEfetivo: "mentor" | "curadoria" | "rifas" =
          canalRequisitado === "curadoria" && ehAdmin ? "curadoria" : "mentor";
        if (canalRequisitado === "rifas") {
          const { data: temApp } = await supabase.rpc("rifa_app_instalado", { p_tenant_id: tenantId });
          canalEfetivo = temApp === true ? "rifas" : "mentor";
        }

        const contextoCuradoria = (body?.contexto_curadoria ?? null) as
          | { aba_ativa?: string; tenant_id?: string | null; tenant_nome?: string }
          | null;
        const modeloOverride = typeof body?.modelo_override === "string"
          ? String(body.modelo_override)
          : null;

        const { processarCanalInterno } = await import("../_shared/canal-interno.ts");
        const r = await processarCanalInterno({
          mensagem: String(body.mensagem),
          conversaId: String(body.conversa_id),
          userId: dono.userId,
          ehAdmin,
          tenantId,
          canal: canalEfetivo,
          contextoAba: contextoCuradoria?.aba_ativa ?? null,
          tenantImpersonadoId: contextoCuradoria?.tenant_id ?? null,
          modeloOverride,
        });
        return jsonResp(
          r.ok ? { ok: true, mensagem: r.mensagem, tool_calls: r.tool_calls } : { error: r.erro ?? "erro_interno" },
          r.ok ? 200 : (r.status ?? 500),
        );
      }
    }

    // Defesa contra chamadas internas que esquecem `phone` mas têm `conversation_id`
    // (cron `processar-acompanhamentos` antes do fix 2026-05-26 era o caso histórico —
    // 100% das ações `agendar_compromisso` morriam aqui no `params_missing`).
    // Resolve uma vez por request, sem alterar o caminho do webhook real (que sempre
    // passa phone).
    phone = phoneInbound;
    if (!phone && convIdInbound) {
      const { data: convResolv } = await supabase
        .from("conversas")
        .select("phone")
        .eq("id", convIdInbound)
        .maybeSingle();
      if (convResolv?.phone) phone = convResolv.phone as string;
    }

    if (!agente_id || !phone || !message) {
      return jsonResp({ error: "params_missing", reply: "", mensagens: [] }, 400);
    }

    // Resolver tenant pelo agente — carrega identidade + calibragem empática (Onda 6)
    const { data: agente } = await supabase
      .from("agentes_usuario")
      .select("id, user_id, nome_agente, identidade, tom_agente, calibragem_recall, configuracao")
      .eq("id", agente_id)
      .maybeSingle();
    if (!agente?.user_id) {
      return jsonResp({ error: "agente_nao_encontrado", reply: "", mensagens: [] }, 404);
    }
    const tenant_id: string = agente.user_id;

    // ── Tranca de chamada (A1 — auditoria de segurança 2026-06-23) ──────────
    // O caminho externo (agente_id + phone) era ABERTO: qualquer um com a
    // anon_key (pública, está no bundle) + um agente_id + um phone fazia o motor
    // responder como se fosse o lead — gastava LLM do tenant e disparava o
    // WhatsApp dele pra um número escolhido (denial-of-wallet + spam em nome do
    // cliente). Agora exige credencial: service_role (webhook +
    // processar-acompanhamentos) OU JWT de usuário dono/equipe do agente
    // (Chat-Teste, retomar manual, demais chamadas autenticadas do front).
    // Fail-closed. Caminho de produção (service_role) custa só 1 comparação de
    // string — sem getUser. service_role nunca toma 401.
    {
      const _auth = req.headers.get("Authorization") ?? "";
      const _token = _auth.replace(/^Bearer\s+/i, "").trim();
      const _ehService = _token.length > 20 &&
        _token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!_ehService) {
        const _dono = await detectarDonoLogado(req);
        let _autorizado = false;
        if (_dono?.userId) {
          if (_dono.userId === tenant_id) {
            _autorizado = true;
          } else {
            const { data: _membro } = await supabase
              .from("profiles")
              .select("id")
              .eq("id", _dono.userId)
              .eq("parent_user_id", tenant_id)
              .maybeSingle();
            _autorizado = !!_membro;
          }
        }
        if (!_autorizado) {
          console.warn("[ragentic-processar-inline] 401 chamada externa sem credencial", { agente_id });
          return jsonResp({ error: "unauthorized", reply: "", mensagens: [] }, 401);
        }
      }
    }

    // --- Gate de plano (replica chat v260 L155-165) ---
    // Assinatura inativa/expirada OU limite de conversas estourado → 402.
    // O webhook traduz 402 em bloqueio silencioso (Z-API 200, agente não responde,
    // msg do lead já foi gravada → dono responde manual). Sem assinatura + com
    // tenant também bloqueia. Gate global (v260 não distinguia interno/externo).
    {
      const { data: _sub } = await supabase
        .from("assinaturas_usuario")
        .select("status, data_expiracao, max_conversas, conversas_usadas")
        .eq("user_id", tenant_id)
        .maybeSingle();
      const _planoVencido = !_sub
        || !["active", "ativa"].includes(String(_sub.status))
        || (!!_sub.data_expiracao && new Date(_sub.data_expiracao as string) < new Date());
      if (_planoVencido || (_sub!.max_conversas !== null && (_sub!.conversas_usadas as number) >= (_sub!.max_conversas as number))) {
        const _motivo = _planoVencido ? "plano_inativo" : "limite_conversas";
        // 2026-09-17 (varredura): o bloqueio era 100% silencioso — a mensagem do
        // lead ficava gravada, a agente não respondia e o dono não sabia. Agora
        // cai uma notificação no painel dele, no máximo 1 por dia por motivo.
        try {
          const _titulo = _planoVencido
            ? "Atendimento automático pausado: plano inativo"
            : "Atendimento automático pausado: limite de conversas";
          const { data: _jaAvisado } = await supabase
            .from("notificacoes")
            .select("id")
            .eq("user_id", tenant_id)
            .eq("tipo", "atendimento_bloqueado")
            .eq("titulo", _titulo)
            .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .limit(1)
            .maybeSingle();
          if (!_jaAvisado) {
            await supabase.from("notificacoes").insert({
              user_id: tenant_id,
              tipo: "atendimento_bloqueado",
              icone: "alert",
              titulo: _titulo,
              mensagem: _planoVencido
                ? "Um cliente mandou mensagem e a agente não respondeu porque a assinatura está inativa ou vencida. A mensagem está salva na conversa."
                : "Um cliente mandou mensagem e a agente não respondeu porque o limite de conversas do plano foi atingido. A mensagem está salva na conversa.",
              acao: "conversas",
              acao_label: "Abrir conversas",
            });
          }
        } catch (_e) {
          console.error(`[ragentic-processar-inline] aviso de bloqueio falhou: ${(_e as Error).message}`);
        }
        console.warn(`[ragentic-processar-inline] 402 ${_motivo} tenant=${tenant_id}`);
        return jsonResp({ error: _motivo, reply: "", mensagens: [] }, 402);
      }
    }

    const identidadeAgente = (agente?.identidade as Record<string, unknown>) || {};
    const nomeAgente = (agente?.nome_agente as string) || (identidadeAgente.nome as string) || "";
    const cargoIdentidade = (identidadeAgente.cargo as string) || "";
    const personalidadeAgente = (identidadeAgente.personalidade as string) || "";
    const tomAgente = (agente?.tom_agente as string) || "espelhado";

    // Onda 6 (2026-05-14): calibragem empática (Propostas 12-05 Companion).
    // Lê agentes.calibragem_recall.empatia (jsonb) cravado pelo tenant em AppAgente.
    const calibragem = (agente?.calibragem_recall as Record<string, unknown> | null) || null;
    const empatia = (calibragem?.empatia as Record<string, unknown> | null) || null;

    // Resolver conversa (ou usar a que o webhook já criou)
    let conversa_id: string | null = convIdInbound ?? null;
    if (!conversa_id) {
      const { data: c } = await supabase
        .from("conversas")
        .select("id")
        .eq("phone", phone)
        .eq("tenant_id", tenant_id)
        .in("status", ["ativa", "humano"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      conversa_id = c?.id ?? null;
    }
    // modo_teste: cria conversa channel='teste' automaticamente se não veio uma.
    // Service_role bypassa RLS — frontend não precisa de policy de INSERT em `conversas`.
    // Onda 2026-05-13 — também garante um LEAD DE TESTE oficial associado (entidade
    // legítima da plataforma, não fantasma). Sem ele, o Extrator Sistema 1 — que checa
    // `if (cargoId && conv?.lead_id)` — pula e Prancheta fica vazia.
    if (!conversa_id && modo_teste) {
      const phoneTeste = `__chat_teste_${tenant_id.slice(0, 8)}__`;
      // 1) Resolver/criar o Lead de Teste oficial do tenant
      let leadIdTeste: string | null = null;
      const { data: leadExistente } = await supabase
        .from("leads")
        .select("id")
        .eq("tenant_id", tenant_id)
        .eq("phone", phoneTeste)
        .is("deleted_at", null)
        .maybeSingle();
      if (leadExistente?.id) {
        leadIdTeste = leadExistente.id as string;
      } else {
        const { data: leadNovo, error: errLead } = await supabase
          .from("leads")
          .insert({
            tenant_id,
            agente_id,
            phone: phoneTeste,
            name: "Lead de Teste",
            nome_exibicao: "Lead de Teste",
            dados_ficha: {},
            tags: ["lead_de_teste"],
          })
          .select("id")
          .single();
        if (errLead) {
          console.warn("[chat-teste] criar Lead de Teste falhou:", errLead.message);
        } else {
          leadIdTeste = leadNovo?.id as string;
        }
      }
      // 2) Criar a conversa linkada ao lead
      const { data: nova, error: errIns } = await supabase
        .from("conversas")
        .insert({
          tenant_id,
          agente_id,
          phone: phoneTeste,
          channel: "teste",
          status: "ativa",
          agent_enabled: true,
          titulo: "Chat de Teste · Ragentic",
          lead_id: leadIdTeste,
        })
        .select("id")
        .single();
      if (errIns) {
        return jsonResp({ error: `criar_conversa_teste: ${errIns.message}`, reply: "", mensagens: [] }, 500);
      }
      conversa_id = nova.id;
    }
    if (!conversa_id) {
      return jsonResp({ error: "conversa_nao_encontrada", reply: "", mensagens: [] }, 404);
    }

    // Onda 2026-05-14 — defesa em camadas: se a conversa de TESTE existe mas SEM lead_id
    // (frontend antigo do Chat-Teste criava assim antes do fix), garante o Lead de Teste
    // oficial e linka. Sem isso o Extrator Sistema 1 (`if cargoId && conv?.lead_id`) pula
    // silencioso → Prancheta nunca preenche, dossiê parece morto.
    if (modo_teste) {
      const { data: convCheck } = await supabase
        .from("conversas")
        .select("lead_id, phone")
        .eq("id", conversa_id)
        .maybeSingle();
      if (convCheck && !convCheck.lead_id) {
        const phoneTeste = (convCheck.phone as string) || `__chat_teste_${tenant_id.slice(0, 8)}__`;
        let leadIdTeste: string | null = null;
        const { data: leadExistente } = await supabase
          .from("leads")
          .select("id")
          .eq("tenant_id", tenant_id)
          .eq("phone", phoneTeste)
          .is("deleted_at", null)
          .maybeSingle();
        if (leadExistente?.id) {
          leadIdTeste = leadExistente.id as string;
        } else {
          const { data: leadNovo } = await supabase
            .from("leads")
            .insert({
              tenant_id,
              agente_id,
              phone: phoneTeste,
              name: "Lead de Teste",
              nome_exibicao: "Lead de Teste",
              dados_ficha: {},
              tags: ["lead_de_teste"],
            })
            .select("id")
            .single();
          leadIdTeste = (leadNovo?.id as string) ?? null;
        }
        if (leadIdTeste) {
          await supabase.from("conversas").update({ lead_id: leadIdTeste }).eq("id", conversa_id);
        }
      }
    }

    // ── Detecção de TOKEN PROATIVO (followups, retomadas, cobranças, campanha, DEC-017) ──
    // Substitui o motor `chat` v260: msgs do tipo `[X]` vindas do `processar-acompanhamentos`
    // NÃO são fala real do user. Pulamos o porteiro e montamos system prompt customizado.
    // B3 (2026-05-24): `[MEDIA_RECEBIDA]` também casa o padrão `[X]` — mas é mídia, não token.
    // `!media_url` impede que mídia seja tratada como token proativo (e pulasse o porteiro).
    const ehTokenProativo = typeof message === "string" && !media_url
      && message.startsWith("[") && message.endsWith("]") && message.length < 80;
    const tokenSemColchetes = ehTokenProativo ? message.slice(1, -1) : "";

    // B3 (2026-05-24): interpretar mídia (áudio→transcrição, imagem/PDF→descrição) via Gemini
    // multimodal. O motor recebia media_url mas só guardava em carga e mandava "[MEDIA_RECEBIDA]"
    // genérico → agente ignorava. Agora a interpretação vira a fala efetiva do turno
    // (mensagemEfetiva) e é devolvida em `media_descricao` (webhook enriquece o histórico).
    // +1 chamada LLM SÓ quando há mídia. Degrada gracioso: falha → mensagemEfetiva = message.
    let mensagemEfetiva: string = message;
    let descricaoMidia = "";
    if (media_url) {
      let rotulo = "Anexo";
      const legenda = (message && message !== "[MEDIA_RECEBIDA]") ? message.trim() : "";
      try {
        const prov = await provedor("openrouter");
        const { interpretarMidia, rotuloMidia } = await import("../_shared/midia-gemini.ts");
        rotulo = rotuloMidia(media_type, media_url);
        descricaoMidia = await interpretarMidia({
          mediaUrl: media_url, mediaType: media_type, apiKey: prov.key, baseUrl: prov.url,
          modelo: (await getConfigChamada(supabase, "sintese", tenant_id ?? null, null)).modelo,
          modeloFallback: MODELO_MIDIA_FALLBACK,
        });
      } catch (eMidia) {
        console.warn("[b3 midia]", (eMidia as Error).message);
      }
      if (descricaoMidia) {
        mensagemEfetiva = legenda
          ? `${legenda}\n\n[${rotulo} enviado pelo lead — conteúdo: ${descricaoMidia}]`
          : `[${rotulo} enviado pelo lead — conteúdo: ${descricaoMidia}]`;
      } else {
        // Falhou primário + fallback (ou exceção): não deixa o agente cego/mudo —
        // instrui a pedir reenvio por texto em vez de ignorar a mídia.
        mensagemEfetiva = legenda
          ? `${legenda}\n\n[${rotulo} enviado pelo lead, mas não consegui acessar o conteúdo — peça gentilmente para o lead reenviar a informação por texto]`
          : `[${rotulo} enviado pelo lead, mas não consegui acessar o conteúdo — peça gentilmente para o lead reenviar a informação por texto]`;
      }
    }

    // F1 Rifas: print de pagamento na conversa congela a reserva antes de qualquer LLM decidir.
    // Best-effort: nada aqui pode derrubar o turno — sem pedido reservado, sai vazio e segue.
    if (media_url && descricaoMidia && phone && tenant_id && !modo_teste) {
      try {
        const avisoComprovante = await congelarReservaComComprovante({
          tenant_id, phone, media_url, media_type, descricao: descricaoMidia,
        });
        if (avisoComprovante) mensagemEfetiva = `${mensagemEfetiva}\n\n${avisoComprovante}`;
      } catch (eComp) {
        console.warn("[rifa comprovante] falhou:", (eComp as Error).message);
      }
    }

    // deno-lint-ignore no-explicit-any
    const metadata: Record<string, any> = (body as any)?.metadata ?? {};

    // DEC-017: PLANEJAR_RETOMADA_* — não envia bolha, só agenda novo TRIGGER_TEMPORAL_* futuro.
    if (ehTokenProativo && tokenSemColchetes.startsWith("PLANEJAR_RETOMADA_")) {
      const sufixo = tokenSemColchetes.replace("PLANEJAR_RETOMADA_", "");
      // Buscar agente_id e tenant pra planejar
      const { data: agentePlan } = await supabase
        .from("agentes_usuario").select("user_id").eq("id", agente_id).maybeSingle();
      const tenantPlan = agentePlan?.user_id;
      if (!tenantPlan) return jsonResp({ error: "agente_invalido_para_planejar", reply: "", mensagens: [] }, 400);
      // Histórico curto pra contexto (+ created_at pra calcular a faixa típica de horário)
      const { data: histPlan } = await supabase.from("mensagens")
        .select("role, content, created_at").eq("conversation_id", conversa_id).is("deleted_at", null)
        .order("created_at", { ascending: false }).limit(20);
      // deno-lint-ignore no-explicit-any
      const _histArr = ((histPlan as any[]) ?? []).reverse();
      const histTxt = _histArr.slice(-8)
        .map((h) => `${h.role}: ${(h.content || "").slice(0, 200)}`).join("\n");

      // ── Planejador enriquecido (2026-06-13, flag USAR_PLANEJADOR_RICO) ──
      // Em vez de decidir horas no escuro, o planejador recebe: relógio BRT + faixa de
      // horário em que ESTE par costuma conversar + os blocos de retomada (RAG) que ensinam
      // QUANDO voltar por nicho. A régua de horário vem do RAG, não do código.
      // Default OFF (2026-06-13): o smoke mostrou a LLM errando o horário (02h da madrugada) quando
      // decide horas sozinha. Substituído pelo cérebro único (motor decide quando_voltar via RAG).
      // Mantido atrás de flag só pra reversão/compat — não liga por default.
      const _planejadorRico = (Deno.env.get("USAR_PLANEJADOR_RICO") ?? "false") === "true";
      let _ctxRicoSystem = "";
      if (_planejadorRico) {
        const _agoraBRTPlan = new Date().toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
        });
        // Data de hoje em ISO-BRT (YYYY-MM-DD) pra a LLM montar o horario_alvo na data certa.
        const _hojeISOBRT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
        // Faixa típica: horas (BRT) das mensagens reais da conversa
        const _horasConversa = Array.from(new Set(
          // deno-lint-ignore no-explicit-any
          _histArr.map((h: any) => {
            try {
              return new Date(h.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit" }).replace(/\D/g, "");
            } catch { return null; }
          }).filter((x: string | null): x is string => !!x),
        )).map((hh) => `${hh}h`).join(", ");
        // Blocos de retomada (RAG) — global + tenant; o conteúdo carrega a régua de horário
        const { data: _blocosRet } = await supabase.from("blocos_comportamento")
          .select("situacao_descricao, instrucao")
          .contains("tags", ["retomada"]).eq("ativo", true).is("deleted_at", null)
          .or(`escopo.eq.global,tenant_id.eq.${tenantPlan}`).limit(8);
        // deno-lint-ignore no-explicit-any
        const _blocosTxt = ((_blocosRet as any[]) ?? [])
          .map((b) => `- ${b.situacao_descricao ? b.situacao_descricao + ": " : ""}${b.instrucao ?? ""}`).join("\n");
        _ctxRicoSystem =
          `\nAGORA: ${_agoraBRTPlan} (horário de Brasília — BRT).\n` +
          (_horasConversa ? `Horários em que vocês COSTUMAM conversar: ${_horasConversa}.\n` : "") +
          (_blocosTxt ? `\nCONHECIMENTOS DE RETOMADA (siga estas regras pra escolher QUANDO voltar — NUNCA invente horário fora do que elas orientam):\n${_blocosTxt}\n` : "") +
          `\nEm vez de "horas_a_partir_de_agora", retorne "horario_alvo" no formato "${_hojeISOBRT}T20:00" (data YYYY-MM-DD + T + HH:MM, no fuso de Brasília) — o MOMENTO EXATO em que a retomada deve disparar, escolhido pra ficar coerente com as regras acima e com os horários habituais (ex.: se já é noite e a regra manda retomar de manhã, escolha amanhã de manhã; se costumam falar à tarde, mire a próxima tarde). NÃO calcule horas — só escolha o melhor dia e hora.\n`;
      }

      // Gemma decide: quando, ângulo, assunto (JSON)
      const planRes = await chamarLLM({
        modelo: (await getConfigChamada(supabase, "porteiro", tenant_id ?? null, null)).modelo,
        temperatura: 0.4, max_tokens: 256, json_mode: true,
        mensagens: [
          {
            role: "system",
            content:
              "Você é o Planejador de Retomada. Receba o histórico curto da conversa e decida " +
              "QUANDO, ANGULO e ASSUNTO da próxima retomada. Retorne JSON: " +
              '{"horas_a_partir_de_agora": int 2-96, "angulo": "empatico"|"curioso"|"direto"|"escassez", "assunto": string curto}. ' +
              `Condição: ${sufixo} (silencio/contrato/comprovante/proposta/despedida). ` +
              `Tom sugerido: ${metadata?.tom ?? "empatico"}. Tentativa: ${metadata?.tentativa ?? 1}.` +
              _ctxRicoSystem,
          },
          { role: "user", content: histTxt || "(sem histórico)" },
        ],
      });
      // deno-lint-ignore no-explicit-any
      let plano: any = { angulo: "empatico", assunto: "retomar conversa" };
      try { plano = { ...plano, ...JSON.parse(planRes.texto) }; } catch { /* fallback */ }
      // Modo rico: a LLM devolve horario_alvo (BRT) e o CÓDIGO calcula o delta — tira o erro de
      // aritmética da LLM (que confundia "20h da noite" com "20 horas a partir de agora").
      let horas = 8;
      let _alvoOk = false;
      if (_planejadorRico && typeof plano.horario_alvo === "string" && plano.horario_alvo.trim()) {
        const _norm = plano.horario_alvo.trim().replace(" ", "T");
        const _withSec = /T\d{2}:\d{2}$/.test(_norm) ? `${_norm}:00` : _norm;
        const _alvo = new Date(`${_withSec}-03:00`);
        if (!isNaN(_alvo.getTime())) {
          horas = (_alvo.getTime() - Date.now()) / 3600_000;
          _alvoOk = true;
        }
      }
      if (!_alvoOk) horas = Number(plano.horas_a_partir_de_agora ?? 8);
      // Cerca física mínima (não é decisão de horário — só impede disparo imediato ou >4 dias):
      horas = Math.max(2, Math.min(96, horas));
      const quando = new Date(Date.now() + horas * 3600_000).toISOString();
      // Criar scheduled_action [TRIGGER_TEMPORAL_<sufixo>] pra horas_a_partir_de_agora no futuro
      await supabase.from("acoes_agendadas").insert({
        conversation_id: conversa_id, agente_id, tenant_id, lead_id: null,
        action_type: "retomada_planejada", scheduled_at: quando, status: "pendente",
        carga: {
          tom: metadata?.tom ?? "empatico",
          tentativa: metadata?.tentativa ?? 1,
          trigger_nome: metadata?.trigger_nome,
          condicao_tipo: sufixo.toLowerCase(),
          assunto: plano.assunto, angulo: plano.angulo,
          origem: "planejar_retomada_ragentic",
        },
      });
      await supabase.from("traces").insert({
        tenant_id, conversa_id, agente_id, tipo: "porteiro",
        modelo_llm: MODELO_PORTEIRO,
        decisao: { tipo: "plano_retomada", sufixo, plano, horas, planejador_rico: _planejadorRico },
        latencia_ms: planRes.latencia_ms,
        custo_tokens_in: planRes.tokens_entrada,
        custo_tokens_out: planRes.tokens_saida,
      });
      return jsonResp({ reply: "", mensagens: [], conversation_id: conversa_id, plano }, 200);
    }

    // Inserir user message só se NÃO for token proativo (token não é fala real)
    // E só se webhook não inseriu antes (mantém idempotência).
    // Onda 2026-05-13 — agora persiste TAMBÉM em modo_teste pra alimentar histórico
    // de sessões do Chat-Teste (sidebar precisa reabrir conversas antigas).
    // Single-flight: guarda o id da inbound que ESTE turno inseriu — houveMsgNova ignora
    // (senão a execução detectava a própria mensagem como "msg nova" e se abortava; em
    // produção via webhook inbound_persistida=true e isso não ocorre, mas blinda o harness
    // de teste e qualquer caller direto do motor).
    let _inboundMsgIdTurno: string | null = null;
    if (!inbound_persistida && !ehTokenProativo) {
      const { data: _insInbound } = await supabase.from("mensagens").insert({
        conversation_id: conversa_id,
        role: "user",
        content: mensagemEfetiva,
        ...(media_url ? { carga: { media_url, media_type, ...(descricaoMidia ? { media_descricao: descricaoMidia } : {}) } } : {}),
      }).select("id").maybeSingle();
      _inboundMsgIdTurno = (_insInbound?.id as string | undefined) ?? null;
    }

    // ── Fora do horário de atendimento (2026-09-15, HS Consultoria) ──
    // O horário personalizado (configuracao.horario + automacoes.respeita_horario_comercial)
    // só travava automações: fala do lead às 23h era respondida na hora. Agora, fora da
    // janela: 1 aviso fixo ("te respondo a partir das 7h30") + ação `responder_fora_horario`
    // na abertura, que o processar-acompanhamentos dispara como [RESPONDER_FORA_HORARIO].
    // Lead que manda mais mensagens antes de abrir não recebe outro aviso (já há ação pendente).
    if (!ehTokenProativo && !modo_teste) {
      const _cfgAg = (agente?.configuracao as Record<string, unknown> | null) ?? null;
      const _respeita = (_cfgAg?.automacoes as Record<string, unknown> | undefined)?.respeita_horario_comercial === true;
      const { checkIsWithinBusinessHours, computeNextBusinessHourSlot } = await import("../_shared/business-hours.ts");
      // deno-lint-ignore no-explicit-any
      const _horario = (_cfgAg?.horario ?? null) as any;
      if (_respeita && _horario?.tipo === "personalizado" && !checkIsWithinBusinessHours(_horario)) {
        const _abre = computeNextBusinessHourSlot(_horario);
        const { data: _jaPendente } = await supabase.from("acoes_agendadas").select("id")
          .eq("conversation_id", conversa_id).eq("action_type", "responder_fora_horario")
          .in("status", ["pendente", "processando"]).limit(1).maybeSingle();
        let _aviso = "";
        if (!_jaPendente) {
          const _diaBRT = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
          const _hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false })
            .format(_abre).replace(/^0/, "").replace(/:00$/, "h").replace(":", "h");
          const _quando = _diaBRT(_abre) === _diaBRT(new Date())
            ? "hoje"
            : _diaBRT(_abre) === _diaBRT(new Date(Date.now() + 86_400_000))
            ? "amanhã"
            : `${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long" }).format(_abre)}`;
          _aviso = `Recebi sua mensagem! No momento estamos fora do horário de atendimento — te respondo ${_quando} a partir das ${_hora}.`;
          await supabase.from("acoes_agendadas").insert({
            conversation_id: conversa_id, agente_id, tenant_id, lead_id: null,
            action_type: "responder_fora_horario", scheduled_at: _abre.toISOString(), status: "pendente",
            carga: { origem: "fora_do_horario", recebida_em: new Date().toISOString() },
          });
          // inviolavel + gerada_ate=null: mesmo tratamento da saudação obrigatória (barge-in não engole).
          await supabase.from("caixa_saida_mensagens").insert({
            tenant_id,
            conversation_id: conversa_id,
            status: "pendente",
            content: _aviso,
            bubble_order: 0,
            scheduled_at: new Date().toISOString(),
            delay_calculado_ms: 0,
            engagement_level: "morno",
            carga: { typing_ms: 2500, origem: "aviso_fora_horario", inviolavel: true, gerada_ate: null },
          });
        }
        try {
          await supabase.from("traces").insert({
            tenant_id, conversa_id, agente_id, tipo: "ferramenta",
            decisao: { ferramenta: "fora_do_horario", abre_em: _abre.toISOString(), aviso_enviado: !_jaPendente },
          });
        } catch (_e) { /* trace é opcional */ }
        return jsonResp({
          ok: true,
          modo: "fora_do_horario",
          reply: _aviso,
          mensagens: [],
          conversation_id: conversa_id,
          ...(descricaoMidia ? { media_descricao: descricaoMidia } : {}),
        });
      }
    }

    // ── Saudação obrigatória (2026-09-11) ──
    // Texto fixo que o DONO escreveu (agentes.configuracao.saudacao_obrigatoria = { ativo, texto })
    // e que sai LITERAL como 1ª fala da empresa na conversa — convite pra grupo, redes etc.
    // Não passa pela Síntese: o recall corta bloco em 600 chars e o modelo reescreve, então
    // bloco de conhecimento não garante nem o texto nem a presença. Mesma via da bolha fixa
    // do Gate A1. 1ª fala = nenhuma msg da empresa (assistant; ou human, que é o eco do envio
    // e a fala manual do dono) e nada na caixa de saída. Vale pra fala do lead e pro
    // [INICIAR_ATENDIMENTO]; campanha/retomada/cobrança não. O turno seguinte segue normal —
    // a Síntese vê a saudação no histórico e retoma o que o lead pediu.
    const _saudacaoCfg = (agente?.configuracao as Record<string, unknown> | null)?.saudacao_obrigatoria as
      { ativo?: boolean; texto?: string } | undefined;
    const _saudacaoTexto = _saudacaoCfg?.ativo === true ? String(_saudacaoCfg.texto ?? "").trim() : "";
    if (_saudacaoTexto && (!ehTokenProativo || tokenSemColchetes === "INICIAR_ATENDIMENTO" || tokenSemColchetes === "RESPONDER_FORA_HORARIO")) {
      const [{ data: _falaEmpresa }, { data: _naCaixa }] = await Promise.all([
        supabase.from("mensagens").select("id").eq("conversation_id", conversa_id)
          .in("role", ["assistant", "human"]).is("deleted_at", null).limit(1).maybeSingle(),
        supabase.from("caixa_saida_mensagens").select("id").eq("conversation_id", conversa_id)
          .limit(1).maybeSingle(),
      ]);
      if (!_falaEmpresa && !_naCaixa) {
        if (modo_teste) {
          await supabase.from("mensagens").insert({
            conversation_id: conversa_id, role: "assistant", content: _saudacaoTexto,
          });
        } else {
          // inviolavel → barge-in não cancela (lead mandando 2ª msg não pode engolir a saudação).
          // gerada_ate=null → fura o guard de obsolescência do outbox-consumer.
          await supabase.from("caixa_saida_mensagens").insert({
            tenant_id,
            conversation_id: conversa_id,
            status: "pendente",
            content: _saudacaoTexto,
            bubble_order: 0,
            scheduled_at: new Date().toISOString(),
            delay_calculado_ms: 0,
            engagement_level: "morno",
            carga: { typing_ms: 4000, origem: "saudacao_obrigatoria", inviolavel: true, gerada_ate: null },
          });
        }
        try {
          await supabase.from("traces").insert({
            tenant_id, conversa_id, agente_id, tipo: "ferramenta",
            decisao: { ferramenta: "saudacao_obrigatoria", gatilho: ehTokenProativo ? tokenSemColchetes : "fala_do_lead" },
          });
        } catch (_e) { /* trace é opcional */ }
        return jsonResp({
          ok: true,
          modo: "saudacao_obrigatoria",
          reply: _saudacaoTexto,
          mensagens: modo_teste ? [_saudacaoTexto] : [],
          conversation_id: conversa_id,
          ...(descricaoMidia ? { media_descricao: descricaoMidia } : {}),
        }, 200);
      }
    }

    // ── Corte "saudação-especialista" (2026-09-01): Theus pediu apresentação + nome da
    // empresa + o que ela resolve, com ar de especialista, SÓ pra tenants NOVOS — não
    // retroagir nos tenants já ativos (evita mudar o tom que já está rodando pra eles).
    // Cutoff fixo no código (não é config de tenant): tenant criado a partir daqui = novo.
    const CORTE_SAUDACAO_ESPECIALISTA = "2026-09-01T18:49:00.000Z";
    const { data: _perfilCorteSaudacao } = await supabase
      .from("profiles").select("created_at").eq("id", tenant_id).maybeSingle();
    const tenantNovoSaudacaoEspecialista = !!_perfilCorteSaudacao?.created_at &&
      new Date(_perfilCorteSaudacao.created_at as string).getTime() >= new Date(CORTE_SAUDACAO_ESPECIALISTA).getTime();

    // ── Mapeamento de cargo + instrução por token proativo ──
    // Cada token traz uma SITUAÇÃO específica. system prompt extra explica pra LLM o que está
    // acontecendo + como agir. Mapeia também query usada no RAG-FIRST.
    // deno-lint-ignore no-explicit-any
    const MAPA_TOKENS: Record<string, { cargo: string; situacao: string; query_rag: string }> = {
      INICIAR_ATENDIMENTO: {
        cargo: "atendimento",
        situacao: tenantNovoSaudacaoEspecialista
          ? "Você está iniciando contato com o lead pela primeira vez. Apresente-se pelo nome, diga o nome da empresa que você representa e explique — com segurança de quem é especialista nesse negócio — o que ela resolve pra quem procura esse tipo de serviço. Seja caloroso e breve (nada de discurso de vendas robótico) e termine perguntando como pode ajudar."
          : "Você está iniciando contato com o lead pela primeira vez. Seja caloroso, apresente-se brevemente e pergunte como pode ajudar.",
        query_rag: tenantNovoSaudacaoEspecialista
          ? "primeiro contato saudação apresentação empresa solução especialista diferencial"
          : "primeiro contato saudação apresentação",
      },
      RESPONDER_FORA_HORARIO: { cargo: "atendimento", situacao: "O lead mandou mensagem fora do horário de atendimento e recebeu um aviso automático de que você responderia quando o expediente abrisse. O expediente abriu agora. Leia as últimas mensagens dele no histórico e responda direto o que ele disse ou perguntou, como se estivesse começando o dia — sem repetir o aviso, sem pedir desculpas pela espera e sem retomar assunto antigo que ele não trouxe. Se é o primeiro contato dele, apresente-se normalmente.", query_rag: "primeiro contato atendimento resposta dúvida do lead" },
      RETOMADA_HORARIO: { cargo: "atendimento", situacao: "Lead pediu pra falar mais tarde e o horário combinado chegou. Retome a conversa lembrando o assunto deixado e perguntando se ele tem disponibilidade agora.", query_rag: "retomada horário combinado disponibilidade" },
      RETOMADA_AGENDAMENTO: { cargo: "atendimento", situacao: "Hora do callback agendado com o lead. Retome contato lembrando do compromisso marcado.", query_rag: "callback agendamento retorno" },
      RETOMADA_ENCERRAMENTO: { cargo: "vendedor", situacao: "Conversa estava encerrada e agora foi reaberta. Retome com gentileza, perguntando se o lead tem novidade ou alguma dúvida nova.", query_rag: "reabrir conversa encerrada retorno" },
      RETOMADA_AUTOMATICA: { cargo: "atendimento", situacao: "Retomada automática proativa do agente. Continue a conversa de onde parou de forma natural.", query_rag: "retomada conversa anterior" },
      RETOMADA_AGENTE_PROPRIA: { cargo: "atendimento", situacao: "Retomada automática proativa do agente (esteira retomada_agente_propria). Continue a conversa de onde parou de forma natural.", query_rag: "retomada conversa anterior" },
      RETOMADA_MANUAL: { cargo: "atendimento", situacao: "O dono do tenant pediu pra você retomar a conversa manualmente. Seja direto e útil.", query_rag: "retomada manual dono operador" },
      LEMBRETE_ASSINATURA: { cargo: "vendedor", situacao: "Lead recebeu link do contrato mas ainda não assinou. Lembre gentilmente do prazo e ofereça ajuda se tiver dúvida.", query_rag: "contrato assinatura lembrete prazo" },
      LEMBRETE_PAGAMENTO: { cargo: "financeiro", situacao: "Lead já assinou contrato mas pagamento ainda não chegou. Lembre que o acesso é liberado após pagamento, sem pressão.", query_rag: "pagamento PIX boleto lembrete acesso" },
      LEMBRETE_REUNIAO: { cargo: "atendimento", situacao: `Reunião marcada se aproximando${metadata?.reuniao_em ? ` (${new Date(String(metadata.reuniao_em)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} BRT)` : ""}${metadata?.titulo ? ` — "${metadata.titulo}"` : ""}. Lembre o contato com simpatia, reenvie o link da sala${metadata?.link_sala ? ` (${metadata.link_sala})` : ""} e PEÇA CONFIRMAÇÃO de presença.`, query_rag: "reunião lembrete confirmação presença" },
      COBRANCA_PAGAMENTO: { cargo: "financeiro", situacao: `Cobrança ativa de pagamento. Tom: ${metadata?.tom ?? "empatico"}. Tentativa ${metadata?.tentativa ?? 1} de ${metadata?.total_tentativas ?? 3}. Seja firme mas humano, ofereça facilitar.`, query_rag: "cobrança pagamento atraso negociação parcelamento" },
      COBRANCA_ASSINATURA: { cargo: "vendedor", situacao: `Cobrança ativa de assinatura de contrato. Tom: ${metadata?.tom ?? "empatico"}. Tentativa ${metadata?.tentativa ?? 1} de ${metadata?.total_tentativas ?? 3}. Lembre que sem assinatura não há matrícula.`, query_rag: "cobrança contrato assinatura prazo" },
      CAMPANHA_INICIAR: { cargo: "vendedor", situacao: "Disparo inicial de campanha de marketing. Você está abrindo conversa com lead segmentado pra essa campanha. Cumprimente e introduza o tema da campanha de forma natural.", query_rag: "campanha disparo inicial introdução produto" },
      // Δ 2026-09-12 (Otmar): abordagem fria de um número inserido na mão ou vindo de planilha.
      // Antes o botão do app usava RETOMADA_MANUAL e a agente abria com "como não tivemos
      // retorno…" pra quem nunca falou com ela.
      ABORDAGEM_FRIA: { cargo: "vendedor", situacao: "PRIMEIRO CONTATO ATIVO: nós estamos abrindo conversa com uma empresa/pessoa que NUNCA falou conosco (planilha, indicação ou número inserido pelo dono). Não existe conversa anterior — jamais fale em retomar, retorno, 'como não tivemos resposta' ou assunto deixado. Bolha 1: apresente-se (nome, empresa, o que ela faz), curta. Bolha 2: o produto e o diferencial. Feche com UMA pergunta. Se o tenant tiver bloco de comportamento de abordagem ativa, siga-o à risca.", query_rag: "abordagem ativa primeiro contato apresentação produto diferencial concorrente migração" },
      CAMPANHA_REPROPOSTA: { cargo: "vendedor", situacao: `Reproposta de campanha. ${metadata?.texto_personalizado ? `Texto sugerido: ${metadata.texto_personalizado}` : "Reapresente a oferta com novo ângulo."}`, query_rag: "campanha reproposta nova oferta retomada" },
      FOLLOWUP_AUTOMATICO: { cargo: "atendimento", situacao: "Followup automático após silêncio do lead. Toque o assunto da última conversa de forma curta e simpática, perguntando se está tudo bem.", query_rag: "followup silêncio retomada gentil" },
      FOLLOWUP_CADENCIADO: { cargo: "vendedor", situacao: `Follow-up COMBINADO com o lead chegou (tentativa ${metadata?.tentativa ?? 1} de ${metadata?.total_tentativas ?? 3}). NÃO se reapresente, NÃO cumprimente como primeira vez: abra direto pelo contexto e pela dor dele${metadata?.frase_de_retomada ? ` — base sugerida: "${metadata.frase_de_retomada}"` : ""}${metadata?.assunto ? `. Assunto pendente: ${metadata.assunto}` : ""}. Objetivo: destravar o próximo passo (agendar). Se de novo não rolar, combine NOVO horário com data e hora (agendar_followup).`, query_rag: "followup combinado retomada agendamento mentoria" },
      // Δ 2026-09-18 (Malu/Carlos): pós-venda de relacionamento — agendado pelo trigger de contrato
      // assinado quando o agente tem `configuracao.pos_venda_relacionamento.ativo`.
      POS_VENDA_RELACIONAMENTO: { cargo: "atendimento", situacao: `O lead JÁ CONTRATOU (contrato assinado) e você está mantendo contato nas horas seguintes só pra conhecê-lo melhor — toque ${metadata?.tentativa ?? 1} de ${metadata?.total_tentativas ?? 1}. NÃO venda, NÃO ofereça outro serviço, NÃO fale de contrato, pagamento, documento, prazo nem processo, e NÃO se reapresente. Puxe UM assunto leve e pessoal a partir do que ELE contou na conversa (o objetivo dele — casa, carro, negócio, cartão —, trabalho, família, cidade, algo que mencionou de passagem), com uma pergunta curta e genuína, como quem se interessa pela pessoa. Uma ou duas bolhas curtas, tom de amiga. Não repita assunto que você já puxou num toque anterior; se ele não contou nada pessoal, pergunte com leveza sobre o plano dele pra quando o nome estiver limpo/o objetivo se realizar.`, query_rag: "relacionamento pós-venda conhecer o cliente conversa leve" },
      TRIGGER_TEMPORAL_SILENCIO: { cargo: "vendedor", situacao: `Lead silenciou após interação. Reabra com curiosidade, ${metadata?.angulo ? `ângulo "${metadata.angulo}"` : "tom empático"}. ${metadata?.assunto_planejado ? `Foco: ${metadata.assunto_planejado}` : ""}`, query_rag: "silencio retomada angulo" },
      TRIGGER_TEMPORAL_PROPOSTA: { cargo: "vendedor", situacao: `Lead recebeu proposta e não respondeu. Reabra perguntando se conseguiu avaliar, ${metadata?.angulo ? `tom "${metadata.angulo}"` : ""}.`, query_rag: "proposta sem resposta seguir up" },
      TRIGGER_TEMPORAL_CONTRATO: { cargo: "vendedor", situacao: `Lead não assinou contrato após receber link. Reabra suavemente, ${metadata?.angulo ? `ângulo "${metadata.angulo}"` : ""}.`, query_rag: "contrato pendente assinatura lembrete" },
      TRIGGER_TEMPORAL_COMPROVANTE: { cargo: "financeiro", situacao: `Lead disse que pagou mas não enviou comprovante. Peça comprovante de forma gentil.`, query_rag: "comprovante pagamento PIX boleto solicitar" },
      TRIGGER_TEMPORAL_DESPEDIDA: { cargo: "atendimento", situacao: "Lead se despediu sem marcar próximo passo. Reabra com algo de valor (dica, oferta nova, conteúdo).", query_rag: "despedida sem data retomada valor" },
    };

    let cargoProativo = "";
    let situacaoProativa = "";
    let queryRagProativa = "";
    if (ehTokenProativo) {
      // Match exato ou prefixo (TRIGGER_TEMPORAL_X)
      const cfg = MAPA_TOKENS[tokenSemColchetes];
      if (cfg) {
        cargoProativo = cfg.cargo;
        situacaoProativa = cfg.situacao;
        queryRagProativa = cfg.query_rag;
      } else {
        // fallback genérico
        cargoProativo = "atendimento";
        situacaoProativa = `Ação proativa do agente (token ${tokenSemColchetes}). Continue a conversa de forma natural.`;
        queryRagProativa = "followup retomada genérica";
      }
    }

    // ── Estímulo normalizado do turno proativo (2026-06-12) ──
    // Antes: o LLM recebia o token cru ("[TRIGGER_TEMPORAL_SILENCIO]") como se fosse fala do lead
    // e às vezes NARRAVA a rubrica em vez de falar com o lead (52 bolhas-lixo em 10-12/06).
    // Agora: mesma esteira do turno normal — só muda a ORIGEM do estímulo, descrita de forma
    // inteligível. O motor também distingue QUEM falou por último (empresa devendo resposta ×
    // lead que sumiu) e marca engajamento + humor pra query de comportamento da curadoria.
    let _proativoDevendo = false;
    let _proativoEng = "desconhecido";
    let _proativoHumor = "neutro";
    if (ehTokenProativo && conversa_id) {
      try {
        const [msgsRes, convLeadRes] = await Promise.all([
          supabase.from("mensagens").select("role, created_at").eq("conversation_id", conversa_id)
            .is("deleted_at", null).order("created_at", { ascending: false }).limit(30),
          supabase.from("conversas").select("lead_id").eq("id", conversa_id).maybeSingle(),
        ]);
        // deno-lint-ignore no-explicit-any
        const _msgs = ((msgsRes as any)?.data as Array<{ role?: string; created_at?: string }>) ?? [];
        const _ult = _msgs[0] ?? null;
        _proativoDevendo = _ult?.role === "user";
        let _tempoTxt = "";
        if (_ult?.created_at) {
          const _h = Math.max(1, Math.round((Date.now() - new Date(_ult.created_at).getTime()) / 3600_000));
          _tempoTxt = _h < 48 ? `${_h} hora${_h > 1 ? "s" : ""}` : `${Math.round(_h / 24)} dias`;
        }
        // Faixa de horário em que o LEAD costuma responder (pra espelhar na retomada) + relógio agora.
        const _horasLead = Array.from(new Set(
          _msgs.filter((m) => m.role === "user" && m.created_at).map((m) => {
            try { return new Date(m.created_at!).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit" }).replace(/\D/g, ""); } catch { return null; }
          }).filter((x): x is string => !!x),
        )).map((h) => `${h}h`).join(", ");
        const _agoraEstimulo = new Date().toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
        });
        // RAG-first: a REGRA de como retomar (tom por momento + régua de horário) vem dos blocos de
        // retomada (gaveta comportamento) — busca DETERMINÍSTICA (não depende do top-N do recall, que
        // priorizava outros blocos). O código só garante que a regra chega; o conteúdo é editável na curadoria.
        let _qRet = supabase.from("blocos_comportamento").select("situacao_descricao, instrucao")
          .contains("tags", ["retomada"]).eq("ativo", true).is("deleted_at", null);
        _qRet = tenant_id ? _qRet.or(`escopo.eq.global,tenant_id.eq.${tenant_id}`) : _qRet.eq("escopo", "global");
        const { data: _blocosRet } = await _qRet.limit(12);
        // deno-lint-ignore no-explicit-any
        const _conhecRetomada = ((_blocosRet as any[]) ?? [])
          .map((b) => `- ${b.situacao_descricao ? b.situacao_descricao + ": " : ""}${b.instrucao ?? ""}`).join("\n");
        // deno-lint-ignore no-explicit-any
        const _leadIdProativo = (convLeadRes as any)?.data?.lead_id as string | null;
        if (_leadIdProativo) {
          const [engRes, afetoRes] = await Promise.all([
            supabase.from("engajamento_lead").select("nivel").eq("lead_id", _leadIdProativo).maybeSingle(),
            supabase.from("estado_afetivo_lead").select("valencia, resumo_humor").eq("lead_id", _leadIdProativo)
              .order("atualizado_em", { ascending: false }).limit(1).maybeSingle(),
          ]);
          // deno-lint-ignore no-explicit-any
          _proativoEng = ((engRes as any)?.data?.nivel as string | undefined) ?? "desconhecido";
          // deno-lint-ignore no-explicit-any
          const _af = (afetoRes as any)?.data as { valencia?: number; resumo_humor?: string } | null;
          _proativoHumor = _af?.resumo_humor ??
            (typeof _af?.valencia === "number" ? (_af.valencia > 0.2 ? "positivo" : _af.valencia < -0.2 ? "negativo" : "neutro") : "neutro");
        }
        // A "fala" do turno deixa de ser o token: vira o estímulo descrito — o resto do pipeline
        // (porteiro, recall, síntese, bolhas) trata como um turno qualquer.
        mensagemEfetiva = `Estímulo interno do servidor (o lead NÃO mandou mensagem nova — isto NUNCA deve ser citado nem imitado): ` +
          `é hora de você puxar a conversa.${_tempoTxt ? ` A conversa está parada há ${_tempoTxt}.` : ""} ` +
          (_proativoDevendo
            ? `A última mensagem é DO LEAD e ficou sem resposta por falha nossa: peça desculpa breve e natural pela demora (estilo "desculpa a demora, tava em atendimento aqui") e responda o que ficou pendente.`
            : `A última mensagem é sua — o lead silenciou: reabra de forma natural, no tom certo pra relação.`) +
          ` Conexão com este lead: engajamento ${_proativoEng}, humor ${_proativoHumor}. ` +
          `Escreva APENAS a sua próxima fala na conversa, como sempre. ` +
          `AGORA são ${_agoraEstimulo} (horário de Brasília).${_horasLead ? ` Este contato costuma responder por volta de: ${_horasLead}.` : ""}` +
          (_conhecRetomada ? `\n\nCONHECIMENTOS DE RETOMADA (siga estas regras pra COMO falar e QUANDO entregar):\n${_conhecRetomada}\n` : "") +
          `\nVocê está PREPARANDO esta retomada agora, mas ela só será ENTREGUE ao lead no horário que você escolher. Por isso NÃO use saudação presa ao momento atual (evite "bom dia"/"boa tarde"/"boa noite" — abra de forma neutra que sirva em qualquer hora). ` +
          `OBRIGATÓRIO no seu <pensamento_estruturado>: "quando_voltar" = ISO YYYY-MM-DDTHH:MM (horário de Brasília) do MELHOR horário pra ESTA mensagem CHEGAR no lead, decidido CONFORME OS CONHECIMENTOS DE RETOMADA acima (siga a regra deles; não invente). Nunca deixe quando_voltar null neste turno.`;
      } catch (eEst) {
        console.warn("[estimulo-proativo] falha ao montar (segue com token):", (eEst as Error).message);
      }
    }

    // ── Carrega cargos REAIS do agente ANTES do porteiro (alinha com Cloud Companion 12) ──
    // Sem isso o porteiro decide entre 5 strings hardcoded sem conhecer os cargos do tenant
    // → fica preso em "atendimento" mesmo quando deveria rotear pra Vendedor/Financeiro/etc.
    type CargoDet = {
      id: string;
      nome: string;
      tipologia: string;
      canal_atuacao: string;
      objetivo_principal: string;
      regras_livres: string;
      campos_rastreio: Array<{ chave: string; descricao?: string; obrigatorio?: boolean }>;
    };
    const { data: cargosRaw } = await supabase
      .from("cargos")
      .select("id, nome, tipologia, canal_atuacao, objetivo_principal, regras_livres, campos_rastreio, ordem")
      .or(`agente_id.eq.${agente_id},and(escopo.eq.global,agente_id.is.null)`)
      .eq("ativo", true)
      .order("ordem", { ascending: true });
    // Isolamento por canal_atuacao (T3-edge → Fusão C1 Fase 2/3c.2, 2026-05-18).
    // O canal vem da ORIGEM CONFIÁVEL (D1), nunca de param cru. Fase 3c.2: a fonte
    // interna é o DONO LOGADO (JWT válido verificado server-side via
    // detectarDonoLogado — assinatura conferida por auth.getUser). Z-API/webhook não
    // mandam Authorization → dono=null → externo, byte-equivalente ao anterior (sem
    // regressão). ACHADO: Chat-Teste é o dono logado SIMULANDO cliente (manda JWT
    // MAS é externo) → desempate `!!dono && !modo_teste` mantém Chat-Teste externo.
    // Corte determinístico ANTES do Porteiro (segurança não depende do LLM): conversa
    // externa NUNCA elegível cargo "interno"; conversa interna só "interno"/"ambos".
    // 3c.3 pluga o processamento real do canal interno (persona/tools/recall).
    const dono = await detectarDonoLogado(req);
    const canalConversa = derivarCanalConversa({ origemInternaConfiavel: !!dono && !modo_teste });
    const cargosDisponiveis: CargoDet[] = ((cargosRaw ?? []) as Array<Record<string, unknown>>)
      .map((c) => ({
        id: String(c.id),
        nome: String(c.nome),
        tipologia: String(c.tipologia ?? ""),
        canal_atuacao: String(c.canal_atuacao ?? "ambos"),
        objetivo_principal: String(c.objetivo_principal ?? ""),
        regras_livres: String(c.regras_livres ?? ""),
        campos_rastreio: Array.isArray(c.campos_rastreio)
          ? (c.campos_rastreio as Array<{ chave: string; descricao?: string; obrigatorio?: boolean }>)
          : [],
      }))
      .filter((c) => canalElegivel(c.canal_atuacao, canalConversa));
    // Cargo anterior (se houver) — base da regra de inércia
    const { data: convAnterior } = await supabase
      .from("conversas")
      .select("cargo_ativo_id, memoria_pendente, memoria_pendente_desde")
      .eq("id", conversa_id)
      .maybeSingle();
    const cargoAnteriorId = (convAnterior?.cargo_ativo_id as string | null) ?? null;

    // v61 (DEC-036 item 2): guard inline — se o pós-turno (memória) do turno anterior ainda roda
    // em background (v60), espera curto antes do Porteiro pra montar o prompt com a memória atual.
    // Determinístico e barato (SELECT + poll ≤3s). Flag velha (>30s) = provável edge morta → segue
    // (o histórico cru cobre o que foi dito; este turno regrava a memória).
    if (!modo_teste && convAnterior?.memoria_pendente === true) {
      const desde = convAnterior?.memoria_pendente_desde
        ? new Date(convAnterior.memoria_pendente_desde as string).getTime()
        : 0;
      if (desde > 0 && (Date.now() - desde) < 30_000) {
        let esperouMs = 0;
        while (esperouMs < 3000) {
          await new Promise((r) => setTimeout(r, 700));
          esperouMs += 700;
          const { data: cChk } = await supabase
            .from("conversas").select("memoria_pendente").eq("id", conversa_id).maybeSingle();
          if (cChk?.memoria_pendente !== true) break;
        }
        await supabase.from("traces").insert({
          tenant_id, conversa_id, agente_id, tipo: "ferramenta",
          modelo_llm: "ragentic/guard_memoria",
          decisao: { ferramenta: "guard_memoria_proximo_turno", esperou_ms: esperouMs },
        });
      }
    }
    const cargoAnterior = cargoAnteriorId
      ? cargosDisponiveis.find((c) => c.id === cargoAnteriorId) ?? null
      : null;
    // RAG-FIRST (princípio cravado em §1 da arquitetura): a "regra" de roteamento NÃO é
    // hardcoded no código — vem do BANCO (cargos.objetivo_principal + cargos.regras_livres,
    // cravados pelo tenant na Curadoria). Aqui só montamos a lista pro porteiro decidir.
    const listaCargosTxt = cargosDisponiveis.length
      ? cargosDisponiveis.map((c) => {
          const linhas = [`  - "${c.nome}":`];
          linhas.push(`      bússola: ${c.objetivo_principal || "(sem bússola)"}`);
          if (c.regras_livres) {
            const regrasCurtas = c.regras_livres.length > 600 ? c.regras_livres.slice(0, 600) + "…" : c.regras_livres;
            linhas.push(`      regras do tenant: ${regrasCurtas.replace(/\n/g, " ")}`);
          }
          return linhas.join("\n");
        }).join("\n")
      : "  - (nenhum cargo cadastrado — caia em Atendimento)";

    // DEC-038: Porteiro vê o catálogo de ferramentas do tenant pra poder sugerir
    // `tool_alvo` quando o intent for AÇÃO clara que casa com uma tool. Sintetizador
    // depois força `tool_choice` na 1ª iteração — anti-placeholder vazando como texto
    // (BUG-01 da auditoria 2026-05-26: "[Link do Contrato]" emitido em vez de chamar
    // `enviar_link_contrato`). Falha silenciosa = [], Porteiro segue sem tool_alvo.
    let ferramentasDoTenant: Array<{ nome_tool: string; descricao: string }> = [];
    try {
      ferramentasDoTenant = await carregarFerramentasDoTenant(supabase, tenant_id);
    } catch {
      ferramentasDoTenant = [];
    }
    const listaFerramentasTxt = ferramentasDoTenant.length
      ? ferramentasDoTenant.map((f) => {
          const desc = (f.descricao || "(sem descrição)").replace(/\n/g, " ").slice(0, 220);
          return `  - "${f.nome_tool}": ${desc}`;
        }).join("\n")
      : "  - (nenhuma ferramenta cadastrada)";

    // ── Porteiro (pulado em modo proativo) ──
    // Onda 3C (2026-05-24): AFETO NA PERCEPÇÃO — lê o humor da relação ANTES do Porteiro pra o
    // estado interno colorir a classificação (top-down / predictive coding; laudo P3c/P4b).
    // Carona: 1 SELECT. Define rupturaAberta + temperaturaRelacao (Porteiro) + blocoHumorRelacao (Síntese).
    let rupturaAberta = false;
    let temperaturaRelacao = "";
    let blocoHumorRelacao = "";
    {
      const { data: _convAfeto } = await supabase
        .from("conversas").select("lead_id").eq("id", conversa_id).maybeSingle();
      const _leadAfeto = (_convAfeto?.lead_id as string | null) ?? null;
      if (_leadAfeto) {
        const { data: _humor } = await supabase
          .from("estado_afetivo_lead")
          .select("valencia, confianca, resumo_humor, ultima_ruptura_em")
          .eq("lead_id", _leadAfeto)
          .eq("agente_id", agente_id)
          .maybeSingle();
        if (_humor) {
          rupturaAberta = _humor.ultima_ruptura_em
            ? (Date.now() - new Date(_humor.ultima_ruptura_em as string).getTime()) < 1000 * 60 * 60 * 24 * 14
            : false;
          const _resumo = (_humor.resumo_humor as string) || "relação em formação";
          temperaturaRelacao =
            `${_resumo} (valência ${Number(_humor.valencia).toFixed(2)} de -1 a 1, confiança ${Number(_humor.confianca).toFixed(2)} de 0 a 1)`;
          blocoHumorRelacao =
            `<temperatura_da_relacao>\n${_resumo}. ` +
            `Valência ${Number(_humor.valencia).toFixed(2)} (-1 negativo · 1 positivo), confiança ${Number(_humor.confianca).toFixed(2)}.\n` +
            `Ajuste o tom à temperatura acima.\n</temperatura_da_relacao>\n\n`;
        }
      }
    }

    // deno-lint-ignore no-explicit-any
    let classificacao: any = ehTokenProativo
      ? { intencao: tokenSemColchetes.toLowerCase(), cargo_alvo: cargoProativo, urgencia: "media", resumo: situacaoProativa, modo: "proativo", tool_alvo: null, confianca_tool: 0 }
      : { intencao: "indefinida", cargo_alvo: cargoAnterior?.nome ?? cargosDisponiveis[0]?.nome ?? "atendimento", urgencia: "media", resumo: mensagemEfetiva, tool_alvo: null, confianca_tool: 0 };

    if (!ehTokenProativo) {
      const porteiroRes = await chamarLLM({
      modelo: (await getConfigChamada(supabase, "porteiro", tenant_id ?? null, null)).modelo,
      temperatura: 0.2,
      max_tokens: 320,
      json_mode: true,
      mensagens: [
        {
          role: "system",
          content:
            `Você é o Porteiro/Roteador (Sistema 1) do agente "${nomeAgente || "Ragentic"}". Você NÃO responde ao lead — só classifica e roteia, rápido e estruturado.\n\n` +
            `REGRA DE SAÍDA (rígida): devolva APENAS um objeto JSON, uma linha, sem markdown, sem cercas, sem texto antes ou depois.\n\n` +
            `CARGO ATIVO no turno anterior: ${cargoAnterior?.nome ?? "(nenhum — primeira mensagem)"}\n\n` +
            (temperaturaRelacao
              ? `TEMPERATURA DA RELAÇÃO (estado afetivo acumulado com este lead, vem da memória): ${temperaturaRelacao}.\n` +
                (rupturaAberta
                  ? `HOUVE ATRITO/RUPTURA RECENTE — este é um turno SENSÍVEL. Oriente a "hipotese_resposta" pra RECONEXÃO (reconhecer, ouvir, baixar a pressão), NÃO pra avançar venda, e defina "liberar_comercial": false até a relação reabrir.\n\n`
                  : `\n`)
              : "") +
            `Cargos disponíveis — fonte da verdade do tenant (RAG-FIRST: a regra de quando ativar cada cargo está na BÚSSOLA e nas REGRAS abaixo, NUNCA no seu conhecimento geral):\n${listaCargosTxt}\n\n` +
            `Ferramentas (tools) disponíveis no tenant — fonte da verdade da Curadoria (a descrição diz QUANDO usar; em dúvida = null):\n${listaFerramentasTxt}\n\n` +
            `COMO DECIDIR cargo_alvo:\n` +
            `1. Leia a última mensagem do lead + o contexto recente.\n` +
            `2. Compare com a BÚSSOLA (objetivo) e as REGRAS de cada cargo.\n` +
            `3. Escolha o cargo cuja bússola/regras melhor explicam o que o lead quer AGORA.\n` +
            `4. INÉRCIA: só troque de cargo se a mensagem casar CLARAMENTE melhor com outra bússola. Continuação do mesmo assunto, ambiguidade ou dúvida entre dois cargos → MANTENHA o cargo anterior. Troca é evento, não default.\n` +
            `5. Multi-intenção: escolha o cargo da intenção DOMINANTE (a que o lead mais enfatiza ou para a qual pede ação).\n\n` +
            `COMO DECIDIR tool_alvo (DEC-038):\n` +
            `1. Releia a última mensagem do lead + a hipótese de resposta que você está montando.\n` +
            `2. Veja a lista de ferramentas acima. Cada descrição diz QUANDO usar.\n` +
            `3. Se UMA ferramenta casa CLARAMENTE com o que o agente precisa FAZER neste turno (não só falar) → "tool_alvo" = nome EXATO dela + "confianca_tool" entre 0.7 e 1.0.\n` +
            `4. Se NENHUMA casa claramente, OU se o turno é só conversa/explicação/qualificação SEM ação → "tool_alvo": null + "confianca_tool": 0.0.\n` +
            `5. NUNCA invente nome. NUNCA marque tool por "talvez precise depois" — só pra ESTE turno.\n` +
            `6. Em dúvida = null. False positive aqui força tool errada; é PIOR do que deixar "auto".\n\n` +
            `BORDAS:\n` +
            `- Saudação pura / sem pedido acionável → cargo anterior (ou 1º cargo da lista se não houver anterior), urgencia "baixa", tool_alvo null.\n` +
            `- Mídia sem texto ou mensagem ininteligível → cargo anterior (ou 1º da lista), intencao "esclarecer_midia", urgencia "media", tool_alvo null.\n` +
            `- Nenhuma bússola casa → 1º cargo da lista, intencao "indefinida", tool_alvo null.\n\n` +
            `CAMPOS DO JSON:\n` +
            `- "intencao": verbo_no_infinitivo curto, minúsculas com _ (ex: pedir_preco, agendar_retorno, tirar_duvida, reclamar, fechar_negocio, saudar, esclarecer_midia, indefinida).\n` +
            `- "cargo_alvo": NOME EXATO de um cargo da lista (case-insensitive). Nunca invente nome.\n` +
            `- "urgencia": "alta" = pede algo imediato / irritação / risco de perder o lead / prazo curto explícito · "media" = interesse ativo sem pressa · "baixa" = saudação / conversa morna / sem pedido claro.\n` +
            `- "resumo": 1 frase, máx ~12 palavras, do que o lead quer neste turno.\n` +
            `- "liberar_comercial": true SÓ se o lead já pediu preço/valor, quer fechar ou está negociando, OU o cargo ativo é de venda/fechamento. false em primeiro contato, saudação ou qualificação SEM pedido de preço (evita falar de R$ cedo demais).\n` +
            `- "hipotese_resposta": 1 frase curta com a resposta IDEAL que o agente daria neste turno (ajuda a achar o conhecimento certo). Pode ser "" se não souber.\n` +
            `- "tool_alvo": nome EXATO de uma ferramenta da lista OU null. NUNCA string vazia, NUNCA "auto".\n` +
            `- "confianca_tool": número 0.0 a 1.0. 0.0 quando tool_alvo=null. ≥0.7 quando casa claramente.\n\n` +
            `EXEMPLOS (ensinam forma e raciocínio; <...> = troque pelo nome real de um cargo da lista, nunca cravado a nicho):\n` +
            `Lead: "oi, tudo bem?" → {"intencao":"saudar","cargo_alvo":"<1º cargo da lista>","urgencia":"baixa","resumo":"lead apenas cumprimentou","liberar_comercial":false,"hipotese_resposta":"","tool_alvo":null,"confianca_tool":0.0}\n` +
            `Lead: "quanto custa e consigo começar essa semana?" → {"intencao":"pedir_preco","cargo_alvo":"<cargo cuja bússola cobre venda/preço>","urgencia":"alta","resumo":"quer preço e tem pressa","liberar_comercial":true,"hipotese_resposta":"apresentar valores e prazo","tool_alvo":null,"confianca_tool":0.0}\n` +
            `Lead: "fechado, pode me mandar o link do contrato" → {"intencao":"fechar_negocio","cargo_alvo":"<cargo de fechamento>","urgencia":"alta","resumo":"aceitou e pediu contrato","liberar_comercial":true,"hipotese_resposta":"enviar o link do contrato","tool_alvo":"<nome exato da ferramenta cuja descrição cobre enviar contrato, se existir>","confianca_tool":0.9}\n` +
            `Lead: "bora marcar então, pode ser amanhã de manhã?" → {"intencao":"agendar_reuniao","cargo_alvo":"<cargo atual>","urgencia":"alta","resumo":"quer agendar a reunião","liberar_comercial":false,"hipotese_resposta":"consultar horários reais e oferecer opções","tool_alvo":"<nome exato da ferramenta que consulta horários disponíveis, se existir>","confianca_tool":0.9}\n` +
            `Lead: "[áudio]" → {"intencao":"esclarecer_midia","cargo_alvo":"<cargo anterior ou 1º da lista>","urgencia":"media","resumo":"mídia sem texto","liberar_comercial":false,"hipotese_resposta":"","tool_alvo":null,"confianca_tool":0.0}\n\n` +
            `GOAL STACK (Onda 13.5): identifica se a mensagem ABRE um objetivo novo (algo que o agente deve LEMBRAR pra acompanhar nos próximos turnos) OU FECHA um objetivo aberto.\n` +
            `- "objetivo_a_abrir": string curta (≤80 chars) descrevendo o objetivo se o lead acabou de mencionar algo pendente (ex: "cachorro do lead sumiu — perguntar se encontrou"); OU null se nada novo.\n` +
            `- "objetivo_aberto_atendido": string curta com EXATAMENTE o texto do objetivo aberto que essa mensagem ATENDE (lead trouxe a resposta esperada); OU null.\n` +
            `Tudo na pilha aberta atual segue como referência (motor cuida do limite).\n\n` +
            `Retorne SÓ o JSON: {"intencao": "...", "cargo_alvo": "...", "urgencia": "baixa"|"media"|"alta", "resumo": "...", "liberar_comercial": true|false, "hipotese_resposta": "...", "tool_alvo": "<nome>"|null, "confianca_tool": 0.0..1.0, "objetivo_a_abrir": "..."|null, "objetivo_aberto_atendido": "..."|null}.`,
        },
        { role: "user", content: mensagemEfetiva },
      ],
    });
      try {
        classificacao = JSON.parse(porteiroRes.texto);
      } catch {
        /* mantém default */
      }

      // Onda 13.5 — Porteiro escrita Goal Stack
      try {
        const objAbrir = typeof classificacao?.objetivo_a_abrir === "string" && classificacao.objetivo_a_abrir.trim().length > 5
          ? classificacao.objetivo_a_abrir.trim().slice(0, 200)
          : null;
        const objAtendido = typeof classificacao?.objetivo_aberto_atendido === "string" && classificacao.objetivo_aberto_atendido.trim().length > 5
          ? classificacao.objetivo_aberto_atendido.trim().slice(0, 200)
          : null;
        if (objAbrir) {
          // deno-lint-ignore no-explicit-any
          await (supabase as any).rpc("abrir_objetivo_pilha", {
            p_conversa_id: conversa_id,
            p_tenant_id: tenant_id,
            p_objetivo: objAbrir,
            p_contexto: classificacao?.resumo ?? null,
            p_lead_id: null,
            p_prioridade: classificacao?.urgencia === "alta" ? 2 : classificacao?.urgencia === "baixa" ? 7 : 5,
            p_origem: "porteiro",
          });
        }
        if (objAtendido) {
          // Buscar objetivo aberto correspondente (match aproximado por texto) e fechar
          // deno-lint-ignore no-explicit-any
          const { data: alvoFechar } = await (supabase as any)
            .from("pilha_objetivos")
            .select("id")
            .eq("conversa_id", conversa_id)
            .eq("status", "aberto")
            .is("deleted_at", null)
            .ilike("objetivo", `%${objAtendido.slice(0, 40)}%`)
            .limit(1)
            .maybeSingle();
          if (alvoFechar?.id) {
            // deno-lint-ignore no-explicit-any
            await (supabase as any).rpc("fechar_objetivo_pilha", {
              p_objetivo_id: alvoFechar.id,
              p_motivo: "atendido pelo lead",
            });
          }
        }
      } catch (e) {
        console.warn("[onda13.5] Goal Stack escrita falhou:", e instanceof Error ? e.message : String(e));
      }

      await supabase.from("traces").insert({
        tenant_id,
        conversa_id,
        agente_id,
        tipo: "porteiro",
        modelo_llm: MODELO_PORTEIRO,
        decisao: classificacao,
        latencia_ms: porteiroRes.latencia_ms,
        custo_tokens_in: porteiroRes.tokens_entrada,
        custo_tokens_out: porteiroRes.tokens_saida,
      });
    } else {
      // Modo proativo: registra trace do "porteiro proativo" (decisão é o próprio token)
      await supabase.from("traces").insert({
        tenant_id,
        conversa_id,
        agente_id,
        tipo: "porteiro",
        modelo_llm: "ragentic/proativo",
        decisao: { ...classificacao, token: tokenSemColchetes, metadata },
      });
    }

    // ── Síntese (cargo + tools + tool-calling 3 iter) ──
    // Trava de 1ª mensagem (2026-08-29, chamado Carlos/Malu): o Porteiro decide cargo_alvo
    // por semântica pura, SEM inércia na 1ª mensagem (não há cargo anterior pra "grudar").
    // Lead que já abre falando do produto ("quero saber da auditoria") batia direto na
    // bússola do cargo de venda, pulando o cargo de triagem/descoberta inteiro — sintoma:
    // agente apresenta produto antes de qualificar (nome, situação). Fix determinístico:
    // conversa nova (sem cargo_ativo anterior, turno não-proativo) SEMPRE abre no cargo de
    // triagem quando ele existir, não importa o que o Porteiro tenha classificado — o
    // roteamento dinâmico do Porteiro só vale a partir do 2º turno em diante. Vale pra
    // TODOS os tenants (arquitetura da plataforma, não config de tenant específico).
    const cargoTriagem = !ehTokenProativo && !cargoAnterior
      ? cargosDisponiveis.find((c) => c.nome.trim().toLowerCase() === "atendimento")
      : undefined;
    const cargoAlvo: string = cargoTriagem?.nome || classificacao?.cargo_alvo || "atendimento";
    // deno-lint-ignore no-explicit-any
    const cargoId = await resolverCargoIdPorAlvo(supabase as any, cargoAlvo, tenant_id);
    // deno-lint-ignore no-explicit-any
    const tools = cargoId ? await carregarFerramentasDoCargo(supabase as any, cargoId) : [];

    // ── Tool nativa `perguntar_ao_dono` (curiosidade consciente) — F1 2026-06-03 ──
    // O agente chama SÓ quando tem dúvida factual real sem fonte — no lugar do gate
    // cego (A1/B1) criar lacuna por score e tratar qualquer fala do lead como pergunta.
    // Reusa o encanamento: o laço de tool-calling roteia internal:// → HANDLERS.perguntar_ao_dono.
    // Este caminho da Síntese é o canal EXTERNO (cargo interno já cai em canal-interno.ts antes).
    // Kill-switch sem redeploy: USAR_TOOL_PERGUNTAR_AO_DONO=false.
    const _usarToolPergunta = (Deno.env.get("USAR_TOOL_PERGUNTAR_AO_DONO") ?? "true").toLowerCase() !== "false";
    if (_usarToolPergunta && cargoId) {
      // deno-lint-ignore no-explicit-any
      (tools as any[]).push({
        type: "function",
        function: {
          name: "perguntar_ao_dono",
          description:
            "Use SÓ quando o lead fizer uma pergunta factual sobre o produto, serviço, preço, prazo ou condições que você NÃO consegue responder com as fontes que recebeu (nenhum bloco sustenta) e inventar seria arriscado. Você formula a dúvida de forma clara pro responsável humano; ele responde e o lead recebe a resposta automaticamente depois. NÃO use para: confirmação ('ok', 'sim', 'parcelado sim'), dado do lead (endereço, CPF, nome), saudação, objeção emocional, pedido de ligação, nem quando a informação já está nas fontes. Na dúvida entre responder e perguntar: se há fonte, responda.",
          parameters: {
            type: "object",
            properties: {
              pergunta_para_dono: {
                type: "string",
                description: "A dúvida factual, formulada de forma clara e objetiva pro responsável humano responder direto.",
              },
              contexto: {
                type: "string",
                description: "1-2 linhas do contexto da conversa pro responsável entender o caso.",
              },
            },
            required: ["pergunta_para_dono"],
          },
        },
        _endpoint: "internal://perguntar_ao_dono",
        _config: {},
      });
    }

    // GATE catraca de apps do agente (instalação + toggle + saldo) — fonte única em
    // _shared/apps-agente.ts. Consulta exige app instalado da loja + agente_pode_vender +
    // saldo >= custo de 1 consulta (tudo na RPC consulta_pode_vender). Agenda é app de
    // loja desde 2026-07-05: instalação + toggle agente_pode_agendar. Flags reusadas no recall (categoriasBloqueadas).
    const recursosAgente = await carregarRecursosAgente(supabase, tenant_id);
    const podeVenderConsulta = recursosAgente.consulta;
    const podeAgendar = recursosAgente.agenda;
    if (!podeVenderConsulta) {
      const TOOLS_CONSULTA = ["enviar_link_consulta", "consultar_dividas_contato"];
      for (let i = tools.length - 1; i >= 0; i--) {
        // deno-lint-ignore no-explicit-any
        if (TOOLS_CONSULTA.includes((tools[i] as any)?.function?.name)) tools.splice(i, 1);
      }
    }
    if (!podeAgendar) {
      const TOOLS_AGENDA = ["enviar_link_agenda", "consultar_horarios_disponiveis", "agendar_reuniao_lead"];
      for (let i = tools.length - 1; i >= 0; i--) {
        // deno-lint-ignore no-explicit-any
        if (TOOLS_AGENDA.includes((tools[i] as any)?.function?.name)) tools.splice(i, 1);
      }
    }
    // Rifas tem TRÊS pacotes (dois desde 2026-09-06, decisão Theus; a leitura foi
    // separada da venda em 2026-09-07):
    //   • leitura → basta o app instalado
    //   • venda   → app + toggle `agente_pode_vender`
    //   • admin (sortear, aprovar pagamento, mudar preço, dívida, disparo, config,
    //     painel e listagem) → SÓ canal interno. Numa conversa com lead essas tools nem
    //     entram na lista: lead não induz o agente a sortear nem a aprovar o próprio
    //     comprovante, e não vê arrecadado. Fonte dos nomes: `_shared/tools-rifas*.ts`.
    // Dentro do pacote "venda", `vender_numeros_rifa` é a única que MOVE dinheiro/número.
    // As outras três são leitura pura e passaram a depender só do app instalado
    // (2026-09-07): informar não é vender. Com o toggle `agente_pode_vender` desligado o
    // agente ficava sem NENHUMA tool de rifa e respondia "vou checar com o dono" quando
    // perguntavam qual rifa existe — sintoma que trouxe este conserto.
    // `listar_rifas` entra na leitura porque é a tool que o Porteiro escolhe para
    // "que rifa tem?" — deixá-la só no admin trazia o problema de volta: alvo indisponível,
    // nada forçado, LLM cai no perguntar_ao_dono. Ela devolve código, título, status,
    // vendidos/total e preço — nada além do que a página pública da rifa já mostra.
    // O que é do dono (arrecadado, a receber, ticket médio, top compradores, fila de
    // comprovantes) está em `painel_rifa`, que segue restrita ao canal interno.
    const TOOLS_RIFA_LEITURA = [
      "consultar_rifa", "consultar_pedido_rifa", "consultar_numeros_rifa", "listar_rifas",
      "enviar_foto_rifa",
    ];
    // `gerenciar_numeros_fixos_rifa` VOLTOU pro admin em 2026-09-17 (decisão Theus): quem
    // crava fixo é o dono. Fixo tira o número da venda em toda rifa daquele sorteio, pra
    // sempre, e no sorteio fixo não pago vira dívida — poder demais pra uma conversa com
    // lead, ainda mais porque o `adicionar` grava por cima do fixo de outra pessoa.
    // O lead continua podendo PEDIR: `solicitar_numero_fixo_rifa` checa se o número está
    // livre, devolve a lista de fixos do sorteio quando está ocupado e registra o pedido
    // como `pendente`. Pendente não reserva nada; o dono aprova pelo canal interno
    // (acao "pendentes"/"aprovar") ou pela aba Fixos.
    const TOOLS_RIFA_VENDA = ["vender_numeros_rifa", "solicitar_numero_fixo_rifa"];
    const TOOLS_RIFA_ADMIN = [
      "painel_rifa", "dossie_cliente_rifa", "decidir_pedido_rifa",
      "sortear_rifa_agora", "gerenciar_rifa", "gerenciar_numeros_fixos_rifa",
      "gerenciar_dividas_rifa", "configurar_rifas", "gerenciar_disparo_rifa",
      "anunciar_resultado_rifa",
    ];
    // Três níveis, do mais aberto ao mais fechado:
    //   leitura → app instalado
    //   venda   → app instalado + toggle agente_pode_vender
    //   admin   → só canal interno (painel_rifa expõe arrecadado, a receber e top
    //             compradores; sortear/decidir_pedido mexem no resultado). Lead não vê.
    const rifasBloqueadas = [
      ...(recursosAgente.rifasLeitura ? [] : TOOLS_RIFA_LEITURA),
      ...(recursosAgente.rifas ? [] : TOOLS_RIFA_VENDA),
      ...(recursosAgente.rifasLeitura && canalConversa === "interno" ? [] : TOOLS_RIFA_ADMIN),
    ];
    if (rifasBloqueadas.length > 0) {
      for (let i = tools.length - 1; i >= 0; i--) {
        // deno-lint-ignore no-explicit-any
        if (rifasBloqueadas.includes((tools[i] as any)?.function?.name)) tools.splice(i, 1);
      }
    }

    // "Rifa do Dia" (2026-09-07, pedido Theus): o estado da rifa entra no prompt de TODO
    // turno, lido do banco na hora. Sem isso o agente dependia de escolher a tool certa —
    // e quando não escolhia, respondia de memória ou mandava perguntar ao dono.
    // Leitura viva, não cache: número disponível muda a cada reserva.
    const blocoRifaDoDia = recursosAgente.rifasLeitura
      ? await montarBlocoRifaDoDia(supabase as any, tenant_id)
      : "";

    // Pacotes de Conhecimento (2026-09-15): upgrade ON/OFF por agente, somado ao conhecimento
    // padrão. Sem pacote ligado volta vazio e nada abaixo muda o prompt — ver _shared/pacotes-conhecimento.ts.
    const pacotesAgente = await carregarPacotesAgente(supabase, agente_id);

    // Chat Treino (2026-09-18): produto em foco + conversa padrão daquele produto. O Chat Treino
    // escolhe o produto antes de começar; aqui ele troca sozinho quando o lead passa a falar de
    // outro produto do catálogo ("trocar a ficha"). Só entra no prompt a conversa padrão do
    // produto em foco (ou a geral) — nunca a de outro, pra não misturar conhecimento.
    let produtoFocoId: string | null = null;
    let conversaPadrao: ConversaPadraoAtiva | null = null;
    if (conversa_id) {
      try {
        const { data: _convFoco } = await supabase.from("conversas").select("produto_foco_id").eq("id", conversa_id).maybeSingle();
        produtoFocoId = (_convFoco?.produto_foco_id as string | null) ?? null;
        if (!ehTokenProativo && typeof mensagemEfetiva === "string" && mensagemEfetiva.trim()) {
          const { data: _catalogo } = await supabase.from("produtos").select("id, nome").eq("user_id", tenant_id);
          const _mencionado = detectarProdutoMencionado(mensagemEfetiva, (_catalogo ?? []) as ProdutoCatalogo[], produtoFocoId);
          if (_mencionado && _mencionado !== produtoFocoId) {
            await supabase.from("conversas").update({ produto_foco_id: _mencionado }).eq("id", conversa_id);
            console.info(`[produto-foco] ${produtoFocoId ?? "nenhum"} → ${_mencionado} (conversa=${conversa_id})`);
            produtoFocoId = _mencionado;
          }
        }
        conversaPadrao = await carregarConversaPadrao(supabase, agente_id, produtoFocoId);
      } catch (e) {
        console.warn("[produto-foco] falhou (segue sem conversa padrão):", (e as Error).message);
      }
    }

    // DEC-038: tool_choice forçada na 1ª iteração quando Porteiro indicar tool clara.
    // - Vale só se Porteiro retornou tool_alvo + confianca_tool ≥ 0.7
    // - E a tool sugerida EXISTE na lista carregada do cargo escolhido (degrada gracioso)
    // - Iter ≥ 1 sempre volta a "auto" (após tool rodar, LLM precisa gerar texto)
    // Resultado: LLM é OBRIGADO a emitir tool_call em vez de escrever placeholder
    // (ex: "[Link do Contrato]" não passa — só JSON da tool ou falha).
    const TOOL_CHOICE_FORCAR_LIMITE = 0.7;
    const toolAlvoPorteiro: string | null =
      typeof classificacao?.tool_alvo === "string" && classificacao.tool_alvo.length > 0
        ? classificacao.tool_alvo
        : null;
    const confTool: number =
      typeof classificacao?.confianca_tool === "number" ? classificacao.confianca_tool : 0;
    // deno-lint-ignore no-explicit-any
    const toolExisteNoCargo = !!toolAlvoPorteiro &&
      // deno-lint-ignore no-explicit-any
      (tools as any[]).some((t: any) => t?.function?.name === toolAlvoPorteiro);
    let toolChoiceForcada: { type: "function"; function: { name: string } } | null =
      toolExisteNoCargo && confTool >= TOOL_CHOICE_FORCAR_LIMITE && toolAlvoPorteiro
        ? { type: "function", function: { name: toolAlvoPorteiro } }
        : null;

    // Agenda autônoma (2026-08-19): fallback determinístico quando o Porteiro NÃO
    // marcou tool mas a intenção/fala é claramente de agendamento e o cargo tem a
    // tool de consulta de horários. Sem isso a Síntese enrola ("vou dar uma
    // olhadinha… já te confirmo") sem emitir tool_call — smoke 2026-08-18 provou
    // que com tool_choice forçada o agente consulta e marca de verdade.
    const TOOL_CONSULTAR_AGENDA = "consultar_horarios_disponiveis";
    if (!toolChoiceForcada && !ehTokenProativo) {
      const temToolAgenda =
        // deno-lint-ignore no-explicit-any
        (tools as any[]).some((t: any) => t?.function?.name === TOOL_CONSULTAR_AGENDA);
      const sinalPorteiro = `${classificacao?.intencao ?? ""} ${classificacao?.hipotese_resposta ?? ""} ${classificacao?.resumo ?? ""}`.toLowerCase();
      const sinalLead = String(mensagemEfetiva ?? "").toLowerCase();
      const regexAgenda = /\b(agendar|agendamento|remarcar|marcar|reuni[aã]o|apresenta[cç][aã]o gratuita|hor[aá]rios? dispon|que horas|disponibilidade|encaixe|call)\b/;
      if (temToolAgenda && (regexAgenda.test(sinalPorteiro) || regexAgenda.test(sinalLead))) {
        toolChoiceForcada = { type: "function", function: { name: TOOL_CONSULTAR_AGENDA } };
      }
    }

    // Carrega metadata do cargo pra injetar a bússola no system prompt da síntese.
    // Sem isso, o LLM não sabe o objetivo do cargo ativo nem as regras livres cravadas
    // pelo tenant em Curadoria/AppAgente — responde genérico (sintoma 2026-05-13).
    let cargoMeta: { nome: string; objetivo_principal: string; regras_livres: string } | null = null;
    let diretrizesCargo: Array<{ ordem: number; titulo: string; descricao: string }> = [];
    if (cargoId) {
      // deno-lint-ignore no-explicit-any
      const sb2 = supabase as any;
      const [cmRes, ddRes] = await Promise.all([
        sb2.from("cargos").select("nome, objetivo_principal, regras_livres").eq("id", cargoId).maybeSingle(),
        // Onda CC12-paridade (2026-05-14): cargo_diretrizes — blocos procedurais
        // independentes vinculados ao cargo. Carol Vendedor tem 9 diretrizes
        // ("Confirmação rápida e avanço", "Fase 1 Saudação", "Fase 2 Qualificação",
        // "Venda consultiva", etc). CC12 injeta como <diretrizes_do_cargo> no system prompt.
        sb2.from("cargo_diretrizes")
          .select("ordem, titulo, descricao")
          .eq("cargo_id", cargoId)
          .eq("ativo", true)
          .order("ordem", { ascending: true }),
      ]);
      const cm = cmRes.data;
      if (cm) {
        cargoMeta = {
          nome: String(cm.nome ?? ""),
          objetivo_principal: String(cm.objetivo_principal ?? ""),
          regras_livres: String(cm.regras_livres ?? ""),
        };
      }
      // deno-lint-ignore no-explicit-any
      diretrizesCargo = ((ddRes.data as any[]) ?? []).map((d) => ({
        ordem: Number(d.ordem ?? 0),
        titulo: String(d.titulo ?? ""),
        descricao: String(d.descricao ?? ""),
      }));
    }

    // Persiste cargo_ativo_id na conversa — drive da coluna no Atendimento Kanban
    // (briefing 2026-05-13 §8.7). Realtime channel `atendimento-${agente_id}` reage
    // ao UPDATE e move o card de coluna. Frontend lê `conversas.cargo_ativo_id`
    // pra mostrar "Cargo ativo" na Ficha do Ragentic.
    if (cargoId) {
      await supabase
        .from("conversas")
        .update({ cargo_ativo_id: cargoId, updated_at: new Date().toISOString() })
        .eq("id", conversa_id);
    }

    const { data: hist } = await supabase
      .from("mensagens")
      .select("role, content, carga")
      .eq("conversation_id", conversa_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(HISTORICO_TURNOS);
    // deno-lint-ignore no-explicit-any
    const historico = ((hist as any[]) ?? []).reverse();

    // B3 (2026-05-24): mídia PASSADA aparece como "[MEDIA_RECEBIDA]" no content — usa a descrição
    // já salva (carga.media_descricao, gravada pelo webhook) pra não perder contexto em turnos futuros.
    for (const h of historico) {
      const desc = (h?.carga as Record<string, unknown> | null)?.media_descricao;
      if (typeof desc === "string" && desc && (!h.content || h.content === "[MEDIA_RECEBIDA]")) {
        h.content = `[Mídia do lead — conteúdo: ${desc}]`;
      }
      // Identidade do autor (2026-06-11 · caso "Manual do Cliente"): mensagem role='human'
      // (dono/membro da equipe) entrava no LLM como fala do PRÓPRIO agente, sem autor —
      // o agente concluiu que "o lead enviou o manual 3x" e ecoou "[arquivo] ...". Rotula
      // QUEM falou e traduz anexo (carga.file) pra descrição legível.
      if (h.role === "human") {
        const cg = h?.carga as Record<string, unknown> | null;
        const sender = cg?.sender as { name?: string; cargo?: string } | null;
        const file = cg?.file as { name?: string } | null;
        let corpo = h.content || "";
        if (file?.name) corpo = `[enviou o arquivo "${file.name}" pro lead]${corpo && !corpo.startsWith("[arquivo]") ? ` ${corpo}` : ""}`;
        // O eco da SUA PRÓPRIA fala (2026-09-07): tudo que o agente manda pelo WhatsApp
        // volta pelo webhook como role='human' com `sender.name` = o DONO do número, porque
        // o número é dele. O webhook já distingue quem falou em `carga.autor`; o rótulo
        // abaixo ignorava esse campo e devolvia a fala do agente como "pode ter sido um
        // humano do time". Resultado: o agente ficava SEM UMA mensagem marcada como dele e,
        // quando o lead respondia, refazia a abertura — a Naty da Easy se apresentando duas
        // vezes na mesma conversa. `autor='agente'` é resposta sem ambiguidade: é fala dele.
        if (String(cg?.autor ?? "") === "agente") {
          h.role = "assistant";
          h.content = corpo;
          continue;
        }
        const ehEcoWhatsapp = String(cg?.source ?? "") === "whatsapp_app";
        const quem = sender?.name
          ? `${sender.name}${sender.cargo ? ` (${sender.cargo})` : ""} — humano da SUA equipe`
          : "humano da SUA equipe";
        h.content = ehEcoWhatsapp
          ? `[Mensagem do lado da empresa enviada pelo WhatsApp${sender?.name ? ` por ${sender.name}` : ""} — pode ter sido um humano do time]: ${corpo}`
          : `[${quem} respondeu o lead diretamente pela plataforma]: ${corpo}`;
      }
    }
    // ── Primeira fala da empresa (2026-09-15, caso Easy/Naty) ──
    // O motor JÁ sabia que a conversa não tinha nenhuma fala da empresa e não usava isso: a
    // <regra_de_continuidade> lá embaixo abre com "PROIBIDO tratar como primeiro contato"
    // (regra do lead JÁ CONHECIDO) e o modelo de síntese leu como ordem geral — a Naty
    // respondeu a PRIMEIRA mensagem do lead com "Pelo que você me contou…" e já jogou
    // produto + preço, sem abrir o atendimento. Aqui a primeira fala vira FATO
    // determinístico no prompt, não inferência do LLM. Só afirma quando o histórico cabe
    // inteiro na janela (senão pode ser conversa antiga truncada). Mesma definição da
    // saudação obrigatória: fala da empresa = assistant, ou human (eco do envio / fala manual).
    const ehPrimeiraFalaDaEmpresa = historico.length < HISTORICO_TURNOS &&
      !historico.some((h: { role?: string }) => h?.role === "assistant" || h?.role === "human");

    // B3: o turno ATUAL com mídia ainda não tem media_descricao salva (o webhook só enriquece
    // após o retorno do motor) → injeta a interpretação na última fala do lead agora.
    if (media_url && descricaoMidia) {
      for (let i = historico.length - 1; i >= 0; i--) {
        if (historico[i].role === "user") { historico[i].content = mensagemEfetiva; break; }
      }
    }

    const { data: conv } = await supabase
      .from("conversas")
      .select("lead_id")
      .eq("id", conversa_id)
      .maybeSingle();

    const ctxFerr: CtxFerramenta = {
      tenant_id,
      conversa_id,
      telefone: phone,
      lead_id: conv?.lead_id ?? null,
      agente_id,
      cargo_ativo: cargoAlvo,
    };

    // ── Single-flight (caso Dantas 2026-06-10): execução obsoleta não fala, não abre lacuna,
    // não executa tool de efeito. Msg nova = lead (role=user) OU dono manual (role=human que
    // NÃO é eco WhatsApp) depois do corte_em. Kill-switch: USAR_TRAVA_CONVERSA=false.
    const _usarSingleFlight = (Deno.env.get("USAR_TRAVA_CONVERSA") ?? "true") !== "false" && !modo_teste && !ehTokenProativo;
    const houveMsgNova = async (): Promise<false | "lead" | "dono"> => {
      if (!_usarSingleFlight || typeof corte_em !== "string" || !corte_em || !conversa_id) return false;
      const { data: _nova } = await supabase
        .from("mensagens")
        .select("id, role, carga")
        .eq("conversation_id", conversa_id)
        .gt("created_at", corte_em)
        .is("deleted_at", null)
        .in("role", ["user", "human"])
        .limit(5);
      const lista = ((_nova ?? []) as Array<{ id: string; role: string; carga: Record<string, unknown> | null }>)
        // ignora a inbound que ESTE turno inseriu (caller direto/harness; via webhook não existe)
        .filter((m) => m.id !== _inboundMsgIdTurno);
      if (lista.some((m) => m.role === "user")) return "lead";
      // role=human que NÃO é eco WhatsApp do agente = dono respondendo manual no app
      if (lista.some((m) => m.role === "human" && String((m.carga as { source?: string } | null)?.source ?? "") !== "whatsapp_app")) return "dono";
      return false;
    };
    // Aborta a execução obsoleta. Msg nova do LEAD → devolve a carga pro buffer (a execução
    // mais nova ou o varredor 1/min responde TUDO junto com um recall só). DONO respondeu
    // manual → morre SEM rebuffer: o humano assumiu o turno; agente não fala por cima
    // (smoke C 2026-06-10: rebuffer pós-dono gerava resposta-lixo atropelando o dono).
    const abortarSuperseded = async (ponto: string, motivo: "lead" | "dono" = "lead") => {
      console.warn(`[single-flight] execução obsoleta em ${ponto} (motivo=${motivo}) — saída silenciosa${motivo === "lead" ? " + rebuffer" : ""}`);
      if (motivo === "lead") {
        try {
          await supabase.rpc("rebufferar_mensagens", {
            p_phone: phone, p_agent_id: agente_id,
            p_texto: String(message ?? ""), p_media_url: media_url ?? null, p_media_type: media_type ?? null,
          });
        } catch (_e) { /* melhor esforço — a msg segue no histórico */ }
      }
      try {
        await supabase.from("traces").insert({ tenant_id, conversa_id, agente_id, tipo: "ferramenta", decisao: { ferramenta: "single_flight_abort", ponto, motivo } });
      } catch (_e) { /* trace é opcional */ }
      return jsonResp({ reply: "", mensagens: [], conversation_id: conversa_id, superseded: true }, 200);
    };

    // ── RAG-FIRST: recall obrigatório ANTES da síntese (plano consolidado L35/L931) ──
    // Em modo proativo, usa query semântica adequada ao token (não o token cru "[X]").
    const queryRecall = ehTokenProativo ? queryRagProativa : mensagemEfetiva;
    // NICHO no recall (Onda 1A 2026-05-23): sem passar o nicho, a RPC ignorava o escopo de nicho
    // (p_nicho_id IS NULL) → o RAG via só global+tenant. Resolve o nicho do tenant pra LIGAR o 3º escopo.
    const { data: _perfilNichoRecall } = await supabase
      .from("profiles").select("nicho_id").eq("id", tenant_id).maybeSingle();
    const nichoIdRecall = (_perfilNichoRecall?.nicho_id as string | null) ?? null;
    // Onda 1B: filtro de FASE + query top-down (HyDE leve).
    const intencaoTurno = String(classificacao?.intencao ?? "").toLowerCase();
    // Override determinístico: se o lead claramente fala de dinheiro, libera o comercial mesmo que o Porteiro hesite.
    const pedeComercial = /(pre[çc]o|valor|custa|quanto|fechar|negoci|paga|parcel|or[çc]ament)/.test(intencaoTurno);
    // Onda 3C: o gate comercial volta a ser decisão do Porteiro (que agora vê o afeto e seta
    // liberar_comercial=false em ruptura) + override por sinal explícito do lead. Sem hardcode de ruptura.
    const liberarComercial = classificacao?.liberar_comercial === true || pedeComercial || ehTokenProativo;
    const categoriasBloqueadas = [
      ...(liberarComercial ? [] : ["preco", "parcelamento", "pagamento"]),
      // Gate do RAG de consulta (decisão #2): venda off → blocos category='consulta' fora do recall.
      ...(podeVenderConsulta ? [] : ["consulta"]),
      // Conversa padrão (Chat Treino) entra só pela seção própria, a do produto em foco —
      // o RAG não pode trazer a de outro produto.
      "conversa_padrao",
    ];
    const hipoteseRecall = String(classificacao?.hipotese_resposta ?? "").slice(0, 300);
    // Query top-down: mensagem do lead + hipótese de resposta do Porteiro guiam a busca (não só o estímulo cru).
    // Expansão por tema (2026-06-10): fala curta ("Qual valor") engorda com sinônimos do tema
    // detectado — corrige o recall que não trazia o bloco de preço existente no top-k.
    const expansaoRecall = expandirQueryRecall(`${queryRecall}\n${intencaoTurno}`);
    // Turno proativo (2026-06-12): a intimidade MARCADA entra na busca — a curadoria devolve o
    // bloco de comportamento certo pra cada relação (frio = cordial · quente = leve · devendo = desculpa).
    const sufixoIntimidade = ehTokenProativo
      ? `retomada proativa: lead ${_proativoEng}, humor ${_proativoHumor}, ${_proativoDevendo ? "empresa ficou devendo resposta ao lead" : "lead silenciou e parou de responder"}`
      : "";
    const queryEnriquecida = [queryRecall, hipoteseRecall, expansaoRecall, sufixoIntimidade].filter((s) => s && s.trim()).join("\n").slice(0, 1200);
    // deno-lint-ignore no-explicit-any
    const blocosContexto = await recuperarBlocosRagFirst(supabase as any, {
      query: queryEnriquecida,
      agente_id,
      nicho_id: nichoIdRecall,
      // Frente B (calibração): 5 → 8. O candidate set (limite*4) e o pool de rerank (limite*3)
      // já eram grandes; subir o corte final traz o bloco certo quando ele cai em 6º-8º pós-rerank
      // (causa do "recall trouxe bloco errado pro turno"). Cap interno da função = 12.
      limite: 8,
      categoriasBloqueadas,
      // Boost comercial (2026-06-10): turno liberado pra dinheiro → blocos de preço/pagamento
      // ganham ×1.25 na ordenação (não cria relevância, só evita morrer fora do top-8).
      categoriasBoost: liberarComercial ? ["produto", "preco", "parcelamento", "pagamento", "processo"] : [],
    });
    // RAG-first amarrado (dossiê B1 Citation-Required) — Frente A Passo 2: numeração GLOBAL
    // contínua [N] ligada ao bloco_id real, válida pra TODAS as fontes do prompt (recall [1..5],
    // gavetas [6..N]). A Síntese cita [N] após cada afirmação factual; o parser pós-geração mapeia
    // [N] → _mapaCtx[n].id e grava por bolha. Assim cada bolha aponta o bloco real de qualquer fonte.
    let _ctxN = 0;
    const _mapaCtx: { n: number; id: string; fonte: string }[] = [];
    const _rotuloCtx = (id: string | null | undefined, fonte: string): string => {
      _ctxN++;
      if (id) _mapaCtx.push({ n: _ctxN, id: String(id), fonte });
      return id ? `[${_ctxN}] ⟨bloco ${id}⟩` : `[${_ctxN}]`;
    };
    const trechoRag = blocosContexto.length
      ? "\n\nBASE DE CONHECIMENTO (use SEMPRE estes fatos antes de inventar — cite a fonte [N] após cada afirmação factual):\n" +
        blocosContexto
          // deno-lint-ignore no-explicit-any
          .map((b: any) => `${_rotuloCtx(b.id, "conhecimento")} ${b.title || "(sem título)"} — ${(b.content || "").slice(0, 600)}`)
          .join("\n\n")
      : "";

    // Pacotes de Conhecimento: fixos ("sempre") + por relevância, numerados no mesmo registro [N].
    // A busca por relevância só roda se algum pacote ligado tiver bloco desse modo.
    const blocoPacotesFixos = montarBlocoPacotesFixos(pacotesAgente.fixos, _rotuloCtx);
    const blocoConversaPadrao = montarBlocoConversaPadrao(conversaPadrao, _rotuloCtx);
    const blocosPacotes: BlocoPacoteRelevante[] = pacotesAgente.temRelevancia
      ? await recuperarBlocosPacotes(supabase, {
          query: queryEnriquecida,
          agente_id,
          limite: 4,
          categoriasBloqueadas,
        })
      : [];
    const trechoPacotes = montarTrechoPacotesRelevantes(blocosPacotes, _rotuloCtx);

    // ── Passo 2 (Gate A1): nome do nicho + escopo do agente pra alimentar o classificador de relevância ──
    // Feito aqui (após nichoIdRecall estar definido) e antes do Gate A1 que usa esses dados.
    let nichoNomeLacuna: string | null = null;
    let escopoAgenteLacuna: string | null = null;
    try {
      if (nichoIdRecall) {
        // deno-lint-ignore no-explicit-any
        const { data: _n } = await (supabase as any).from("nichos").select("nome").eq("id", nichoIdRecall).maybeSingle();
        nichoNomeLacuna = (_n?.nome as string | null) ?? null;
      }
      // Combina cargo + persona + personalidade pra dar contexto rico ao classificador de relevância
      const _cargoStr = (identidadeAgente?.cargo as string | undefined) ?? "";
      const _personaStr = (identidadeAgente?.persona as string | undefined) ?? (identidadeAgente?.tom as string | undefined) ?? "";
      escopoAgenteLacuna = [_cargoStr, _personaStr, personalidadeAgente].filter(Boolean).join(" — ").slice(0, 600) || null;
    } catch (_eNicho) { /* ignora — classificador usa fallback de escopo vazio */ }

    // ── Gate A1 global RAG-first amarrado (Onda D4 / loop-mentor) ──
    // Se o recall principal veio vazio OU o melhor rerank_score ficou abaixo do limiar,
    // o motor NÃO chama a Síntese — delega direto pro loop-mentor.
    // O classificador de relevância LLM (dentro do loop-mentor) ainda decide:
    //   → pergunta plausível no escopo  → cria lacuna no Mentor (dono responde, agente entrega)
    //   → pergunta absurda/fora-escopo  → bolha de recusa educada direto ao lead
    // Configurável via env USAR_GATE_A1_RAG_FIRST=false (kill-switch sem redeploy).
    // Gate A1 DESLIGADO por padrão (2026-05-29, intenção pura do recurso cravada pelo Theus).
    // O A1 adivinhava "tem dado?" pela NOTA do recall da query crua ANTES da Síntese. Query vaga
    // de abertura ("Como funciona", "tenho interesse") casa fraco (score 0.04-0.12) → disparava
    // Mentor e travava o INÍCIO da conversa. Era chute por score, não juízo do conteúdo gerado.
    // Agora a Síntese SEMPRE gera com o que recebeu no prompt (fontes com UUID) e o Gate B1
    // (auditor pós-resposta) é o ÚNICO juiz. Religável via USAR_GATE_A1_RAG_FIRST=true.
    const _USAR_GATE_A1 = (Deno.env.get("USAR_GATE_A1_RAG_FIRST") ?? "false").toLowerCase() === "true";
    if (_USAR_GATE_A1 && !ehTokenProativo) {
      // rerank_score vai de 0.0 a 1.0; score máximo entre todos os blocos recuperados
      // deno-lint-ignore no-explicit-any
      const _scoreMaxA1 = blocosContexto.reduce((acc: number, b: any) => Math.max(acc, Number((b as { rerank_score?: number }).rerank_score ?? 0)), 0);
      // Frente B (calibração): limiar baixado 0.25 → 0.15. Com o Gate B1 robusto (audita a
      // resposta contra TODAS as fontes), o A1 vira PISO EXTREMO (recall quase nulo) — deixa a
      // Síntese responder em recall moderado (ex: cláusulas jurídicas rerankeiam ~0.19 vs query
      // coloquial) e o B1 julga. Antes 0.25 cortava resposta legítima → Mentor desnecessário.
      const _LIMIAR_A1 = Number(Deno.env.get("LIMIAR_GATE_A1") ?? "0.15");

      if (blocosContexto.length === 0 || _scoreMaxA1 < _LIMIAR_A1) {
        console.warn(`[gate_a1] disparou — blocos=${blocosContexto.length} scoreMax=${_scoreMaxA1.toFixed(3)} limiar=${_LIMIAR_A1}`);

        const { criarLacunaParaMentor } = await import("../_shared/loop-mentor.ts");
        const _lacunaA1 = await criarLacunaParaMentor(supabase, {
          tenantId: tenant_id,
          conversaId: conversa_id!,
          leadId: conv?.lead_id ?? null,
          agenteId: agente_id ?? null,
          perguntaOriginalLead: String(mensagemEfetiva ?? ""),
          // Últimas 4 trocas do histórico como contexto resumido pro classificador
          contextoResumido: (historico as Array<{ role: string; content: string | null }>)
            .slice(-4)
            .map((m) => `${m.role}: ${typeof m.content === "string" ? m.content.slice(0, 300) : ""}`)
            .join("\n")
            .slice(0, 1500),
          nichoNome: nichoNomeLacuna,
          escopoAgente: escopoAgenteLacuna,
        });

        // Trace de observabilidade — não derruba se falhar
        try {
          await supabase.from("traces").insert({
            tenant_id, conversa_id, agente_id,
            tipo: "porteiro",
            modelo_llm: "ragentic/gate_a1",
            decisao: {
              ferramenta: _lacunaA1.foi_pro_mentor ? "fallback_mentor_gate_a1" : "segue_fluxo_normal",
              pergunta_id: _lacunaA1.pergunta_id,
              motivo_classificador: _lacunaA1.motivo_classificador,
              score_max: _scoreMaxA1,
              limiar: _LIMIAR_A1,
              blocos_encontrados: blocosContexto.length,
            },
          });
        } catch (_eTrace) { /* ignora */ }

        // SÓ intercepta quando o classificador mandou pro Mentor (pergunta factual relevante
        // sem bloco). Confirmações/saudações/continuações ("Sim", "Ok", "No aguardo") têm score
        // de recall baixo natural — mas NÃO são lacuna: o classificador devolve foi_pro_mentor=false
        // e aqui a gente DEIXA o fluxo normal seguir (a Síntese responde com base no contexto e o
        // Gate B1 audita a saída). Antes o A1 soltava "Essa pergunta foge do que atendo" pra todo
        // 'sim'/'ok' e trancava a conversa (incidente Diego 2026-05-29).
        if (_lacunaA1.foi_pro_mentor) {
          // Bolha pro lead: modo_teste → grava em `mensagens` (Chat de Teste lê daqui).
          // Produção → enfileira em caixa_saida_mensagens (process-followups despacha via Z-API).
          if (modo_teste) {
            try {
              await supabase.from("mensagens").insert({
                conversation_id: conversa_id,
                role: "assistant",
                content: _lacunaA1.bolha_fixa_para_lead,
              });
            } catch (_eMtA1) { /* ignora */ }
          } else {
            try {
              await enfileirarBolha({
                tenant_id,
                conversation_id: conversa_id!,
                content: _lacunaA1.bolha_fixa_para_lead,
                ordem: 0,
                t0_ms: Date.now(),
                gerada_ate: null,
              });
            } catch (_eBolha) {
              console.warn("[gate_a1] erro ao enfileirar bolha fixa:", (_eBolha as Error).message);
            }
          }

          return jsonResp({
            ok: true,
            modo: "fallback_mentor_gate_a1",
            pergunta_id: _lacunaA1.pergunta_id,
            reply: _lacunaA1.bolha_fixa_para_lead,
            mensagens: modo_teste ? [_lacunaA1.bolha_fixa_para_lead] : [],
            conversation_id: conversa_id,
          }, 200);
        }
        // foi_pro_mentor=false → não intercepta; cai pro fluxo normal (Síntese + Gate B1).
      }
    }

    // ============================================================================
    // Onda 7B (2026-05-28) — Religar 3 primeiras gavetas mortas (94 blocos órfãos)
    // regras_operacionais (53) + anti_padroes (7) + humanizacao (34)
    // Configurável via config_chamadas_llm.sintese.gavetas_ativas (UI Curadoria).
    // Fallback: se RPC/embedding falhar, motor segue sem (zero regressão).
    // ============================================================================
    let trechoGavetas = "";
    try {
      const cfgSinteseGavetas = await getConfigChamada(supabase, "sintese", tenant_id ?? null, nichoIdRecall ?? null);
      const gavetasCfg = cfgSinteseGavetas.gavetas_ativas ?? {};
      const cfgRO = gavetasCfg.regras_operacionais;
      const cfgAP = gavetasCfg.anti_padroes;
      const cfgHU = gavetasCfg.humanizacao;
      const algumaAtiva = !!(cfgRO?.ativo || cfgAP?.ativo || cfgHU?.ativo);
      if (algumaAtiva && queryEnriquecida.trim()) {
        const embGavetas = await gerarEmbeddingQuery(supabase, queryEnriquecida);
        if (embGavetas) {
          // deno-lint-ignore no-explicit-any
          const sb = supabase as any;
          // Onda 10: + variacao, gatilho, procedurais, meta
          const cfgVA = gavetasCfg.variacao;
          const cfgGA = gavetasCfg.gatilho;
          const cfgPR = gavetasCfg.procedurais;
          const cfgME = gavetasCfg.meta;
          const [resRO, resAP, resHU, resVA, resGA, resPR, resME, resPS, resAP15, resMP, resEM] = await Promise.allSettled([
            cfgRO?.ativo ? sb.rpc("busca_hibrida_regras_operacionais", {
              p_query_text: queryEnriquecida,
              p_query_embedding: embGavetas,
              p_categoria: null,
              p_tenant_id: tenant_id ?? null,
              p_nicho_id: nichoIdRecall ?? null,
              p_top_k: cfgRO.top_n ?? 5,
              p_threshold: cfgRO.piso ?? 0.0,
            }) : Promise.resolve({ data: [] }),
            cfgAP?.ativo ? sb.rpc("busca_hibrida_anti_padroes", {
              p_query_text: queryEnriquecida,
              p_query_embedding: embGavetas,
              p_tenant_id: tenant_id ?? null,
              p_nicho_id: nichoIdRecall ?? null,
              p_top_k: cfgAP.top_n ?? 3,
              p_threshold: cfgAP.piso ?? 0.35,
            }) : Promise.resolve({ data: [] }),
            cfgHU?.ativo ? sb.rpc("busca_hibrida_humanizacao", {
              p_query_text: queryEnriquecida,
              p_query_embedding: embGavetas,
              p_tenant_id: tenant_id ?? null,
              p_nicho_id: nichoIdRecall ?? null,
              p_persona_tags: null,
              p_match_count: cfgHU.top_n ?? 2,
            }) : Promise.resolve({ data: [] }),
            cfgVA?.ativo ? sb.rpc("busca_hibrida_variacao", {
              p_query_text: queryEnriquecida,
              p_query_embedding: embGavetas,
              p_agent_id: agente_id ?? null,
              p_nicho_id: nichoIdRecall ?? null,
              p_tenant_id: tenant_id ?? null,
              p_match_count: cfgVA.top_n ?? 2,
            }) : Promise.resolve({ data: [] }),
            cfgGA?.ativo ? sb.rpc("busca_hibrida_gatilho", {
              p_query_text: queryEnriquecida,
              p_query_embedding: embGavetas,
              p_tenant_id: tenant_id ?? null,
              p_nicho_id: nichoIdRecall ?? null,
              p_match_count: cfgGA.top_n ?? 3,
            }) : Promise.resolve({ data: [] }),
            cfgPR?.ativo ? sb.rpc("busca_hibrida_procedurais", {
              p_query_text: queryEnriquecida,
              p_query_embedding: embGavetas,
              p_tenant_id: tenant_id ?? null,
              p_nicho_id: nichoIdRecall ?? null,
              p_top_k: cfgPR.top_n ?? 3,
              p_threshold: cfgPR.piso ?? 0.35,
            }) : Promise.resolve({ data: [] }),
            cfgME?.ativo ? sb.rpc("busca_hibrida_meta", {
              p_query_text: queryEnriquecida,
              p_query_embedding: embGavetas,
              p_tenant_id: tenant_id ?? null,
              p_nicho_id: nichoIdRecall ?? null,
              p_tag: "qualquer",
              p_match_count: cfgME.top_n ?? 2,
            }) : Promise.resolve({ data: [] }),
            // Onda 15: 3 gavetas finais
            gavetasCfg.prova_social?.ativo ? sb.rpc("busca_hibrida_prova_social", {
              p_query_text: queryEnriquecida,
              p_query_embedding: embGavetas,
              p_tenant_id: tenant_id ?? null,
              p_nicho_id: nichoIdRecall ?? null,
              p_top_k: gavetasCfg.prova_social.top_n ?? 2,
              p_threshold: gavetasCfg.prova_social.piso ?? 0.40,
            }) : Promise.resolve({ data: [] }),
            gavetasCfg.acao_pausa?.ativo ? sb.rpc("busca_hibrida_acao_pausa", {
              p_query: queryEnriquecida,
              p_query_embedding: embGavetas,
              p_tenant_id: tenant_id ?? null,
              p_nicho_id: nichoIdRecall ?? null,
              p_match_count: gavetasCfg.acao_pausa.top_n ?? 1,
            }) : Promise.resolve({ data: [] }),
            gavetasCfg.manipulacao?.ativo ? sb.rpc("busca_hibrida_manipulacao", {
              p_query_text: queryEnriquecida,
              p_query_embedding: embGavetas,
              p_tenant_id: tenant_id ?? null,
              p_nicho_id: nichoIdRecall ?? null,
              p_top_k: gavetasCfg.manipulacao.top_n ?? 1,
              p_threshold: gavetasCfg.manipulacao.piso ?? 0.65,
            }) : Promise.resolve({ data: [] }),
            // Fechamento: emocao (11/11)
            gavetasCfg.emocao?.ativo ? sb.rpc("busca_hibrida_emocao", {
              p_query_text: queryEnriquecida,
              p_query_embedding: embGavetas,
              p_tenant_id: tenant_id ?? null,
              p_nicho_id: nichoIdRecall ?? null,
              p_top_k: gavetasCfg.emocao.top_n ?? 2,
              p_threshold: gavetasCfg.emocao.piso ?? 0.35,
            }) : Promise.resolve({ data: [] }),
          ]);
          // deno-lint-ignore no-explicit-any
          const dataRO = (resRO.status === "fulfilled" ? ((resRO.value as any)?.data ?? []) : []) as any[];
          // deno-lint-ignore no-explicit-any
          const dataAP = (resAP.status === "fulfilled" ? ((resAP.value as any)?.data ?? []) : []) as any[];
          // deno-lint-ignore no-explicit-any
          const dataHU = (resHU.status === "fulfilled" ? ((resHU.value as any)?.data ?? []) : []) as any[];
          if (dataRO.length) {
            trechoGavetas += "\n\n<regras_operacionais>\n" +
              dataRO.slice(0, cfgRO?.top_n ?? 5).map((b: Record<string, unknown>) =>
                `${_rotuloCtx(b.id as string | undefined, "regras_operacionais")} (${b.categoria ?? "geral"}) ${b.regra ?? ""}${b.contexto ? ` — contexto: ${String(b.contexto).slice(0, 200)}` : ""}`
              ).join("\n") + "\n</regras_operacionais>";
          }
          if (dataAP.length) {
            trechoGavetas += "\n\n<anti_padroes>\n" +
              dataAP.slice(0, cfgAP?.top_n ?? 3).map((b: Record<string, unknown>) =>
                `${_rotuloCtx(b.id as string | undefined, "anti_padroes")} EVITE: ${b.situacao ?? ""} → AÇÃO CORRETA: ${b.acao_correta ?? ""}${b.por_que ? ` (porque ${String(b.por_que).slice(0, 150)})` : ""}`
              ).join("\n") + "\n</anti_padroes>";
          }
          if (dataHU.length) {
            trechoGavetas += "\n\n<humanizacao>\n" +
              dataHU.slice(0, cfgHU?.top_n ?? 2).map((b: Record<string, unknown>) => {
                const ex = (b.exemplos_bons as string[] | undefined)?.slice(0, 2)?.join(" / ") ?? "";
                return `${_rotuloCtx(b.id as string | undefined, "humanizacao")} (${b.categoria ?? ""}/${b.subcategoria ?? ""}) ${b.regra ?? ""}${ex ? ` ex: ${ex}` : ""}`;
              }).join("\n") + "\n</humanizacao>";
          }
          // Onda 10: 4 gavetas adicionais
          // deno-lint-ignore no-explicit-any
          const dataVA = (resVA.status === "fulfilled" ? ((resVA.value as any)?.data ?? []) : []) as any[];
          // deno-lint-ignore no-explicit-any
          const dataGA = (resGA.status === "fulfilled" ? ((resGA.value as any)?.data ?? []) : []) as any[];
          // deno-lint-ignore no-explicit-any
          const dataPR = (resPR.status === "fulfilled" ? ((resPR.value as any)?.data ?? []) : []) as any[];
          // deno-lint-ignore no-explicit-any
          const dataME = (resME.status === "fulfilled" ? ((resME.value as any)?.data ?? []) : []) as any[];
          if (dataVA.length) {
            trechoGavetas += "\n\n<variacao_lexical>\n" +
              dataVA.slice(0, cfgVA?.top_n ?? 2).map((b: Record<string, unknown>) =>
                `${_rotuloCtx(b.id as string | undefined, "variacao")} (${b.categoria ?? "geral"}) ${b.frase ?? b.conteudo ?? b.texto ?? ""}`
              ).join("\n") + "\n</variacao_lexical>";
          }
          if (dataGA.length) {
            trechoGavetas += "\n\n<gatilhos_disponiveis>\n" +
              dataGA.slice(0, cfgGA?.top_n ?? 3).map((b: Record<string, unknown>) =>
                `${_rotuloCtx(b.id as string | undefined, "gatilho")} ${b.nome_trigger ?? ""}: SE "${b.exemplo_frase ?? ""}" ENTÃO ${b.acao_disparada ?? ""}`
              ).join("\n") + "\n</gatilhos_disponiveis>";
          }
          if (dataPR.length) {
            trechoGavetas += "\n\n<procedimentos>\n" +
              dataPR.slice(0, cfgPR?.top_n ?? 3).map((b: Record<string, unknown>) =>
                `${_rotuloCtx(b.id as string | undefined, "procedurais")} (${b.categoria ?? "geral"}) ${b.titulo ?? b.nome ?? ""}: ${b.passos ?? b.conteudo ?? ""}`
              ).join("\n") + "\n</procedimentos>";
          }
          if (dataME.length) {
            trechoGavetas += "\n\n<meta_controle>\n" +
              dataME.slice(0, cfgME?.top_n ?? 2).map((b: Record<string, unknown>) =>
                `${_rotuloCtx(b.id as string | undefined, "meta")} ${b.titulo ?? ""}: ${b.conteudo ?? b.regra ?? ""}`
              ).join("\n") + "\n</meta_controle>";
          }
          // Onda 15: 3 gavetas finais
          // deno-lint-ignore no-explicit-any
          const dataPS = (resPS.status === "fulfilled" ? ((resPS.value as any)?.data ?? []) : []) as any[];
          // deno-lint-ignore no-explicit-any
          const dataAP15 = (resAP15.status === "fulfilled" ? ((resAP15.value as any)?.data ?? []) : []) as any[];
          // deno-lint-ignore no-explicit-any
          const dataMP = (resMP.status === "fulfilled" ? ((resMP.value as any)?.data ?? []) : []) as any[];
          if (dataPS.length) {
            trechoGavetas += "\n\n<prova_social>\n" +
              dataPS.slice(0, gavetasCfg.prova_social?.top_n ?? 2).map((b: Record<string, unknown>) =>
                `${_rotuloCtx(b.id as string | undefined, "prova_social")} ${b.titulo ?? ""}: ${b.conteudo ?? b.texto ?? ""}`
              ).join("\n") + "\n</prova_social>";
          }
          if (dataAP15.length) {
            trechoGavetas += "\n\n<acao_pausa>\n" +
              dataAP15.slice(0, gavetasCfg.acao_pausa?.top_n ?? 1).map((b: Record<string, unknown>) =>
                `${_rotuloCtx(b.id as string | undefined, "acao_pausa")} ${b.gatilho ?? ""}: PAUSE quando ${b.condicao ?? b.regra ?? b.conteudo ?? ""}`
              ).join("\n") + "\n</acao_pausa>";
          }
          if (dataMP.length) {
            trechoGavetas += "\n\n<tecnicas_persuasao>\n" +
              dataMP.slice(0, gavetasCfg.manipulacao?.top_n ?? 1).map((b: Record<string, unknown>) =>
                `${_rotuloCtx(b.id as string | undefined, "manipulacao")} ${b.tecnica ?? b.titulo ?? ""}: ${b.descricao ?? b.conteudo ?? ""}`
              ).join("\n") + "\n</tecnicas_persuasao>";
          }
          // Fechamento: emocao
          // deno-lint-ignore no-explicit-any
          const dataEM = (resEM.status === "fulfilled" ? ((resEM.value as any)?.data ?? []) : []) as any[];
          if (dataEM.length) {
            trechoGavetas += "\n\n<emocoes_situacionais>\n" +
              dataEM.slice(0, gavetasCfg.emocao?.top_n ?? 2).map((b: Record<string, unknown>) =>
                `${_rotuloCtx(b.id as string | undefined, "emocao")} ${b.emocao ?? ""} (intensidade ${b.intensidade_match ?? "?"}): ${b.corpo ?? ""}`
              ).join("\n") + "\n</emocoes_situacionais>";
          }
        }
      }
    } catch (e) {
      console.warn("[onda7b] falha religar gavetas (motor segue sem):", e instanceof Error ? e.message : String(e));
    }

    // Onda 3C: religa a gaveta de COMPORTAMENTO (estava morta no motor). Query top-down (enriquecida
    // pela hipótese do Porteiro, já colorida pelo afeto) → em ruptura puxa os blocos de reparação.
    const comportamentos = await recuperarComportamento(supabase as any, {
      query: queryEnriquecida,
      tenant_id,
      nicho_id: nichoIdRecall,
      tom: tomAgente,
      limite: 3,
    });
    const blocoComportamento = comportamentos.length
      ? `<comportamento_situacional importancia="alta">\n` +
        `Como agir nesta situação (curadoria de comportamento — plataforma/nicho/você; siga):\n` +
        comportamentos.map((c) => `${_rotuloCtx((c as { id?: string }).id, "comportamento")} ${c.instrucao}`).join("\n") +
        `\n</comportamento_situacional>\n\n`
      : "";

    // BUG-02 / DEC-038 telemetria: agregar IDs de TODOS os blocos acionados no turno.
    // Vai gravado em `caixa_saida_mensagens.carga.blocos_acionados` (prod) e em
    // `mensagens.blocos_acionados` direto (modo_teste). Webhook reconcilia eco com a
    // carga pra popular `mensagens.blocos_acionados` em prod (best-effort por content).
    // deno-lint-ignore no-explicit-any
    const blocosAcionadosIds: string[] = [
      // deno-lint-ignore no-explicit-any
      ...blocosContexto.map((b: any) => String(b?.id ?? "")).filter(Boolean),
      // deno-lint-ignore no-explicit-any
      ...comportamentos.map((c: any) => String(c?.id ?? "")).filter(Boolean),
      ...pacotesAgente.fixos.map((b) => b.id),
      ...blocosPacotes.map((b) => b.id),
    ];

    await supabase.from("traces").insert({
      tenant_id,
      conversa_id,
      agente_id,
      tipo: "ferramenta",
      modelo_llm: "voyage/voyage-4+rerank-2.5",
      decisao: {
        ferramenta: "recall_pre_sintese",
        blocos_recuperados: blocosContexto.length,
        ids: blocosContexto.map((b) => b.id),
        // Observabilidade Onda 1A: ver se o nicho entrou + relevância pura de cada bloco + escopos.
        escopos: blocosContexto.map((b) => b.escopo),
        categorias: blocosContexto.map((b) => b.category),
        rerank_scores: blocosContexto.map((b) => Number((b as { rerank_score?: number }).rerank_score ?? 0)),
        nicho_ligado: nichoIdRecall != null,
        // Observabilidade Onda 1B: filtro de fase + HyDE.
        liberar_comercial: liberarComercial,
        categorias_bloqueadas: categoriasBloqueadas,
        hipotese_usada: hipoteseRecall.trim().length > 0,
        // Pacotes de Conhecimento (upgrade ON/OFF): quais estavam ligados e o que entrou.
        pacotes_ligados: pacotesAgente.pacotes.map((p) => p.nome),
        pacotes_fixos_ids: pacotesAgente.fixos.map((b) => b.id),
        pacotes_relevantes_ids: blocosPacotes.map((b) => b.id),
        pacotes_rerank_scores: blocosPacotes.map((b) => Number(b.rerank_score.toFixed(3))),
      },
    });

    // ── Onda 1 (2026-05-14): leitura de memória pra contexto longo ──
    // Working memory estrutural (SELECT direto): crença + última intenção pendente.
    // Memória semântica longa (RAG-First via RPCs): fatos consolidados + episódios relevantes.
    // Sem isso, o motor "esquece" o que prometeu/conversou em retomadas → "boa tarde" repetido.
    // deno-lint-ignore no-explicit-any
    const sb = supabase as any;

    // ── A8 (Companion 12 Feature C): herança de crença de conversa anterior ──
    // Se conversa atual NÃO tem crença ainda E o lead já conversou com este agente nos últimos 7 dias,
    // COPIA o belief da última conversa anterior pra nova crenca_conversa (com flag herdada_de).
    // Resolve "agente esquece em conversa nova mesmo lead" — mais grave em retomadas proativas
    // (token PROATIVO entra, conversa nova é criada, crenca_conversa fica vazia → amnésia).
    let crencaHerdadaFlag = false;
    if (conv?.lead_id) {
      try {
        const { data: cExistAtual } = await sb.from("crenca_conversa")
          .select("id").eq("conversation_id", conversa_id).maybeSingle();
        if (!cExistAtual?.id) {
          // Pega IDs de conversas anteriores do mesmo lead+agente nos últimos 7 dias
          const { data: convsAnteriores } = await sb.from("conversas")
            .select("id, updated_at")
            .eq("lead_id", conv.lead_id)
            .eq("agente_id", agente_id)
            .neq("id", conversa_id)
            .gt("updated_at", new Date(Date.now() - 7 * 86400_000).toISOString())
            .order("updated_at", { ascending: false })
            .limit(5);
          // deno-lint-ignore no-explicit-any
          const idsAnteriores = ((convsAnteriores as any[]) ?? []).map((c) => c.id as string);
          if (idsAnteriores.length > 0) {
            const { data: crencaAnterior } = await sb.from("crenca_conversa")
              .select("belief, resumo_agente, proxima_intencao, proximo_passo_previsto, estilo_lead, conversation_id, updated_at")
              .in("conversation_id", idsAnteriores)
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (crencaAnterior?.belief) {
              const beliefHerdado = {
                ...(crencaAnterior.belief as Record<string, unknown>),
                herdada_de: crencaAnterior.conversation_id,
                herdada_em: new Date().toISOString(),
              };
              await sb.from("crenca_conversa").insert({
                conversation_id: conversa_id,
                tenant_id,
                belief: beliefHerdado,
                resumo_agente: (crencaAnterior.resumo_agente as string | null) ?? null,
                proxima_intencao: (crencaAnterior.proxima_intencao as Record<string, unknown> | null) ?? null,
                proximo_passo_previsto: (crencaAnterior.proximo_passo_previsto as string | null) ?? null,
                estilo_lead: (crencaAnterior.estilo_lead as string | null) ?? null,
              });
              crencaHerdadaFlag = true;
              await supabase.from("traces").insert({
                tenant_id, conversa_id, agente_id, tipo: "ferramenta",
                modelo_llm: "ragentic/heranca",
                decisao: { ferramenta: "herdar_crenca_conversa_anterior", herdada_de: crencaAnterior.conversation_id },
              });
            }
          }
        }
      } catch (eH) {
        console.warn("[a8 heranca crenca]", (eH as Error).message);
      }
    }

    const [crencaRes, ultIntencaoRes] = await Promise.all([
      sb.from("crenca_conversa")
        .select("belief, resumo_agente, proxima_intencao, proximo_passo_previsto, estilo_lead")
        .eq("conversation_id", conversa_id)
        .maybeSingle(),
      sb.from("intencoes_pendentes")
        .select("dados, criado_em")
        .eq("conversa_id", conversa_id)
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (ultIntencaoRes.error) {
      console.warn("[intencoes_pendentes] falha ao buscar última intenção:", ultIntencaoRes.error.message);
    }
    const crenca = crencaRes.data as Record<string, unknown> | null;
    const ultIntencao = (ultIntencaoRes.data?.dados as Record<string, unknown> | null) ?? null;

    // ── Onda 2 (2026-05-14): EMA — Estado do Mundo do Agente ──
    // SELECT compromissos_ativos (view unifica acoes_agendadas + compromissos_do_lead + contratos).
    // Bloco injetado condicional (apenas se length > 0 — fix regressão lead novo Companion 12).
    // Defesa em profundidade (2026-09-01, Theus): `sb` é service_role (ignora RLS) e a view
    // `compromissos_ativos` confia no `conversa_id`/`tenant_id` de cada linha de origem
    // (acoes_agendadas/compromissos_do_lead/contratos) — se algum registro nascer com
    // conversa_id de OUTRO tenant (ex.: contrato criado via `criar_contrato_livre` com
    // conversa_id errado), filtrar só por conversa_id deixaria vazar pro prompt do lead
    // errado. tenant_id explícito trava isso mesmo com dado ruim na origem.
    const { data: compromissosAtivosData } = await sb
      .from("compromissos_ativos")
      .select("id, tipo, origem, origem_tabela, titulo, executar_em, status")
      .eq("conversa_id", conversa_id)
      .eq("tenant_id", tenant_id)
      .order("executar_em", { ascending: true })
      .limit(5);
    // deno-lint-ignore no-explicit-any
    const compromissosAtivos = ((compromissosAtivosData as any[]) ?? []);

    // Recall de memória → _shared/recall-memoria.ts (Fusão C1 / Fase 1).
    // Comportamento idêntico ao bloco inline anterior (mesmas RPCs/params/fallback);
    // é a "tomada" `_shared/` onde DEC-036 (fila/guard) e as ondas do lab plugam.
    // A3 (2026-06-02 · Trilha A): recall de memória usa a query enriquecida (mensagem do lead +
    // hipótese de resposta do Porteiro), mesmo sinal top-down já usado no RAG de conhecimento.
    // Antes ia só a mensagem crua (`queryRecall`): um "oi" puxava fato irrelevante. RAG-first/semântico.
    const { fatosLead, episodios } = await recuperarMemoriaLead(supabase, {
      leadId: conv?.lead_id,
      tenantId: tenant_id,
      queryRecall: queryEnriquecida,
    });

    // Onda zero (2026-05-20): Prancheta de volta ao prompt — carrega os campos
    // estruturados que o próprio motor já capturou (leads.dados_ficha), pra o
    // agente USAR o que sabe e não repergunta. Aditivo; lead novo → {} → bloco some.
    let fichaLead: Record<string, unknown> = {};
    let tagsLead: string[] = [];
    let temperaturaLead = "";
    if (conv?.lead_id) {
      const { data: leadFichaRow } = await supabase
        .from("leads")
        .select("dados_ficha, tags, temperatura_lead")
        .eq("id", conv.lead_id)
        .maybeSingle();
      fichaLead = (leadFichaRow?.dados_ficha as Record<string, unknown>) || {};
      tagsLead = Array.isArray(leadFichaRow?.tags) ? (leadFichaRow!.tags as string[]) : [];
      temperaturaLead = leadFichaRow?.temperatura_lead ? String(leadFichaRow.temperatura_lead) : "";
    }

    // A5.3 — métricas de qualidade da memória viva (observabilidade contínua, sem LLM-judge).
    // deno-lint-ignore no-explicit-any
    const _ff = (fatosLead as any[]);
    const _scoresFinais = _ff.map((f) => Number(f?._score_final) || 0).sort((a, b) => b - a);
    const _memMetrics = {
      mem_melhor_score: _scoresFinais.length ? Number(_scoresFinais[0].toFixed(4)) : 0,
      mem_mediana_score: _scoresFinais.length ? Number(_scoresFinais[Math.floor(_scoresFinais.length / 2)].toFixed(4)) : 0,
      mem_saliencia_max: Number(_ff.reduce((m, f) => Math.max(m, Number(f?._saliencia) || 0), 0).toFixed(4)),
      mem_fatos_piso: _ff.filter((f) => String(f?.relevancia) === "alta").length,
      mem_fatos_confirmados: _ff.filter((f) => f?.confirmado_pelo_lead === true).length,
      mem_fatos_com_emocao: _ff.filter((f) => (Number(f?.valencia_emocional) || 0) > 0).length,
    };

    await supabase.from("traces").insert({
      tenant_id,
      conversa_id,
      agente_id,
      tipo: "ferramenta",
      modelo_llm: "voyage/voyage-4+busca_hibrida_memoria_*",
      decisao: {
        ferramenta: "leitura_memoria_pre_sintese",
        fatos_lead_recuperados: fatosLead.length,
        episodios_recuperados: episodios.length,
        ..._memMetrics,
        humor_relacao_ativo: !!blocoHumorRelacao,
        ruptura_aberta: rupturaAberta,
        comportamento_count: comportamentos.length,
        crenca_existe: !!crenca,
        ultima_intencao_existe: !!ultIntencao,
      },
    });

    // Bloco de identidade — injeta nome/cargo/personalidade/tom configurados pelo tenant na Curadoria.
    // Sem isso, o LLM se identifica como "assistente virtual" (sintoma reportado no Chat-Teste 2026-05-13).
    const blocoIdentidade = nomeAgente
      ? `Você é ${nomeAgente}${cargoIdentidade ? `, ${cargoIdentidade}` : ""}.` +
        `${personalidadeAgente ? ` ${personalidadeAgente}` : ""}` +
        ` Tom de voz: ${tomAgente}.\n\n`
      : "";
    // B4 fix (2026-05-24): você é UM agente. A troca de cargo é controle INTERNO da plataforma e
    // NÃO pode vazar pro lead (sintoma: "vou te direcionar pro setor certo" / transferência fantasma → churn).
    // Δ 2026-09-12 (Otmar/Verifik): tenant pode declarar um humano NOMEADO que assume no
    // fechamento (`agentes.configuracao.handoff_humano = {nome, empresa, faz, quando}`).
    // Nesse caso a única passagem que a agente pode (e deve) anunciar é essa; o resto da
    // regra do agente único continua valendo.
    const _handoffHumano = ((agente?.configuracao as Record<string, unknown> | null)?.handoff_humano ?? null) as
      { nome?: string; empresa?: string; faz?: string; quando?: string } | null;
    // Redirecionamento (2026-09-18): com `configuracao.redirecionamento` ativo, pedido de
    // "falar com responsável/humano/ser redirecionado" vira transferir_humano — o motor manda
    // o texto fixo com o número (ver depois do laço de tools). O modelo não escreve nada.
    const _redirecionamentoAtivo = (() => {
      const r = (agente?.configuracao as Record<string, unknown> | null)?.redirecionamento as
        { ativo?: boolean; texto?: string } | undefined;
      return r?.ativo === true && !!String(r.texto ?? "").trim();
    })();
    const blocoRedirecionamento = _redirecionamentoAtivo
      ? `<redirecionamento importancia="alta">\n` +
        `Quando o lead pedir pra ser redirecionado, transferido ou encaminhado, ou pedir pra falar com o responsável, com um humano, atendente, dono ou alguém da equipe: chame a ferramenta transferir_humano NA HORA, sem perguntar nada antes. A plataforma envia sozinha a mensagem com o número do responsável — você NÃO escreve texto nesse turno e nunca digita esse número por conta própria.\n` +
        `</redirecionamento>\n\n`
      : "";
    const blocoAgenteUnico = blocoRedirecionamento + (_handoffHumano?.nome
      ? `<voce_e_um_unico_agente importancia="alta">\n` +
        `Você é UMA pessoa atendendo — a troca de cargo/foco é INTERNA e INVISÍVEL: você mesmo segue a conversa, só muda o foco. NUNCA diga que vai "direcionar pro setor" ou "passar pro time". ` +
        `A ÚNICA passagem que existe, e que você DEVE anunciar, é para ${_handoffHumano.nome}${_handoffHumano.empresa ? `, da ${_handoffHumano.empresa}` : ""}, ${_handoffHumano.quando || "quando o lead fecha"}: ${_handoffHumano.nome} ${_handoffHumano.faz || "assume o atendimento"}. ` +
        `Nesse momento chame a ferramenta transferir_humano e avise o lead, em uma frase, que ${_handoffHumano.nome} assume dali em diante. Fora desse caso, não prometa transferência nenhuma.\n` +
        `</voce_e_um_unico_agente>\n\n`
      : `<voce_e_um_unico_agente importancia="alta">\n` +
        `Você é UMA pessoa atendendo do início ao fim — não existe equipe, setor nem outro atendente. A troca de cargo/foco é INTERNA e INVISÍVEL: você mesmo segue a conversa, só muda o foco. NUNCA diga nem dê a entender que vai transferir, direcionar pro setor, passar pro time ou que outra pessoa assume. Precisa de humano real? Use a ferramenta — sem prometer transferência no texto.\n` +
        `</voce_e_um_unico_agente>\n\n`);
    // Bússola do cargo ativo — objetivo + regras livres do cargo do tenant (Etapa E Ragentic).
    // Permite que a síntese saiba O QUE buscar neste turno (qualificar lead, fechar contrato, etc).
    const blocoBussola = cargoMeta?.objetivo_principal
      ? `BÚSSOLA DESTE CARGO (${cargoMeta.nome || cargoAlvo}):\n${cargoMeta.objetivo_principal}\n` +
        (cargoMeta.regras_livres ? `\nREGRAS DESTE CARGO:\n${cargoMeta.regras_livres}\n` : "") +
        "\n"
      : "";

    // Onda CC12-paridade (2026-05-14): <diretrizes_do_cargo>
    // Carrega cargo_diretrizes filtradas por cargo_id ativo. Carol Vendedor tem 9 diretrizes
    // como "Confirmação rápida e avanço", "Fase 2 — Qualificação", "Venda consultiva", etc.
    // CC12 chat.ts:912-914 injeta esse bloco — paridade real com o motor original.
    const blocoDiretrizesCargo = diretrizesCargo.length > 0
      ? `<diretrizes_do_cargo>\n` +
        diretrizesCargo.map((d) => `  - ${d.titulo}: ${d.descricao}`).join("\n") +
        `\n</diretrizes_do_cargo>\n\n`
      : "";

    // ── Onda 1 (2026-05-14): blocos de memória no system prompt ──
    // 1. Working memory: o que o agente "pensou" no último turno (crença + intenção planejada)
    const resumoCrenca = crenca?.resumo_agente ? String(crenca.resumo_agente) : "";
    const proxIntCrenca = crenca?.proxima_intencao ? JSON.stringify(crenca.proxima_intencao).slice(0, 400) : "";
    const passoPrev = crenca?.proximo_passo_previsto ? String(crenca.proximo_passo_previsto) : "";
    const blocoCrenca = (resumoCrenca || proxIntCrenca || passoPrev)
      ? `<historico_destilado>\n` +
        (resumoCrenca ? `Resumo da conversa até aqui (sua leitura no turno anterior): ${resumoCrenca}\n` : "") +
        (proxIntCrenca ? `Próxima intenção que VOCÊ planejou: ${proxIntCrenca}\n` : "") +
        (passoPrev ? `Próximo passo previsto: ${passoPrev}\n` : "") +
        `</historico_destilado>\n\n`
      : "";

    // 2. Fatos consolidados sobre o lead (RAG-First em memoria_lead)
    // A2 (2026-06-02 · Trilha A): fatos ordenados por relevância (alta primeiro); os de ALTA
    // relevância vêm DESTACADOS como verdade real deste lead — devem vencer exemplo genérico de
    // regra de cargo. Furo do smoke A3: o agente usou o exemplo "financiamento de carro/cartão" do
    // `regras_livres` do cargo no lugar do fato real "limpar o nome para alugar apartamento". Cap
    // por ITEM (limite consciente, não slice cego). Bullet "-" em vez de [N] (o [N] é só citação RAG).
    const MAX_FATOS_PROMPT = 12;
    const _pesoRelev: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
    // deno-lint-ignore no-explicit-any
    const _fatosOrdenados = [...(fatosLead as any[])]
      .sort((a, b) => (_pesoRelev[String(a?.relevancia ?? "media")] ?? 1) - (_pesoRelev[String(b?.relevancia ?? "media")] ?? 1))
      .slice(0, MAX_FATOS_PROMPT);
    // deno-lint-ignore no-explicit-any
    const _fatosFortes = _fatosOrdenados.filter((f: any) => String(f?.relevancia ?? "") === "alta");
    // deno-lint-ignore no-explicit-any
    const _fatosDemais = _fatosOrdenados.filter((f: any) => String(f?.relevancia ?? "") !== "alta");
    const blocoFatos = _fatosOrdenados.length > 0
      ? `<fatos_sobre_o_lead>\n` +
        (_fatosFortes.length > 0
          ? `VERDADES DESTE LEAD (alta prioridade — fatos REAIS deste lead específico; quando um deles informar um dado como objetivo, situação ou preferência, USE O FATO e NUNCA o troque por um exemplo genérico vindo das REGRAS/BÚSSOLA do cargo):\n` +
            // deno-lint-ignore no-explicit-any
            _fatosFortes.map((f: any) => `- (${f.categoria ?? "geral"}) ${f.fato ?? ""}`).join("\n") + "\n"
          : "") +
        (_fatosDemais.length > 0
          ? `Outros fatos (média/baixa relevância):\n` +
            // deno-lint-ignore no-explicit-any
            _fatosDemais.map((f: any) => `- (${f.categoria ?? "geral"}) ${f.fato ?? ""}`).join("\n") + "\n"
          : "") +
        `</fatos_sobre_o_lead>\n\n`
      : "";

    // Onda 11 (2026-05-28): perfil_empresa destilado (B3) — top objeções, argumentos
    // ganhadores, perfil lead ideal do tenant. Hoje V1 = quantitativo (taxa_conversao,
    // conversas_destiladas, segmento). V2 (Onda 12) adicionará conteúdo qualitativo via LLM.
    // perfil_empresa APOSENTADO (2026-06-02, decisão Theus): redundante com o RAG/gavetas
    // (anti_padroes, manipulacao_blocos, prova_social_blocos, blocos_comportamento, blocos_conhecimento),
    // que entregam objeções/argumentos/diferenciais por RELEVÂNCIA just-in-time. O bloco fixo empurrava
    // tudo sempre, sem gating — pior que o RAG. V2 (argumentos vencedores) nunca foi feita; V1 só
    // quantitativa. Mantido como "" pra reversibilidade + tira 1 query/turno. A tabela e o cron ficam.
    const blocoPerfilEmpresa = "";

    // A7 (Trilha A): linha do tempo do contato — ações DATADAS (contrato emitido/assinado/pago,
    // compromissos, agendamentos) via RPC única. Just-in-time: lead sem histórico → bloco some.
    // Objetivo: o agente nunca falar como se não soubesse o que já aconteceu (cobrar algo pago, ignorar contrato).
    let blocoLinhaTempo = "";
    if (conv?.lead_id) try {
      // deno-lint-ignore no-explicit-any
      const { data: _ltRows } = await (supabase as any).rpc("linha_do_tempo_contato", {
        p_lead_id: conv.lead_id, p_tenant_id: tenant_id, p_limite: 12,
      });
      if (Array.isArray(_ltRows) && _ltRows.length > 0) {
        const _linhas = (_ltRows as Array<{ quando: string; descricao: string }>)
          .map((e) => {
            const dataBr = new Date(e.quando).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
            return `- ${dataBr}: ${e.descricao}`;
          }).join("\n");
        blocoLinhaTempo = `<linha_do_tempo_do_contato>\n` +
          `O que JÁ aconteceu com este contato (datado — esteja ciente: NÃO cobre o que já foi pago, NÃO ignore contrato já emitido, NÃO fale como se fosse o primeiro contato):\n` +
          _linhas + `\n</linha_do_tempo_do_contato>\n\n`;
      }
    } catch (e) {
      console.warn("[a7 linha_do_tempo] falha (motor segue sem):", e instanceof Error ? e.message : String(e));
    }

    // ============================================================================
    // Onda 13 (2026-05-28) — Goal Stack: lê pilha viva de objetivos abertos da conversa.
    // Injetado no TOPO do sistemaBase (maior peso atencional do LLM).
    // ============================================================================
    let blocoPilhaObjetivos = "";
    try {
      // deno-lint-ignore no-explicit-any
      const { data: objetivosAbertos } = await (supabase as any)
        .from("pilha_objetivos")
        .select("id, objetivo, contexto, prioridade, criado_em")
        .eq("conversa_id", conversa_id)
        .eq("status", "aberto")
        .is("deleted_at", null)
        .order("prioridade", { ascending: true })
        .order("criado_em", { ascending: true })
        .limit(5);
      if (objetivosAbertos && objetivosAbertos.length > 0) {
        blocoPilhaObjetivos = `<pilha_objetivos>\n` +
          `Você TEM objetivos abertos nesta conversa (de turnos anteriores). NÃO esqueça:\n` +
          // deno-lint-ignore no-explicit-any
          objetivosAbertos.map((o: any, i: number) =>
            `[${i + 1}] (prioridade ${o.prioridade}) ${o.objetivo}${o.contexto ? ` — ${o.contexto}` : ""}`
          ).join("\n") +
          `\nVerifique se algum desses objetivos é atendido pela mensagem do lead agora.\n` +
          `</pilha_objetivos>\n\n`;
      }
    } catch (e) {
      console.warn("[onda13] falha ler pilha_objetivos (motor segue sem):", e instanceof Error ? e.message : String(e));
    }

    // Onda zero (2026-05-20): Prancheta capturada — devolve ao agente os campos
    // que ele já preencheu (chave:valor não-vazios), pra avançar em vez de reperguntar.
    const fichaEntries = Object.entries(fichaLead).filter(([, v]) =>
      v !== null && v !== undefined &&
      String(v).trim() !== "" && String(v).trim().toLowerCase() !== "null"
    );
    const blocoFicha = fichaEntries.length > 0
      ? `<ficha_do_lead>\n` +
        `Dados que você JÁ capturou deste lead (não pergunte de novo — confirme só se necessário e avance):\n` +
        fichaEntries.map(([k, v]) =>
          `  - ${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`
        ).join("\n") +
        `\n</ficha_do_lead>\n\n`
      : "";

    // Onda zero (2026-05-20): Sinais inferidos do lead — tags semânticas + nível de
    // engajamento (frio/morno/quente). Leitura, não fato literal — calibra tom/abordagem.
    const blocoSinais = (tagsLead.length > 0 || temperaturaLead)
      ? `<sinais_do_lead>\n` +
        `Leitura inferida deste lead (NÃO é fato literal — use só pra calibrar tom e ritmo, nunca cite ao lead):\n` +
        (temperaturaLead
          ? `  - Engajamento: ${temperaturaLead} (frio → reaqueça sem pressionar · morno → avance com cuidado · quente → pode fechar).\n`
          : "") +
        (tagsLead.length > 0 ? `  - Tags: ${tagsLead.join(", ")}\n` : "") +
        `</sinais_do_lead>\n\n`
      : "";

    // 3. Eventos passados com este lead (RAG-First em memoria_episodica)
    const blocoEpisodios = episodios.length > 0
      ? `<eventos_passados_com_este_lead>\n` +
        episodios.slice(0, 5).map((e, i) => {
          const data = e.criado_em ? new Date(e.criado_em).toLocaleDateString("pt-BR") : "?";
          const emocao = e.emocao ? `emoção: ${e.emocao}` : "";
          const outcome = e.outcome ? `desfecho: ${e.outcome}` : "";
          const meta = [emocao, outcome].filter(Boolean).join(" | ");
          return `[${i + 1}] ${data}${meta ? " | " + meta : ""}\n  → ${e.episodio_resumo ?? ""}`;
        }).join("\n") +
        `\n</eventos_passados_com_este_lead>\n\n`
      : "";

    // EMA (Onda 2): bloco condicional `if length > 0` (Companion 12 fix regressão lead novo).
    // Quando há compromisso pendente, agente NÃO pode criar outro em janela ±4h sem usar ref_id.
    const blocoEMA = compromissosAtivos.length > 0
      ? `<compromissos_ativos_do_lead>\n` +
        `ATENÇÃO: você já tem ${compromissosAtivos.length} compromisso(s) pendente(s) com este lead. ` +
        `Antes de prometer/agendar NOVO retorno, consulte esta lista. Se o lead pede algo já agendado, ` +
        `confirme o existente em vez de duplicar. Pra modificar, use tool gerenciar_compromisso com acao=atualizar e ref_id.\n\n` +
        compromissosAtivos.map((c, i) => {
          const quando = c.executar_em ? new Date(c.executar_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "?";
          return `[${i + 1}] ref_id=${c.id} | tipo=${c.tipo} | origem=${c.origem} | ${quando} | "${c.titulo}"`;
        }).join("\n") +
        `\n</compromissos_ativos_do_lead>\n\n`
      : "";

    // 4. Pensamento explícito do turno anterior (cobra continuidade ou justificativa de mudança)
    const intProx = ultIntencao?.proxima_intencao ? String(ultIntencao.proxima_intencao) : "";
    const intAcao = ultIntencao?.acao_pretendida ? String(ultIntencao.acao_pretendida) : "";
    const intMotivo = ultIntencao?.motivo ? String(ultIntencao.motivo) : "";
    const blocoPensamento = (intProx || intAcao || intMotivo)
      ? `<pensamento_do_turno_anterior>\n` +
        (intProx ? `Sua intenção: ${intProx}\n` : "") +
        (intAcao ? `Ação pretendida: ${intAcao}\n` : "") +
        (intMotivo ? `Por quê: ${intMotivo}\n` : "") +
        `IMPORTANTE: cumpra essa intenção neste turno OU justifique abertamente por que mudou.\n` +
        `</pensamento_do_turno_anterior>\n\n`
      : "";

    // Onda 6: bloco de calibragem empática (sliders profundidade/acolhimento/validação + toggles).
    const blocoEmpatia = empatia
      ? `<calibragem_empatica>\n` +
        (typeof empatia.profundidade === "number" ? `Profundidade emocional: ${(Number(empatia.profundidade) * 100).toFixed(0)}% (0=superficial · 100=profundo).\n` : "") +
        (typeof empatia.acolhimento === "number" ? `Acolhimento: ${(Number(empatia.acolhimento) * 100).toFixed(0)}% (0=neutro · 100=muito acolhedor).\n` : "") +
        (typeof empatia.validacao === "number" ? `Validação emocional: ${(Number(empatia.validacao) * 100).toFixed(0)}% (0=ignora sentimento · 100=valida sempre).\n` : "") +
        (empatia.pausa_em_emocao ? `PAUSE em emoção forte: quando lead expressar raiva/tristeza/medo intenso, NÃO continue o roteiro — acolha primeiro.\n` : "") +
        (empatia.escalar_crise ? `ESCALE em crise: sinais de auto-mutilação, ideação suicida, violência iminente → use tool transferir_humano IMEDIATAMENTE.\n` : "") +
        `</calibragem_empatica>\n\n`
      : "";

    // Âncora temporal: sem isto o modelo não sabe a data/hora/fuso e
    // "aluciná" o tempo (ex.: "amanhã 15h" virou +6min — lead 35d58b25).
    const agoraBRT = new Date().toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const blocoTemporal =
      `<contexto_temporal>\n` +
      `Agora: ${agoraBRT} (horário de Brasília — BRT, UTC-03:00).\n` +
      `Para agendar retorno/compromisso, chame a tool gerenciar_compromisso com ` +
      `executar_em em ISO 8601 COM o fuso -03:00, calculado a partir do "Agora" acima ` +
      `(ex.: "amanhã às 15h" → executar_em "2026-05-17T15:00:00-03:00"; ajuste a data real). ` +
      `Nunca agende no passado e nunca use minutos/horas relativas quando o lead deu um dia ou horário do relógio.\n` +
      `</contexto_temporal>\n\n`;

    // RAG-first: diretriz de bolha do turno (busca_hibrida_diretriz_bolha, multi-escopo).
    // Estado do turno = resumo+intenção+urgência do Porteiro + última msg do lead.
    // Fallback (null) → mantém a instrução semântica fixa abaixo (zero regressão).
    const { data: _perfilNicho } = await supabase
      .from("profiles").select("nicho_id").eq("id", tenant_id).maybeSingle();
    const _queryDiretriz = `${classificacao?.resumo ?? ""} | intencao:${classificacao?.intencao ?? ""} urgencia:${classificacao?.urgencia ?? ""} | ${String(mensagemEfetiva ?? "").slice(0, 200)}`;
    const { selecionarDiretrizBolha } = await import("../_shared/diretriz-bolha.ts");
    const _diretrizBolha = await selecionarDiretrizBolha(supabase, {
      tenantId: tenant_id,
      nichoId: (_perfilNicho?.nicho_id as string | null) ?? null,
      queryText: _queryDiretriz,
    });
    const _instrucaoBolha = _diretrizBolha
      ? `FRAGMENTAÇÃO DESTA RESPOSTA (diretriz ${_diretrizBolha.escopo}/${_diretrizBolha.contexto} — RAG, varia por turno): ~${_diretrizBolha.quantidade_sugerida} bolha(s), ~${_diretrizBolha.chars_medio_sugerido} chars cada. Motivo: ${_diretrizBolha.motivo}. Cada ideia distinta numa bolha — separadas por UMA LINHA EM BRANCO real entre elas. `
      : `Quebre a resposta em bolhas curtas (parágrafos) — quantas o conteúdo natural pedir, sem encher de bolha à toa: cada ideia distinta numa bolha, mensagem simples fica em 1 só — separadas por UMA LINHA EM BRANCO real entre elas. `;

    const sistemaBase =
      blocoPilhaObjetivos +
      blocoTemporal +
      blocoIdentidade +
      blocoAgenteUnico +
      // === MEMÓRIA DO RELACIONAMENTO (topo — máxima atenção; sustenta conversa de +1 ano) ===
      blocoCrenca +
      blocoFatos +
      blocoPerfilEmpresa +
      blocoFicha +
      blocoSinais +
      blocoEpisodios +
      blocoLinhaTempo +
      blocoPensamento +
      blocoEMA +
      // === TAREFA DO TURNO ===
      blocoBussola +
      blocoDiretrizesCargo +
      blocoEmpatia +
      blocoHumorRelacao +
      blocoComportamento +
      // Instrução fixa do turno (A4 2026-05-30: comprimida — mesma regra, menos token). Invariantes preservados:
      // hierarquia de verdade · anti-invenção · citação [N] · anti-placeholder · pensamento estruturado.
      `${nomeAgente ? "" : "Você é um agente conversacional Ragentic. "}Cargo ativo: ${cargoAlvo}. Intenção: ${classificacao?.intencao || "indefinida"}. Urgência: ${classificacao?.urgencia || "media"}.\n` +
      `Use as tools quando forem o caminho (transferir_humano, agendar_compromisso, buscar_blocos_conhecimento p/ fato mais específico).\n` +
      `HIERARQUIA DE VERDADE (resolve conflito de cima pra baixo): (1) BASE DE CONHECIMENTO + <fatos_sobre_o_lead> + <ficha_do_lead>; (2) histórico desta conversa; (3) BÚSSOLA/REGRAS do cargo; (4) <historico_destilado>. Seu conhecimento geral do mundo NUNCA é fato do produto/tenant; fato dito pelo lead vence suposição sua. Exemplos dentro das REGRAS/BÚSSOLA do cargo (ex.: tipos de objetivo como "financiamento de casa/carro/cartão") são ILUSTRATIVOS e genéricos — NUNCA os apresente como se fossem o dado real deste lead; havendo um <fato_sobre_o_lead> com o dado verdadeiro (ex.: o objetivo real), use o FATO, jamais o exemplo.\n` +
      `NUNCA invente preço, prazo, data, condição, garantia ou característica. Toda afirmação factual sobre o produto/serviço DEVE terminar com o número do bloco que a prova, no formato [N] (ex: "100% jurídico [1]"; vários: [1][3]). Sem bloco que prove, NÃO afirme — pergunte pra entender o caso ou diga que vai confirmar (use transferir_humano se faltar o fato). Os [N] são removidos antes de chegar ao lead.\n` +
      // Regra de plataforma (Theus, 2026-09-11): pedir print do Serasa "não é mais bem visto".
      // Vale pra todo agente e vence bloco, histórico e improviso do modelo.
      `NUNCA peça ao lead print, foto, captura de tela, relatório ou consulta de órgão de crédito (Serasa, SPC, Boa Vista, Registrato/Bacen/SCR, score), nem mande ele acessar app ou portal desses órgãos pra conferir — mesmo que um bloco ou o histórico da conversa sugira. Se ele mandar por conta própria, use a informação e siga.\n` +
      `Responda em pt-BR, tom natural e objetivo. ` +
      _instrucaoBolha +
      `Use quebras de linha de verdade, nunca os caracteres "\\n".\n` +
      `O ÚNICO colchete permitido é a citação [N] (só número). NUNCA escreva "[nome]", "[Nome do Lead]" nem colchete com texto: se sabe o nome do lead, usa; se não, fala sem o nome.\n\n` +
      `<objetivo_deste_turno>\n` +
      `Avance a Bússola sem soar formulário; descubra os campos pendentes da Prancheta como conversa natural, seguindo as regras do cargo. Mudar de cargo não muda quem você é (${nomeAgente || "o mesmo agente"}), só o foco. LEIA o histórico antes de perguntar — se o lead já respondeu, avance, não repergunte.\n` +
      `</objetivo_deste_turno>\n\n` +
      `META-INSTRUÇÃO PENSAMENTO ESTRUTURADO (NÃO É RESPOSTA AO LEAD): após as bolhas, ADICIONE no FINAL esta tag, SEMPRE (se a resposta for [silencio], a tag vem depois do marcador):\n` +
      `<pensamento_estruturado>\n` +
      `{"leitura_da_situacao":"1 frase: o que esta acontecendo agora","proxima_intencao":"1 frase: o que pretendo no proximo turno","acao_pretendida":"responder_e_aguardar|fazer_pergunta_de_qualificacao|oferecer|fechar|agendar_retorno|escalar_humano|esperar_silencio|registrar_e_seguir","quando_voltar":"se você pretende voltar a falar depois (retomada/follow-up por silêncio), o MOMENTO em ISO YYYY-MM-DDTHH:MM no horário de Brasília, decidido CONFORME OS CONHECIMENTOS DE RETOMADA que você recebeu (siga a regra deles pra o horário, não invente); se não for voltar, null","motivo":"1 frase: por que essa acao agora","plano_proximos_2_turnos":[{"turno":1,"o_que_fazer":"...","por_que":"..."},{"turno":2,"o_que_fazer":"...","por_que":"..."}]}\n` +
      `</pensamento_estruturado>\n` +
      `Essa tag NUNCA chega ao lead — é removida antes do envio.`;;
    // Em modo proativo: prepende a SITUAÇÃO específica do token + remove dependência de fala do user
    // v59 (2026-05-20): regra de continuidade no FIM (recency — máxima atenção do LLM).
    // Manda obedecer a MEMÓRIA DO RELACIONAMENTO do topo; trata lead novo normalmente (sem regressão de abertura).
    // Onda 3C: a continuidade segue o gate comercial do Porteiro (liberarComercial). Quando o Porteiro
    // fecha o comercial (ex.: ruptura → liberar_comercial=false), a continuidade NÃO manda retomar o
    // passo de venda — manda seguir o <comportamento_situacional> (reparação). RAG-First: a decisão é
    // do Porteiro, não um branch hardcoded de ruptura.
    const blocoRegraContinuidade = ehPrimeiraFalaDaEmpresa
      ? `\n\n<regra_de_continuidade>\n` +
        `PRIMEIRO CONTATO REAL: você NUNCA falou com este lead — esta conversa não tem nenhuma fala sua. Nada foi contado, combinado, proposto, orçado ou apresentado antes da mensagem que ele acabou de mandar. PROIBIDO escrever "pelo que você me contou", "como conversamos", "conforme combinamos", "retomando", "pela sua situação" ou qualquer frase que suponha conversa anterior, e PROIBIDO tratar como dito pelo lead algo que ele não disse.\n` +
        // Em turno proativo (abordagem fria, campanha, INICIAR_ATENDIMENTO) quem conduz a
        // abertura é a SITUAÇÃO do token — alguns pedem justamente apresentar o produto.
        (ehTokenProativo
          ? `Abra a conversa exatamente como a SITUAÇÃO descrita no topo deste prompt manda.\n`
          : (tenantNovoSaudacaoEspecialista
            ? `ABRA O ATENDIMENTO antes de qualquer outra coisa: apresente-se pelo nome, diga o nome da empresa que você representa e explique, com segurança de quem é especialista nesse negócio, o que ela resolve — com o conhecimento real da empresa, nunca invente. `
            : `ABRA O ATENDIMENTO antes de qualquer outra coisa: cumprimente o lead e apresente-se brevemente. `) +
            `Depois acolha o que ele acabou de dizer e faça UMA pergunta pra entender o caso dele. NESTE PRIMEIRO TURNO não ofereça serviço, plano, pacote nem preço, e não mande ele escolher entre opções — mesmo que um bloco de conhecimento descreva pra qual serviço o caso dele leva: primeiro entenda, indicar vem depois.\n`) +
        `</regra_de_continuidade>`
      : `\n\n<regra_de_continuidade>\n` +
      `Releia a memória do topo (<historico_destilado>, <fatos_sobre_o_lead>, <ficha_do_lead>, <sinais_do_lead>, <eventos_passados_com_este_lead>, <compromissos_ativos_do_lead>). Se há estágio avançado, serviço/preço já apresentado, fatos ou compromissos: lead JÁ CONHECIDO — ` +
      (liberarComercial
        ? `retome de onde parou. `
        : `siga o <comportamento_situacional> e NÃO retome preço/contrato/fechamento agora; reconecte e avance quando fizer sentido. `) +
      (tenantNovoSaudacaoEspecialista
        ? `PROIBIDO tratar como primeiro contato ou reapresentar o serviço do zero. Lead NOVO (sem memória acima): esta é a sua primeira mensagem pra ele — apresente-se pelo nome, diga o nome da empresa que você representa e explique, com segurança de quem é especialista nesse negócio, o que ela resolve; só depois siga pra acolher e qualificar normal. Não pule essa apresentação nem a jogue genérica — use o conhecimento real da empresa, nunca invente.\n`
        : `PROIBIDO tratar como primeiro contato ou reapresentar o serviço do zero. Lead NOVO (sem memória acima): acolha e qualifique normal.\n`) +
      `</regra_de_continuidade>`;;
    // ── Contexto de reencontro (2026-06-11) ──
    // Turno proativo = reabrir conversa parada. O agente precisa saber HÁ QUANTO TEMPO não
    // falam e o grau de conexão pra calibrar a saudação (caso real do smoke: abriu com
    // "Enquanto isso..." após dias de silêncio). Fail-open: falhou = motor segue sem o bloco.
    let blocoReencontro = "";
    if (ehTokenProativo) {
      try {
        const [ultUserRes, engRes, afetoRes, fichaRes] = await Promise.all([
          supabase.from("mensagens").select("created_at").eq("conversation_id", conversa_id)
            .eq("role", "user").is("deleted_at", null)
            .order("created_at", { ascending: false }).limit(1).maybeSingle(),
          conv?.lead_id
            ? supabase.from("engajamento_lead").select("nivel").eq("lead_id", conv.lead_id).maybeSingle()
            : Promise.resolve({ data: null }),
          conv?.lead_id
            ? supabase.from("estado_afetivo_lead").select("valencia, resumo_humor").eq("lead_id", conv.lead_id)
              .order("atualizado_em", { ascending: false }).limit(1).maybeSingle()
            : Promise.resolve({ data: null }),
          supabase.from("fichas_lead").select("dados_capturados").eq("conversation_id", conversa_id).maybeSingle(),
        ]);
        // Tempo desde a última fala REAL do lead (não do agente)
        // deno-lint-ignore no-explicit-any
        const ultimaFalaLead = (ultUserRes as any)?.data?.created_at as string | undefined;
        let tempoTxt = "";
        if (ultimaFalaLead) {
          const horas = Math.max(1, Math.round((Date.now() - new Date(ultimaFalaLead).getTime()) / 3600_000));
          tempoTxt = horas < 48 ? `${horas} hora${horas > 1 ? "s" : ""}` : `${Math.round(horas / 24)} dias`;
        }
        // deno-lint-ignore no-explicit-any
        const nivelEng = ((engRes as any)?.data?.nivel as string | undefined) ?? "desconhecido";
        // deno-lint-ignore no-explicit-any
        const afeto = (afetoRes as any)?.data as { valencia?: number; resumo_humor?: string } | null;
        const humorTxt = afeto?.resumo_humor
          ? ` · humor da relação: ${afeto.resumo_humor}`
          : (typeof afeto?.valencia === "number"
            ? ` · humor da relação: ${afeto.valencia > 0.2 ? "positivo" : afeto.valencia < -0.2 ? "negativo" : "neutro"}`
            : "");
        // deno-lint-ignore no-explicit-any
        const _dadosFicha = ((fichaRes as any)?.data?.dados_capturados as Record<string, string> | null) ?? {};
        const tentativa = Number(metadata?.tentativa ?? 0) ||
          (Number(_dadosFicha.retomadas_sem_resposta ?? 0) + 1);
        blocoReencontro = `<contexto_de_reencontro>\n` +
          (tempoTxt ? `Vocês NÃO conversam há ${tempoTxt}. ` : "") +
          `Esta é uma RETOMADA (tentativa ${tentativa}) — o lead não mandou mensagem nova.\n` +
          `Conexão com este lead: engajamento ${nivelEng}${humorTxt}.\n` +
          `REGRA DA SAUDAÇÃO: abra como REENCONTRO, nunca como continuação de frase do passado (PROIBIDO começar com "Enquanto isso", "Além disso", "Como eu dizia" ou similares).\n` +
          `Calibre a informalidade pelo tempo e pela conexão: poucas horas = retome leve e direto; 1-3 dias = cumprimente e referencie o assunto pendente; muitos dias ou conexão fria/negativa = saudação mais cuidadosa, relembre quem você é em meia frase e justifique o contato com algo de valor.\n` +
          `</contexto_de_reencontro>\n\n`;
      } catch (e) {
        console.warn("[contexto-reencontro] falha (motor segue sem):", e instanceof Error ? e.message : String(e));
      }
    }

    // Aviso de meta-rótulos (2026-06-11): o histórico marca autoria com colchetes
    // ("[Fulano (Diretor) — humano da SUA equipe respondeu...]"). O LLM precisa saber
    // que isso é meta-informação de QUEM falou — e nunca imitar o formato na resposta.
    const avisoRotulosHistorico = `\n\n<regra_de_autoria_do_historico>\n` +
      `No histórico, mensagens marcadas com colchetes do tipo "[Fulano — humano da SUA equipe...]" foram escritas por uma PESSOA REAL do time (dono ou funcionário), não por você e não pelo lead. ` +
      `Trate o conteúdo delas como ação da empresa (ex.: arquivo enviado pela equipe ao lead). ` +
      `NUNCA copie esse formato de colchetes, NUNCA escreva meta-comentários sobre a conversa (ex.: "o lead parou de responder") e NUNCA repita placeholders como "[arquivo] nome.pdf" — fale sempre como você mesmo, direto com o lead.\n` +
      `</regra_de_autoria_do_historico>`;

    const sistema = (ehTokenProativo
      ? `MODO PROATIVO — Você está iniciando o contato (não há nova mensagem do lead). SITUAÇÃO: ${situacaoProativa}\n\n${blocoReencontro}${sistemaBase}${blocoRifaDoDia}${blocoConversaPadrao}${blocoPacotesFixos}${trechoRag}${trechoPacotes}${trechoGavetas}${blocoRegraContinuidade}`
      : sistemaBase + blocoRifaDoDia + blocoConversaPadrao + blocoPacotesFixos + trechoRag + trechoPacotes + trechoGavetas + blocoRegraContinuidade) + avisoRotulosHistorico;

    // A1 (Frente 1 · prompt enxuto): orçamento de tokens por seção do prompt — observabilidade pra
    // cortar com evidência (medir antes de cortar). Char-count por bloco; tokens ≈ chars/4 (pt-BR).
    // "fixo_e_outros" = resíduo (instrução fixa inline + MODO PROATIVO). Defensivo: nunca derruba o turno.
    try {
      const _secoes: Record<string, number> = {
        pilha_objetivos: blocoPilhaObjetivos.length,
        temporal: blocoTemporal.length,
        rifa_do_dia: blocoRifaDoDia.length,
        identidade: blocoIdentidade.length,
        agente_unico: blocoAgenteUnico.length,
        crenca: blocoCrenca.length,
        fatos: blocoFatos.length,
        linha_do_tempo: blocoLinhaTempo.length,
        perfil_empresa: blocoPerfilEmpresa.length,
        ficha: blocoFicha.length,
        sinais: blocoSinais.length,
        episodios: blocoEpisodios.length,
        pensamento: blocoPensamento.length,
        ema: blocoEMA.length,
        bussola: blocoBussola.length,
        diretrizes_cargo: blocoDiretrizesCargo.length,
        empatia: blocoEmpatia.length,
        humor_relacao: blocoHumorRelacao.length,
        comportamento: blocoComportamento.length,
        rag: trechoRag.length,
        pacotes_fixos: blocoPacotesFixos.length,
        pacotes_relevantes: trechoPacotes.length,
        gavetas: trechoGavetas.length,
        continuidade: blocoRegraContinuidade.length,
      };
      const _somaNomeadas = Object.values(_secoes).reduce((a, b) => a + b, 0);
      const _totalChars = sistema.length;
      _secoes.fixo_e_outros = Math.max(0, _totalChars - _somaNomeadas);
      await supabase.from("traces").insert({
        tenant_id,
        conversa_id,
        agente_id,
        tipo: "ferramenta",
        modelo_llm: "ragentic/orcamento",
        decisao: {
          ferramenta: "orcamento_prompt",
          total_chars: _totalChars,
          total_tokens_estimado: Math.round(_totalChars / 4),
          secoes_chars: _secoes,
          cargo: cargoAlvo,
          intencao: classificacao?.intencao ?? null,
          primeira_fala_da_empresa: ehPrimeiraFalaDaEmpresa,
        },
      });
    } catch (_eOrc) {
      /* observabilidade — nunca derruba o turno */
    }

    // deno-lint-ignore no-explicit-any
    const mensagensLLM: any[] = [
      { role: "system", content: sistema },
      ...historico.map((h: { role: string; content: string | null }) => ({
        role: h.role === "user" ? "user" : "assistant",
        content: h.content || "",
      })),
    ];
    // Turno proativo (2026-06-12): o estímulo normalizado entra como última mensagem — sem isso
    // a síntese via só o histórico parado e às vezes NARRAVA a situação em vez de falar com o lead.
    if (ehTokenProativo) mensagensLLM.push({ role: "user", content: mensagemEfetiva });

    let resposta_final = "";
    // F0 (blueprint v3 §4) — CARTEIRO UNIVERSAL (2026-06-11): qualquer link DA PLATAFORMA
    // devolvido por tool neste turno (contrato, consulta, sala — rotas públicas) entra aqui.
    // Entrega determinística — bolha própria na caixa de saída, nunca depende
    // do LLM colar a URL no texto (50% das conversas em fechamento ficavam sem link).
    let linkPlataformaTurno: { link: string; contrato_id: string | null } | null = null;
    // Δ 2026-09-09: a agente ANUNCIOU uma reserva que não existe. No Chat de Teste a tool
    // recusou (telefone placeholder) e ela respondeu "Perfeito! Reservei 8 números para você"
    // com PIX e tudo — zero pedido no banco (`origem='agente'` = 0 linhas em toda a base).
    // O Gate B1 não pega porque a recusa É fonte confiável: ele valida o DADO, não a AÇÃO.
    // Aqui a guarda é determinística: recusou a venda, nenhuma bolha pode afirmar que reservou.
    let vendaRifaRecusada = false;
    // Fix B1 (2026-06-11): resultado de TOOL é fonte PRIMÁRIA (a tool leu o banco na hora).
    // Sem isso o juiz reprovava preço/link/dívidas vindos de ferramenta como "invenção".
    const resultadosToolsTurno: string[] = [];
    // Redirecionamento (2026-09-18): `transferir_humano` com `configuracao.redirecionamento`
    // ativo devolve o texto fixo aqui — o turno termina com ele LITERAL (ver depois do laço).
    let redirecionamentoTurno: string | null = null;
    let total_in = 0;
    let total_out = 0;
    let total_lat = 0;
    const tools_usadas: string[] = [];
    // Retomada da tool_alvo (2026-09-05) — incidente da conversa f96a5c5b, 00:27 BRT.
    // O modelo NÃO esqueceu de chamar a tool: chamou, `enviar_link_contrato` recusou
    // ("carrinho vazio, chame buscar_produto e gerenciar_carrinho antes"), ele consertou a
    // pré-condição (produto achado + adicionado, os dois ok) e nunca chamou de novo — foi
    // redigir a resposta e escreveu "[Link do Contrato]" no lugar do link que nunca
    // recebeu. A força do DEC-038 valia só na 1ª iteração, então uma recusa COM instrução
    // de conserto deixava o turno órfão.
    // Regra pura (testável sem Deno) em `_shared/retomada-tool-alvo.ts`; aqui só o estado.
    const desfechosToolsTurno: DesfechoTool[] = [];
    let reforcosToolAlvo = 0;
    const registrarDesfechoToolAlvo = (nome: string, resultado: { ok?: boolean } | null | undefined) => {
      desfechosToolsTurno.push({ nome, ok: !!resultado?.ok });
    };

    // Teto absoluto do laço. O orçamento REAL é `MAX_ITER_TOOL_CALLING + retomadas já
    // usadas`, avaliado no `break` abaixo — não dá pra pré-calcular, porque a retomada só
    // fica armada DEPOIS que a iteração anterior rodou (smoke 01:41 BRT: a 2ª retomada
    // ficava pronta no exato momento em que o laço acabava, e o link não saía).
    for (let iter = 0; iter < MAX_ITER_TOOL_CALLING + MAX_REFORCO_TOOL_ALVO; iter++) {
      // DEC-038: força a tool indicada pelo Porteiro SÓ na 1ª iteração.
      // Depois que a tool roda e o resultado volta pro contexto, o LLM precisa
      // GERAR TEXTO de resposta — aí `tool_choice` precisa voltar a "auto".
      // Exceção: a retomada abaixo, quando a tool_alvo recusou e a pré-condição já foi
      // atendida — aí forçar de novo é o que impede o placeholder.
      const reforcarToolAlvo = precisaRetomarToolAlvo(toolAlvoPorteiro, desfechosToolsTurno, reforcosToolAlvo);
      // Passar do teto base só se vale a pena: uma retomada pendente pra pagar, ou o giro
      // extra que cada retomada já usada comprou (é nele que a fala final é escrita).
      if (!reforcarToolAlvo && iter >= MAX_ITER_TOOL_CALLING + reforcosToolAlvo) break;
      if (reforcarToolAlvo) {
        reforcosToolAlvo++;
        await supabase.from("traces").insert({
          tenant_id,
          conversa_id,
          agente_id,
          tipo: "ferramenta",
          modelo_llm: MODELO_SINTESE,
          decisao: {
            ferramenta: toolAlvoPorteiro,
            origem: "tool_alvo_reforcada",
            motivo: "tool_alvo recusou e a pré-condição foi resolvida por outra tool no mesmo turno",
            iteracao: iter,
          },
        });
      }
      const toolChoiceIter = iter === 0 && toolChoiceForcada
        ? toolChoiceForcada
        : reforcarToolAlvo
        ? { type: "function" as const, function: { name: toolAlvoPorteiro as string } }
        : undefined;
      const r = await chamarLLM({
        modelo: (await getConfigChamada(supabase, "sintese", tenant_id ?? null, null)).modelo,
        temperatura: 0.6,
        max_tokens: 1400,
        mensagens: mensagensLLM,
        tools: tools.length ? tools : undefined,
        tool_choice: toolChoiceIter,
      });
      total_in += r.tokens_entrada;
      total_out += r.tokens_saida;
      total_lat += r.latencia_ms;

      // deno-lint-ignore no-explicit-any
      const toolCalls = r.tool_calls as any[] | null;
      if (toolCalls?.length) {
        mensagensLLM.push({ role: "assistant", content: r.texto || null, tool_calls: toolCalls });
        for (const tc of toolCalls) {
          const nome = tc.function?.name as string;
          // deno-lint-ignore no-explicit-any
          const ferr = tools.find((t: any) => t.function.name === nome);
          // deno-lint-ignore no-explicit-any
          let resultado: any = { ok: false, mensagem: `tool '${nome}' não disponível` };
          if (ferr) {
            // deno-lint-ignore no-explicit-any
            let args: any = {};
            try {
              args = JSON.parse(tc.function.arguments || "{}");
            } catch {
              /* mantém vazio */
            }
            // Single-flight: chegou msg nova → NÃO executa tool (contrato/link/agendamento
            // teriam efeito real impossível de desfazer no descarte). Aborta (lead → rebuffer).
            {
              const _msgNova = await houveMsgNova();
              if (_msgNova) return await abortarSuperseded(`tool:${nome}`, _msgNova);
            }
            resultado = await despacharFerramenta(
              // deno-lint-ignore no-explicit-any
              supabase as any,
              // deno-lint-ignore no-explicit-any
              (ferr as any)._endpoint,
              ctxFerr,
              args,
              // deno-lint-ignore no-explicit-any
              (ferr as any)._config,
            );
            tools_usadas.push(nome);
            // Recusa da tool_alvo vira dívida do turno (ver bloco da retomada acima).
            registrarDesfechoToolAlvo(nome, resultado);
            // F0 universal: captura QUALQUER link de rota pública da plataforma devolvido pela tool
            // (contrato, consulta, sala — entrega determinística no fim do turno).
            if (resultado?.ok && typeof resultado?.dados?.link === "string" && ehLinkPlataforma(resultado.dados.link)) {
              linkPlataformaTurno = { link: resultado.dados.link, contrato_id: (resultado.dados.contrato_id as string | undefined) ?? null };
            }
            if (nome === "vender_numeros_rifa") vendaRifaRecusada = !resultado?.ok;
            if (typeof resultado?.dados?.redirecionamento_texto === "string") {
              redirecionamentoTurno = resultado.dados.redirecionamento_texto;
            }
            // Fix B1: resultado da tool entra como fonte do juiz (dados vivos do banco).
            // `fonte_confiavel` (2026-09-07): recusa que AINDA ASSIM leu dado do banco também
            // entra. Sem isso, `vender_numeros_rifa` recusando por falta de telefone deixava o
            // turno sem fonte nenhuma — o B1 reprovava a disponibilidade correta e o lead levava
            // "vou confirmar e já te retorno" em vez da resposta (conversa 3d20e9cb).
            if (resultado?.ok || resultado?.fonte_confiavel) {
              resultadosToolsTurno.push(fonteDaTool(nome, resultado));
            }
            await supabase.from("traces").insert({
              tenant_id,
              conversa_id,
              agente_id,
              tipo: "ferramenta",
              modelo_llm: MODELO_SINTESE,
              decisao: { ferramenta: nome, args, resultado },
            });
          }
          mensagensLLM.push({
            role: "tool",
            tool_call_id: tc.id,
            name: nome,
            content: JSON.stringify(resultado),
          });
        }
        if (redirecionamentoTurno) break;
        continue;
      }
      // B1 fix (2026-05-24): o flash-lite às vezes emite a tool como TEXTO em vez de usar function-calling
      // nativo → vazava o JSON pro lead e a ação não executava. Tenta executar + re-prompta; nunca vaza.
      const toolTexto = parseToolEmTexto(r.texto || "");
      // F0: roda TAMBÉM na última iteração (antes: `iter < MAX_ITER - 1` → gerar_contrato
      // emitido como texto no último loop nunca executava e o LLM narrava "enviei" sem contrato).
      // Na última iteração o `continue` encerra o laço e o fallback sem-tools fecha o texto.
      if (toolTexto) {
        // deno-lint-ignore no-explicit-any
        const ferrTxt = toolTexto.nome ? tools.find((t: any) => t.function.name === toolTexto.nome) : null;
        if (ferrTxt) {
          // Single-flight: mesmo guard do ramo nativo — tool emitida como texto também tem efeito.
          {
            const _msgNova = await houveMsgNova();
            if (_msgNova) return await abortarSuperseded(`tool_texto:${toolTexto.nome}`, _msgNova);
          }
          const resultadoTxt = await despacharFerramenta(
            // deno-lint-ignore no-explicit-any
            supabase as any, (ferrTxt as any)._endpoint, ctxFerr, toolTexto.args ?? {}, (ferrTxt as any)._config,
          );
          tools_usadas.push(toolTexto.nome as string);
          // Idem ramo texto: o flash-lite usa este caminho em prod, a dívida conta igual.
          registrarDesfechoToolAlvo(toolTexto.nome as string, resultadoTxt);
          // F0 universal: captura o link também no ramo texto (flash-lite usa este em prod).
          if (resultadoTxt?.ok && typeof resultadoTxt?.dados?.link === "string" && ehLinkPlataforma(resultadoTxt.dados.link)) {
            linkPlataformaTurno = { link: resultadoTxt.dados.link, contrato_id: (resultadoTxt.dados.contrato_id as string | undefined) ?? null };
          }
          if (toolTexto.nome === "vender_numeros_rifa") vendaRifaRecusada = !resultadoTxt?.ok;
          if (typeof resultadoTxt?.dados?.redirecionamento_texto === "string") {
            redirecionamentoTurno = resultadoTxt.dados.redirecionamento_texto;
            break;
          }
          // Fix B1: idem ramo texto — resultado da tool (ou recusa com dado lido) é fonte do juiz.
          if (resultadoTxt?.ok || resultadoTxt?.fonte_confiavel) {
            resultadosToolsTurno.push(fonteDaTool(toolTexto.nome as string, resultadoTxt));
          }
          await supabase.from("traces").insert({
            tenant_id, conversa_id, agente_id, tipo: "ferramenta", modelo_llm: MODELO_SINTESE,
            decisao: { ferramenta: toolTexto.nome, args: toolTexto.args, resultado: resultadoTxt, origem: "tool_em_texto" },
          });
          mensagensLLM.push({ role: "assistant", content: r.texto || "" });
          mensagensLLM.push({ role: "user", content: `[sistema] A ferramenta ${toolTexto.nome} já foi executada (resultado: ${JSON.stringify(resultadoTxt)}). Agora responda ao lead em linguagem natural, SEM escrever nenhuma chamada de ferramenta, JSON ou tag no texto.` });
          continue;
        }
        // emitiu tool como texto mas sem nome mapeável → re-prompta 1x pra usar a ferramenta de verdade
        mensagensLLM.push({ role: "assistant", content: r.texto || "" });
        mensagensLLM.push({ role: "user", content: `[sistema] Você escreveu uma chamada de ferramenta como TEXTO — isso NÃO executa e NÃO pode aparecer pro lead. Use a ferramenta de verdade (function-calling) se for o caso; senão, responda ao lead em linguagem natural, sem JSON nem tags.` });
        continue;
      }
      // Defesa final: nunca deixar artefato de tool vazar pro lead.
      resposta_final = striparArtefatosTool(r.texto || "");
      break;
    }

    // ── Redirecionamento (2026-09-18, Contato Babel) ──
    // O lead pediu pra ser redirecionado e `transferir_humano` devolveu o texto fixo do dono
    // (`agentes.configuracao.redirecionamento = { ativo, texto }`). Sai LITERAL, uma bolha, sem
    // Síntese — o número no fim precisa chegar intacto pra virar link no WhatsApp. Mesma via
    // da saudação obrigatória (inviolavel + gerada_ate=null). A conversa NÃO é pausada.
    if (redirecionamentoTurno) {
      if (modo_teste) {
        await supabase.from("mensagens").insert({
          conversation_id: conversa_id, role: "assistant", content: redirecionamentoTurno,
        });
      } else {
        await supabase.from("caixa_saida_mensagens").insert({
          tenant_id,
          conversation_id: conversa_id,
          status: "pendente",
          content: redirecionamentoTurno,
          bubble_order: 0,
          scheduled_at: new Date().toISOString(),
          delay_calculado_ms: 0,
          engagement_level: "morno",
          carga: { typing_ms: 3000, origem: "redirecionamento", inviolavel: true, gerada_ate: null },
        });
      }
      return jsonResp({
        ok: true,
        modo: "redirecionamento",
        reply: redirecionamentoTurno,
        mensagens: modo_teste ? [redirecionamentoTurno] : [],
        conversation_id: conversa_id,
        ...(descricaoMidia ? { media_descricao: descricaoMidia } : {}),
      }, 200);
    }

    if (!resposta_final) {
      // Tools consumiram todas as iterações sem o modelo gerar texto final (ex: contrato falhou e
      // o modelo ficou tentando tool) → 1 chamada SEM tools pra fechar com resposta natural ao lead.
      try {
        const rFinal = await chamarLLM({ modelo: (await getConfigChamada(supabase, "sintese", tenant_id ?? null, null)).modelo, temperatura: 0.6, max_tokens: 1400, mensagens: mensagensLLM });
        total_in += rFinal.tokens_entrada;
        total_out += rFinal.tokens_saida;
        total_lat += rFinal.latencia_ms;
        resposta_final = striparArtefatosTool(rFinal.texto || "");
      } catch (eFinal) {
        console.warn(`[sintese] fallback sem-tools falhou: ${(eFinal as Error).message}`);
      }
    }
    if (!resposta_final) resposta_final = "(sem resposta)";

    // ── A3 (2026-05-14): extrair tag <pensamento_estruturado> ANTES do strip de \n ──
    // LLM termina cada resposta com tag XML contendo JSON do pensamento (6 campos Companion 12).
    // Aqui: regex extrai, valida acao_pretendida contra enum, strip da tag antes de quebrar bolhas.
    const ACOES_PRETENDIDAS = [
      "responder_e_aguardar","fazer_pergunta_de_qualificacao","oferecer","fechar",
      "agendar_retorno","escalar_humano","esperar_silencio","registrar_e_seguir",
    ];
    type PensamentoEstruturado = {
      leitura_da_situacao: string;
      proxima_intencao: string;
      acao_pretendida: string;
      quando_voltar: string | null;
      motivo: string;
      plano_proximos_2_turnos: Array<{ turno: number; o_que_fazer: string; por_que: string }>;
    };
    let pensamentoEstrut: PensamentoEstruturado | null = null;
    // 1ª tentativa — tag fechada normalmente <pensamento_estruturado>...</pensamento_estruturado>
    const matchPensamento = resposta_final.match(/<pensamento_estruturado>\s*([\s\S]*?)\s*<\/pensamento_estruturado>/i);
    let jsonBruto: string | null = null;
    if (matchPensamento) {
      jsonBruto = matchPensamento[1].trim();
    } else {
      // 2ª tentativa (FIX vazamento bolha 2026-05-14 03:40 BRT) — tag ABERTA sem fechamento
      // (LLM truncou por max_tokens). Pega tudo após <pensamento_estruturado> e tenta parsear.
      const matchAberto = resposta_final.match(/<pensamento_estruturado>\s*([\s\S]*)$/i);
      if (matchAberto) {
        jsonBruto = matchAberto[1].trim();
      }
    }
    if (jsonBruto) {
      try {
        // deno-lint-ignore no-explicit-any
        const parsed: any = JSON.parse(jsonBruto);
        const acao = String(parsed?.acao_pretendida ?? "").trim();
        pensamentoEstrut = {
          leitura_da_situacao: String(parsed?.leitura_da_situacao ?? "").trim(),
          proxima_intencao: String(parsed?.proxima_intencao ?? "").trim(),
          acao_pretendida: ACOES_PRETENDIDAS.includes(acao) ? acao : "responder_e_aguardar",
          quando_voltar: parsed?.quando_voltar === null || parsed?.quando_voltar === undefined
            ? null
            : String(parsed.quando_voltar).trim() || null,
          motivo: String(parsed?.motivo ?? "").trim(),
          plano_proximos_2_turnos: Array.isArray(parsed?.plano_proximos_2_turnos)
            // deno-lint-ignore no-explicit-any
            ? (parsed.plano_proximos_2_turnos as any[]).slice(0, 2).map((p, i) => ({
                turno: Number(p?.turno ?? i + 1),
                o_que_fazer: String(p?.o_que_fazer ?? "").trim(),
                por_que: String(p?.por_que ?? "").trim(),
              }))
            : [],
        };
      } catch (eP) {
        // JSON truncado pode falhar — sem problema, fallback derivado do porteiro entra
        console.warn("[a3 pensamento parse]", (eP as Error).message);
      }
      // STRIP ROBUSTO: remove tag fechada normalmente
      resposta_final = resposta_final.replace(/<pensamento_estruturado>[\s\S]*?<\/pensamento_estruturado>/gi, "").trim();
      // STRIP DE TAG ABERTA SEM FECHAMENTO (truncada): remove TUDO desde <pensamento_estruturado> até o fim
      resposta_final = resposta_final.replace(/<pensamento_estruturado>[\s\S]*$/i, "").trim();
    }
    // Defesa final — síntese sem NENHUMA fala (LLM devolveu só o pensamento interno).
    // Fix 2026-06-11: isso virava "(processando)" ENVIADO ao lead (42 casos em prod).
    // Agora vira silêncio real: o placeholder fica só em log/trace, nunca em bolha.
    let _sinteseVazia = false;
    if (!resposta_final || resposta_final.length < 2 || resposta_final.trim() === "(sem resposta)") {
      // "(sem resposta)" (loop de tools esgotado) também é placeholder interno — nunca vira bolha.
      if (resposta_final?.trim() !== "(sem resposta)") resposta_final = "(processando)";
      _sinteseVazia = true;
    }
    // Fallback robusto: se não conseguiu parsear, deriva do porteiro (mantém comportamento v25)
    if (!pensamentoEstrut) {
      pensamentoEstrut = {
        leitura_da_situacao: String(classificacao?.resumo ?? "").slice(0, 200),
        proxima_intencao: "Continuar conversa naturalmente",
        acao_pretendida: "responder_e_aguardar",
        quando_voltar: null,
        motivo: `Fallback (LLM não retornou tag pensamento_estruturado)`,
        plano_proximos_2_turnos: [],
      };
    }

    // Normaliza `\n` literal (2 chars: \ + n) e `\\n` que a LLM eventualmente cospe
    // em vez de quebra de linha de verdade. Sem isso o frontend renderiza "Boa tarde!
    // \nme chamo Carol" — bug visto em 2026-05-13 com gemini-2.5-flash.
    resposta_final = resposta_final
      .replace(/\\{2,}n/g, "\n")
      .replace(/\\n/g, "\n");

    // N1: rede final — placeholder de nome cru nunca chega ao lead.
    resposta_final = striparPlaceholders(resposta_final);

    // Quebra 100% semântica (sem cap hardcoded) — ver _shared/bolhas.ts.
    // [silencio]/[no-reply] como resposta inteira = agente não responde verbalmente.
    const { bolhas: _bolhasBrutas } = quebrarEmBolhas(resposta_final);

    // ── Citação por bolha (RAG-first amarrado, dossiê B1) ──
    // Extrai [N] (índice da BASE DE CONHECIMENTO) ou ⟨uuid⟩ de cada bolha, mapeia pro bloco_id
    // real (blocosContexto[N-1].id) e LIMPA a citação do texto (o lead nunca vê [N]).
    // Resultado: cada bolha sai com os blocos_usados que a fundamentam, gravados por bolha.
    // Passo 2: o parser mapeia [N] contra o registro GLOBAL de fontes do turno (_mapaCtx —
    // recall + todas as gavetas + comportamento), não só o recall. Assim a bolha cita o
    // bloco real de QUALQUER fonte.
    const _ctxPorN = new Map<number, string>();
    for (const _it of _mapaCtx) _ctxPorN.set(_it.n, _it.id);
    const _idsValidosCtx = new Set(_mapaCtx.map((_it) => _it.id));
    const _parseCitacoes = (txt: string): { texto: string; blocos: string[] } => {
      const ids = new Set<string>();
      for (const m of txt.matchAll(/\[(\d{1,3})\]/g)) {
        const id = _ctxPorN.get(Number(m[1]));
        if (id) ids.add(id);
      }
      for (const m of txt.matchAll(/\[([0-9a-fA-F-]{36})\]/g)) {
        if (_idsValidosCtx.has(m[1])) ids.add(m[1]);
      }
      const texto = txt
        .replace(/\s*\[(?:\d{1,3}|[0-9a-fA-F-]{36})\]/g, "")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\s+([,.!?])/g, "$1")
        .trim();
      return { texto, blocos: [...ids] };
    };
    const _bolhasCitadas = _bolhasBrutas.map(_parseCitacoes).filter((b) => b.texto.length > 0);
    // `let` (2026-06-11): a cirurgia do Gate B1 pode cortar bolhas reprovadas e reatribuir.
    let bolhasFinais = _bolhasCitadas.map((b) => b.texto);
    // blocos_usados por bolha (índice alinhado a bolhasFinais) — gravado em mensagens.blocos_acionados.
    let _blocosPorBolha: string[][] = _bolhasCitadas.map((b) => b.blocos);

    // ── Saneamento de FORMA (2026-06-12 — substitui a tesoura de etiqueta v159) ──
    // 52 bolhas-lixo em 10-12/06: o LLM narrava a rubrica em vez de falar com o lead
    // ("(Lead não respondeu desde X)", "---*…*", "***", etiqueta imitada truncada/no meio).
    // Regra por FORMA, não por literal: etiqueta morre em QUALQUER posição (mesmo malformada)
    // e bolha-anotação é derrubada. Tudo caiu → 1 refeita da síntese com o motivo → silêncio.
    const _ehBolhaAnotacao = (b: string): boolean => {
      const t = b.trim();
      if (/^[-*_=\s]{2,}$/.test(t)) return true; // só símbolos: "***", "---", "==="
      const _meta =
        /(o\s+)?lead\s+(não\s+)?(respondeu|responde|silenciou|enviou|parou|está em silêncio)|sem resposta|processando|última mensagem|histórico da conversa|mensagem do lado da empresa|aqui está a resposta|fim do histórico/i;
      if (/^[([\-—*]/.test(t) && _meta.test(t)) return true; // "(anotação)", "[rubrica]", "---*meta*"
      // Δ 2026-09-09: PLANO no infinitivo virando bolha. A Lucy mandou "Pedir mais detalhes ao
      // cliente." pro lead (conversa do Fabrício, 01:21 BRT) — frase limpa, sem colchete e sem
      // símbolo, então escapava das duas regras acima. O que a denuncia é a forma: verbo no
      // infinitivo abrindo, ninguém sendo endereçado, e o lead na TERCEIRA pessoa ("ao cliente")
      // em vez da segunda. Fala de verdade em pt-BR começa com "Vou…", "Me conta…", "Pode…",
      // quase nunca com "Pedir…"/"Confirmar…"/"Aguardar…".
      const _infinitivo = /^[A-ZÀ-Ú][a-zà-úçãõâêô]+(ar|er|ir|á-lo|á-la)\b/;
      const _fala2aPessoa = /\b(você|vc|tu|te|ti|seu|sua|seus|suas|lhe|contigo|obrigad|oi|olá|opa)\b/i;
      if (
        t.length <= 90 &&
        !t.includes("?") &&
        _infinitivo.test(t) &&
        !_fala2aPessoa.test(t)
      ) return true;
      return false;
    };
    // Δ 2026-09-15 (HS Consultoria): só a etiqueta "[Mensagem do lado da empresa…]" era
    // cortada. O LLM imitou a outra etiqueta do histórico e o lead recebeu
    // "[Heydi Shairon (CEO) — humano da SUA equipe respondeu o lead diretamente pela
    // plataforma]: Entendo seu desabafo…". Agora qualquer etiqueta de autoria montada no
    // histórico (ver o rótulo `quem` acima) morre, em qualquer posição.
    const _MARCA_ETIQUETA =
      "mensagem d[oa] lado da empresa|humano da sua equipe|respondeu o lead diretamente|enviou o arquivo";
    const _cortarEtiquetaInterna = (b: string): string => {
      const fechada = new RegExp(`\\[[^\\]\\n]{0,220}?(?:${_MARCA_ETIQUETA})[^\\]\\n]{0,220}\\]:?\\s*`, "gi");
      let t = b.replace(fechada, " ");
      // etiqueta malformada (sem "]"): corta do "[" até o fim do rótulo ou o primeiro ":"
      const aberta = new RegExp(`\\[[^\\]\\n]{0,220}?(?:${_MARCA_ETIQUETA})[^\\n:]{0,220}:?\\s*`, "i");
      t = t.replace(aberta, " ");
      return t === b ? b : t.replace(/[ \t]{2,}/g, " ").trim();
    };
    const _sanearBolhas = (textos: string[], blocos: string[][]) => {
      const pares = textos
        .map((t, i) => ({ texto: _cortarEtiquetaInterna(t).trim(), blocos: blocos[i] ?? [] }))
        .filter((p) => p.texto.length > 0 && !_ehBolhaAnotacao(p.texto));
      return { textos: pares.map((p) => p.texto), blocos: pares.map((p) => p.blocos), caiu: textos.length - pares.length };
    };
    {
      const _s1 = _sanearBolhas(bolhasFinais, _blocosPorBolha);
      if (_s1.caiu > 0) console.warn(`[saneamento-forma] ${_s1.caiu} bolha(s)-anotação cortada(s) (conversa=${conversa_id})`);
      if (_s1.textos.length === 0 && bolhasFinais.length > 0) {
        // A resposta INTEIRA era anotação interna → a própria síntese refaz 1× com o motivo.
        try {
          mensagensLLM.push({ role: "assistant", content: resposta_final });
          mensagensLLM.push({
            role: "user",
            content:
              `[sistema] Sua resposta anterior era ANOTAÇÃO INTERNA sobre a conversa (ex: "(lead não respondeu)", "[Mensagem do lado da empresa...]", "---"). Isso NUNCA pode ser enviado. Escreva agora APENAS a sua próxima fala natural ao lead, direto, sem colchetes, parênteses de narração ou meta-comentários.`,
          });
          const rRetry = await chamarLLM({ modelo: MODELO_SINTESE, temperatura: 0.6, max_tokens: 1200, mensagens: mensagensLLM });
          total_in += rRetry.tokens_entrada;
          total_out += rRetry.tokens_saida;
          total_lat += rRetry.latencia_ms;
          const _txtRetry = striparPlaceholders(
            striparArtefatosTool(rRetry.texto || "").replace(/<pensamento_estruturado>[\s\S]*$/i, "").trim(),
          );
          const { bolhas: _bRetry } = quebrarEmBolhas(_txtRetry);
          const _cRetry = _bRetry.map(_parseCitacoes).filter((b) => b.texto.length > 0);
          const _s2 = _sanearBolhas(_cRetry.map((b) => b.texto), _cRetry.map((b) => b.blocos));
          if (_s2.textos.length > 0) {
            bolhasFinais = _s2.textos;
            _blocosPorBolha = _s2.blocos;
            resposta_final = bolhasFinais.join("\n\n");
            console.warn(`[saneamento-forma] refeita aprovada (conversa=${conversa_id})`);
          } else {
            bolhasFinais = [];
            _blocosPorBolha = [];
            resposta_final = "";
            try {
              await supabase.from("traces").insert({
                tenant_id, conversa_id, agente_id, tipo: "sintese_vazia_silencio",
                decisao: { motivo: "forma_invalida_2x", proativo: ehTokenProativo },
              });
            } catch { /* trace opcional */ }
          }
        } catch (eRetry) {
          console.warn(`[saneamento-forma] refeita falhou — silêncio (${(eRetry as Error).message})`);
          bolhasFinais = [];
          _blocosPorBolha = [];
          resposta_final = "";
        }
      } else {
        bolhasFinais = _s1.textos;
        _blocosPorBolha = _s1.blocos;
      }
    }

    // ── Guarda do pagamento fantasma (Δ 2026-09-09) ────────────────────────
    // "Já confirmou?" → "Confirmado com sucesso! Seus números já estão garantidos." A agente
    // aprovou o pagamento sozinha (Chat de Teste do Fabrício, 01:5x BRT) — o pedido seguia
    // `reservado` no banco. Quem valida comprovante é o DONO, no painel: nenhuma tool do agente
    // aprova pagamento, então essa frase nunca tem fonte. Aqui ela é reescrita, não silenciada:
    // o lead perguntou e merece a resposta certa ("o dono confere e te confirma").
    if (bolhasFinais.length > 0 && recursosAgente.rifasLeitura) {
      const _afirmaPagamento =
        /\b(pagamento (foi )?(confirmad|aprovad)|confirmad[oa] com sucesso|comprovante (foi )?(aprovad|validad|confirmad)|est[áa] tudo cert[oa] com (o )?(seu )?pagamento|n[úu]meros (j[áa] )?(est[ãa]o )?(garantid|confirmad))/i;
      const _idxPagamento = bolhasFinais
        .map((b, i) => (_afirmaPagamento.test(b) ? i : -1))
        .filter((i) => i >= 0);
      if (_idxPagamento.length > 0) {
        console.warn(`[pagamento-fantasma] síntese confirmou pagamento sem o dono (conversa=${conversa_id})`);
        const _troca =
          "Recebi! Agora é com o dono da rifa: ele confere o comprovante e eu te confirmo aqui assim que ele validar.";
        for (const i of _idxPagamento) bolhasFinais[i] = _troca;
        // Duas trocas viram uma só — o lead não precisa ouvir a mesma frase duas vezes.
        bolhasFinais = bolhasFinais.filter((b, i) => b !== _troca || i === _idxPagamento[0]);
        _blocosPorBolha = _blocosPorBolha.slice(0, bolhasFinais.length);
        resposta_final = bolhasFinais.join("\n\n");
        try {
          await supabase.from("traces").insert({
            tenant_id, conversa_id, agente_id, tipo: "pagamento_fantasma_barrado",
            decisao: { bolhas_trocadas: _idxPagamento.length },
          });
        } catch { /* trace best-effort */ }
      }
    }

    // ── Guarda da reserva fantasma (Δ 2026-09-09) ──────────────────────────
    // `vender_numeros_rifa` recusou e a agente anunciou a reserva assim mesmo — aconteceu no
    // Chat de Teste do Fabrício (01:07 BRT): "Perfeito! Reservei 8 números para você" + PIX,
    // com ZERO pedido de origem 'agente' no banco. É a pior mentira possível: o lead paga.
    // O Gate B1 não pega porque valida DADO (a disponibilidade estava certa), não AÇÃO.
    if (vendaRifaRecusada && bolhasFinais.length > 0) {
      const _afirmaReserva =
        /\b(reservei|reservad[oa]s?|separei|separad[oa]s?|garanti|garantid[oa]s?|est[ãa]o (seus|reservados)|s[ãa]o seus|fechei|anotei os n[úu]meros)\b/i;
      if (bolhasFinais.some((b) => _afirmaReserva.test(b))) {
        console.warn(`[reserva-fantasma] síntese afirmou reserva com a tool recusada (conversa=${conversa_id})`);
        try {
          mensagensLLM.push({ role: "assistant", content: resposta_final });
          mensagensLLM.push({
            role: "user",
            content:
              `[sistema] A reserva NÃO foi feita — a ferramenta recusou e nenhum número foi separado. ` +
              `Sua resposta anterior dizia que reservou, e isso é mentira que faz o lead pagar por nada. ` +
              `Reescreva AGORA: diga com naturalidade o que falta pra fechar (o motivo veio no resultado da ferramenta), ` +
              `peça o que falta e NÃO afirme reserva, número separado, valor a pagar nem PIX.`,
          });
          const rFantasma = await chamarLLM({ modelo: MODELO_SINTESE, temperatura: 0.5, max_tokens: 900, mensagens: mensagensLLM });
          total_in += rFantasma.tokens_entrada;
          total_out += rFantasma.tokens_saida;
          total_lat += rFantasma.latencia_ms;
          const _txtF = striparPlaceholders(
            striparArtefatosTool(rFantasma.texto || "").replace(/<pensamento_estruturado>[\s\S]*$/i, "").trim(),
          );
          const { bolhas: _bF } = quebrarEmBolhas(_txtF);
          const _cF = _bF.map(_parseCitacoes).filter((b) => b.texto.length > 0);
          const _sF = _sanearBolhas(_cF.map((b) => b.texto), _cF.map((b) => b.blocos));
          const _limpa = _sF.textos.length > 0 && !_sF.textos.some((b) => _afirmaReserva.test(b));
          if (_limpa) {
            bolhasFinais = _sF.textos;
            _blocosPorBolha = _sF.blocos;
            resposta_final = bolhasFinais.join("\n\n");
          } else {
            // Insistiu na mentira: melhor calar do que prometer número que não existe.
            bolhasFinais = [];
            _blocosPorBolha = [];
            resposta_final = "";
          }
          await supabase.from("traces").insert({
            tenant_id, conversa_id, agente_id, tipo: "reserva_fantasma_barrada",
            decisao: { refeita_aprovada: _limpa },
          });
        } catch (eFantasma) {
          console.warn(`[reserva-fantasma] refeita falhou — silêncio (${(eFantasma as Error).message})`);
          bolhasFinais = [];
          _blocosPorBolha = [];
          resposta_final = "";
        }
      }
    }

    // ── Gate B1 (Auditor de Groundedness) — RAG-first amarrado 2026-05-29 ──
    // A Síntese já gerou a resposta. Antes de enfileirar, o Auditor (Gemma-4) checa se TODA
    // afirmação factual sobre o produto tem bloco que a sustente (preenche o Bloco ID).
    //  - APROVADA → segue o fluxo normal (enfileira/insere bolhas).
    //  - REPROVADA → descarta a resposta e joga pro Mentor: cria lacuna (→ GenUI no Chat de Teste /
    //    aba Perguntas) + bolha fixa "tô chamando o chefe". Fecha o caso "fato sem bloco" (ex: versão em inglês).
    // Kill-switch: USAR_AUDITOR_GROUNDEDNESS=false. Falha silenciosa = mantém a resposta (zero regressão).
    const _USAR_AUDITOR_B1 = (Deno.env.get("USAR_AUDITOR_GROUNDEDNESS") ?? "true").toLowerCase() !== "false";
    const _respostaRealB1 = bolhasFinais.length > 0 && !["(sem resposta)", "(processando)"].includes(resposta_final.trim());
    // 2026-06-12: B1 LIGADO também no turno proativo (antes a porta do cron ficava sem vigia —
    // rajada de 12/06). No proativo a reprovação total vira SILÊNCIO (sem bolha-chefe nem lacuna:
    // o lead não perguntou nada — cron re-tenta no ciclo seguinte).
    // Δ 2026-09-24 (item 3): resultado do B1 destilado e preservado até a entrega pro veto final.
    // Preenchido SÓ quando o veredito é REPROVADA — veredito APROVADA com trechos vetados pela
    // contraprova literal NÃO pode derrubar bolha legítima (o juiz foi "vetado" pelas fontes).
    let _reprovadosB1: { bolhasIdx: number[]; trechos: string[] } | null = null;
    if (_USAR_AUDITOR_B1 && _respostaRealB1) {
      try {
        const { auditarRespostaGroundedness } = await import("../_shared/auditor-groundedness.ts");
        // deno-lint-ignore no-explicit-any
        const _blocosB1 = (blocosContexto as any[]).map((b) => ({
          id: String(b.id),
          title: (b.title ?? null) as string | null,
          content: String(b.content ?? ""),
          category: (b.category ?? null) as string | null,
          rerank_score: Number(b.rerank_score ?? 0),
        }));
        // Passo 1 da Frente A: o B1 audita contra TODAS as fontes do prompt, não só o recall.
        // Sem isso, fato que veio de gaveta/comportamento era tratado como "inventado" → reprovava
        // resposta correta (incidente "nega tudo" 2026-05-29).
        // Fatos da MEMÓRIA do lead são fonte legítima pro juiz (fix 2026-06-11: resposta
        // ancorada em fato_financeiro da consulta concluída era reprovada como "sem fonte"
        // — o agente dizia "não tenho acesso aos seus dados" com os dados na mão).
        const _fatosLeadB1 = (fatosLead as Array<{ fato?: string | null }>)
          .map((f) => String(f?.fato ?? "").trim())
          .filter((t) => t.length > 0 && !t.startsWith("Pergunta descartada pelo dono"))
          .slice(0, 20)
          .map((t) => `- ${t.slice(0, 200)}`)
          .join("\n");
        const _contextoAdicionalB1 = [
          // Resultado de tool vem PRIMEIRO (Δ 2026-09-10, Lucy): o auditor corta estas fontes num
          // teto de caracteres e, com gavetas + comportamento + Rifa do Dia antes, a tool do turno
          // ficava fora. `enviar_foto_rifa` mandava a foto, o juiz não via e reprovava a resposta
          // ("pediu a foto, nenhuma fonte cobre") — o lead recebia "vou verificar com a equipe" e o
          // dono uma pergunta à toa. Fonte primária não pode ser a primeira a cair.
          resultadosToolsTurno.length
            ? `RESULTADOS DAS FERRAMENTAS EXECUTADAS NESTE TURNO (dados VIVOS lidos do banco — fonte PRIMÁRIA; preço/link/dívida daqui NÃO é invenção; ação que a ferramenta diz ter feito — ex.: foto enviada — FOI feita):\n${resultadosToolsTurno.map((r) => `- ${r}`).join("\n")}`
            : "",
          // Regras do cargo ativo (2026-09-18, babel123/kit Likemax, conversa 87ae0f89): o script
          // palavra-por-palavra do Vendedor ("Serasa, SPC, Boa Vista, Cenprot, Cadin, Bacen…") mora em
          // cargos.regras_livres — entra no prompt (REGRAS DESTE CARGO), mas não chegava ao juiz, que
          // cortou a lista 2× como "órgãos inventados" e a agente se desdisse e mudou de assunto.
          cargoMeta?.regras_livres
            ? `REGRAS E SCRIPT DO CARGO ATIVO (${cargoMeta.nome || cargoAlvo}) — o agente foi INSTRUÍDO a falar isto; frases, listas, valores e prazos daqui são fonte, não invenção:\n${cargoMeta.regras_livres}`
            : "",
          // Pacotes de Conhecimento ligados (2026-09-15): mesma lição da Rifa do Dia — o que está
          // no prompt do agente tem que chegar ao juiz, senão resposta certa vira "invenção".
          // Antes das gavetas porque o auditor corta o contexto no teto de caracteres.
          blocoConversaPadrao,
          blocoPacotesFixos,
          trechoPacotes,
          trechoGavetas,
          blocoComportamento,
          blocoDiretrizesCargo,
          // Rifa do Dia (2026-09-07, conversa 9a30c57e): a seção entra em TODO system prompt
          // com preço, promoções e sorteio lidos do banco na hora — mas não chegava ao juiz.
          // Resultado: o agente respondia "R$ 10,00 cada número" (certo, estava no prompt) e
          // o B1 cortava como invenção; quando o lead perguntou "tem desconto?", reprovou o
          // turno inteiro e virou pergunta pro dono. Fonte do agente e fonte do juiz têm que
          // ser a MESMA.
          blocoRifaDoDia,
          _fatosLeadB1 ? `FATOS CONHECIDOS DESTE CONTATO (memória do sistema — fonte válida):\n${_fatosLeadB1}` : "",
        ]
          .filter((s) => typeof s === "string" && s.trim().length > 0)
          .join("\n\n");
        // Temas que o dono já descartou pra este lead (memória com prefixo, gravada pela RPC
        // descartar_pergunta_mentor). O B1 não re-escala esses — o agente deve contornar.
        const _temasDescartados = (fatosLead as Array<{ fato?: string | null }>)
          .map((f) => String(f?.fato ?? ""))
          .filter((t) => t.startsWith("Pergunta descartada pelo dono"))
          .join("\n")
          .slice(0, 2000);
        // Últimas 4 falas do PRÓPRIO agente — fonte legítima pro juiz (varredura 2026-06-11:
        // 8% das reprovações eram o agente repetindo o que ele mesmo disse antes com fonte).
        const _historicoAgenteB1 = (historico as Array<{ role: string; content: string | null }>)
          .filter((m) => (m.role === "human" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
          .slice(-4)
          .map((m) => `- ${String(m.content).slice(0, 200)}`)
          .join("\n")
          .slice(0, 800);
        const _audB1 = await auditarRespostaGroundedness(supabase, {
          tenantId: tenant_id,
          nichoId: nichoIdRecall ?? null,
          perguntaLead: String(mensagemEfetiva ?? ""),
          bolhas: bolhasFinais,
          blocosRecuperados: _blocosB1,
          contextoAdicional: _contextoAdicionalB1,
          temasDescartados: _temasDescartados || null,
          historicoAgente: _historicoAgenteB1 || null,
        });

        // Δ 2026-09-24 (item 3): copia o que o auditor agarrou pra rede de entrega final
        // (cirurgia, curiosidade/proativo e enqueue usam a MESMA verificação — ver D).
        _reprovadosB1 = _audB1.veredito === "REPROVADA"
          ? { bolhasIdx: _audB1.bolhas_reprovadas ?? [], trechos: _audB1.afirmacoes_sem_suporte ?? [] }
          : null;

        // Auditoria persistente — Theus revisa amostras e calibra o limiar.
        try {
          await supabase.from("auditoria_groundedness").insert({
            tenant_id,
            conversa_id,
            bolha_indice: 0,
            texto_bolha: resposta_final.slice(0, 2000),
            blocos_citados: _audB1.blocos_que_sustentam,
            blocos_recuperados: _blocosB1.map((b) => b.id),
            veredito_auditor: _audB1.veredito,
            motivo_reprovacao: _audB1.veredito === "REPROVADA"
              ? `${_audB1.motivo} | sem suporte: ${_audB1.afirmacoes_sem_suporte.join(" · ")}`.slice(0, 1000)
              : null,
            rounds_executados: 1,
            modelo_auditor: _audB1.modelo,
            latencia_auditor_ms: _audB1.latencia_ms,
            custo_tokens_in: _audB1.tokens_in,
            custo_tokens_out: _audB1.tokens_out,
          });
        } catch (_eAud) { /* ignora — não derruba turno */ }

        // ── Cirurgia por bolha (2026-06-11): corta SÓ as bolhas reprovadas; as com fonte saem. ──
        // Teste 1 puro (agente tropeçou numa frase) com sobreviventes → entrega as aprovadas e
        // segue o fluxo normal. Tropeço interno NUNCA vira pergunta pro dono — só corte de frase.
        // O ramo mentor (abaixo) roda apenas quando o LEAD pediu fato sem fonte (lacuna_cobertura)
        // ou quando não sobrou nenhuma bolha aproveitável.
        if (_audB1.rodou_auditor && _audB1.veredito === "REPROVADA") {
          const _idxReprovadasB1 = new Set(_audB1.bolhas_reprovadas ?? []);
          // Órfãs da cirurgia (2026-09-11, Verifik conv 853a66a7): quando o auditor corta a bolha
          // com a lista, sobram a introdução ("Basicamente, você consegue:") e a pergunta de
          // fechamento ("Qual dessas funções você mais vai usar?") — o lead lê como mensagem
          // quebrada ("consigo oq? não falou") e a agente ainda pede desculpa pela "falha no envio"
          // no turno seguinte, com o mesmo buraco. Regra: introdução que termina em ":" logo
          // antes de uma bolha cortada cai junto; e se o que sobrou é só pergunta/desculpa,
          // sem afirmação nenhuma, não é cirurgia — é lacuna, e segue pro ramo de curiosidade.
          if (_idxReprovadasB1.size > 0) {
            for (let i = 0; i < bolhasFinais.length; i++) {
              if (_idxReprovadasB1.has(i)) continue;
              const _t = bolhasFinais[i].trim();
              const _introDeLista = /[:：]\s*$/.test(_t) && _idxReprovadasB1.has(i + 1);
              const _soDesculpa = /^(pe[çc]o (sinceras )?desculpas?|desculp[ae]|me desculp[ae])/i.test(_t) && _t.length < 140;
              if (_introDeLista || _soDesculpa) _idxReprovadasB1.add(i);
            }
          }
          const _bolhasAprovadasB1 = _idxReprovadasB1.size > 0 ? bolhasFinais.filter((_, i) => !_idxReprovadasB1.has(i)) : [];
          const _blocosAprovadosB1 = _idxReprovadasB1.size > 0 ? _blocosPorBolha.filter((_, i) => !_idxReprovadasB1.has(i)) : [];
          const _sobrouSoPergunta = _bolhasAprovadasB1.length > 0 &&
            _bolhasAprovadasB1.every((b) => /\?\s*$/.test(b.trim()));
          if (!_audB1.lacuna_cobertura && _bolhasAprovadasB1.length > 0 && !_sobrouSoPergunta) {
            console.warn(`[gate_b1] cirurgia: ${_idxReprovadasB1.size} bolha(s) sem fonte cortada(s), ${_bolhasAprovadasB1.length} entregue(s) — sem mentor`);
            bolhasFinais = _bolhasAprovadasB1;
            _blocosPorBolha = _blocosAprovadosB1;
            resposta_final = bolhasFinais.join("\n\n");
            // Δ reconciliação 2026-09-24: a cirurgia já removeu TODAS as bolhas reprovadas
            // (pelo índice original). `bolhas_reprovadas` agora estaria desalinhado com o
            // array filtrado: no veto final, posição nova N comparada com índice OLD derrubaria
            // bolha aprovada legítima (falso silêncio + alerta falso ao dono). A rede anti
            // duplicado vira a checagem POR CONTEÚDO (afirmacoes_sem_suporte) — mais forte aqui.
            if (_reprovadosB1) _reprovadosB1.bolhasIdx = [];
            try {
              await supabase.from("traces").insert({
                tenant_id, conversa_id, agente_id, tipo: "sintese", modelo_llm: "ragentic/gate_b1",
                decisao: { ferramenta: "cirurgia_b1", bolhas_cortadas: [..._idxReprovadasB1], motivo_auditor: _audB1.motivo },
              });
            } catch (_e) { /* trace opcional */ }
          } else if (ehTokenProativo) {
            // Turno proativo reprovado por inteiro: silêncio (não há pergunta do lead pra virar
            // lacuna, e bolha-compromisso "vou confirmar com a equipe" do nada soaria estranha).
            console.warn(`[gate_b1] REPROVADA em turno proativo → silêncio (${_audB1.motivo})`);
            bolhasFinais = [];
            _blocosPorBolha = [];
            resposta_final = "";
            try {
              await supabase.from("traces").insert({
                tenant_id, conversa_id, agente_id, tipo: "sintese_vazia_silencio",
                decisao: { motivo: "b1_reprovou_proativo", detalhe: String(_audB1.motivo ?? "").slice(0, 300) },
              });
            } catch { /* trace opcional */ }
          } else {
          console.warn(`[gate_b1] REPROVADA — ${_audB1.motivo} | lead pediu fato sem fonte → fluxo de curiosidade`);
          // Single-flight: se já chegou msg nova, esta execução pode ter sido auditada contra
          // fontes do turno errado (caso Dantas). NÃO abre lacuna nem solta bolha — lead →
          // rebuffer (execução nova decide); dono manual → morre quieta.
          {
            const _msgNova = await houveMsgNova();
            if (_msgNova) return await abortarSuperseded("lacuna_b1", _msgNova);
          }

          // F2 (2026-06-03): o B1 deixa de soltar bolha robô + pergunta crua. Em vez disso,
          // 1 chamada no tom do agente decide {vale_perguntar, pergunta_para_dono, bolha_para_lead}:
          //  - vale  → registra lacuna com a pergunta FORMULADA + bolha no tom (compromisso de retorno)
          //  - !vale → recusa educada no tom, sem poluir o dono (absorve o classificador de relevância)
          //  - chamada falhou → fallback caminho velho (criarLacunaParaMentor, bolha fixa) = rede de segurança
          const { registrarPerguntaConsciente, formularPerguntaEbolha, criarLacunaParaMentor } =
            await import("../_shared/loop-mentor.ts");

          const _ctxHistB1 = (historico as Array<{ role: string; content: string | null }>)
            .slice(-4)
            .map((m) => `${m.role}: ${typeof m.content === "string" ? m.content.slice(0, 300) : ""}`)
            .join("\n")
            .slice(0, 1500);

          const _decB1 = await formularPerguntaEbolha(supabase, {
            tenantId: tenant_id,
            agenteNome: (agente.nome_agente as string) ?? "atendente",
            tomAgente: (agente.tom_agente as string | null) ?? null,
            mensagemLead: String(mensagemEfetiva ?? ""),
            motivoReprovacao: _audB1.motivo ?? "",
            afirmacoesSemSuporte: _audB1.afirmacoes_sem_suporte ?? [],
            historicoResumido: _ctxHistB1,
            escopoAgente: escopoAgenteLacuna,
          });

          let _bolhaB1: string;
          let _perguntaIdB1: string | null = null;
          let _foiPergunta: boolean;

          if (_decB1) {
            _foiPergunta = _decB1.vale_perguntar && _decB1.pergunta_para_dono.trim().length > 0;
            _bolhaB1 = _decB1.bolha_para_lead.trim() ||
              "Deixa eu confirmar isso certinho com a equipe e já te retorno, tá?";
            if (_foiPergunta) {
              // Dedup semântico (2026-06-11): embeda a pergunta e compara com as do tenant.
              // Já respondida parecida → entrega a resposta do dono AGORA (sem lacuna nova);
              // aberta parecida → soma ocorrência (sem duplicar o painel).
              const _vetorPerguntaB1 = await gerarEmbeddingQuery(supabase, _decB1.pergunta_para_dono).catch(() => null);
              const _reg = await registrarPerguntaConsciente(supabase, {
                tenantId: tenant_id,
                conversaId: conversa_id!,
                leadId: conv?.lead_id ?? null,
                agenteId: agente_id ?? null,
                perguntaFormulada: _decB1.pergunta_para_dono,
                contextoResumido: _ctxHistB1,
                vetorSemantico: _vetorPerguntaB1,
              });
              _perguntaIdB1 = _reg.pergunta_id;
              if (_reg.resposta_existente) {
                // O dono JÁ respondeu isso antes — conhecimento vira resposta na hora.
                _bolhaB1 = _reg.resposta_existente.slice(0, 900);
                _foiPergunta = false;
                _perguntaIdB1 = null;
              } else if (!_perguntaIdB1) {
                // Invariante promessa↔lacuna (2026-06-11): a lacuna NÃO foi gravada → o lead
                // não pode ouvir promessa de retorno que ninguém vai cumprir. Condução neutra.
                _bolhaB1 = "Essa parte específica eu prefiro confirmar direitinho antes de te afirmar. Posso te ajudar com o restante enquanto isso?";
                _foiPergunta = false;
              }
            }
          } else {
            // Fallback: a chamada falhou → caminho velho (bolha fixa + classificador interno)
            const _lacB1 = await criarLacunaParaMentor(supabase, {
              tenantId: tenant_id,
              conversaId: conversa_id!,
              leadId: conv?.lead_id ?? null,
              agenteId: agente_id ?? null,
              perguntaOriginalLead: String(mensagemEfetiva ?? ""),
              contextoResumido: _ctxHistB1,
              nichoNome: nichoNomeLacuna,
              escopoAgente: escopoAgenteLacuna,
            });
            _bolhaB1 = _lacB1.bolha_fixa_para_lead;
            _perguntaIdB1 = _lacB1.pergunta_id;
            _foiPergunta = _lacB1.foi_pro_mentor;
            // Invariante promessa↔lacuna vale também no fallback: sem lacuna gravada, sem promessa.
            if (_foiPergunta && !_perguntaIdB1) {
              _bolhaB1 = "Essa parte específica eu prefiro confirmar direitinho antes de te afirmar. Posso te ajudar com o restante enquanto isso?";
              _foiPergunta = false;
            }
          }

          const _modoB1 = _foiPergunta ? "fallback_mentor_gate_b1" : "recusa_fora_escopo_b1";

          // Cirurgia (2026-06-11): bolhas COM fonte saem antes da bolha de curiosidade —
          // o lead recebe o que tem resposta + o compromisso só do pedaço descoberto.
          //
          // Δ 2026-09-09: esta entrega passa pelo MESMO saneamento de forma do caminho normal.
          // Ela é montada aqui do zero e grava direto em `mensagens`/caixa de saída, então
          // escapava do filtro — foi por aqui que "Pedir mais detalhes ao cliente." chegou ao
          // lead às 01:58, já com a regra do infinitivo no ar (trace `recusa_fora_escopo_b1`).
          // Se sobrar nada, sai a bolha padrão de compromisso: silêncio aqui é pior, porque o
          // lead acabou de fazer uma pergunta.
          const _entregaBruta = [..._bolhasAprovadasB1, _bolhaB1];
          const _saneadaB1 = _sanearBolhas(_entregaBruta, _entregaBruta.map(() => []));
          if (_saneadaB1.caiu > 0) {
            console.warn(`[gate_b1] ${_saneadaB1.caiu} bolha(s)-anotação cortada(s) na entrega (conversa=${conversa_id})`);
          }
          const _entregaB1 = _saneadaB1.textos.length > 0
            ? _saneadaB1.textos
            : ["Deixa eu confirmar essa parte direitinho pra não te passar nada errado — já te retorno."];

          // Δ 2026-09-24 (item 3): este ramo enfileira DIRETO em `mensagens`/caixa_saida — passava
          // por fora do fluxo final. Mesmo veto da entrega final, aqui na fonte: bolha que ainda
          // carrega trecho reprovado (a cirurgia cortou pelo índice, mas a MESMA afirmação pode ter
          // sobrado duplicada numa bolha NÃO listada pelo auditor) não sai. Vetou tudo → silêncio
          // real (padrão do resto do motor) + aviso ao dono — a pergunta já foi pra ele, então o
          // lead fica sem resposta e o dono é quem destrava.
          const _silenciadoB1 = await (async () => {
            // Δ reconciliação 2026-09-24: `_entregaB1` é remontado (sobreviventes comprimidos +
            // bolha do mentor) — índice original de `bolhas_reprovadas` não mapeia mais. Sempre
            // rede por CONTEÚDO aqui; checar por índice derrubaria a promessa/sobrevivente errado.
            if (_reprovadosB1) _reprovadosB1.bolhasIdx = [];
            const _vetoB1 = vetarTrechosReprovadosB1(_entregaB1, _entregaB1.map(() => []), _reprovadosB1);
            if (_vetoB1.vetou && _vetoB1.textos.length === 0) {
              console.warn(`[gate_b1] VETO no ramo de curiosidade — entrega bloqueada por auditoria (conversa=${conversa_id})`);
              try {
                await supabase.from("traces").insert({
                  tenant_id, conversa_id, agente_id, tipo: "sintese_vazia_silencio",
                  decisao: { motivo: "b1_veto_entrega", proativo: ehTokenProativo, pergunta_id: _perguntaIdB1 },
                });
              } catch { /* trace opcional */ }
              await avisarDonoBloqueioAuditoria(tenant_id, conversa_id, String(mensagemEfetiva ?? "").slice(0, 300));
            } else if (_vetoB1.vetou) {
              console.warn(`[gate_b1] VETO no ramo de curiosidade: ${_entregaB1.length - _vetoB1.textos.length} bolha(s) com trecho reprovado removida(s) (conversa=${conversa_id})`);
            }
            if (_vetoB1.vetou && _vetoB1.textos.length > 0) _entregaB1.splice(0, _entregaB1.length, ..._vetoB1.textos);
            return _vetoB1.vetou && _vetoB1.textos.length === 0;
          })();

          // Bolha pro lead: modo_teste → grava em `mensagens` (Chat de Teste lê daqui);
          // prod → enfileira em caixa_saida_mensagens (process-followups → Z-API). Veto total = nada.
          if (!_silenciadoB1 && modo_teste) {
            await supabase.from("mensagens").insert(_entregaB1.map((c) => ({
              conversation_id: conversa_id,
              role: "assistant",
              content: c,
            })));
          } else if (!_silenciadoB1) {
            try {
              const _t0B1 = Date.now();
              for (let i = 0; i < _entregaB1.length; i++) {
                await enfileirarBolha({
                  tenant_id,
                  conversation_id: conversa_id!,
                  content: _entregaB1[i],
                  ordem: i,
                  t0_ms: _t0B1,
                  gerada_ate: typeof corte_em === "string" ? corte_em : null,
                });
              }
            } catch (_eBolhaB1) { /* ignora */ }
          }

          try {
            await supabase.from("traces").insert({
              tenant_id, conversa_id, agente_id,
              tipo: "sintese",
              modelo_llm: "ragentic/gate_b1",
              decisao: {
                ferramenta: _modoB1,
                via: _decB1 ? "agente_formulou" : "fallback_bolha_fixa",
                vale_perguntar: _decB1?.vale_perguntar ?? null,
                veredito: _audB1.veredito,
                motivo_auditor: _audB1.motivo,
                afirmacoes_sem_suporte: _audB1.afirmacoes_sem_suporte,
                blocos_que_sustentam: _audB1.blocos_que_sustentam,
                pergunta_id: _perguntaIdB1,
                pergunta_formulada: _decB1?.pergunta_para_dono ?? null,
                resposta_descartada: resposta_final.slice(0, 200),
              },
              latencia_ms: _audB1.latencia_ms,
              custo_tokens_in: _audB1.tokens_in,
              custo_tokens_out: _audB1.tokens_out,
            });
          } catch (_eTraceB1) { /* ignora */ }

          // F0: o Gate B1 reprova o TEXTO, mas o link JÁ EXISTE no banco — precisa chegar
          // mesmo assim (acompanhado de 1 bolha de contexto pra URL não ir seca).
          if (linkPlataformaTurno) {
            const _ctxLink = rotuloDoLink(linkPlataformaTurno.link);
            if (modo_teste) {
              await supabase.from("mensagens").insert([
                { conversation_id: conversa_id, role: "assistant", content: _ctxLink },
                { conversation_id: conversa_id, role: "assistant", content: linkPlataformaTurno.link },
              ]);
            } else {
              try {
                await enfileirarBolha({
                  tenant_id, conversation_id: conversa_id!, content: _ctxLink,
                  ordem: _entregaB1.length, t0_ms: Date.now(), gerada_ate: null,
                });
                await enfileirarBolhaLinkContrato({
                  tenant_id, conversation_id: conversa_id!,
                  link: linkPlataformaTurno.link, contrato_id: linkPlataformaTurno.contrato_id,
                  ordem: _entregaB1.length + 1, t0_ms: Date.now() + 1000,
                });
              } catch (_eLinkB1) { /* best-effort — sweep safety-net cobre */ }
            }
          }

          return jsonResp({
            ok: true,
            modo: _modoB1,
            pergunta_id: _perguntaIdB1,
            // Δ 2026-09-24 (item 3): veto total → reply vazio (silêncio real), sem enfileirar nada.
            reply: _silenciadoB1 ? "" : _entregaB1.join("\n\n"),
            mensagens: modo_teste
              ? (_silenciadoB1
                  ? (linkPlataformaTurno ? [rotuloDoLink(linkPlataformaTurno.link), linkPlataformaTurno.link] : [])
                  : (linkPlataformaTurno ? [..._entregaB1, rotuloDoLink(linkPlataformaTurno.link), linkPlataformaTurno.link] : _entregaB1))
              : [],
            conversation_id: conversa_id,
          }, 200);
          } // fim do ramo curiosidade (lacuna_cobertura ou zero bolha aproveitável)
        }
      } catch (_eB1) {
        console.warn("[gate_b1] erro — mantém resposta original:", (_eB1 as Error).message);
        // Δ 2026-09-24 (item 3): fail-open de RESPOSTA mantido (não derruba o turno), mas o
        // incidente vira marcador rastreável. Mesmas colunas do insert feliz (L3680+); o valor
        // `veredito_auditor` respeita o CHECK constraint (APROVADA/REPROVADA/RETRY_APROVADA/
        // FALLBACK_MENTOR) — o marcador "auditoria_indisponivel" vai no `motivo_reprovacao`.
        try {
          await supabase.from("auditoria_groundedness").insert({
            tenant_id,
            conversa_id,
            bolha_indice: 0,
            texto_bolha: String(resposta_final ?? "").slice(0, 2000),
            blocos_citados: [],
            blocos_recuperados: (blocosContexto as any[]).map((b) => String(b.id)),
            veredito_auditor: "APROVADA",
            motivo_reprovacao: `auditoria_indisponivel: ${String((_eB1 as Error).message).slice(0, 900)}`,
            rounds_executados: 1,
            modelo_auditor: "erro",
            latencia_auditor_ms: 0,
            custo_tokens_in: 0,
            custo_tokens_out: 0,
          });
        } catch (_ePers) { /* persistir é best-effort — nunca derruba o turno */ }
      }
    }

    // Síntese vazia = SILÊNCIO real (fix "(processando)" 2026-06-11): zero bolha pro lead.
    // Side-effects legítimos continuam: link de contrato determinístico (F0) abaixo,
    // agendamento via pensamento estruturado, traces e dossiê.
    if (_sinteseVazia && bolhasFinais.length === 1 && ["(processando)", "(sem resposta)"].includes(bolhasFinais[0])) {
      bolhasFinais = [];
      _blocosPorBolha = [];
      try {
        await supabase.from("traces").insert({
          tenant_id,
          conversa_id,
          agente_id,
          tipo: "sintese_vazia_silencio",
          decisao: { motivo: "llm_sem_bolha", proativo: ehTokenProativo },
        });
      } catch { /* trace é best-effort — nunca derruba o turno */ }
    }

    // ── Cérebro único: retomada ENGATILHADA (2026-06-13) ──
    // O motor gera a fala agora (1x), mas a bolha de retomada sai no horário que o AGENTE escolheu
    // (quando_voltar, via RAG). A peça de saída (outbox-consumer) já respeita scheduled_at: a bolha
    // fica pendente na caixa até a hora. Só engatilha pro FUTURO (>30min); senão sai já.
    let _agendarRetomada: string | null = null;
    if (ehTokenProativo && tokenSemColchetes.startsWith("TRIGGER_TEMPORAL_") && bolhasFinais.length > 0) {
      const _cu = (Deno.env.get("USAR_RETOMADA_CEREBRO_UNICO") ?? "true") !== "false"
        // deno-lint-ignore no-explicit-any
        || (body as any)?.cerebro_unico === true;
      // GATE DE DESISTÊNCIA: bateu o limite (config do tenant, default 3) → não retoma mais,
      // marca lead 'desistiu', desliga agente. Roda ANTES de engatilhar a retomada.
      if (_cu && conversa_id) {
        try {
          const { verificarDesistenciaELimite } = await import("../_shared/desistencia-guard.ts");
          // deno-lint-ignore no-explicit-any
          const _des = await verificarDesistenciaELimite(supabase as any, conversa_id, conv?.lead_id ?? null, agente_id ?? "");
          if (_des.desistiu) {
            bolhasFinais = [];
            _blocosPorBolha = [];
            await supabase.from("traces").insert({
              tenant_id, conversa_id, agente_id, tipo: "sintese_vazia_silencio",
              decisao: { motivo: "desistencia_cerebro_unico", retomadas: _des.retomadas, limite: _des.limite },
            });
          }
        } catch (_eDes) { /* fail-open: não trava a retomada */ }
      }
      const _qv = pensamentoEstrut?.quando_voltar;
      if (_cu && bolhasFinais.length > 0 && typeof _qv === "string" && _qv.trim() && _qv.trim().toLowerCase() !== "null") {
        const _raw = _qv.trim().replace(" ", "T");
        const _temFuso = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(_raw);
        const _norm = _temFuso ? _raw : (/T\d{2}:\d{2}$/.test(_raw) ? `${_raw}:00-03:00` : `${_raw}-03:00`);
        const _alvo = new Date(_norm);
        // cerca física: máx 96h à frente (não engatilha pra semana que vem por erro da LLM)
        if (!isNaN(_alvo.getTime()) && _alvo.getTime() > Date.now() + 1800_000 && _alvo.getTime() < Date.now() + 96 * 3600_000) {
          _agendarRetomada = _alvo.toISOString();
        }
      }
      try {
        await supabase.from("traces").insert({
          tenant_id, conversa_id, agente_id, tipo: "porteiro",
          decisao: { tipo: "retomada_engatilhada", sai_em: _agendarRetomada ?? "agora", quando_voltar: _qv ?? null },
        });
      } catch { /* trace best-effort */ }
    }

    // Guards de link de contrato NA ORIGEM (2026-09-05). Os mesmos dois guards do
    // `outbox-consumer` (link inventado · placeholder não resolvido), agora aplicados onde
    // a bolha NASCE em vez de só onde ela é despachada.
    //
    // Motivo: o outbox não é o único caminho de saída. Canal `teste` (modo_teste) grava
    // direto em `mensagens` e nunca passa pelo consumidor — foi por aí que
    // "[Link do Contrato]" apareceu inteiro na conversa f96a5c5b. Barrando aqui, qualquer
    // canal fica coberto, e a bolha suja também deixa de virar histórico (que envenena o
    // contexto dos turnos seguintes e a ficha do lead).
    //
    // Derruba só a bolha ofensora, não o turno: o resto da fala é legítimo, e quando a
    // tool tiver mesmo devolvido link o carteiro F0 logo abaixo entrega a URL de verdade.
    {
      const _bolhasLimpas: string[] = [];
      const _blocosLimpos: string[][] = [];
      for (let i = 0; i < bolhasFinais.length; i++) {
        const _b = bolhasFinais[i];
        const _motivo = temLinkContratoFantasma(_b)
          ? "link_contrato_fantasma"
          : temPlaceholderNaoResolvido(_b)
          ? "placeholder_nao_resolvido"
          : null;
        if (!_motivo) {
          _bolhasLimpas.push(_b);
          _blocosLimpos.push(_blocosPorBolha[i] ?? []);
          continue;
        }
        console.error(
          `[bolha barrada na origem] conv ${conversa_id}: ${_motivo} — ${_b.slice(0, 200)}`,
        );
        try {
          await supabase.from("traces").insert({
            tenant_id, conversa_id, agente_id, tipo: "sintese", modelo_llm: MODELO_SINTESE,
            decisao: {
              origem: "guard_link_contrato_na_origem",
              motivo: _motivo,
              bolha: _b.slice(0, 300),
              tool_alvo_porteiro: toolAlvoPorteiro,
              tool_alvo_entregou: resumoToolAlvo(toolAlvoPorteiro, desfechosToolsTurno).entregou,
            },
          });
        } catch { /* trace best-effort */ }
      }
      bolhasFinais = _bolhasLimpas;
      _blocosPorBolha = _blocosLimpos;
    }

    // Guard de chave PIX NA ORIGEM (2026-09-11). A Naty (Easy) mandou
    // "[Chave PIX: 12.345.678/0001-99 - Easy Soluções Financeiras]" — CNPJ de exemplo
    // inventado pelo modelo, porque o bloco com a chave real não entrou no recall do turno
    // ("sim" do lead não puxa "chave pix"). Dinheiro indo pra conta errada é o pior defeito
    // possível, então toda bolha que fala de PIX/chave e traz algo com cara de chave é
    // conferida contra as chaves cadastradas do tenant: chave estranha vira a cadastrada
    // (quando o tenant tem uma só) ou a bolha cai (sem chave cadastrada / várias).
    // Só consulta o banco quando alguma bolha fala de pix/chave — turno comum não paga nada.
    if (bolhasFinais.some((b) => RE_FALA_PIX.test(b))) {
      const _pix = await carregarChavesPixTenant(supabase, tenant_id);
      const _bolhasPix: string[] = [];
      const _blocosPix: string[][] = [];
      for (let i = 0; i < bolhasFinais.length; i++) {
        const _b = bolhasFinais[i];
        // A chave vai SOZINHA numa bolha (formato que os blocos de pagamento mandam usar, pra
        // o lead copiar de uma vez) — essa bolha não tem a palavra "pix" dentro dela, então o
        // guard precisa saber que a bolha anterior falava de PIX pra conferi-la também.
        const _ctxPix = i > 0 && RE_FALA_PIX.test(bolhasFinais[i - 1]);
        const _r = conferirChavePix(_b, _pix.chaves, _pix.exibicao ?? undefined, { contextoPix: _ctxPix });
        if (_r.acao === "ok") {
          _bolhasPix.push(_b);
          _blocosPix.push(_blocosPorBolha[i] ?? []);
          continue;
        }
        if (_r.acao === "trocada") {
          _bolhasPix.push(_r.bolha);
          _blocosPix.push(_blocosPorBolha[i] ?? []);
        }
        console.error(
          `[chave pix ${_r.acao} na origem] conv ${conversa_id}: ${_r.de.join(", ")} — ${_b.slice(0, 200)}`,
        );
        try {
          await supabase.from("traces").insert({
            tenant_id, conversa_id, agente_id, tipo: "sintese", modelo_llm: MODELO_SINTESE,
            decisao: {
              origem: "guard_chave_pix_na_origem",
              acao: _r.acao,
              motivo: _r.acao === "derrubada" ? _r.motivo : null,
              chaves_invalidas: _r.de,
              chave_usada: _r.acao === "trocada" ? _r.para : null,
              bolha: _b.slice(0, 300),
            },
          });
        } catch { /* trace best-effort */ }
      }
      bolhasFinais = _bolhasPix;
      _blocosPorBolha = _blocosPix;
    }

    // ── Veto B1 na entrega final (Δ 2026-09-24, item 3 auditoria) ──
    // Rede de segurança da cirurgia na ÚLTIMA porta antes da caixa de saída. Se um trecho
    // reprovado sobreviveu (ex.: a cirurgia cortou a bolha pelo índice, mas a MESMA afirmação
    // estava duplicada numa bolha NÃO listada pelo auditor — provável causa dos 3/40), o braço
    // contaminado não enfileira. Vetou TUDO → silêncio real (mesmo padrão da síntese vazia):
    // side-effects legítimos seguem (trace, F0, agendamento, dossiê) + aviso ao dono (1×/dia).
    {
      const _veto = vetarTrechosReprovadosB1(bolhasFinais, _blocosPorBolha, _reprovadosB1);
      if (_veto.vetou && _veto.textos.length === 0) {
        console.warn(`[gate_b1] VETO na entrega final — resposta bloqueada por auditoria (conversa=${conversa_id})`);
        bolhasFinais = [];
        _blocosPorBolha = [];
        try {
          await supabase.from("traces").insert({
            tenant_id, conversa_id, agente_id, tipo: "sintese_vazia_silencio",
            decisao: { motivo: "b1_veto_entrega", proativo: ehTokenProativo },
          });
        } catch { /* trace opcional */ }
        await avisarDonoBloqueioAuditoria(tenant_id, conversa_id, String(mensagemEfetiva ?? "").slice(0, 300));
      } else if (_veto.vetou) {
        console.warn(`[gate_b1] VETO na entrega final: ${bolhasFinais.length - _veto.textos.length} bolha(s) com trecho reprovado removida(s) (conversa=${conversa_id})`);
        bolhasFinais = _veto.textos;
        _blocosPorBolha = _veto.blocos;
        resposta_final = bolhasFinais.length > 0 ? bolhasFinais.join("\n\n") : "";
      }
    }

    // Enfileirar bolhas em caixa_saida_mensagens (process-followups vai despachar com delay humanizado).
    // modo_teste pula: Chat de Teste recebe bolhas direto no response HTTP, sem disparar Z-API —
    // mas grava as bolhas em `mensagens` direto pra alimentar histórico do sidebar.
    if (modo_teste) {
      for (let i = 0; i < bolhasFinais.length; i++) {
        await supabase.from("mensagens").insert({
          conversation_id: conversa_id,
          role: "assistant",
          content: bolhasFinais[i],
          // RAG-first B1: blocos que fundamentam ESTA bolha (citação [N] parseada). null = bolha sem fato ancorado.
          blocos_acionados: _blocosPorBolha[i]?.length ? _blocosPorBolha[i] : null,
        });
      }
    } else {
      // Single-flight: última checagem antes de falar — msg nova durante a geração →
      // descarta tudo; lead → rebuffer (a execução nova cobre o contexto inteiro),
      // dono manual → silêncio (humano assumiu o turno).
      {
        const _msgNova = await houveMsgNova();
        if (_msgNova) return await abortarSuperseded("enfileirar_bolhas", _msgNova);
      }
      const t0 = Date.now();
      for (let i = 0; i < bolhasFinais.length; i++) {
        await enfileirarBolha({
          tenant_id,
          conversation_id: conversa_id,
          content: bolhasFinais[i],
          ordem: i,
          t0_ms: t0,
          gerada_ate: typeof corte_em === "string" ? corte_em : null,
          // RAG-first B1: blocos que fundamentam ESTA bolha (citação [N] parseada). Webhook reconcilia com eco fromMe.
          blocos_acionados: _blocosPorBolha[i]?.length ? _blocosPorBolha[i] : null,
          // Retomada engatilhada: sai no horário que o agente escolheu (null = sai agora).
          agendar_para: _agendarRetomada,
        });
      }
    }

    // F0 universal (carteiro): entrega determinística de QUALQUER link da plataforma.
    // Tool devolveu link e NENHUMA bolha do LLM contém a URL → o motor entrega
    // por conta própria (bolha inviolável). Fim do "já enviei" sem link.
    if (linkPlataformaTurno && !bolhasFinais.some((b) => b.includes(linkPlataformaTurno!.link))) {
      if (modo_teste) {
        await supabase.from("mensagens").insert({
          conversation_id: conversa_id,
          role: "assistant",
          content: linkPlataformaTurno.link,
        });
        bolhasFinais.push(linkPlataformaTurno.link);
      } else {
        try {
          await enfileirarBolhaLinkContrato({
            tenant_id,
            conversation_id: conversa_id,
            link: linkPlataformaTurno.link,
            contrato_id: linkPlataformaTurno.contrato_id,
            ordem: bolhasFinais.length,
            t0_ms: Date.now(),
          });
        } catch (eLink) {
          console.warn("[link_plataforma] enfileirar bolha-do-link falhou:", (eLink as Error).message);
        }
      }
    }

    // Trace de síntese
    await supabase.from("traces").insert({
      tenant_id,
      conversa_id,
      agente_id,
      tipo: "sintese",
      modelo_llm: MODELO_SINTESE,
      decisao: {
        resposta_preview: resposta_final.slice(0, 200),
        tools_usadas,
        cargo: cargoAlvo,
        bolhas: bolhasFinais.length,
        // DEC-038: auditoria do roteamento de tool_choice — debug fácil quando
        // analista quiser saber se o intent do Porteiro virou força de tool real.
        tool_alvo_porteiro: toolAlvoPorteiro,
        confianca_tool: confTool,
        tool_choice_forcada: toolChoiceForcada?.function?.name ?? null,
        // Retomada da tool_alvo (2026-09-05): quantas vezes ela foi re-forçada depois de
        // recusar, e se no fim entregou. `recusou && !entregou` = turno que teria virado
        // placeholder no modelo antigo.
        tool_alvo_reforcos: reforcosToolAlvo,
        tool_alvo_recusou: resumoToolAlvo(toolAlvoPorteiro, desfechosToolsTurno).recusou,
        tool_alvo_entregou: resumoToolAlvo(toolAlvoPorteiro, desfechosToolsTurno).entregou,
      },
      latencia_ms: total_lat,
      custo_tokens_in: total_in,
      custo_tokens_out: total_out,
    });

    // Snapshot do System Prompt deste turno — fonte do visualizador "cérebro" + Curadoria admin.
    // Aditivo e defensivo: qualquer falha aqui NUNCA derruba o turno (motor crítico, todos os tenants).
    try {
      await supabase.from("prompts_turno").insert({
        tenant_id,
        conversa_id,
        agente_id,
        lead_id: conv?.lead_id ?? null,
        modelo_llm: MODELO_SINTESE,
        prompt_completo: sistema,
        blocos: {
          temporal: blocoTemporal,
          rifa_do_dia: blocoRifaDoDia,
          pacotes_fixos: blocoPacotesFixos,
          conversa_padrao: blocoConversaPadrao,
          pacotes_relevantes: trechoPacotes,
          identidade: blocoIdentidade,
          bussola: blocoBussola,
          diretrizes: blocoDiretrizesCargo,
          empatia: blocoEmpatia,
          humor: blocoHumorRelacao,
          comportamento: blocoComportamento,
          crenca: blocoCrenca,
          fatos: blocoFatos,
          ficha: blocoFicha,
          sinais: blocoSinais,
          episodios: blocoEpisodios,
          pensamento: blocoPensamento,
          ema: blocoEMA,
          rag: trechoRag,
          proativo: ehTokenProativo,
        },
      });
    } catch (ePrompt) {
      console.warn(
        `[prompts_turno] falha ao gravar snapshot do prompt: ${(ePrompt as Error).message}`,
      );
    }

    // ── Conectar dossiê (briefing 2026-05-13 §6.11 + §8.7 + §1265) ──
    // 1. `intencoes_pendentes` — Sistema 2 visível no Card "Pensamento estruturado"
    // 2. **Sistema 1 Extrator** — extrai `cargos.campos_rastreio` da fala do lead
    //    pra `leads.dados_ficha` (Prancheta) + sugere tags (`leads.tags`)
    // 3. `crenca_conversa.belief` — working memory persistente (mais abaixo)

    // ── Sistema 1 Extrator: campos_rastreio do cargo + tags inferidas ──
    // Roda só quando msg do lead REAL (não token proativo) E cargo tem template.
    // deno-lint-ignore no-explicit-any
    let extraidoFinal: Record<string, unknown> = {};
    let tagsSugeridasFinal: string[] = [];
    // A1+A6 métricas (escopo amplo pra serem usadas depois em intencoes_pendentes + trace HTTP)
    let fatosNovosGravados = 0;
    let fatosCorroboradosTotal = 0;
    let camposDescartadosAlucinacao = 0;
    // v60: içados pro escopo do handler (o return modo_teste lê após await do pós-turno)
    let scoreLead = 0;
    let coberturaPrancheta = 0;

    // v60 (DEC-036): pós-turno (3ª LLM memória gemma-4-31b + score + intenções + episódica + crença)
    // empacotado numa closure. Externo → roda em background (EdgeRuntime.waitUntil), edge responde já.
    // modo_teste → await (trace inline completo). Cura o 504 (memória fora da espera do cliente).
    const processarResto = async () => {
    if (!ehTokenProativo && cargoId && conv?.lead_id) {
      // Carrega template do cargo
      const { data: cargoDef } = await supabase
        .from("cargos")
        .select("nome, campos_rastreio")
        .eq("id", cargoId)
        .maybeSingle();
      // Aceita os 2 formatos: array de strings (legado, todos viram obrigatórios) ou
      // array de { chave, descricao, obrigatorio } (formato oficial Ragentic).
      // Sem este normalizador, o extrator nunca rodava em cargos novos — Prancheta vazia eternamente.
      type CampoCargoEdge = { chave: string; descricao?: string; obrigatorio: boolean };
      const camposObj: CampoCargoEdge[] = Array.isArray(cargoDef?.campos_rastreio)
        ? (cargoDef!.campos_rastreio as unknown[])
            .map((x): CampoCargoEdge | null => {
              if (typeof x === "string" && x.length > 0) {
                return { chave: x, obrigatorio: true };
              }
              if (x && typeof x === "object" && typeof (x as { chave?: unknown }).chave === "string") {
                const o = x as { chave: string; descricao?: unknown; obrigatorio?: unknown };
                return {
                  chave: o.chave,
                  descricao: typeof o.descricao === "string" ? o.descricao : undefined,
                  obrigatorio: o.obrigatorio === false ? false : true,
                };
              }
              return null;
            })
            .filter((x): x is CampoCargoEdge => x !== null)
        : [];
      const camposRastreio: string[] = camposObj.map((c) => c.chave);
      const obrigatoriosObj = camposObj.filter((c) => c.obrigatorio);
      const opcionaisObj = camposObj.filter((c) => !c.obrigatorio);
      const descreveCampo = (c: CampoCargoEdge) =>
        c.descricao ? `${c.chave} (${c.descricao})` : c.chave;
      const listaObrigatorios = obrigatoriosObj.map(descreveCampo).join(", ");
      const listaOpcionais = opcionaisObj.map(descreveCampo).join(", ");

      if (camposRastreio.length > 0) {
        // Histórico curto pra contexto (últimas 8 trocas)
        const dialogoCurto = historico
          .slice(-8)
          .map((h: { role: string; content: string | null }) =>
            `${h.role === "user" ? "lead" : "agente"}: ${(h.content || "").slice(0, 200)}`
          )
          .join("\n");
        const conversaCompleta = `${dialogoCurto}\nlead: ${mensagemEfetiva}\nagente: ${bolhasFinais.join(" ")}`;

        try {
          // Extrator memory-aware (2026-05-30): injeta os fatos JÁ conhecidos do lead pra
          // não re-extrair o mesmo tema com fraseado diferente (redundância de cosine médio
          // que o gate de dedup não pega). Padrão Memori/Mem0: extração consciente da memória.
          let blocoFatosConhecidosPrompt = "FATOS JÁ CONHECIDOS deste lead: (nenhum ainda).";
          try {
            const { data: _fatosConhecidos } = await supabase
              .from("memoria_lead")
              .select("fato, categoria")
              .eq("lead_id", conv.lead_id)
              .eq("ativa", true)
              .order("criado_em", { ascending: false })
              .limit(25);
            if (Array.isArray(_fatosConhecidos) && _fatosConhecidos.length > 0) {
              const _lista = (_fatosConhecidos as Array<{ fato: string; categoria: string }>)
                .map((f) => `- (${f.categoria}) ${f.fato}`).join("\n");
              blocoFatosConhecidosPrompt =
                `FATOS JÁ CONHECIDOS deste lead (de turnos anteriores):

REGRA 1 — NÃO DUPLICAR: não gere um fato que apenas reafirma ou reformula (mesmo assunto, outras palavras) algo da lista abaixo. Se o turno só confirma o que já se sabe, retorne "fatos": [].
REGRA 2 — ATUALIZAR: se um fato novo TORNA OBSOLETO um da lista — o lead mudou de ideia/situação (ex.: antes 'alugar', agora 'comprar') — inclua nesse fato o campo "substitui" com o TEXTO EXATO do fato antigo da lista. Objetivo adicional distinto NÃO substitui (querer carro E apartamento = 2 fatos separados).
REGRA 3 — INÉDITO: só gere fato novo se for informação genuinamente inédita OU acrescentar detalhe relevante (valor, prazo, órgão específico).

` + _lista;
            }
          } catch (_eFc) {
            console.warn("[extrator memory-aware] fatos conhecidos:", (_eFc as Error).message);
          }
          const extResp = await chamarLLM({
            // Decisão arquitetural Theus 2026-05-14: extrator é GEMMA (Sistema 1 — barato/rápido).
            // Síntese é gemini (Sistema 2 — responde ao lead). Não trocar.
            // Prompt foi simplificado + exemplo concreto pra gemma acertar JSON schema rico.
            modelo: (await getConfigChamada(supabase, "porteiro", tenant_id ?? null, null)).modelo,
            temperatura: 0.1,
            max_tokens: 1024,
            json_mode: true,
            mensagens: [
              {
                role: "system",
                content:
                  `Voce e o EXTRATOR Sistema 1 (S1) do Ragentic — agente cognitivo que extrai estrutura de conversas em tempo real.\n` +
                  `Sua funcao e ler a conversa abaixo e devolver JSON com 3 secoes (A, B, C). Voce e S-tier em extracao estruturada — capriche na precisao.\n` +
                  `Foco: precisao acima de tudo. NUNCA invente. Se nao tem certeza, retorne null/[]. Ouro: dado correto. Lixo: dado inventado.\n\n` +

                  `=== SECAO A — CAMPOS DA PRANCHETA DO CARGO ===\n` +
                  `O cargo "${cargoDef?.nome || cargoAlvo}" tem uma prancheta com chaves a preencher. Sua tarefa: preencher cada chave com o valor que o LEAD disse LITERALMENTE no texto. Se nao foi dito (ou voce nao tem certeza absoluta), retorne null.\n\n` +
                  `OBRIGATORIOS (foco primario — tente capturar a cada turno): ${listaObrigatorios || "nenhum"}\n` +
                  (listaOpcionais ? `OPCIONAIS (capture so se aparecer espontaneo na fala): ${listaOpcionais}\n` : "") +
                  `\nPara CADA chave que voce preencher com valor != null, voce DEVE colocar em "campos_evidencia" o trecho EXATO da fala do lead que justifica esse valor. Se nao consegue citar trecho exato, deixe valor=null.\n\n` +

                  `=== SECAO B — TAGS SEMANTICAS DO ESTADO DO LEAD ===\n` +
                  `Tags sao marcadores INFERIDOS pelo agente — NAO precisam de evidencia literal. Sao leitura semantica do estado do lead.\n` +
                  `O agente do proximo turno vai consultar via filter exato (WHERE leads.tags @> ARRAY['perfil:negativado']). Por isso usam NAMESPACE HIERARQUICO obrigatorio.\n` +
                  `Formato: namespace:valor (lowercase + underscore + SEM acento).\n\n` +
                  `MINIMO 3 tags por turno em namespaces VARIADOS, ate 8 tags relevantes. Mesmo em saudacao curta ("oi", "boa tarde") infira: fase:primeiro_contato + sentimento:neutro (ou outro) + prioridade:media (ou outro). Tag aplicada nao precisa estar dita explicitamente pelo lead — eh inferencia legitima do contexto.\n\n` +
                  `Os 8 namespaces validos com seus valores:\n` +
                  `  fase:*       -> qualificado | em_negociacao | proposta_enviada | ganho | perdido | descoberta_preco | apresentacao_concluida | fechamento_iniciado\n` +
                  `                  (em qual fase do funil de vendas o lead esta agora)\n` +
                  `  produto:*    -> slug do produto/servico do tenant que o lead demonstrou interesse (ex: produto:<slug-do-catalogo-do-tenant>). NAO invente produto fora do que o contexto/cargo indicar.\n` +
                  `  perfil:*     -> caracteristica estavel do lead inferida do contexto (ex: perfil:primeiro_contato, perfil:recorrente). Use o termo que o contexto do tenant sugerir — sem catalogo fixo de nicho.\n` +
                  `                  (caracteristica estavel do lead — multiplas podem coexistir)\n` +
                  `  sentimento:* -> resistente | entusiasmado | desconfiante | urgente | ansioso | neutro\n` +
                  `                  (estado emocional detectado neste turno)\n` +
                  `  objecao:*    -> preco | tempo | confianca | ja_tentou_antes | precisa_pensar\n` +
                  `                  (objecao explicita ou implicita do lead)\n` +
                  `  prioridade:* -> alta | media | baixa\n` +
                  `                  (urgencia da operacao para esse lead)\n` +
                  `  historico:*  -> contato_anterior_sem_resposta | proposta_recusada | comprovante_enviado | contrato_assinado\n` +
                  `                  (eventos passados relevantes na relacao)\n` +
                  `  livre:*      -> overflow para casos raros sem namespace cravado (ex: livre:quer_parcelar_em_mais_de_10x)\n\n` +

                  `=== SECAO C — FATOS PERSISTENTES SOBRE O LEAD (memoria_lead) ===\n` +
                  `Fatos sao verdades sobre o LEAD que valem em conversas FUTURAS. Sao a memoria semantica longa do agente.\n` +
                  `O cron de destilacao 06h UTC consolida estes fatos. Voce escreve em real-time pra evitar lag de 24h.\n\n` +
                  `REGRAS CRAVADAS para fato persistente:\n` +
                  `  1. Maximo 3 fatos NOVOS por turno (qualidade > quantidade).\n` +
                  `  2. So inclua fatos com confianca >= 0.6 (escala 0-1). Em CADA fato inclua tambem valencia_emocional (numero 0..1): carga emocional do fato pra o lead. 0 = neutro (mora em SP, tem CNPJ). 0.4-0.6 = alguma carga (sonha com a casa propria). 0.8-1 = muito carregado (o cachorro morreu, medo de perder a casa). Fato emocional e lembrado mais forte meses depois; na duvida use 0.\n` +
                  `  3. Fato persistente != campo de prancheta != tag. Distincao critica:\n` +
                  `     - Campo prancheta = chave-valor especifico do CARGO atual ("esta_negativado: sim").\n` +
                  `     - Tag = marcador semantico de estado momentaneo ("perfil:negativado").\n` +
                  `     - Fato persistente = frase narrativa completa que faz sentido fora do cargo ("Esta negativado no Serasa ha 6 meses").\n` +
                  `  4. categoria DEVE ser uma destas 5 (constraint do banco): fato_biografico | fato_financeiro | objecao | interesse | historico_negociacao\n` +
                  `  5. Cada fato precisa de "evidencia" — trecho EXATO da fala do lead.\n\n` +

                  `=== FORMATO DE RETORNO (sempre este JSON, sem markdown, sem prosa) ===\n` +
                  `{\n` +
                  `  "campos": {"chave1": "valor literal", "chave2": null},\n` +
                  `  "campos_evidencia": {"chave1": "trecho EXATO do lead que justifica chave1", "chave2": null},\n` +
                  `  "tags": ["namespace:valor", "namespace:valor", ...],\n` +
                  `  "fatos": [\n` +
                  `    {"fato":"frase narrativa", "categoria":"interesse", "relevancia":"alta|media|baixa", "confianca":0.85, "evidencia":"trecho exato do lead"}\n` +
                  `  ]\n` +
                  `}\n\n` +

                  `=== EXEMPLO COMPLETO (generico — adapte aos campos REAIS do cargo abaixo) ===\n` +
                  `Lead disse: "oi, aqui e a Marina. queria entender como funciona e qual o valor. preciso resolver isso ainda este mes."\n` +
                  `Cargo: <nome do cargo ativo> (campos obrigatorios deste cargo: nome_lead, objetivo_do_lead, prazo_desejado, motivo_contato — estes vem da config do cargo, NUNCA cravados).\n` +
                  `RETORNO ESPERADO:\n` +
                  `{\n` +
                  `  "campos": {"nome_lead":"Marina", "objetivo_do_lead":"entender como funciona e o valor", "prazo_desejado":"este mes", "motivo_contato":null},\n` +
                  `  "campos_evidencia": {"nome_lead":"aqui e a Marina", "objetivo_do_lead":"queria entender como funciona e qual o valor", "prazo_desejado":"ainda este mes", "motivo_contato":null},\n` +
                  `  "tags": ["fase:descoberta_preco", "prioridade:alta", "sentimento:urgente", "perfil:primeiro_contato"],\n` +
                  `  "fatos": [\n` +
                  `    {"fato":"Quer entender o funcionamento e o valor do servico","categoria":"interesse","relevancia":"alta","confianca":0.9,"evidencia":"queria entender como funciona e qual o valor"},\n` +
                  `    {"fato":"Tem urgencia para resolver ainda este mes","categoria":"historico_negociacao","relevancia":"media","confianca":0.8,"evidencia":"preciso resolver isso ainda este mes"}\n` +
                  `  ]\n` +
                  `}\n` +
                  `(Os nomes de campo acima sao ILUSTRATIVOS. Use SEMPRE os campos obrigatorios reais do cargo informados acima nesta mensagem; o slug de produto em tags vem do catalogo do tenant, nunca de um nicho fixo.)\n\n` +

                  `=== EXEMPLO NEGATIVO (anti-alucinacao) ===\n` +
                  `Lead disse APENAS: "quanto custa?".\n` +
                  `RETORNO CORRETO (so o que foi dito; resto null; nada inventado):\n` +
                  `{"campos":{"nome_lead":null,"objetivo_do_lead":"saber o preco","prazo_desejado":null,"motivo_contato":null},\n` +
                  ` "campos_evidencia":{"nome_lead":null,"objetivo_do_lead":"quanto custa?","prazo_desejado":null,"motivo_contato":null},\n` +
                  ` "tags":["fase:descoberta_preco","sentimento:neutro","prioridade:media"],\n` +
                  ` "fatos":[]}\n\n` +
                  `ERRADO seria preencher campo que o lead nao disse, ou inferir produto/perfil de um nicho que o tenant nao mencionou.\n\n` +

                  `Agora extraia da conversa abaixo. Lembre: precisao > completude. Quando em duvida, retorne null.`,
              },
              { role: "system", content: blocoFatosConhecidosPrompt },
              { role: "user", content: conversaCompleta },
            ],
          });

          // deno-lint-ignore no-explicit-any
          let extraidoJson: any = {};
          try { extraidoJson = JSON.parse(extResp.texto); } catch { extraidoJson = {}; }
          const extraidoCampos: Record<string, unknown> = (extraidoJson?.campos as Record<string, unknown>) ?? {};
          const camposEvidencia: Record<string, string | null> = (extraidoJson?.campos_evidencia as Record<string, string | null>) ?? {};

          // A4 — Tags namespace hierárquico: aceita tags ou tags_sugeridas, normaliza + cap 8 + dedup
          const normalizarTag = (t: string): string => t
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase()
            .trim()
            .replace(/\s+/g, "_");
          const tagsRaw: unknown = extraidoJson?.tags ?? extraidoJson?.tags_sugeridas;
          const tagsSugeridas: string[] = Array.isArray(tagsRaw)
            ? Array.from(new Set(
                (tagsRaw as unknown[])
                  .filter((x): x is string => typeof x === "string" && x.length > 0)
                  .map(normalizarTag)
                  .filter((t) => t.length > 0)
              )).slice(0, 8)
            : [];

          // A6 — Anti-alucinação: descarta valor que não tem evidência literal cravada
          // (ou cuja evidência é vazia/curta demais pra ser citação real)
          // deno-lint-ignore no-explicit-any
          const extraidoValidado: Record<string, unknown> = {};
          camposDescartadosAlucinacao = 0;
          for (const k of camposRastreio) {
            const v = extraidoCampos[k];
            if (v === null || v === "" || v === undefined) continue;
            const ev = camposEvidencia?.[k];
            // Aceita se evidência presente E tem >= 3 chars de fala real do lead
            if (typeof ev === "string" && ev.trim().length >= 3) {
              extraidoValidado[k] = v;
            } else {
              camposDescartadosAlucinacao++;
            }
          }
          extraidoFinal = extraidoValidado;
          tagsSugeridasFinal = tagsSugeridas;

          // Merge com dados_ficha existente (não sobrescreve campos já preenchidos com null novo)
          const { data: leadAtual } = await supabase
            .from("leads")
            .select("dados_ficha, tags")
            .eq("id", conv.lead_id)
            .maybeSingle();
          const fichaAntiga = (leadAtual?.dados_ficha as Record<string, unknown>) || {};
          const tagsAntigas = Array.isArray(leadAtual?.tags) ? (leadAtual!.tags as string[]) : [];
          const fichaNova = { ...fichaAntiga };
          let campos_capturados_no_turno = 0;
          for (const k of camposRastreio) {
            const v = extraidoValidado[k];
            if (v !== null && v !== "" && v !== undefined) {
              fichaNova[k] = v;
              if (!(k in fichaAntiga) || fichaAntiga[k] !== v) campos_capturados_no_turno++;
            }
          }
          // Tags: dedup + cap em 20 tags total
          const tagsNovas = Array.from(new Set([...tagsAntigas, ...tagsSugeridas])).slice(0, 20);

          // A1 — Fatos persistentes em memoria_lead INLINE no turno (resolve memoria_lead=0 do Lead de Teste).
          // Cap 3 fatos novos por turno + confianca >= 0.6 + evidencia_literal obrigatória.
          // Gate anti-dup via similarity() pg_trgm: corroboração += 0.05, contradição inativa antigo.
          // A1 — Fatos persistentes (aceita "fatos" ou "fatos_persistentes")
          // deno-lint-ignore no-explicit-any
          const fatosRaw: any = extraidoJson?.fatos ?? extraidoJson?.fatos_persistentes ?? [];
          // deno-lint-ignore no-explicit-any
          const fatosPersistRaw: any[] = Array.isArray(fatosRaw) ? (fatosRaw as unknown[]).slice(0, 3) : [];
          // Caminho B (2026-05-30): dedup SEMÂNTICO via gate compartilhado (_shared/memoria-anti-dup.ts)
          // — substitui o antigo dedup lexical (ilike/pg_trgm). Mesma percepção com redação diferente
          // é reconhecida (embedding + lead_memory_similar) → NOOP, não duplica.
          const CATEGORIAS_OK = ["fato_biografico","fato_financeiro","objecao","interesse","historico_negociacao"];
          const fatosCandidatos: FatoCandidato[] = [];
          const fatosASubstituir: string[] = []; // fatos antigos que o lead tornou obsoletos (campo "substitui" do extrator)
          for (const f of fatosPersistRaw) {
            const fato = String(f?.fato ?? "").trim();
            const confianca = Number(f?.confianca ?? 0);
            const evidencia = String(f?.evidencia ?? f?.evidencia_literal ?? "").trim();
            if (!fato || fato.length < 4 || confianca < 0.6 || evidencia.length < 3) continue;
            const categoriaRaw = String(f?.categoria ?? "interesse").toLowerCase().trim();
            const categoria = CATEGORIAS_OK.includes(categoriaRaw)
              ? categoriaRaw
              : (categoriaRaw === "profissional" ? "fato_biografico" : "interesse");
            const relevancia = ["alta","media","baixa"].includes(String(f?.relevancia)) ? String(f.relevancia) : "media";
            const validFrom = (typeof f?.valido_desde === "string" && /^\d{4}-\d{2}-\d{2}/.test(f.valido_desde))
              ? new Date(f.valido_desde).toISOString() : null;
            const _substitui = String(f?.substitui ?? "").trim();
            if (_substitui && _substitui.length >= 4) fatosASubstituir.push(_substitui);
            // A6: carga emocional do fato (0..1) — alimenta a saliência viva. Default 0 se o extrator não pontuar.
            const valenciaEmocional = Math.max(0, Math.min(1, Number(f?.valencia_emocional ?? f?.valencia ?? 0) || 0));
            fatosCandidatos.push({ fato, categoria, relevancia, confianca, valido_desde: validFrom, valencia_emocional: valenciaEmocional });
          }
          if (fatosCandidatos.length > 0 && conv?.lead_id) {
            try {
              const resultadosGate = await avaliarFatosAntiDup({ supabase, leadId: conv.lead_id, fatos: fatosCandidatos });
              const pr = await persistirFatos({
                supabase,
                leadId: conv.lead_id,
                tenantId: tenant_id,
                resultados: resultadosGate,
                fonteTurno: historico.length + 1,
                camposComuns: { conversation_id: conversa_id, fonte: "auto", modulo: "atendimento", escopo: "curto" },
              });
              fatosNovosGravados = pr.inseridos;
              fatosCorroboradosTotal = pr.atualizados;
              // Atualização (lead mudou de ideia): invalida os fatos antigos tornados obsoletos.
              if (fatosASubstituir.length > 0) {
                await supabase.from("memoria_lead")
                  .update({ ativa: false, atualizado_em: new Date().toISOString(), valido_ate: new Date().toISOString(), sistema_expirou_em: new Date().toISOString() })
                  .eq("lead_id", conv.lead_id).eq("ativa", true).in("fato", fatosASubstituir);
              }
            } catch (eF) {
              console.warn("[a1 memoria_lead gate]", (eF as Error).message);
            }
          }
          // deno-lint-ignore no-explicit-any
          const patch: any = {};
          if (Object.keys(fichaNova).length !== Object.keys(fichaAntiga).length || campos_capturados_no_turno > 0) {
            patch.dados_ficha = fichaNova;
          }
          if (tagsNovas.length !== tagsAntigas.length) patch.tags = tagsNovas;
          if (Object.keys(patch).length > 0) {
            await supabase.from("leads").update(patch).eq("id", conv.lead_id);
          }
          await supabase.from("traces").insert({
            tenant_id, conversa_id, agente_id,
            tipo: "ferramenta",
            modelo_llm: MODELO_PORTEIRO,
            decisao: {
              ferramenta: "extrair_dados_ficha",
              campos_extraidos: extraidoCampos,
              tags_sugeridas: tagsSugeridas,
              campos_capturados_no_turno,
              fatos_count: fatosPersistRaw.length,
              raw_excerpt: (extResp.texto || "").slice(0, 600),
            },
            latencia_ms: extResp.latencia_ms,
            custo_tokens_in: extResp.tokens_entrada,
            custo_tokens_out: extResp.tokens_saida,
          });
        } catch (e) {
          console.warn("[extrator] falhou:", (e as Error).message);
        }
      }
    }

    // ── Cobertura da Prancheta + Score do lead computado a cada turno ──
    // Inspirado em Cloud Companion 12 chat.ts:825-843 e cravado no §17 do
    // documentos/plataforma/ragentic-arquitetura-2026-05-14.md.
    // Substitui score=0 estático que vinha sem nunca ser computado.
    if (cargoId && conv?.lead_id) {
      const [cargoScoreRes, leadScoreRes] = await Promise.all([
        supabase.from("cargos").select("campos_rastreio").eq("id", cargoId).maybeSingle(),
        supabase.from("leads").select("dados_ficha").eq("id", conv.lead_id).maybeSingle(),
      ]);
      const camposRaw = Array.isArray(cargoScoreRes.data?.campos_rastreio)
        ? (cargoScoreRes.data!.campos_rastreio as unknown[])
        : [];
      const obrigatoriosKeys = camposRaw
        .map((x): string | null => {
          if (typeof x === "string" && x.length > 0) return x;
          if (x && typeof x === "object" && typeof (x as { chave?: unknown }).chave === "string") {
            const o = x as { chave: string; obrigatorio?: unknown };
            if (o.obrigatorio === false) return null;
            return o.chave;
          }
          return null;
        })
        .filter((x): x is string => x !== null);
      const ficha = (leadScoreRes.data?.dados_ficha as Record<string, unknown>) || {};
      const preenchidos = obrigatoriosKeys.filter((k) => {
        const v = ficha[k];
        return v !== null && v !== undefined && String(v).trim() !== "";
      }).length;
      coberturaPrancheta = obrigatoriosKeys.length === 0 ? 1 : preenchidos / obrigatoriosKeys.length;
      const totalMsgsLead = historico.filter((h: { role?: string }) => h.role === "user").length;
      const urgenciaPeso = classificacao?.urgencia === "alta" ? 1 : classificacao?.urgencia === "media" ? 0.5 : 0;
      scoreLead = Math.round(
        70 * coberturaPrancheta +
        20 * Math.min(1, totalMsgsLead / 5) +
        10 * urgenciaPeso,
      );
      await supabase.from("conversas").update({ score_lead: scoreLead }).eq("id", conversa_id);

      // Onda 2026-05-16 — popula engajamento_lead (era tabela morta de escrita;
      // gatilhos temporais liam `nivel` e pulavam todo lead como "frio", o que
      // desligava a retomada proativa em produção). Isolado em try/catch —
      // nunca derruba o turno (mesmo padrão dos blocos A1/A2).
      try {
        const msgsLead = (historico as Array<{ role?: string; content?: string }>)
          .filter((h) => h.role === "user");
        const comprimentoMedio = msgsLead.length
          ? msgsLead.reduce((s, m) => s + String(m.content ?? "").length, 0) / msgsLead.length
          : 0;
        const { data: engAnt } = await supabase
          .from("engajamento_lead")
          .select("pontuacao")
          .eq("lead_id", conv.lead_id)
          .maybeSingle();
        const { count: convCount } = await supabase
          .from("conversas")
          .select("id", { count: "exact", head: true })
          .eq("lead_id", conv.lead_id);
        const eng = calcularEngajamento({
          scoreLead,
          comprimentoMedio,
          pontuacaoAnterior: engAnt?.pontuacao != null ? Number(engAnt.pontuacao) : null,
        });
        await supabase.from("engajamento_lead").upsert({
          lead_id: conv.lead_id,
          tenant_id,
          nivel: eng.nivel,
          pontuacao: eng.pontuacao,
          comprimento_medio: eng.comprimento_medio,
          conversas_count: convCount ?? 0,
          tendencia: eng.tendencia,
          ultima_atualizacao: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "lead_id" });
        await supabase.from("leads")
          .update({ temperatura_lead: eng.nivel })
          .eq("id", conv.lead_id);
      } catch (eE) {
        console.warn("[onda2 engajamento_lead]", (eE as Error).message);
      }
      await supabase.from("traces").insert({
        tenant_id, conversa_id, agente_id,
        tipo: "ferramenta",
        modelo_llm: "ragentic/score",
        decisao: {
          ferramenta: "score_calculado",
          score: scoreLead,
          cobertura_prancheta: coberturaPrancheta,
          obrigatorios_total: obrigatoriosKeys.length,
          obrigatorios_preenchidos: preenchidos,
        },
      });
    }

    if (!ehTokenProativo) {
      await supabase.from("intencoes_pendentes").insert({
        conversa_id,
        intencao: classificacao?.intencao || "indefinida",
        dados: {
          // Porteiro + extrator (cravado em ondas anteriores)
          cargo_alvo: cargoAlvo,
          urgencia: classificacao?.urgencia || "media",
          resumo_porteiro: classificacao?.resumo || "",
          tools_usadas,
          blocos_recuperados: blocosContexto.length,
          campos_extraidos: extraidoFinal,
          tags_sugeridas: tagsSugeridasFinal,
          score_lead: scoreLead,
          cobertura_prancheta: coberturaPrancheta,
          // A3 — Pensamento estruturado 6 campos Companion 12 (cravados pela síntese)
          leitura_da_situacao: pensamentoEstrut.leitura_da_situacao,
          proxima_intencao: pensamentoEstrut.proxima_intencao,
          acao_pretendida: pensamentoEstrut.acao_pretendida,
          quando_voltar: pensamentoEstrut.quando_voltar,
          motivo: pensamentoEstrut.motivo,
          plano_proximos_turnos: pensamentoEstrut.plano_proximos_2_turnos,
          // A8 + A1 + A6 — métricas de qualidade do turno
          crenca_herdada: crencaHerdadaFlag,
          fatos_novos_gravados: typeof fatosNovosGravados === "number" ? fatosNovosGravados : 0,
          fatos_corroborados: typeof fatosCorroboradosTotal === "number" ? fatosCorroboradosTotal : 0,
          campos_descartados_alucinacao: typeof camposDescartadosAlucinacao === "number" ? camposDescartadosAlucinacao : 0,
        },
      });
    }

    // ── A2 (2026-05-14): Síntese escreve em memoria_episodica INLINE no turno ──
    // Detecta episódio relevante (ação forte / urgência alta / sentimento marcado / fatos novos)
    // e INSERT inline. Cap: 1 episódio por turno + intervalo mínimo de 3 turnos do anterior
    // (evita explosão de ruído). Companion 12 prevê isso mas não escreve em real-time —
    // aqui fazemos pra evitar "lag de 24h" do cron destilar.
    if (!ehTokenProativo && conv?.lead_id) {
      try {
        const acoesEpisodioForte = ["fechar", "agendar_retorno", "escalar_humano"];
        const tagsSentimento = tagsSugeridasFinal.filter((t) => t.startsWith("sentimento:"));
        const ehEpisodioRelevante =
          acoesEpisodioForte.includes(pensamentoEstrut.acao_pretendida) ||
          classificacao?.urgencia === "alta" ||
          tagsSentimento.length > 0 ||
          fatosNovosGravados >= 2;

        if (ehEpisodioRelevante) {
          const turnoAtual = historico.length + 1;
          const { data: ultEpisodio } = await supabase.from("memoria_episodica")
            .select("turno_fim")
            .eq("conversation_id", conversa_id)
            .eq("ativa", true)
            .order("criado_em", { ascending: false })
            .limit(1)
            .maybeSingle();
          const ultimoTurnoEpisodio = (ultEpisodio?.turno_fim as number | null) ?? -10;
          if (turnoAtual - ultimoTurnoEpisodio >= 3) {
            const emocao = tagsSentimento[0]?.replace("sentimento:", "") ?? "neutro";
            // Constraint outcome: ['fechado','retomado','desistiu','perdido','encerrado_natural','sem_resultado']
            const mapaOutcome: Record<string, string> = {
              fechar: "fechado",
              agendar_retorno: "retomado",
              escalar_humano: "encerrado_natural",
              esperar_silencio: "sem_resultado",
              registrar_e_seguir: "sem_resultado",
              fazer_pergunta_de_qualificacao: "sem_resultado",
              oferecer: "sem_resultado",
              responder_e_aguardar: "sem_resultado",
            };
            const outcome = mapaOutcome[pensamentoEstrut.acao_pretendida] ?? "sem_resultado";
            const resumo = pensamentoEstrut.leitura_da_situacao
              || classificacao?.resumo
              || "Episódio sem resumo";
            const gancho = typeof mensagemEfetiva === "string"
              ? mensagemEfetiva.slice(0, 200)
              : pensamentoEstrut.proxima_intencao.slice(0, 200);
            await supabase.from("memoria_episodica").insert({
              tenant_id,
              conversation_id: conversa_id,
              lead_id: conv.lead_id,
              episodio_resumo: resumo.slice(0, 500),
              gancho: gancho.slice(0, 200),
              emocao,
              outcome,
              turno_inicio: Math.max(1, turnoAtual - 2),
              turno_fim: turnoAtual,
              relevancia: classificacao?.urgencia === "alta" ? 0.85 : 0.65,
              decay_factor: 1.0,
              embedding_status: "pendente",
              ativa: true,
            });
            await supabase.from("traces").insert({
              tenant_id, conversa_id, agente_id, tipo: "ferramenta",
              modelo_llm: "ragentic/episodica_inline",
              decisao: { ferramenta: "memoria_episodica_inline", emocao, outcome, turno_atual: turnoAtual },
            });
          }
        }
      } catch (eEp) {
        console.warn("[a2 episodica inline]", (eEp as Error).message);
      }
    }

    // Upsert manual em crenca_conversa (não tem UNIQUE em conversation_id, então SELECT+UPDATE/INSERT)
    const beliefNovo = {
      intencao: classificacao?.intencao || "indefinida",
      cargo: cargoAlvo,
      urgencia: classificacao?.urgencia || "media",
      bolhas_ultimo_turno: bolhasFinais.length,
      blocos_recuperados: blocosContexto.length,
      tools_usadas,
      atualizado_em: new Date().toISOString(),
    };
    const { data: cExist } = await supabase
      .from("crenca_conversa")
      .select("id, belief")
      .eq("conversation_id", conversa_id)
      .maybeSingle();
    if (cExist?.id) {
      const beliefMerged = { ...((cExist.belief as Record<string, unknown>) || {}), ...beliefNovo };
      await supabase
        .from("crenca_conversa")
        .update({
          belief: beliefMerged,
          resumo_agente: classificacao?.resumo || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", cExist.id);
    } else {
      await supabase.from("crenca_conversa").insert({
        conversation_id: conversa_id,
        tenant_id,
        belief: beliefNovo,
        resumo_agente: classificacao?.resumo || null,
      });
    }

    // v61: memória deste turno terminou — libera o guard do próximo turno.
    try {
      await supabase.from("conversas").update({ memoria_pendente: false }).eq("id", conversa_id);
    } catch (_e) { /* flag velha (>30s) é ignorada pelo guard */ }

    // Cérebro único de retomada (2026-06-13): a retomada é ENGATILHADA na caixa de saída pro horário
    // que o agente escolheu (ver bloco _agendarRetomada no enfileiramento). O gate de desistência roda
    // ali também, ANTES de engatilhar. A re-tentativa (se o lead não responder) vem do próprio cron na
    // próxima janela (detecta o silêncio persistente e re-engatilha, respeitando o guard anti-dup).
    // Nada a fazer aqui — o auto-agendamento separado foi removido (não há 2º cérebro nem ação extra).
    }; // fim processarResto (v60)

    // v60 (DEC-036): externo → memória (3ª LLM gemma + score + episódica + crença) fora da espera do cliente.
    // As bolhas já foram enfileiradas antes; o lead é atendido independentemente. Cura o 504.
    const _waitUntil = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
      .EdgeRuntime?.waitUntil;
    if (!modo_teste && typeof _waitUntil === "function") {
      // v61: marca memória pendente ANTES de soltar em background (o guard do próximo turno lê isto)
      await supabase.from("conversas")
        .update({ memoria_pendente: true, memoria_pendente_desde: new Date().toISOString() })
        .eq("id", conversa_id);
      _waitUntil(processarResto());
      return jsonResp({
        reply: bolhasFinais[0] || "",
        mensagens: bolhasFinais,
        conversation_id: conversa_id,
        // B3: webhook usa pra enriquecer a msg do lead (carga.media_descricao) no histórico.
        ...(descricaoMidia ? { media_descricao: descricaoMidia } : {}),
      }, 200);
    }
    // modo_teste OU runtime sem waitUntil → roda síncrono (trace inline completo / zero regressão)
    await processarResto();

    return jsonResp({
      reply: bolhasFinais[0] || "",
      mensagens: bolhasFinais,
      conversation_id: conversa_id,
      // B3: webhook usa pra enriquecer a msg do lead (carga.media_descricao) no histórico.
      ...(descricaoMidia ? { media_descricao: descricaoMidia } : {}),
      // Quando modo_teste, devolvemos o trace pro Chat de Teste renderizar
      // cérebro/ficha sem precisar de round-trip extra na tabela `traces`.
      ...(modo_teste
        ? {
          trace: {
            intencao: classificacao?.intencao || "indefinida",
            cargo_alvo: cargoAlvo,
            urgencia: classificacao?.urgencia || "media",
            resumo_porteiro: classificacao?.resumo || "",
            tools_usadas,
            blocos: blocosContexto.map((b: { id: string; title?: string | null }) => ({
              id: b.id,
              titulo: b.title || "(sem título)",
            })),
            // B1 — cargo_ativo completo (objetivo_principal + regras_livres + campos_rastreio)
            // Frontend renderiza bússola, regras e prancheta sem nova query no banco.
            cargo_ativo: cargoId
              ? {
                  id: cargoId,
                  nome: cargoMeta?.nome ?? cargoAlvo,
                  tipologia: cargosDisponiveis.find((c) => c.id === cargoId)?.tipologia ?? null,
                  objetivo_principal: cargoMeta?.objetivo_principal ?? null,
                  regras_livres: cargoMeta?.regras_livres ?? null,
                  campos_rastreio: cargosDisponiveis.find((c) => c.id === cargoId)?.campos_rastreio ?? [],
                }
              : null,
            // B1 — Pensamento estruturado 6 campos (A3) — frontend renderiza Card 5 AbaMente
            pensamento: pensamentoEstrut,
            // B1 — Compromissos ativos (EMA) — frontend renderiza Card "Compromissos ativos"
            compromissos_ativos: compromissosAtivos.map((c: { id: string; tipo: string; origem: string; titulo: string; executar_em: string; status: string }) => ({
              id: c.id,
              tipo: c.tipo,
              titulo: c.titulo,
              prazo: c.executar_em,
              status: c.status,
              origem: c.origem,
            })),
            // B1 — Fatos do lead (RAG-FIRST memoria_lead) — frontend renderiza Card NOVO "Fatos do lead"
            fatos_do_lead: fatosLead.slice(0, 10).map((f: { id: string; fato: string; categoria: string; relevancia: string; confianca: number; valido_desde: string | null }) => ({
              id: f.id,
              fato: f.fato,
              categoria: f.categoria,
              relevancia: f.relevancia,
              confianca: f.confianca,
              valido_desde: f.valido_desde,
            })),
            // B1 — Episódios passados (RAG-FIRST memoria_episodica) — frontend renderiza AbaQuem timeline
            episodios: episodios.slice(0, 5).map((e: { id: string; episodio_resumo: string; gancho: string; emocao: string; outcome: string; decay_factor: number; criado_em: string }) => ({
              id: e.id,
              episodio_resumo: e.episodio_resumo,
              gancho: e.gancho,
              emocao: e.emocao,
              outcome: e.outcome,
              decay_factor: e.decay_factor,
              criado_em: e.criado_em,
            })),
            // B1 — Métricas de qualidade do turno (A1+A2+A6+A8)
            qualidade_turno: {
              fatos_novos_gravados: fatosNovosGravados,
              fatos_corroborados: fatosCorroboradosTotal,
              campos_descartados_alucinacao: camposDescartadosAlucinacao,
              crenca_herdada: crencaHerdadaFlag,
            },
            // Mente do dossiê (mantido pra compat): campos da prancheta capturados + tags inferidas neste turno.
            campos_extraidos: extraidoFinal,
            tags_sugeridas: tagsSugeridasFinal,
            // Score computado a cada turno
            score_lead: scoreLead,
            cobertura_prancheta: coberturaPrancheta,
            agente: nomeAgente
              ? { nome: nomeAgente, cargo: cargoIdentidade, tom: tomAgente }
              : null,
            latencia_ms: total_lat,
            tokens_in: total_in,
            tokens_out: total_out,
            modelos: { porteiro: MODELO_PORTEIRO, sintese: MODELO_SINTESE },
          },
        }
        : {}),
    }, 200);
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[ragentic-processar-inline] erro:", msg);
    return jsonResp({ error: msg, reply: "", mensagens: [] }, 500);
  }
});
