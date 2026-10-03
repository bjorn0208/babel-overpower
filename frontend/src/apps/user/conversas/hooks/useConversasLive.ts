/**
 * useConversasLive — busca conversas reais do Supabase com Realtime.
 *
 * Onda B.2 (2026-05-13): substitui CONVERSAS_MOCK por dados reais filtrados
 * por RLS (tenant_id do usuário autenticado OU parent_user_id da equipe).
 *
 * Estratégia anti-N+1: 1 query inicial busca N conversas, depois 6 queries
 * paralelas via Promise.all (`.in('conversa_id', ids)`) hidratam todas as
 * coleções de uma vez. Total: 7 round-trips, não N*7.
 *
 * Realtime: 4 channels postgres_changes em paralelo. Cleanup obrigatório.
 *
 * Fallback gracioso: se sem auth ou erro → retorna mock + flag `fonte`.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ehContatoAtivo, LOCATION_BASE } from "../contatos-ativos";
import type {
  AcaoPretendida,
  AutorHumano,
  Cargo,
  CargoTipologia,
  CompromissoAtivo,
  Conversa,
  EstadoPessoa,
  Mensagem,
  Pensamento,
  PlanoTurno,
  StatusConversa,
} from "../tipos";

type Fonte = "live" | "carregando";

interface Estado {
  conversas: Conversa[];
  fonte: Fonte;
  erro: string | null;
  carregarMensagensConversa: (conversaId: string) => Promise<Mensagem[]>;
}

/**
 * Extrai a identidade do autor humano de `mensagens.carga.sender`.
 *
 * Shape real no banco (100% das msgs `role='human'` já têm):
 *   `{ "sender": { "name", "cargo", "avatar_url" }, "source": "whatsapp_app" }`
 *
 * Defensivo: qualquer campo ausente cai pra fallback (nome → "Atendente",
 * cargo/foto → null → a Bolha mostra iniciais).
 */
function extrairAutorHumano(
  carga: unknown,
  senderId: string | null | undefined,
): AutorHumano {
  const sender =
    carga && typeof carga === "object" && "sender" in carga
      ? (carga as { sender?: unknown }).sender
      : undefined;
  const s = sender && typeof sender === "object" ? (sender as Record<string, unknown>) : null;
  const txt = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  return {
    id: senderId ? String(senderId) : undefined,
    nome: txt(s?.name) ?? "Atendente",
    cargo: txt(s?.cargo),
    foto_url: txt(s?.avatar_url),
  };
}

const TIPO_MIDIA_PT: Record<string, Mensagem["tipo"]> = {
  image: "imagem",
  imagem: "imagem",
  sticker: "sticker",
  audio: "audio",
  ptt: "audio",
  video: "video",
  document: "documento",
  documento: "documento",
};

function limparMarcadores(texto: string): string {
  return texto.replace(/\[MEDIA_RECEBIDA\]|\[MEDIA_ENVIADA\]/g, "").trim();
}

/**
 * Deriva tipo/mídia/legenda da `carga`. Cobre os formatos reais do banco:
 * - lead/fromMe recebido: `{ media_url, media_type }` (EN: image/audio/video/document/sticker)
 * - humano painel: `{ file: { url, name, type, size } }`
 * - localização/contato (Fase C): `{ local }` / `{ contato }`
 * NÃO usa `media_descricao` (transcrição fica só pro motor — decisão Theus 2026-05-18).
 */
function extrairMidia(
  carga: Record<string, unknown> | null,
  content: string,
): {
  tipo: Mensagem["tipo"];
  midia_url?: string;
  nome_arquivo?: string;
  tamanho_bytes?: number;
  conteudo: string;
  local?: Mensagem["local"];
  contato?: Mensagem["contato"];
} {
  const limpo = limparMarcadores(content);
  if (!carga) return { tipo: "texto", conteudo: limpo };

  const file =
    carga.file && typeof carga.file === "object" ? (carga.file as Record<string, unknown>) : null;
  if (file && typeof file.url === "string") {
    const ft = typeof file.type === "string" ? file.type : "";
    const tipo: Mensagem["tipo"] = ft.startsWith("image/")
      ? "imagem"
      : ft.startsWith("audio/")
        ? "audio"
        : ft.startsWith("video/")
          ? "video"
          : "documento";
    return {
      tipo,
      midia_url: file.url,
      nome_arquivo: typeof file.name === "string" ? file.name : undefined,
      tamanho_bytes: typeof file.size === "number" ? file.size : undefined,
      conteudo: limpo,
    };
  }

  const local =
    carga.local && typeof carga.local === "object" ? (carga.local as Record<string, unknown>) : null;
  if (local && typeof local.lat === "number" && typeof local.lng === "number") {
    return {
      tipo: "localizacao",
      conteudo: limpo,
      local: {
        lat: local.lat as number,
        lng: local.lng as number,
        endereco: typeof local.endereco === "string" ? local.endereco : undefined,
      },
    };
  }

  const ct =
    carga.contato && typeof carga.contato === "object"
      ? (carga.contato as Record<string, unknown>)
      : null;
  if (ct && typeof ct.nome === "string") {
    return {
      tipo: "contato",
      conteudo: limpo,
      contato: {
        nome: ct.nome as string,
        telefones: Array.isArray(ct.telefones) ? (ct.telefones as string[]) : [],
      },
    };
  }

  const mu = typeof carga.media_url === "string" ? carga.media_url : null;
  if (mu) {
    const mt = typeof carga.media_type === "string" ? carga.media_type : "";
    return { tipo: TIPO_MIDIA_PT[mt] ?? "documento", midia_url: mu, conteudo: limpo };
  }

  return { tipo: "texto", conteudo: limpo };
}

function mapearMensagem(m: {
  id: string;
  conversation_id: string;
  role: string | null;
  content: string | null;
  created_at: string | null;
  sender_id?: string | null;
  carga?: unknown;
}): Mensagem {
  const cargaObj =
    m.carga && typeof m.carga === "object" ? (m.carga as Record<string, unknown>) : null;
  const fonteCarga = typeof cargaObj?.source === "string" ? cargaObj.source : null;
  const ehRoleHumano = m.role === "human" || m.role === "humano";
  // O webhook (fromMe) grava o ECO da resposta do agente também como
  // role='human' + identidade do tenant, mas marca carga.source='whatsapp_app'.
  // Intervenção humana REAL (atendimento antigo / painel) grava carga.sender
  // SEM source. Só esse caso é "humano"; o eco volta a ser lógica de agente.
  const ehHumano = ehRoleHumano && fonteCarga !== "whatsapp_app";
  const papel: Mensagem["papel"] =
    m.role === "lead" || m.role === "user"
      ? "lead"
      : m.role === "system"
        ? "sistema"
        : ehHumano
          ? "humano"
          : "agente";
  const md = extrairMidia(cargaObj, String(m.content ?? ""));
  return {
    id: String(m.id),
    conversa_id: String(m.conversation_id),
    papel,
    tipo: md.tipo,
    conteudo: md.conteudo,
    midia_url: md.midia_url,
    nome_arquivo: md.nome_arquivo,
    tamanho_bytes: md.tamanho_bytes,
    local: md.local,
    contato: md.contato,
    autor: ehHumano ? extrairAutorHumano(m.carga, m.sender_id) : undefined,
    criado_em: String(m.created_at ?? new Date().toISOString()),
    lido: true,
    enviado: true,
  };
}

// Limite do PRIMEIRO PAINT da LISTA — as N mais recentes por updated_at vêm no
// boot (1 query leve, sem hidratação de mente). O TOTAL real do tenant é mostrado
// no topo via `contarConversasAtivas` (count no banco), e qualquer conversa além
// do limite é alcançável pela busca server-side (`buscarConversasPorTermo`).
// 1000 = cap de 1 request do PostgREST → 1 só round-trip, sem paginar. Mantém o
// que o dono já via na lista; o número no topo deixa de mentir sobre o total.
const LIMITE_CONVERSAS = 1000;

// Scroll infinito server-side: lote de cada busca de conversas ANTIGAS além do
// primeiro paint. Cursor keyset em `updated_at` — só toca o banco quando o
// usuário esgota o pool carregado, lote a lote, sem re-baixar o que já veio.
const LOTE_ANTIGAS = 300;

// Cursor do histórico (updated_at da conversa mais antiga já carregada) + flag
// de fim. Module-level: sobrevive a remontagens do hook dentro da sessão.
let cursorAntigas: string | null = null;
let historicoEsgotado = false;

// Cache module-level (vive entre montagens do hook). Quando o usuário abre o
// app Conversas, fecha, e reabre dentro de 60s, pintamos do cache na hora e
// revalidamos em background — primeira impressão é INSTANTÂNEA.
let CACHE_CONVERSAS: { dados: Conversa[]; ts: number } | null = null;
const CACHE_TTL_MS = 60_000;

const COR_POR_TIPOLOGIA: Record<CargoTipologia, string> = {
  atendimento: "oklch(0.7 0.18 220)",
  mentor: "oklch(0.65 0.22 280)",
  vendedor: "oklch(0.72 0.20 145)",
  financeiro: "oklch(0.82 0.18 80)",
  suporte: "oklch(0.72 0.20 30)",
  admin: "oklch(0.7 0.18 220)",
};

const ACOES_VALIDAS: ReadonlySet<AcaoPretendida> = new Set([
  "responder_e_aguardar",
  "fazer_pergunta_de_qualificacao",
  "oferecer",
  "fechar",
  "agendar_retorno",
  "escalar_humano",
  "esperar_silencio",
  "registrar_e_seguir",
]);

function ehAcaoValida(s: unknown): s is AcaoPretendida {
  return typeof s === "string" && ACOES_VALIDAS.has(s as AcaoPretendida);
}

function corCargo(tipologia: string | null | undefined): string {
  if (tipologia && tipologia in COR_POR_TIPOLOGIA) {
    return COR_POR_TIPOLOGIA[tipologia as CargoTipologia];
  }
  return "var(--txt-3)";
}

function mapearStatus(s: string | null | undefined): StatusConversa {
  if (s === "ativa" || s === "humano") return "ativa";
  if (s === "encerrada") return "encerrada";
  return "aguardando";
}

function mapearEstadoLead(
  faseCliente: string | null,
  location: string | null,
  convertedAt: string | null,
  temContratoAssinado: boolean,
  temContratoAtivo: boolean,
  temCampanhaAtiva: boolean,
): EstadoPessoa {
  // Conversão é SÓ explícita (pacote Marcos 2026-07-22): vale o que `tornarCliente`
  // gravou (location/converted_at/fase_cliente). Contrato ativo/assinado NÃO converte
  // mais sozinho — comprovante anexado ficava promovendo lead a cliente sem validação
  // humana (sobrecorreção de 2026-07-18 revertida). Contrato assinado segue visível
  // na pílula "Contratos assinados" como pendência de validação.
  const ehCliente =
    location === "cliente" ||
    convertedAt != null ||
    faseCliente != null;
  void temContratoAssinado;
  void temContratoAtivo;
  if (ehCliente && temCampanhaAtiva) return "cliente_em_campanha";
  if (ehCliente) return "cliente";
  if (temCampanhaAtiva) return "em_campanha";
  return "lead";
}

function mapearPensamento(
  intencao: Record<string, unknown> | null,
  pranchetaBelief: Record<string, unknown> | null,
): Pensamento {
  // Caso 1: intencoes_pendentes tem registro estruturado
  if (intencao && typeof intencao.dados === "object" && intencao.dados !== null) {
    const dados = intencao.dados as Record<string, unknown>;
    const planoBruto = Array.isArray(dados.plano_proximos_turnos)
      ? dados.plano_proximos_turnos
      : [];
    const plano: PlanoTurno[] = planoBruto
      .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
      .map((p) => ({
        turno: Number(p.turno ?? 0),
        o_que_fazer: String(p.o_que_fazer ?? ""),
        por_que: String(p.por_que ?? ""),
      }));
    const acao = ehAcaoValida(dados.acao_pretendida) ? dados.acao_pretendida : "responder_e_aguardar";
    return {
      id: String(intencao.id ?? ""),
      proxima_intencao: String(dados.proxima_intencao ?? intencao.intencao ?? ""),
      acao_pretendida: acao,
      leitura_da_situacao: dados.leitura_da_situacao ? String(dados.leitura_da_situacao) : null,
      motivo: dados.motivo ? String(dados.motivo) : null,
      quando_voltar: dados.quando_voltar ? String(dados.quando_voltar) : null,
      plano_proximos_turnos: plano,
      criado_em: String(intencao.criado_em ?? new Date().toISOString()),
    };
  }
  // Caso 2: derivar de prancheta.belief (motor atual)
  return {
    id: "derivado",
    proxima_intencao: "Pensamento estruturado indisponível",
    acao_pretendida: "responder_e_aguardar",
    leitura_da_situacao: null,
    motivo: pranchetaBelief
      ? "Motor atual ainda não popula intencoes_pendentes — derivado da prancheta."
      : null,
    quando_voltar: null,
    plano_proximos_turnos: [],
    criado_em: new Date().toISOString(),
  };
}

/** Achata valores da ficha pra exibição: desembrulha `{valor, evidencia}` do extrator,
 *  junta arrays, descarta nulos/"null"/vazios e chaves internas `_*` (ex.: `_contexto`).
 *  Motivo: o extrator às vezes grava o embrulho inteiro e a tela imprimia `[object Object]`. */
function normalizarDadosCapturados(
  ...fontes: Array<Record<string, unknown> | null | undefined>
): Record<string, string | number | null> {
  const bruto: Record<string, unknown> = Object.assign({}, ...fontes.map((f) => f ?? {}));
  const limpo: Record<string, string | number | null> = {};
  for (const [chave, v] of Object.entries(bruto)) {
    if (chave.startsWith("_")) continue;
    let valor: unknown = v;
    if (valor && typeof valor === "object" && !Array.isArray(valor) && "valor" in valor) {
      valor = (valor as { valor: unknown }).valor;
    }
    if (Array.isArray(valor)) valor = valor.filter((x) => x != null && x !== "null").join(", ");
    if (valor == null || valor === "" || valor === "null") continue;
    if (typeof valor === "boolean") valor = valor ? "sim" : "não";
    limpo[chave] = typeof valor === "number" || typeof valor === "string" ? valor : JSON.stringify(valor);
  }
  return limpo;
}

function mapearCobertura(belief: Record<string, unknown> | null): number {
  if (!belief) return 0;
  const totalCampos = Object.keys(belief).length;
  if (totalCampos === 0) return 0;
  // heurística simples: 100% se belief tem 6+ campos preenchidos
  return Math.min(100, Math.round((totalCampos / 6) * 100));
}

function ehAtrasado(parcelasPagas: number, parcelasTotal: number, vencidos: number): "ativo" | "atrasado" | "concluido" | "rascunho" {
  if (parcelasPagas >= parcelasTotal && parcelasTotal > 0) return "concluido";
  if (vencidos > 0) return "atrasado";
  if (parcelasPagas > 0) return "ativo";
  return "rascunho";
}

/**
 * Shape esperado da query inicial. Types gerados do Supabase ainda não conhecem
 * `responsavel_id` (recém-adicionada) nem `message_type` (não-typed) — castamos
 * manualmente pra evitar regenerar tipos globais.
 */
interface RawConversa {
  id: string;
  status: string | null;
  agent_enabled: boolean | null;
  channel: string | null;
  updated_at: string | null;
  visto_em: string | null;
  lead_id: string | null;
  cargo_ativo_id: string | null;
  responsavel_id: string | null;
  score_lead: number | null;
  agente_id: string | null;
  tenant_id: string | null;
  aberta_manual_em: string | null;
  leads: {
    id: string;
    nome_exibicao: string | null;
    name: string | null;
    phone: string | null;
    url_foto_perfil: string | null;
    fase_pipeline: string | null;
    fase_cliente: string | null;
    temperatura_lead: string | null;
    location: string | null;
    produto: string | null;
    chave_rastreamento: string | null;
    converted_at: string | null;
    pasta_base_id: string | null;
    pastas_base: { nome: string } | null;
  } | null;
  cargos: {
    id: string;
    nome: string;
    tipologia: string;
  } | null;
}

interface RawMensagem {
  id: string;
  conversation_id: string;
  role: string | null;
  content: string | null;
  created_at: string | null;
  sender_id: string | null;
  carga: unknown;
}

/**
 * Supabase cliente sem inferência de schema — usado pra fazer queries com
 * colunas recém-adicionadas (responsavel_id) ou não-typed (message_type).
 * Evita regenerar types globais e quebrar outros consumidores.
 *
 * Cast `unknown` deliberado: durante Onda B.2 cada caller adiciona o shape
 * concreto no destino (RawConversa, RawMensagem, etc). Quando types gerados
 * forem atualizados, removemos os casts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseBruto = any;

/**
 * PostgREST tem cap default de 1000 rows por response. Pra mostrar TUDO
 * (Diego tem 3473 conversas hoje), paginamos em lotes de 1000 via range().
 * maxLotes = guardrail — se passar disso, vira virtualização da lista.
 */
const PAGE_SIZE = 1000;

async function buscarPaginado<T>(
  fazer: (de: number, ate: number) => Promise<{ data: T[] | null; error: unknown }>,
  rotulo: string,
  maxLotes: number,
): Promise<T[]> {
  // Dispara TODOS os lotes em paralelo (Promise.all). Lotes vazios voltam vazios.
  // Trade-off: pode buscar 1-2 lotes a mais que o necessário, mas elimina o
  // gargalo de série (Diego: 4 lotes em série = 30s; em paralelo = 7s).
  const promessas = Array.from({ length: maxLotes }, (_, lote) => {
    const de = lote * PAGE_SIZE;
    const ate = de + PAGE_SIZE - 1;
    return fazer(de, ate).then((resp) => {
      if (resp.error) {
        console.warn(`[useConversasLive] paginado ${rotulo} lote ${lote} falhou:`, resp.error);
        return [] as T[];
      }
      return resp.data ?? [];
    });
  });
  const partes = await Promise.all(promessas);
  return partes.flat();
}

/**
 * Divide um array de IDs em chunks de 100 e roda a query paralela pra cada chunk.
 * Resolve o problema de URL gigante quando .in() tem 200+ UUIDs.
 */


/** Select compartilhado da conversa + joins de lead/cargo (carga geral e única). */
const SELECT_CONVERSA = `id, status, agent_enabled, channel, updated_at, visto_em, lead_id, cargo_ativo_id, responsavel_id,
   score_lead, agente_id, tenant_id, aberta_manual_em,
   leads:lead_id ( id, nome_exibicao, name, phone, url_foto_perfil, fase_pipeline, fase_cliente, temperatura_lead, tags, dados_ficha, location, produto, chave_rastreamento, converted_at, pasta_base_id, pastas_base:pasta_base_id ( nome ) ),
   cargos:cargo_ativo_id ( id, nome, tipologia, objetivo_principal, campos_rastreio )`;

/**
 * Maps de hidratação vazios. A LISTA do app Conversas não usa a "mente"
 * (prancheta / intenções / traces / ficha) — só lead + cargo + preview. A mente
 * completa do Dossiê é carregada sob demanda ao abrir a conversa, via
 * `enriquecerDossieViaRPC`. Carregar a mente de TODAS as conversas era ~117 mil
 * queries/dia desperdiçadas (4 tabelas × cada reload disparado por evento).
 */
function mapsVazios(): IdxsHidratacao {
  return {
    idxPrancheta: new Map(),
    idxIntencao: new Map(),
    idxTrace: new Map(),
    idxFicha: new Map(),
    idxContratos: new Map(),
    idxPagamentos: new Map(),
    idxCompromissos: new Map(),
    leadsComContratoAssinado: new Set(),
    leadsAbordadosCampanha: new Set(),
  };
}

/**
 * Dono efetivo pro filtro explícito de tenant (defesa em profundidade — regra
 * do projeto: nunca confiar só na RLS; e o planner usa o índice composto
 * `(tenant_id, updated_at DESC)` em vez de seq scan quando o filtro é explícito).
 * Membro de equipe → parent_user_id (vê as conversas do dono). Admin da
 * plataforma filtra pelo PRÓPRIO uid como qualquer tenant (2026-08-18: o app
 * Conversas entrou no lado admin pra receber os leads da Bel — visão global
 * de conversas nunca foi usada aqui e vazava todos os tenants na janela).
 * Cache module-level: resolve 1× por sessão.
 */
let tenantFiltroCache: { uid: string; valor: string | null } | null = null;
async function resolverTenantFiltro(): Promise<string | null> {
  const sb = supabase as SupabaseBruto;
  const { data: sessao } = await supabase.auth.getSession();
  const uid = sessao?.session?.user?.id;
  if (!uid) return null;
  if (tenantFiltroCache?.uid === uid) return tenantFiltroCache.valor;
  const { data: perfil } = await sb
    .from("profiles")
    .select("parent_user_id")
    .eq("id", uid)
    .maybeSingle();
  const valor = (perfil as { parent_user_id?: string | null } | null)?.parent_user_id ?? uid;
  tenantFiltroCache = { uid, valor };
  return valor;
}

/**
 * Δ 2026-09-14: lead_ids da Base que uma campanha ATIVA já abordou
 * (`last_contact_at` preenchido). A campanha só pega lead com location='base', e
 * a lista esconde a Base inteira — então a conversa que a campanha abriu ficava
 * invisível até o lead responder (o webhook é que tira da Base). Quem só está
 * inscrito e ainda aguarda disparo continua fora: são centenas por campanha.
 */
async function buscarLeadsAbordadosEmCampanha(opts: {
  tenantId?: string | null;
  leadIds?: string[];
}): Promise<Set<string>> {
  if (opts.leadIds && opts.leadIds.length === 0) return new Set();
  const sb = supabase as SupabaseBruto;
  let consulta = sb
    .from("leads_campanha")
    .select("lead_id, campanhas!inner(tenant_id)")
    .eq("state", "ativo")
    .not("last_contact_at", "is", null);
  if (opts.tenantId) consulta = consulta.eq("campanhas.tenant_id", opts.tenantId);
  if (opts.leadIds) consulta = consulta.in("lead_id", opts.leadIds);
  const { data, error } = await consulta.limit(2000);
  if (error) {
    console.warn("[useConversasLive] leads abordados em campanha:", error);
    return new Set();
  }
  return new Set(((data ?? []) as Array<{ lead_id: string }>).map((r) => String(r.lead_id)));
}

/**
 * Set de lead_ids com contrato assinado (`contratos.assinado_em` preenchido).
 * 1 query leve (só lead_id) — alimenta a pílula "Contratos assinados" e a
 * derivação de estado sem hidratar contratos inteiros na lista. Filtro por
 * tenant (lista) ou por lote de leads (busca/conversa única); RLS isola de
 * qualquer forma — filtro explícito é defesa em profundidade.
 */
async function buscarLeadsComContratoAssinado(opts: {
  tenantId?: string | null;
  leadIds?: string[];
}): Promise<Set<string>> {
  if (opts.leadIds && opts.leadIds.length === 0) return new Set();
  const sb = supabase as SupabaseBruto;
  let consulta = sb
    .from("contratos")
    .select("lead_id")
    .not("assinado_em", "is", null)
    .not("lead_id", "is", null);
  if (opts.tenantId) consulta = consulta.eq("tenant_id", opts.tenantId);
  if (opts.leadIds) consulta = consulta.in("lead_id", opts.leadIds);
  const { data, error } = await consulta.limit(2000);
  if (error) {
    console.warn("[useConversasLive] contratos assinados:", error);
    return new Set();
  }
  return new Set(
    ((data ?? []) as Array<{ lead_id: string }>).map((r) => String(r.lead_id)),
  );
}

async function carregarLive(
  publicarBasicas?: (basicas: Conversa[]) => void,
): Promise<Conversa[]> {
  const sbBruto = supabase as SupabaseBruto;
  const tenantFiltro = await resolverTenantFiltro();

  // Conversas paginadas — as mais recentes por updated_at, até LIMITE_CONVERSAS.
  // Filtra channel='teste' (Chat-Teste não aparece no app Conversas). SEM
  // hidratação de mente: a lista usa só lead+cargo+preview; o Dossiê busca a
  // mente sob demanda (enriquecerDossieViaRPC) ao abrir a conversa. Isso elimina
  // as 4 queries (prancheta/intencoes_pendentes/traces/fichas_lead) que rodavam
  // sobre TODAS as conversas a cada (re)carga.
  // 1 query enxuta: as LIMITE_CONVERSAS mais recentes por updated_at. Como
  // LIMITE_CONVERSAS (300) < cap do PostgREST (1000), basta `.limit()` — sem
  // paginar. (Antes: buscarPaginado com ceil(300/1000)=1 lote disparava
  // range(0,999) e trazia 1000 — o teto real virava 1000, não 300.)
  let consultaLista = sbBruto
    .from("conversas")
    .select(SELECT_CONVERSA)
    .neq("channel", "teste");
  if (tenantFiltro) consultaLista = consultaLista.eq("tenant_id", tenantFiltro);
  const [{ data: rowsConvRaw, error: errConv }, assinados, abordados] = await Promise.all([
    consultaLista.order("updated_at", { ascending: false }).limit(LIMITE_CONVERSAS),
    buscarLeadsComContratoAssinado({ tenantId: tenantFiltro }),
    buscarLeadsAbordadosEmCampanha({ tenantId: tenantFiltro }),
  ]);
  if (errConv) console.warn("[useConversasLive] conversas:", errConv);
  const rowsConv = (rowsConvRaw ?? []) as RawConversa[];

  // Rearma o cursor do histórico a cada carga completa da lista.
  cursorAntigas = rowsConv.length > 0 ? String(rowsConv[rowsConv.length - 1].updated_at) : null;
  historicoEsgotado = rowsConv.length < LIMITE_CONVERSAS;

  if (rowsConv.length === 0) return [];

  const conversas = montarConversas(rowsConv, {
    ...mapsVazios(),
    leadsComContratoAssinado: assinados,
    leadsAbordadosCampanha: abordados,
  });
  publicarBasicas?.(conversas);
  return conversas;
}


/**
 * Busca o próximo lote de conversas ANTIGAS além do pool carregado — keyset em
 * `updated_at`, andando a partir da mais antiga já vista. Mesma query enxuta da
 * lista (sem hidratação de mente); o planner usa o índice
 * `(tenant_id, updated_at DESC)`. Chamada pelo scroll infinito do app Conversas
 * quando o usuário esgota a lista local — zero custo se ninguém rolar.
 * Empate exato de `updated_at` no corte pode pular linha (aceito: timestamptz
 * tem precisão de microssegundo).
 */
export async function carregarConversasAntigas(): Promise<{ antigas: Conversa[]; esgotou: boolean }> {
  if (historicoEsgotado || !cursorAntigas) return { antigas: [], esgotou: true };
  const sbBruto = supabase as SupabaseBruto;
  const tenantFiltro = await resolverTenantFiltro();
  let consulta = sbBruto
    .from("conversas")
    .select(SELECT_CONVERSA)
    .neq("channel", "teste")
    .lt("updated_at", cursorAntigas);
  if (tenantFiltro) consulta = consulta.eq("tenant_id", tenantFiltro);
  const { data: rowsRaw, error } = await consulta
    .order("updated_at", { ascending: false })
    .limit(LOTE_ANTIGAS);
  if (error) {
    console.warn("[carregarConversasAntigas] conversas:", error);
    return { antigas: [], esgotou: false };
  }
  const rows = (rowsRaw ?? []) as RawConversa[];
  if (rows.length === 0) {
    historicoEsgotado = true;
    return { antigas: [], esgotou: true };
  }
  cursorAntigas = String(rows[rows.length - 1].updated_at);
  if (rows.length < LOTE_ANTIGAS) historicoEsgotado = true;
  const assinados = await buscarLeadsComContratoAssinado({
    tenantId: tenantFiltro,
    leadIds: rows.map((r) => String(r.lead_id)).filter(Boolean),
  });
  const abordados = await buscarLeadsAbordadosEmCampanha({
    leadIds: rows.map((r) => String(r.lead_id)).filter(Boolean),
  });
  const antigas = montarConversas(rows, {
    ...mapsVazios(),
    leadsComContratoAssinado: assinados,
    leadsAbordadosCampanha: abordados,
  });
  return { antigas, esgotou: historicoEsgotado };
}


/**
 * Conta o total de contatos ATIVOS do tenant (não-teste, não-arquivados na Base)
 * direto no banco via count `head` — não traz linhas, só o número. A RLS isola
 * o tenant. Usado no contador do topo do app Conversas: o total REAL, mesmo
 * além das `LIMITE_CONVERSAS` carregadas na lista.
 *
 * ativos = (conversas não-teste) − (conversas não-teste com lead.location='base').
 * Mesma regra do filtro da lista (`ehContatoAtivo`: location ≠ 'base'), e conversa aberta à mão (`aberta_manual_em`) conta como ativa.
 */
export async function contarConversasAtivas(): Promise<number> {
  const sbBruto = supabase as SupabaseBruto;
  const tenantFiltro = await resolverTenantFiltro();
  let contaTotal = sbBruto.from("conversas").select("id", { count: "exact", head: true }).neq("channel", "teste");
  let contaBase = sbBruto
    .from("conversas")
    .select("id, leads!inner(location)", { count: "exact", head: true })
    .neq("channel", "teste")
    .eq("leads.location", LOCATION_BASE)
    .is("aberta_manual_em", null);
  if (tenantFiltro) {
    contaTotal = contaTotal.eq("tenant_id", tenantFiltro);
    contaBase = contaBase.eq("tenant_id", tenantFiltro);
  }
  const [naoTeste, arquivadas] = await Promise.all([contaTotal, contaBase]);
  if (naoTeste.error) {
    console.warn("[contarConversasAtivas] nao-teste:", naoTeste.error);
    return 0;
  }
  const total = naoTeste.count ?? 0;
  const base = arquivadas.error ? 0 : arquivadas.count ?? 0;
  return Math.max(0, total - base);
}


/**
 * Carga de UMA conversa pelo id. A maquete (e outros pontos que só têm o id)
 * abre a conversa isolada sem o objeto completo do drag — aqui buscamos a
 * conversa + hidratação filtrada (leve) e reusamos `montarConversas`.
 */
export async function carregarConversaUnica(conversaId: string): Promise<Conversa | null> {
  if (!conversaId) return null;
  const sbBruto = supabase as SupabaseBruto;
  const { data: row, error } = await sbBruto
    .from("conversas")
    .select(SELECT_CONVERSA)
    .eq("id", conversaId)
    .maybeSingle();
  if (error || !row) {
    if (error) console.warn("[carregarConversaUnica] conversa:", error);
    return null;
  }
  const r = row as RawConversa;
  const leadId = r.lead_id;
  type Linha = Record<string, unknown>;
  const [prancheta, intencao, trace, ficha, assinados, abordados] = await Promise.all([
    sbBruto.from("prancheta")
      .select("conversation_id, belief, resumo_agente, proxima_intencao, proximo_passo_previsto, estilo_lead, updated_at")
      .eq("conversation_id", conversaId).maybeSingle(),
    sbBruto.from("intencoes_pendentes")
      .select("id, conversa_id, intencao, dados, criado_em")
      .eq("conversa_id", conversaId).order("criado_em", { ascending: false }).limit(1).maybeSingle(),
    sbBruto.from("traces")
      .select("id, conversa_id, tipo, raciocinio_interno, decisao, confianca, criado_em")
      .eq("conversa_id", conversaId).order("criado_em", { ascending: false }).limit(1).maybeSingle(),
    leadId
      ? sbBruto.from("fichas_lead").select("lead_id, dados_capturados").eq("lead_id", leadId).maybeSingle()
      : Promise.resolve({ data: null }),
    leadId
      ? buscarLeadsComContratoAssinado({ leadIds: [leadId] })
      : Promise.resolve(new Set<string>()),
    leadId
      ? buscarLeadsAbordadosEmCampanha({ leadIds: [leadId] })
      : Promise.resolve(new Set<string>()),
  ]);

  const idxPrancheta = new Map<string, Linha>();
  if (prancheta.data) idxPrancheta.set(String((prancheta.data as Linha).conversation_id), prancheta.data as Linha);
  const idxIntencao = new Map<string, Linha>();
  if (intencao.data) idxIntencao.set(String((intencao.data as Linha).conversa_id), intencao.data as Linha);
  const idxTrace = new Map<string, Linha>();
  if (trace.data) idxTrace.set(String((trace.data as Linha).conversa_id), trace.data as Linha);
  const idxFicha = new Map<string, Linha>();
  if (ficha.data) idxFicha.set(String((ficha.data as { lead_id: string }).lead_id), ficha.data as Linha);

  const lista = montarConversas([r], {
    idxPrancheta,
    idxIntencao,
    idxTrace,
    idxFicha,
    idxContratos: new Map(),
    idxPagamentos: new Map(),
    idxCompromissos: new Map(),
    leadsComContratoAssinado: assinados,
    leadsAbordadosCampanha: abordados,
  });
  return lista[0] ?? null;
}


/**
 * Busca server-side por nome ou telefone. Garante achar QUALQUER conversa do
 * tenant, mesmo além das `LIMITE_CONVERSAS` carregadas na lista. A RLS isola o
 * tenant automaticamente. Usada pela busca do app Conversas (com debounce).
 * Sem hidratação de mente (a lista não usa; o Dossiê busca sob demanda).
 */
export async function buscarConversasPorTermo(termo: string): Promise<Conversa[]> {
  const bruto = termo.trim();
  // Remove caracteres que quebram a sintaxe do filtro PostgREST (.or(...)).
  const seguro = bruto.replace(/[,()*%]/g, " ").trim();
  if (seguro.length < 2) return [];
  const sbBruto = supabase as SupabaseBruto;
  const digitos = bruto.replace(/\D+/g, "");

  const ors = [`nome_exibicao.ilike.%${seguro}%`, `name.ilike.%${seguro}%`];
  if (digitos.length >= 3) ors.push(`phone.ilike.%${digitos}%`);

  const tenantFiltro = await resolverTenantFiltro();
  let consultaLeads = sbBruto.from("leads").select("id").or(ors.join(","));
  if (tenantFiltro) consultaLeads = consultaLeads.eq("tenant_id", tenantFiltro);

  // Busca por CONTEÚDO: mensagens cujo texto casa com o termo (índice trigram
  // idx_mensagens_conteudo_trgm). As mais recentes primeiro — a conversa herda
  // a posição da mensagem que casou.
  let consultaMensagens = sbBruto
    .from("mensagens")
    .select("conversation_id, created_at, conversas!inner(tenant_id, channel)")
    .ilike("content", `%${seguro}%`)
    .is("deleted_at", null)
    .neq("conversas.channel", "teste")
    .order("created_at", { ascending: false })
    .limit(300);
  if (tenantFiltro) consultaMensagens = consultaMensagens.eq("conversas.tenant_id", tenantFiltro);

  const [{ data: leadsData, error: errLeads }, { data: msgsData, error: errMsgs }] =
    await Promise.all([consultaLeads.limit(50), consultaMensagens]);
  if (errLeads) console.warn("[buscarConversasPorTermo] leads:", errLeads);
  if (errMsgs) console.warn("[buscarConversasPorTermo] mensagens:", errMsgs);

  const leadIds = ((leadsData ?? []) as Array<{ id: string }>).map((l) => l.id);
  // Dedupe preservando a ordem (mensagem mais recente primeiro).
  const idsPorConteudo: string[] = [];
  const vistos = new Set<string>();
  for (const m of (msgsData ?? []) as Array<{ conversation_id: string }>) {
    if (!vistos.has(m.conversation_id)) {
      vistos.add(m.conversation_id);
      idsPorConteudo.push(m.conversation_id);
    }
  }
  if (leadIds.length === 0 && idsPorConteudo.length === 0) return [];

  const [porLead, porConteudo] = await Promise.all([
    leadIds.length > 0
      ? sbBruto
          .from("conversas")
          .select(SELECT_CONVERSA)
          .in("lead_id", leadIds)
          .neq("channel", "teste")
          .order("updated_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    idsPorConteudo.length > 0
      ? sbBruto
          .from("conversas")
          .select(SELECT_CONVERSA)
          .in("id", idsPorConteudo.slice(0, 50))
          .neq("channel", "teste")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (porLead.error) console.warn("[buscarConversasPorTermo] conversas/lead:", porLead.error);
  if (porConteudo.error) {
    console.warn("[buscarConversasPorTermo] conversas/conteúdo:", porConteudo.error);
  }

  // União sem duplicar conversa (mesma conversa pode casar por nome E conteúdo).
  const rows: RawConversa[] = [];
  const idsRows = new Set<string>();
  for (const r of [
    ...((porLead.data ?? []) as RawConversa[]),
    ...((porConteudo.data ?? []) as RawConversa[]),
  ]) {
    if (!idsRows.has(String(r.id))) {
      idsRows.add(String(r.id));
      rows.push(r);
    }
  }
  if (rows.length === 0) return [];

  const assinados = await buscarLeadsComContratoAssinado({
    leadIds: rows.map((r) => String(r.lead_id)).filter(Boolean),
  });
  const abordados = await buscarLeadsAbordadosEmCampanha({
    leadIds: rows.map((r) => String(r.lead_id)).filter(Boolean),
  });
  return montarConversas(rows, {
    ...mapsVazios(),
    leadsComContratoAssinado: assinados,
    leadsAbordadosCampanha: abordados,
  });
}

interface IdxsHidratacao {
  idxPrancheta: Map<string, Record<string, unknown>>;
  idxIntencao: Map<string, Record<string, unknown>>;
  idxTrace: Map<string, Record<string, unknown>>;
  idxFicha: Map<string, Record<string, unknown>>;
  idxContratos: Map<string, Array<Record<string, unknown>>>;
  idxPagamentos: Map<string, Array<Record<string, unknown>>>;
  idxCompromissos: Map<string, Array<Record<string, unknown>>>;
  /** lead_ids com contrato `assinado_em` preenchido — alimenta a pílula
   *  "Contratos assinados" e reforça a derivação de estado (assinou ⇒ cliente). */
  leadsComContratoAssinado: Set<string>;
  /** lead_ids da Base já abordados por campanha ativa — aparecem mesmo na Base. */
  leadsAbordadosCampanha: Set<string>;
}

function montarConversas(rowsConv: RawConversa[], idxs: IdxsHidratacao): Conversa[] {
  // Onda 2026-05-16 — só contatos ATIVOS no Conversas; location='base'
  // (serviço concluído/arquivado) some daqui e vai pro app Base (sub-projeto 3).
  // Exceções que aparecem mesmo na Base: abordado por campanha e conversa
  // iniciada à mão pelo número (`aberta_manual_em`, Verifik 2026-09-15).
  return rowsConv
    .filter(
      (row) =>
        ehContatoAtivo(row.leads?.location) ||
        row.aberta_manual_em != null ||
        idxs.leadsAbordadosCampanha.has(String(row.lead_id)),
    )
    .map((row) => {
    const lead = row.leads as Record<string, unknown> | null;
    const cargoRow = row.cargos as Record<string, unknown> | null;
    const ficha = lead?.id ? idxs.idxFicha.get(String(lead.id)) ?? null : null;
    const fichaTyped = ficha as { dados_capturados?: Record<string, unknown> } | null;
    const leadTyped = lead as { tags?: string[]; dados_ficha?: Record<string, unknown> } | null;
    const prancheta = idxs.idxPrancheta.get(String(row.id)) ?? null;
    const intencao = idxs.idxIntencao.get(String(row.id)) ?? null;
    const trace = idxs.idxTrace.get(String(row.id)) ?? null;
    const contratosLead = lead?.id ? idxs.idxContratos.get(String(lead.id)) ?? [] : [];
    const pagamentosLead = lead?.id ? idxs.idxPagamentos.get(String(lead.id)) ?? [] : [];
    const compromissosLead = lead?.id ? idxs.idxCompromissos.get(String(lead.id)) ?? [] : [];

    const cargo: Cargo = cargoRow
      ? {
          id: String(cargoRow.id),
          nome: String(cargoRow.nome),
          tipologia: (cargoRow.tipologia as CargoTipologia) ?? "atendimento",
          cor_acento: corCargo(cargoRow.tipologia as string),
          objetivo_principal: typeof cargoRow.objetivo_principal === "string"
            ? (cargoRow.objetivo_principal as string)
            : undefined,
          campos_rastreio: Array.isArray(cargoRow.campos_rastreio)
            ? (cargoRow.campos_rastreio as unknown[])
                .map((x): { chave: string; descricao?: string; obrigatorio?: boolean } | null => {
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
                .filter((x): x is { chave: string; descricao?: string; obrigatorio?: boolean } => x !== null)
            : [],
        }
      : {
          id: "sem-cargo",
          nome: "Sem cargo",
          tipologia: "atendimento",
          cor_acento: corCargo("atendimento"),
          objetivo_principal: undefined,
          campos_rastreio: [],
        };

    const pranchetaBelief = (prancheta as { belief?: Record<string, unknown> })?.belief ?? null;
    const pensamento = mapearPensamento(intencao, pranchetaBelief);

    const temContratoAtivo = contratosLead.some((c) => (c as { status?: string }).status === "ativo");
    const temContratoAssinado = lead?.id
      ? idxs.leadsComContratoAssinado.has(String(lead.id))
      : false;
    const faseCliente = (lead as { fase_cliente?: string | null })?.fase_cliente ?? null;
    const estadoLead = mapearEstadoLead(
      faseCliente,
      (lead as { location?: string | null })?.location ?? null,
      (lead as { converted_at?: string | null })?.converted_at ?? null,
      temContratoAssinado,
      temContratoAtivo,
      lead?.id ? idxs.leadsAbordadosCampanha.has(String(lead.id)) : false,
    );

    const compromissosTyped = compromissosLead.map((c) => ({
      id: String(c.id),
      titulo: String(c.titulo ?? ""),
      data_iso: String(c.data_iso ?? new Date().toISOString()),
      status: ((c as { status?: string }).status ?? "agendado") as "agendado" | "realizado" | "cancelado",
      observacao: c.observacao ? String(c.observacao) : undefined,
    }));

    const compromissosAtivos: CompromissoAtivo[] = compromissosLead
      .filter(
        (c) =>
          (c as { prometido_pelo_agente?: boolean }).prometido_pelo_agente === true &&
          (c as { status?: string }).status === "agendado",
      )
      .map((c) => ({
        id: String(c.id),
        titulo: String(c.titulo ?? ""),
        prometido_em: String((c as { criado_em?: string }).criado_em ?? new Date().toISOString()),
        vencimento_iso: c.data_iso ? String(c.data_iso) : undefined,
      }));

    return {
      id: String(row.id),
      lead: {
        id: String(lead?.id ?? ""),
        nome: String(
          (lead as { nome_exibicao?: string })?.nome_exibicao
          ?? (lead as { name?: string })?.name
          ?? "Sem nome",
        ),
        // Lead do Instagram usa phone sintético 'ig:<IGSID>' — não é telefone, some da UI
        telefone: String((lead as { phone?: string })?.phone ?? "").replace(/^ig:.*/, ""),
        foto_url: (lead as { url_foto_perfil?: string })?.url_foto_perfil ?? undefined,
        canal: (row.channel as "whatsapp" | "instagram" | "site") ?? "whatsapp",
        estado: estadoLead,
        produto: (lead as { produto?: string | null })?.produto ?? null,
        chave_rastreamento: (lead as { chave_rastreamento?: string | null })?.chave_rastreamento ?? null,
        converted_at: (lead as { converted_at?: string | null })?.converted_at ?? null,
        tem_contrato_assinado: temContratoAssinado,
        fase_pipeline: (lead as { fase_pipeline?: string | null })?.fase_pipeline ?? null,
        pasta_base_nome: (lead as { pastas_base?: { nome?: string } | null })?.pastas_base?.nome ?? null,
        memoria_longa: {
          resumo: (prancheta as { resumo_agente?: string })?.resumo_agente ?? "",
          pontos_chave: [],
          engajamento_score: row.score_lead != null ? Number(row.score_lead) / 100 : 0.5,
          primeiro_contato_iso: String(row.updated_at ?? new Date().toISOString()),
        },
        timeline: [],
      },
      status: mapearStatus(row.status as string),
      agente_ligado: row.agent_enabled !== false,
      cargo_ativo: cargo,
      responsavel_id: row.responsavel_id ? String(row.responsavel_id) : null,
      ultima_mensagem_em: String(row.updated_at ?? new Date().toISOString()),
      preview_ultima_mensagem: "",
      mensagens_nao_lidas: 0,
      mente: {
        cargo_ativo: cargo,
        pensamento,
        tags: leadTyped?.tags ?? [],
        // Funde as duas fontes: ficha antiga (fichas_lead) por baixo, motor novo (leads.dados_ficha) por cima.
        // Motivo: o motor grava dados_ficha = {} no insert e o `??` sombreava a captura antiga (ficha aparecia vazia).
        dados_capturados: normalizarDadosCapturados(fichaTyped?.dados_capturados, leadTyped?.dados_ficha),
        prancheta_belief: pranchetaBelief ?? {},
        confianca_atual: trace?.confianca != null ? Number(trace.confianca) : 0.5,
        score_lead: row.score_lead != null ? Number(row.score_lead) : 0,
        cobertura_prancheta: mapearCobertura(pranchetaBelief),
        compromissos_ativos: compromissosAtivos,
        atualizado_em: String(row.updated_at ?? new Date().toISOString()),
      },
      mensagens: [],
      contratos: contratosLead.map((c) => ({
        id: String(c.id),
        titulo: String((c as { titulo?: string }).titulo ?? "Contrato"),
        valor_total: Number((c as { valor_total?: number }).valor_total ?? 0),
        parcelas_pagas: Number((c as { parcelas_pagas?: number }).parcelas_pagas ?? 0),
        parcelas_total: Number((c as { parcelas_total?: number }).parcelas_total ?? 0),
        status: ehAtrasado(
          Number((c as { parcelas_pagas?: number }).parcelas_pagas ?? 0),
          Number((c as { parcelas_total?: number }).parcelas_total ?? 0),
          0,
        ),
        chave_publica: (c as { chave_publica?: string }).chave_publica ?? undefined,
        data_assinatura: (c as { data_assinatura?: string }).data_assinatura ?? undefined,
      })),
      pagamentos: pagamentosLead.map((p) => ({
        id: String(p.id),
        contrato_id: (p as { contrato_id?: string }).contrato_id ?? undefined,
        valor: Number((p as { valor?: number }).valor ?? 0),
        data: String((p as { data?: string }).data ?? new Date().toISOString()),
        metodo: ((p as { metodo?: string }).metodo ?? "pix") as "pix" | "boleto" | "cartao",
        status: ((p as { status?: string }).status ?? "pendente") as "pago" | "pendente" | "atrasado",
        comprovante_url: (p as { comprovante_url?: string }).comprovante_url ?? undefined,
      })),
      pedidos: [],
      compromissos: compromissosTyped,
    } satisfies Conversa;
  });
}

export async function carregarMensagensConversaImpl(conversaId: string): Promise<Mensagem[]> {
  const sbBruto = supabase as SupabaseBruto;
  const todas = await buscarPaginado<{
    id: string;
    conversation_id: string;
    role: string | null;
    content: string | null;
    created_at: string | null;
    sender_id: string | null;
    carga: unknown;
  }>(
    (de, ate) =>
      sbBruto.from("mensagens")
        .select("id, conversation_id, role, content, created_at, sender_id, carga")
        .eq("conversation_id", conversaId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .range(de, ate),
    `mensagens-${conversaId}`,
    10,
  );
  return todas.map(mapearMensagem);
}

export function useConversasLive(): Estado {
  // Init lazy: se cache fresco (<60s), parte dele — paint instantâneo na reabertura.
  const [estado, setEstado] = useState<Estado>(() => {
    if (CACHE_CONVERSAS && Date.now() - CACHE_CONVERSAS.ts < CACHE_TTL_MS) {
      return {
        conversas: CACHE_CONVERSAS.dados,
        fonte: "live",
        erro: null,
        carregarMensagensConversa: carregarMensagensConversaImpl,
      };
    }
    return {
      conversas: [],
      fonte: "carregando",
      erro: null,
      carregarMensagensConversa: carregarMensagensConversaImpl,
    };
  });

  useEffect(() => {
    let ativo = true;

    const publicarBasicas = (basicas: Conversa[]) => {
      if (!ativo) return;
      // Primeiro paint: lista magra (sem mente hidratada). Usuário já vê.
      setEstado((prev) => ({
        conversas: basicas,
        fonte: "live",
        erro: null,
        carregarMensagensConversa: prev.carregarMensagensConversa,
      }));
    };

    const carregar = async () => {
      try {
        const { data: sessao } = await supabase.auth.getSession();
        if (!sessao?.session) {
          // Sem sessão não existe conversa possível — vazio real (modo
          // demonstração removido a pedido do Theus, 2026-08-18).
          if (ativo) {
            setEstado((prev) =>
              prev.fonte === "live"
                ? prev
                : { conversas: [], fonte: "live", erro: null, carregarMensagensConversa: carregarMensagensConversaImpl },
            );
          }
          return;
        }
        // Two-step: publicarBasicas dispara o primeiro paint; o `await` aguarda hidratação.
        const conversas = await carregarLive(publicarBasicas);
        if (!ativo) return;
        // Lista vazia é estado real (tenant novo) — nada de exemplos fake.
        setEstado({ conversas, fonte: "live", erro: null, carregarMensagensConversa: carregarMensagensConversaImpl });
        if (conversas.length > 0) CACHE_CONVERSAS = { dados: conversas, ts: Date.now() };
      } catch (e) {
        if (!ativo) return;
        const msg = e instanceof Error ? e.message : "Erro ao carregar conversas";
        console.warn("[useConversasLive] erro reload — mantém last good se live:", msg);
        setEstado((prev) =>
          prev.fonte === "live"
            ? prev
            : { conversas: [], fonte: "live", erro: msg, carregarMensagensConversa: carregarMensagensConversaImpl },
        );
      }
    };

    void carregar();

    // Realtime — assina DEPOIS do primeiro paint. Não bloqueia render inicial,
    // não dispara reload concorrente com a carga inicial. 800ms é tempo médio
    // pra primeiro paint terminar em conexões boas.
    let ch: ReturnType<typeof supabase.channel> | null = null;
    const timerSubscribe = setTimeout(() => {
      if (!ativo) return;

      const idCanal = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);

      // Granular: só conversa NOVA (lead inédito) entra por aqui — busca SÓ ela
      // e adiciona ao topo, sem recarregar a lista inteira. Mensagens novas,
      // preview e ordem são tratados pelo canal próprio da tela (Conversas.tsx).
      // Antes este canal disparava carregarLive() COMPLETO a cada mensagem nova
      // e a cada update de lead — era o que estourava CPU/IO do banco.
      ch = supabase
        .channel(`conversas-live-${idCanal}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "conversas" },
          (payload) => {
            const id = (payload.new as { id?: string } | null)?.id;
            if (!id || !ativo) return;
            void carregarConversaUnica(id).then((conv) => {
              if (!ativo || !conv) return;
              setEstado((prev) => {
                if (prev.conversas.some((c) => c.id === conv.id)) return prev;
                const conversas = [conv, ...prev.conversas];
                CACHE_CONVERSAS = { dados: conversas, ts: Date.now() };
                return { ...prev, conversas, fonte: "live" };
              });
            });
          },
        )
        .subscribe();
    }, 800);

    return () => {
      ativo = false;
      clearTimeout(timerSubscribe);
      if (ch) void supabase.removeChannel(ch);
    };
  }, []);

  return estado;
}

/**
 * Onda 2026-05-14 — Enriquecedor sob demanda do dossiê via RPC consolidada.
 *
 * Chama `public.fn_dossie_lead_consolidado(lead_id, conversa_id)` (B2) e
 * `public.fn_alertas_dossie(lead_id)` (B3) em paralelo. Retorna shape
 * normalizado pra AbaMente/AbaQuem/AbaFinanceiro/AbaOperacao/AbaCompromissos
 * sem que cada aba tenha que fazer N queries.
 *
 * Fonte da informação RAG-FIRST: tudo cravado no banco real do tenant.
 */
import type { AlertaDossie, Episodio, FatoLead } from "../tipos";

export interface CargoAtivoRpc {
  id: string;
  nome: string;
  tipologia: string;
  objetivo_principal: string | null;
  regras_livres: string | null;
  campos_rastreio: unknown;
}

export interface DossieEnriquecido {
  fatos: FatoLead[];
  episodios: Episodio[];
  alertas: AlertaDossie[];
  /** Cargo completo da conversa ativa, ja resolvido do banco. Onda 2026-05-14 (cargo-realtime). */
  cargo_ativo: CargoAtivoRpc | null;
  cargo_ativo_regras_livres: string | null;
  cargo_ativo_objetivo_principal: string | null;
  cargo_ativo_nome: string | null;
  contratos: Array<Record<string, unknown>>;
  campanhas: Array<Record<string, unknown>>;
  /** View `compromissos_ativos` (acoes_agendadas pendentes + compromissos_do_lead agendados +
   *  contratos em assinatura + pagamentos pendentes). Onda 2026-05-14. */
  compromissos_ativos: Array<Record<string, unknown>>;
  anexos: Array<{
    id: string;
    role: string;
    tipo: string | null;
    media_url: string | null;
    categoria_anexo: string | null;
    content: string | null;
    criado_em: string;
  }>;
  pensamento_atual: Record<string, unknown> | null;
  crenca_belief: Record<string, unknown> | null;
  crenca_resumo: string | null;
  engajamento: Record<string, unknown> | null;
  /** Bloco `lead` do RPC fn_dossie_lead_consolidado — first_contact_at = MIN(mensagens.created_at).
   *  Onda 2026-05-16 — AbaQuem usa pra primeiro contato/nome reais (antes ficava mock). */
  lead: {
    id: string;
    nome_exibicao: string | null;
    name: string | null;
    phone: string | null;
    criado_em: string | null;
    first_contact_at: string | null;
  } | null;
  conversa_ativa_id: string | null;
  gerado_em: string;
}

// Guard UUID — PostgREST retorna 400 se p_lead_id não for uuid válido
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function enriquecerDossieViaRPC(
  leadId: string,
  conversaId?: string | null,
): Promise<DossieEnriquecido | null> {
  if (!leadId || !RE_UUID.test(leadId)) return null;
  // Se conversaId vier mas não for UUID, passa null em vez de string mock
  const convIdSafe = conversaId && RE_UUID.test(conversaId) ? conversaId : null;
  conversaId = convIdSafe;
  // deno-lint-ignore no-explicit-any
  const sb = supabase as any;
  const [dossieRes, alertasRes] = await Promise.all([
    sb.rpc("fn_dossie_lead_consolidado", {
      p_lead_id: leadId,
      p_conversa_id: conversaId ?? null,
    }),
    sb.rpc("fn_alertas_dossie", { p_lead_id: leadId }),
  ]);
  if (dossieRes.error) {
    console.warn("[enriquecerDossieViaRPC] fn_dossie_lead_consolidado falhou:", dossieRes.error);
    return null;
  }
  const dossie = (dossieRes.data ?? {}) as Record<string, unknown>;
  const alertas: AlertaDossie[] = Array.isArray(alertasRes.data)
    ? (alertasRes.data as AlertaDossie[])
    : [];
  // deno-lint-ignore no-explicit-any
  const cargoAtivo = (dossie.cargo_ativo as Record<string, any> | null) ?? null;
  const cargoAtivoTipado: CargoAtivoRpc | null = cargoAtivo && typeof cargoAtivo.id === "string"
    ? {
        id: String(cargoAtivo.id),
        nome: String(cargoAtivo.nome ?? ""),
        tipologia: String(cargoAtivo.tipologia ?? "atendimento"),
        objetivo_principal: typeof cargoAtivo.objetivo_principal === "string" ? cargoAtivo.objetivo_principal : null,
        regras_livres: typeof cargoAtivo.regras_livres === "string" ? cargoAtivo.regras_livres : null,
        campos_rastreio: cargoAtivo.campos_rastreio,
      }
    : null;
  // deno-lint-ignore no-explicit-any
  const leadRpc = (dossie.lead as Record<string, any> | null) ?? null;
  const leadTipado: DossieEnriquecido["lead"] = leadRpc && typeof leadRpc.id === "string"
    ? {
        id: String(leadRpc.id),
        nome_exibicao: leadRpc.nome_exibicao ?? null,
        name: leadRpc.name ?? null,
        phone: leadRpc.phone ?? null,
        criado_em: leadRpc.criado_em ?? null,
        first_contact_at: leadRpc.first_contact_at ?? null,
      }
    : null;
  return {
    fatos: Array.isArray(dossie.fatos) ? (dossie.fatos as FatoLead[]) : [],
    episodios: Array.isArray(dossie.episodios) ? (dossie.episodios as Episodio[]) : [],
    alertas,
    cargo_ativo: cargoAtivoTipado,
    cargo_ativo_regras_livres: cargoAtivo?.regras_livres ?? null,
    cargo_ativo_objetivo_principal: cargoAtivo?.objetivo_principal ?? null,
    cargo_ativo_nome: cargoAtivo?.nome ?? null,
    contratos: Array.isArray(dossie.contratos) ? (dossie.contratos as Array<Record<string, unknown>>) : [],
    campanhas: Array.isArray(dossie.campanhas) ? (dossie.campanhas as Array<Record<string, unknown>>) : [],
    compromissos_ativos: Array.isArray(dossie.compromissos_ativos)
      ? (dossie.compromissos_ativos as Array<Record<string, unknown>>)
      : [],
    // deno-lint-ignore no-explicit-any
    anexos: Array.isArray(dossie.anexos) ? (dossie.anexos as any[]) : [],
    pensamento_atual: (dossie.pensamento_atual as Record<string, unknown> | null) ?? null,
    // deno-lint-ignore no-explicit-any
    crenca_belief: ((dossie.crenca_conversa as any)?.belief ?? null) as Record<string, unknown> | null,
    // deno-lint-ignore no-explicit-any
    crenca_resumo: ((dossie.crenca_conversa as any)?.resumo_agente ?? null) as string | null,
    engajamento: (dossie.engajamento as Record<string, unknown> | null) ?? null,
    lead: leadTipado,
    conversa_ativa_id: (dossie.conversa_ativa_id as string | null) ?? null,
    gerado_em: String(dossie.gerado_em ?? new Date().toISOString()),
  };
}
