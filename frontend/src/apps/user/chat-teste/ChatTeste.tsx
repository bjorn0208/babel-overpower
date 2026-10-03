/**
 * Chat Treino (era Chat-Teste; virou Treino em 2026-09-18): produto em foco escolhido antes de
 * começar (troca no meio), lápis ✎ nas bolhas da agente pra corrigir/sugerir, e o Mentor de
 * Humanização — botão Analisar dá a nota de humanização e grava a conversa corrigida como
 * CONVERSA PADRÃO do produto (edge chat-treino-analisar; o motor passa a usá-la).
 *
 * Chat-Teste — versão modular Onda B.7 (2026-05-13).
 *
 * Single-conversation: usa ChatAtivo + Dossie 5 abas do app Conversas.
 * Motor real `ragentic-processar-inline` com modo_teste:true — NÃO dispara Z-API.
 * Conversa fake `channel='teste'` criada na 1ª mensagem; reusa nas seguintes.
 * Aba Mente do Dossiê absorve o que era o painel "Cérebro" (cargo + pensamento +
 * prancheta + tags). Cérebro removido.
 */

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  AcaoPretendida,
  CampoCargo,
  Cargo,
  CargoTipologia,
  CompromissoAtivo,
  Conversa,
  Mensagem,
  Pensamento,
  PlanoTurno,
} from "../conversas/tipos";
import { ChatAtivo } from "../conversas/ChatAtivo";
import { Dossie } from "../conversas/Dossie";
import { enriquecerDossieViaRPC } from "../conversas/hooks/useConversasLive";
import { pensamentoDoDossie } from "./pensamento-dossie";
import { montarMemoriaLonga, montarTimelineQuem } from "./memoria-longa";
import { SidebarHistorico, type SessaoTeste } from "./SidebarHistorico";
import { gerarPhoneSessaoTeste } from "./sessao-teste";
import type { CorrecaoBolha } from "../conversas/ChatAtivo";
import {
  type AnaliseTreino,
  analisarConversa,
  carregarCorrecoes,
  definirProdutoFoco,
  listarProdutos,
  type ProdutoTreino,
  resolverIdMensagem,
  resolverTenantId,
  salvarCorrecao,
} from "./treino-dados";
import { ModalCorrecao } from "./ModalCorrecao";
import { PainelMentor } from "./PainelMentor";
import { SeletorProdutoTopo, TelaEscolherProduto } from "./SeletorProduto";

interface ToastApi {
  success: (m: string) => void;
  error: (m: string) => void;
  info?: (m: string) => void;
}

function pegarToast(): ToastApi {
  const w = window as unknown as { useToast?: () => ToastApi };
  return w.useToast?.() ?? { success: () => {}, error: () => {} };
}

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

function montarCargo(
  tipologia: string | undefined,
  nome?: string,
  bussola?: string,
  camposRastreio?: CampoCargo[],
): Cargo {
  const t = (tipologia ?? "atendimento") as CargoTipologia;
  const cor = COR_POR_TIPOLOGIA[t] ?? COR_POR_TIPOLOGIA.atendimento;
  return {
    id: `cargo-${t}`,
    nome: nome || (t === "atendimento" ? "Atendimento" : t.charAt(0).toUpperCase() + t.slice(1)),
    tipologia: t,
    cor_acento: cor,
    objetivo_principal: bussola,
    campos_rastreio: camposRastreio ?? [],
  };
}

/**
 * Busca o cargo real do banco que o motor decidiu usar neste turno.
 * Prioridade: cargo do AGENTE com tipologia bate > cargo GLOBAL com tipologia bate.
 */
async function buscarCargoReal(
  agenteId: string,
  tipologia: string,
): Promise<{ nome: string; bussola?: string; campos_rastreio?: CampoCargo[] } | null> {
  const sbBruto = supabase as unknown as {
    from: (t: string) => {
      select: (s: string) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => {
            order: (c: string, opts: { ascending: boolean }) => {
              limit: (n: number) => Promise<{ data: Array<Record<string, unknown>> | null; error: unknown }>;
            };
          };
        };
      };
    };
  };
  const tipologiasValidas = new Set(["atendimento", "mentor", "face_cliente", "admin"]);
  const tip = tipologiasValidas.has(tipologia) ? tipologia : "atendimento";
  // Tenta cargo do agente; se nada, cai pra global (escopo='global').
  const respAgente = await sbBruto.from("cargos")
    .select("nome, objetivo_principal, campos_rastreio")
    .eq("agente_id", agenteId)
    .eq("tipologia", tip)
    .order("ordem", { ascending: true })
    .limit(1);
  const ag = respAgente.data?.[0];
  if (ag) {
    return {
      nome: String(ag.nome ?? ""),
      bussola: typeof ag.objetivo_principal === "string" ? ag.objetivo_principal : undefined,
      // Normaliza pros 2 formatos: string[] legado vira [{chave, obrigatorio:true}],
      // objeto Ragentic-novo {chave, descricao, obrigatorio} preserva metadados pra UI.
      campos_rastreio: Array.isArray(ag.campos_rastreio)
        ? (ag.campos_rastreio as unknown[])
            .map((x): CampoCargo | null => {
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
            .filter((x): x is CampoCargo => x !== null)
        : [],
    };
  }
  return null;
}

function pensamentoInicial(): Pensamento {
  return {
    id: "inicial",
    proxima_intencao: "Aguardando primeira mensagem",
    acao_pretendida: "responder_e_aguardar",
    leitura_da_situacao: null,
    motivo: "Modo teste · envie uma mensagem para o agente responder.",
    quando_voltar: null,
    plano_proximos_turnos: [],
    criado_em: new Date().toISOString(),
  };
}

interface AgenteInfo {
  id: string;
  nome: string;
  modelo: string;
  // `agentes_usuario.is_active=false` = "IA Geral pausada": kill-switch do WhatsApp,
  // checado no webhook (index.ts:582). O motor (`ragentic-processar-inline`) NÃO
  // olha esse campo — só exige que o agente exista e que o caller seja dono/equipe.
  // Por isso o Chat de Teste roda com agente pausado; só avisa que o WhatsApp não vai.
  pausado: boolean;
}

// Mapeia compromissos_ativos do RPC (fn_dossie_lead_consolidado) pro tipo da
// Mente. O Chat-Teste hidratava fatos/episódios/alertas mas esquecia este
// campo → Card "Compromissos ativos" ficava (0) mesmo o agente tendo agendado.
function montarCompromissosAtivos(arr: unknown): CompromissoAtivo[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    .map((x) => {
      const quando = typeof x.executar_em === "string" ? x.executar_em : "";
      return {
        id: String(x.id ?? ""),
        titulo: String(x.titulo ?? "Compromisso"),
        prometido_em: quando,
        vencimento_iso: quando || undefined,
      };
    })
    .filter((c) => c.id.length > 0);
}

function conversaInicial(agente: AgenteInfo): Conversa {
  const cargo = montarCargo("atendimento");
  const agora = new Date().toISOString();
  // Sem saudação simulada — fluxo real: contato (você) começa a conversa.
  return {
    id: `teste-${Date.now()}`,
    lead: {
      id: "lead-teste",
      nome: "Você (modo teste)",
      telefone: "—",
      canal: "whatsapp",
      estado: "lead",
      memoria_longa: {
        resumo: `Teste com ${agente.nome} · sem disparo Z-API.`,
        pontos_chave: [],
        engajamento_score: 0,
        primeiro_contato_iso: agora,
      },
      timeline: [],
    },
    status: "ativa",
    agente_ligado: true,
    cargo_ativo: cargo,
    responsavel_id: null,
    ultima_mensagem_em: agora,
    preview_ultima_mensagem: "",
    mensagens_nao_lidas: 0,
    mente: {
      cargo_ativo: cargo,
      pensamento: pensamentoInicial(),
      tags: [],
      dados_capturados: {},
      prancheta_belief: {},
      confianca_atual: 0,
      score_lead: 0,
      cobertura_prancheta: 0,
      compromissos_ativos: [],
      atualizado_em: agora,
    },
    mensagens: [],
    contratos: [],
    pagamentos: [],
    pedidos: [],
    compromissos: [],
  };
}

interface TraceVolta {
  intencao?: string;
  cargo_alvo?: string;
  urgencia?: string;
  resumo_porteiro?: string;
  tools_usadas?: string[];
  blocos?: Array<{ titulo?: string; id?: string }>;
  latencia_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
  // Onda 2026-05-13 — Mente do dossiê: agora a edge devolve o que foi extraído neste turno.
  tags_sugeridas?: string[];
  campos_extraidos?: Record<string, unknown>;
  agente?: { nome?: string; cargo?: string; tom?: string } | null;
  // Onda 2026-05-14 — score computado pela edge a cada turno (não mais zero estático).
  score_lead?: number; // 0-100
  cobertura_prancheta?: number; // 0-1 (frontend multiplica por 100)
}

interface RespostaInline {
  mensagens?: string[];
  reply?: string;
  trace?: TraceVolta;
  error?: string;
}

// Append de bolha(s) do agente em conversa.mensagens com dedup por conteúdo numa
// janela de 60s — evita duplicar entre o realtime e o fallback do invoke, sem
// bloquear uma resposta legítima idêntica de turnos distantes.
function appendBolhasAgente(c: Conversa, conteudos: string[], criadoEm: string): Conversa {
  const agoraMs = Date.now();
  const recentes = new Set(
    c.mensagens
      .filter((m) => m.papel === "agente" && agoraMs - new Date(m.criado_em).getTime() < 60_000)
      .map((m) => m.conteudo.trim()),
  );
  const novas: Mensagem[] = conteudos
    .filter((x) => typeof x === "string" && x.trim() !== "" && !recentes.has(x.trim()))
    .map((conteudo, i) => ({
      id: `a-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      conversa_id: c.id,
      papel: "agente" as const,
      tipo: "texto" as const,
      conteudo,
      criado_em: criadoEm,
      lido: true,
      enviado: true,
    }));
  if (novas.length === 0) return c;
  const ultimo = novas[novas.length - 1];
  return {
    ...c,
    mensagens: [...c.mensagens, ...novas],
    preview_ultima_mensagem: ultimo.conteudo.slice(0, 80),
    ultima_mensagem_em: criadoEm,
  };
}

export function ChatTeste() {
  const t = pegarToast();
  const [agente, setAgente] = useState<AgenteInfo | null>(null);
  const [conversa, setConversa] = useState<Conversa | null>(null);
  const [conversaIdReal, setConversaIdReal] = useState<string | null>(null);
  const [erroFatal, setErroFatal] = useState<string | null>(null);
  const [resolvendoAgente, setResolvendoAgente] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [agenteDigitando, setAgenteDigitando] = useState<{ duracao_ms: number } | null>(null);
  // Espelho síncrono do conversaIdReal. Callbacks assíncronos (flush de bolhas
  // agendado por setTimeout de 5s no ChatAtivo) liam o state por closure de
  // render — após "Nova sessão" o flush stale caía na conversa antiga. O ref
  // sempre reflete o id atual, matando o stale closure.
  const refConversaId = useRef<string | null>(null);
  // Época do abrirSessao — descarta o resultado de um fetch obsoleto quando o
  // usuário abre outra sessão do histórico no meio da hidratação (race).
  const refAbrirEpoca = useRef(0);
  // Espelho síncrono do lead real da sessão. O pós-turno do onAgrupar lia
  // `conversa.lead.id` do closure (capturado em t+0 com o lead mock) → consultava
  // o lead errado e não corrigia o cargo. O ref sempre reflete o lead atual.
  const refLeadId = useRef<string | null>(null);
  // Timestamp da sessão de teste corrente — entra no phone pra cada sessão
  // ter um lead PRÓPRIO zerado (sem herdar fatos/tags de testes anteriores).
  const refSessaoTs = useRef<number>(Date.now());
  const produtosRef = useRef<ProdutoTreino[]>([]);

  // Layout pela largura do PRÓPRIO app (é janela redimensionável, não só viewport):
  //   < 760px  → celular: só a conversa, histórico e ficha em tela cheia por cima
  //   < 1100px → histórico + conversa; ficha vira painel sobreposto
  //   senão    → as três colunas lado a lado
  const refRaiz = useRef<HTMLDivElement | null>(null);
  const [largura, setLargura] = useState<number>(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );
  const [painel, setPainel] = useState<"historico" | "ficha" | "mentor" | null>(null);

  // ── Chat Treino ──
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [produtos, setProdutos] = useState<ProdutoTreino[]>([]);
  const [carregandoProdutos, setCarregandoProdutos] = useState(true);
  // undefined = ainda não escolheu (mostra a tela de escolha); null = geral.
  const [produtoFoco, setProdutoFoco] = useState<string | null | undefined>(undefined);
  const refProdutoFoco = useRef<string | null | undefined>(undefined);
  const [correcoes, setCorrecoes] = useState<Record<string, CorrecaoBolha>>({});
  const [editando, setEditando] = useState<Mensagem | null>(null);
  const [salvandoCorrecao, setSalvandoCorrecao] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [analise, setAnalise] = useState<AnaliseTreino | null>(null);
  const [erroAnalise, setErroAnalise] = useState<string | null>(null);

  function mudarProdutoFoco(id: string | null | undefined) {
    refProdutoFoco.current = id;
    setProdutoFoco(id);
  }
  const compacto = largura < 760;
  const dossieLateral = largura >= 1100;

  useEffect(() => {
    const el = refRaiz.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entradas) => {
      const w = entradas[0]?.contentRect.width;
      if (w) setLargura(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function setConvId(id: string | null) {
    refConversaId.current = id;
    setConversaIdReal(id);
  }

  useEffect(() => {
    (async () => {
      try {
        const { data: u } = await supabase.auth.getSession();
        const uid = u?.session?.user?.id;
        if (!uid) {
          setErroFatal("Sessão expirada. Faça login novamente.");
          setResolvendoAgente(false);
          return;
        }
        // Antes filtrava `.eq("is_active", true)` e travava a tela inteira com
        // erroFatal quando o tenant tinha a IA Geral pausada. Era o oposto do que
        // se quer: pausar o agente no WhatsApp é exatamente a hora de querer testar
        // sem risco de disparar pro lead. E o motor aceita agente pausado (ver
        // AgenteInfo.pausado). Agora pega o agente mais recente independente do
        // estado, só preferindo um ativo quando existe mais de um.
        const { data, error } = await supabase
          .from("agentes_usuario")
          .select("id, nome_agente, identidade, modelo_principal, is_active")
          .eq("user_id", uid)
          .order("is_active", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) {
          setErroFatal(`Erro buscando agente: ${error.message}`);
          setResolvendoAgente(false);
          return;
        }
        if (!data) {
          setErroFatal('Nenhum agente cadastrado. Crie um em "Agente" antes de testar.');
          setResolvendoAgente(false);
          return;
        }
        const ident = (data.identidade as { nome?: string } | null) ?? {};
        const ag: AgenteInfo = {
          id: String(data.id),
          nome: data.nome_agente || ident.nome || "Agente",
          modelo: data.modelo_principal || "gemini-2.5-flash",
          pausado: data.is_active === false,
        };
        setAgente(ag);
        setConversa(conversaInicial(ag));
        setResolvendoAgente(false);
        try {
          const tid = await resolverTenantId(uid);
          setTenantId(tid);
          setProdutos(await listarProdutos(tid));
        } catch (e) {
          console.warn("[chat-treino] produtos:", (e as Error).message);
        } finally {
          setCarregandoProdutos(false);
        }
      } catch (e) {
        setErroFatal(`Falha ao resolver agente: ${(e as Error).message}`);
        setResolvendoAgente(false);
      }
    })();
  }, []);

  // Onda T (2026-05-14) — Realtime channel pro Chat-Teste.
  // Escuta UPDATE em conversas (cargo_ativo_id, score_lead, dados_ficha) +
  // UPDATE leads (dados_ficha, tags) + INSERT mensagens. Quando dispara, re-chama
  // enriquecerDossieViaRPC pra atualizar fatos_do_lead/episodios/alertas/cargo+regras
  // sem precisar fazer turno novo. Resolve o problema do dossiê defasado entre turnos.
  useEffect(() => {
    if (!conversaIdReal || !conversa?.lead?.id) return;
    const leadId = conversa.lead.id;
    const convId = conversaIdReal;
    let timerDebounce: ReturnType<typeof setTimeout> | null = null;
    const refetch = async () => {
      try {
        const dossie = await enriquecerDossieViaRPC(leadId, convId);
        if (!dossie) return;
        setConversa((c) => {
          if (!c) return c;
          // Sincroniza cargo_ativo com o que está no banco (a edge UPDATE em conversas.cargo_ativo_id
          // a cada turno; sem esse mapeamento aqui o cargo na UI ficava stale como "Atendimento" mock
          // até o usuário fechar e reabrir a tela). Onda 2026-05-14 cargo-realtime.
          const ca = dossie.cargo_ativo;
          const cargoNovo: Cargo = ca
            ? montarCargo(
                (ca.tipologia ?? "atendimento") as CargoTipologia,
                ca.nome,
                ca.objetivo_principal ?? undefined,
                Array.isArray(ca.campos_rastreio)
                  ? (ca.campos_rastreio as unknown[])
                      .map((x): CampoCargo | null => {
                        if (typeof x === "string" && x.length > 0) return { chave: x, obrigatorio: true };
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
                      .filter((x): x is CampoCargo => x !== null)
                  : [],
              )
            : c.cargo_ativo;
          if (cargoNovo && ca?.regras_livres) cargoNovo.regras_livres = ca.regras_livres;
          // atualizado_em muda em todo refetch — sinaliza pras abas (Mente/Quem/Financeiro/
          // Operação/Compromissos) que precisam re-puxar o RPC. Sem isso, fica stale.
          return {
            ...c,
            cargo_ativo: cargoNovo,
            // Onda 2026-05-16 — hidrata o bloco `lead` (AbaQuem) com dado real do
            // RPC; antes ficava o mock fixo de conversaInicial (engajamento 0,
            // pontos-chave vazio, "em contato hoje" sempre).
            lead: {
              ...c.lead,
              nome: dossie.lead?.nome_exibicao ?? dossie.lead?.name ?? c.lead.nome,
              telefone:
                dossie.lead?.phone && !dossie.lead.phone.startsWith("__chat_teste")
                  ? dossie.lead.phone
                  : c.lead.telefone,
              memoria_longa: montarMemoriaLonga(
                dossie,
                c.mente.score_lead,
                c.lead.memoria_longa.primeiro_contato_iso,
              ),
              timeline: montarTimelineQuem(dossie),
            },
            mente: {
              ...c.mente,
              cargo_ativo: cargoNovo,
              // Pensamento RICO do RPC também entre turnos (realtime), não só
              // pós-turno. Mantém o atual se o RPC ainda não tiver conteúdo.
              pensamento: pensamentoDoDossie(
                dossie.pensamento_atual ?? null,
                c.mente.pensamento,
                ehAcaoValida,
              ),
              fatos_do_lead: dossie.fatos,
              episodios: dossie.episodios,
              alertas: dossie.alertas,
              compromissos_ativos: montarCompromissosAtivos(dossie.compromissos_ativos),
              atualizado_em: dossie.gerado_em,
            },
          };
        });
      } catch (e) {
        console.warn("[chat-teste realtime] enriquecer falhou:", (e as Error).message);
      }
    };
    const triggerDebounced = () => {
      if (timerDebounce) clearTimeout(timerDebounce);
      timerDebounce = setTimeout(() => {
        timerDebounce = null;
        void refetch();
      }, 800);
    };
    // Realtime SEM filtro server-side + checagem client-side — mesmo padrão do
    // SidebarHistorico (que funciona). O filtro server-side `conversation_id=eq.X`
    // não estava entregando, por isso chat/ficha só atualizavam ao reabrir.
    const onMensagemInsert = (payload: { new?: Record<string, unknown> }) => {
      const row = (payload?.new ?? {}) as { conversation_id?: string; role?: string; content?: string | null; created_at?: string };
      if (row.conversation_id !== convId) return;
      // Bolha do agente aparece na hora que o motor grava (cedo, antes do retorno
      // lento do invoke). role=user já entrou otimista via onComitarLocal — não duplica.
      if (row.role && row.role !== "user") {
        const criadoEm = typeof row.created_at === "string" ? row.created_at : new Date().toISOString();
        setConversa((c) => (c ? appendBolhasAgente(c, [String(row.content ?? "")], criadoEm) : c));
        setAgenteDigitando(null);
      }
      triggerDebounced();
    };
    const ch = supabase
      .channel(`chat-teste-rt-${convId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversas" }, (p: { new?: Record<string, unknown> }) => {
        const row = (p?.new ?? {}) as { id?: string; produto_foco_id?: string | null };
        if (row.id !== convId) return;
        // O motor trocou o produto em foco (o lead passou a falar de outro) → a ficha troca junto.
        if ("produto_foco_id" in row && (row.produto_foco_id ?? null) !== (refProdutoFoco.current ?? null)) {
          mudarProdutoFoco(row.produto_foco_id ?? null);
          const nome = produtosRef.current.find((x) => x.id === row.produto_foco_id)?.nome;
          t.info?.(nome ? `Ficha trocada para ${nome}` : "Ficha trocada para geral");
        }
        triggerDebounced();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensagens" }, onMensagemInsert)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "leads" }, (p: { new?: Record<string, unknown> }) => {
        if (((p?.new ?? {}) as { id?: string }).id === leadId) triggerDebounced();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "memoria_lead" }, (p: { new?: Record<string, unknown> }) => {
        if (((p?.new ?? {}) as { lead_id?: string }).lead_id === leadId) triggerDebounced();
      })
      .subscribe();
    return () => {
      if (timerDebounce) clearTimeout(timerDebounce);
      void supabase.removeChannel(ch);
    };
  }, [conversaIdReal, conversa?.lead?.id]);

  // Cria uma sessão de teste NOVA e zerada: lead PRÓPRIO (sem herdar fatos de
  // testes anteriores) + conversa channel='teste'. `resetarConversa` true zera
  // a tela (clique explícito em Nova sessão/Reiniciar); false preserva as
  // bolhas que o usuário acabou de digitar (criação preguiçosa na 1ª mensagem).
  async function criarSessaoNova(opts: { resetarConversa: boolean }): Promise<string | null> {
    if (!agente?.id) {
      setErroFatal("Agente ainda não resolvido. Aguarde e tente novamente.");
      return null;
    }
    const { data: u } = await supabase.auth.getSession();
    const uid = u?.session?.user?.id;
    if (!uid) {
      setErroFatal("Sessão expirada.");
      return null;
    }
    const sessaoTs = Date.now();
    refSessaoTs.current = sessaoTs;
    const phoneSessao = gerarPhoneSessaoTeste(uid, sessaoTs);
    // Lead de teste NOVO e zerado pra esta sessão. Entidade legítima da
    // plataforma (tag `lead_de_teste`) — o phone único por sessão garante que
    // o agente trate como 1º contato, sem memória/tags de testes anteriores.
    const { data: leadNovo, error: errLead } = await supabase
      .from("leads")
      .insert({
        tenant_id: uid,
        agente_id: agente.id,
        phone: phoneSessao,
        name: "Lead de Teste",
        nome_exibicao: "Lead de Teste",
        dados_ficha: {},
        tags: ["lead_de_teste"],
      })
      .select("id")
      .single();
    if (errLead || !leadNovo?.id) {
      setErroFatal(`Não consegui criar o lead de teste: ${errLead?.message ?? "sem id"}`);
      return null;
    }
    const leadIdTeste = String(leadNovo.id);
    refLeadId.current = leadIdTeste;
    const { data, error } = await supabase
      .from("conversas")
      .insert({
        tenant_id: uid,
        agente_id: agente.id,
        phone: phoneSessao,
        channel: "teste",
        status: "ativa",
        agent_enabled: true,
        lead_id: leadIdTeste,
        produto_foco_id: opts.resetarConversa ? null : (refProdutoFoco.current ?? null),
      } as never)
      .select("id")
      .single();
    if (error || !data?.id) {
      setErroFatal(`Não consegui criar conversa de teste: ${error?.message ?? "sem id"}`);
      return null;
    }
    const convId = String(data.id);
    setConvId(convId);
    setCorrecoes({});
    setAnalise(null);
    setErroAnalise(null);
    if (opts.resetarConversa) {
      const base = conversaInicial(agente);
      setConversa({ ...base, lead: { ...base.lead, id: leadIdTeste } });
      mudarProdutoFoco(undefined); // sessão nova: escolhe o produto de novo
    } else {
      // 1ª mensagem na tela inicial: preserva as bolhas locais, só corrige o
      // lead.id mock pelo UUID real (realtime + RPC do dossiê precisam dele).
      setConversa((c) => (c ? { ...c, lead: { ...c.lead, id: leadIdTeste } } : c));
    }
    return convId;
  }

  async function garantirConversaReal(): Promise<string | null> {
    if (refConversaId.current) return refConversaId.current;
    return criarSessaoNova({ resetarConversa: false });
  }

  function onComitarLocal(texto: string) {
    if (!conversa) return;
    const agora = new Date().toISOString();
    const nova: Mensagem = {
      id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      conversa_id: conversa.id,
      papel: "lead",
      tipo: "texto",
      conteudo: texto,
      criado_em: agora,
      lido: true,
      enviado: true,
    };
    setConversa((c) =>
      c
        ? {
            ...c,
            mensagens: [...c.mensagens, nova],
            preview_ultima_mensagem: texto.slice(0, 80),
            ultima_mensagem_em: agora,
          }
        : c,
    );
  }

  async function onAgrupar(bolhas: string[]) {
    if (bolhas.length === 0 || !agente || !conversa || enviando) return;
    setEnviando(true);
    setAgenteDigitando({ duracao_ms: 1500 });
    // Bolhas já foram renderizadas via onComitarLocal a cada Enter — não duplicar aqui.
    const textoUnido = bolhas.join("\n");

    let convId: string | null = null;
    try {
      convId = await garantirConversaReal();
      if (!convId) {
        setEnviando(false);
        setAgenteDigitando(null);
        return;
      }
      const { data, error } = await supabase.functions.invoke<RespostaInline>(
        "ragentic-processar-inline",
        {
          body: {
            agente_id: agente.id,
            phone: "__chat_teste__",
            message: textoUnido,
            conversation_id: convId,
            modo_teste: true,
          },
        },
      );
      if (error) throw new Error(error.message || "erro na chamada da edge");
      if (data?.error) throw new Error(data.error);

      const bolhas = Array.isArray(data?.mensagens) && data.mensagens.length
        ? data.mensagens
        : data?.reply
          ? [data.reply]
          : [];
      const trace = data?.trace ?? {};

      // As bolhas do agente aparecem via realtime (INSERT em mensagens), assim que
      // o motor as grava — não dependem mais do retorno lento do invoke nem de
      // setTimeout (que vazava pra conversa errada / duplicava ao trocar de sessão).
      // Fallback: se o realtime ainda não entregou, insere agora (dedup por conteúdo),
      // guardado por convId pra nunca cair na conversa errada.
      if (refConversaId.current === convId && bolhas.length > 0) {
        const agoraResp = new Date().toISOString();
        setConversa((c) => (c ? appendBolhasAgente(c, bolhas, agoraResp) : c));
      }
      setAgenteDigitando(null);

      // Onda 2026-05-14 (cargo-realtime) — substitui `buscarCargoReal(agente.id, tipologia)`
      // que dependia de `trace.cargo_alvo` (vinha null da edge → fallback "atendimento"
      // → cargo na UI ficava stale como Atendimento mesmo o banco já tendo Vendedor).
      // Agora puxa o cargo REAL via RPC consolidado pelo `cargo_ativo_id` que a edge
      // gravou em `conversas`. Também aproveita pra refrescar fatos/episódios/alertas.
      const leadIdAtual = refLeadId.current ?? conversa.lead?.id;
      const dossieAposTurno = leadIdAtual
        ? await enriquecerDossieViaRPC(leadIdAtual, convId)
        : null;
      const ca = dossieAposTurno?.cargo_ativo;
      const tipologia = (ca?.tipologia ?? "atendimento") as CargoTipologia;
      const cargoNovo = montarCargo(
        tipologia,
        ca?.nome,
        ca?.objetivo_principal ?? undefined,
        Array.isArray(ca?.campos_rastreio)
          ? (ca!.campos_rastreio as unknown[])
              .map((x): CampoCargo | null => {
                if (typeof x === "string" && x.length > 0) return { chave: x, obrigatorio: true };
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
              .filter((x): x is CampoCargo => x !== null)
          : [],
      );
      if (cargoNovo && ca?.regras_livres) cargoNovo.regras_livres = ca.regras_livres;
      const acaoPretendida: AcaoPretendida = trace.urgencia === "alta"
        ? "fechar"
        : trace.intencao && trace.intencao.includes("preco")
          ? "oferecer"
          : ehAcaoValida(trace.intencao)
            ? (trace.intencao as AcaoPretendida)
            : "responder_e_aguardar";

      const planoTurnos: PlanoTurno[] = (trace.tools_usadas ?? []).slice(0, 3).map((tool, idx) => ({
        turno: idx + 1,
        o_que_fazer: `Usar tool ${tool}`,
        por_que: "Sinalizado pelo motor neste turno.",
      }));

      const pensamentoNovo: Pensamento = {
        id: `pens-${Date.now()}`,
        proxima_intencao: trace.resumo_porteiro || trace.intencao || "Processando próximo turno",
        acao_pretendida: acaoPretendida,
        leitura_da_situacao: trace.intencao ? `Intenção: ${trace.intencao}` : null,
        motivo: trace.urgencia ? `Urgência: ${trace.urgencia}` : null,
        quando_voltar: null,
        plano_proximos_turnos: planoTurnos,
        criado_em: new Date().toISOString(),
      };

      const totalTokens = (trace.tokens_in ?? 0) + (trace.tokens_out ?? 0);

      // Onda 2026-05-13 — alimenta a Mente com o que a edge extraiu neste turno.
      // Tags: dedup + cap 20. Dados capturados: merge só com valores não-nulos.
      // Cobertura: campos preenchidos ÷ total do cargo (campos_rastreio) × 100.
      const tagsRecebidas = Array.isArray(trace.tags_sugeridas) ? trace.tags_sugeridas : [];
      const camposRecebidos = (trace.campos_extraidos && typeof trace.campos_extraidos === "object")
        ? trace.campos_extraidos
        : {};

      if (refConversaId.current !== convId) return;
      setConversa((c) => {
        if (!c) return c;
        const tagsMescladas = Array.from(
          new Set([...(c.mente.tags ?? []), ...tagsRecebidas].filter((x) => typeof x === "string" && x.length > 0)),
        ).slice(0, 20);
        const dadosCapturadosNovos: Record<string, string | number | null> = { ...(c.mente.dados_capturados ?? {}) };
        for (const [k, v] of Object.entries(camposRecebidos)) {
          if (v === null || v === undefined || v === "") continue;
          if (typeof v === "string" || typeof v === "number") dadosCapturadosNovos[k] = v;
          else if (typeof v === "boolean") dadosCapturadosNovos[k] = v ? "sim" : "não";
          else dadosCapturadosNovos[k] = JSON.stringify(v);
        }
        // Onda 2026-05-14 — score e cobertura vêm COMPUTADOS da edge (não mais fake +12).
        // Fallback local mantido caso o trace não traga (cargo sem campos, lead null, etc).
        const obrigatorios = (cargoNovo.campos_rastreio ?? []).filter((c) => c.obrigatorio !== false);
        const coberturaLocal = obrigatorios.length > 0
          ? Math.round(
              (obrigatorios.filter((c) => {
                const v = dadosCapturadosNovos[c.chave];
                return v !== undefined && v !== null && String(v).trim() !== "";
              }).length / obrigatorios.length) * 100,
            )
          : c.mente.cobertura_prancheta;
        const cobertura = typeof trace.cobertura_prancheta === "number"
          ? Math.round(trace.cobertura_prancheta * 100)
          : coberturaLocal;
        const scoreNovo = typeof trace.score_lead === "number"
          ? Math.max(0, Math.min(100, trace.score_lead))
          : c.mente.score_lead;
        return {
          ...c,
          cargo_ativo: cargoNovo,
          // Onda 2026-05-16 — hidrata o bloco `lead` (AbaQuem) pós-turno com o
          // dossiê do RPC; substitui o mock fixo de conversaInicial.
          lead: dossieAposTurno
            ? {
                ...c.lead,
                nome:
                  dossieAposTurno.lead?.nome_exibicao ??
                  dossieAposTurno.lead?.name ??
                  c.lead.nome,
                telefone:
                  dossieAposTurno.lead?.phone &&
                  !dossieAposTurno.lead.phone.startsWith("__chat_teste")
                    ? dossieAposTurno.lead.phone
                    : c.lead.telefone,
                memoria_longa: montarMemoriaLonga(
                  dossieAposTurno,
                  scoreNovo,
                  c.lead.memoria_longa.primeiro_contato_iso,
                ),
                timeline: montarTimelineQuem(dossieAposTurno),
              }
            : c.lead,
          mente: {
            ...c.mente,
            cargo_ativo: cargoNovo,
            // Pensamento RICO do RPC (pensamento_atual): motivo, leitura da
            // situação e plano real dos próximos turnos que o motor gera e
            // persiste. Fallback no `pensamentoNovo` (trace) só se o RPC vier
            // sem conteúdo útil. Antes o trace raso era usado sempre.
            pensamento: pensamentoDoDossie(
              dossieAposTurno?.pensamento_atual ?? null,
              pensamentoNovo,
              ehAcaoValida,
            ),
            confianca_atual: 0.85,
            score_lead: scoreNovo,
            cobertura_prancheta: cobertura,
            tags: tagsMescladas,
            dados_capturados: dadosCapturadosNovos,
            prancheta_belief: {
              ...c.mente.prancheta_belief,
              ultimo_resumo: trace.resumo_porteiro ?? null,
              latencia_ms: trace.latencia_ms ?? null,
              tokens: totalTokens,
              tools: trace.tools_usadas ?? [],
              identidade_agente: trace.agente ?? null,
            },
            // Hidrata fatos/episódios/alertas do RPC pós-turno — substitui a espera
            // do debounce do realtime (800ms). Onda 2026-05-14 cargo-realtime.
            fatos_do_lead: dossieAposTurno?.fatos ?? c.mente.fatos_do_lead,
            episodios: dossieAposTurno?.episodios ?? c.mente.episodios,
            alertas: dossieAposTurno?.alertas ?? c.mente.alertas,
            compromissos_ativos: dossieAposTurno
              ? montarCompromissosAtivos(dossieAposTurno.compromissos_ativos)
              : c.mente.compromissos_ativos,
            atualizado_em: dossieAposTurno?.gerado_em ?? new Date().toISOString(),
          },
        };
      });
    } catch (e) {
      const msg = (e as Error).message ?? "erro desconhecido";
      t.error(`Ragentic: ${msg}`);
      if (refConversaId.current !== convId) return;
      setConversa((c) =>
        c
          ? {
              ...c,
              mensagens: [
                ...c.mensagens,
                {
                  id: `err-${Date.now()}`,
                  conversa_id: c.id,
                  papel: "sistema",
                  tipo: "texto",
                  conteudo: `[erro do motor] ${msg}`,
                  criado_em: new Date().toISOString(),
                  lido: true,
                  enviado: false,
                },
              ],
            }
          : c,
      );
    } finally {
      setEnviando(false);
      setAgenteDigitando(null);
    }
  }

  // "Nova sessão" — começa um teste zerado. NÃO toca na conversa anterior:
  // ela continua no histórico (sidebar) pra revisitar.
  async function novaSessao() {
    const id = await criarSessaoNova({ resetarConversa: true });
    if (id) t.info?.("Nova sessão · teste zerado");
  }

  // "Reiniciar" — apaga os dados da sessão atual (conversa encerrada +
  // mensagens e lead soft-deletados) e recomeça do zero. `conversas` não tem
  // deleted_at; encerrar + esconder no histórico = sumir da lista.
  async function reiniciar() {
    const alvo = refConversaId.current;
    const leadAlvo =
      conversa?.lead?.id && conversa.lead.id !== "lead-teste" ? conversa.lead.id : null;
    if (alvo) {
      const agora = new Date().toISOString();
      // deno-lint-ignore no-explicit-any
      const sb = supabase as unknown as { from: (t: string) => any };
      await sb.from("conversas").update({ status: "encerrada" }).eq("id", alvo);
      await sb
        .from("mensagens")
        .update({ deleted_at: agora })
        .eq("conversation_id", alvo)
        .is("deleted_at", null);
      if (leadAlvo) {
        await sb.from("leads").update({ deleted_at: agora }).eq("id", leadAlvo);
      }
    }
    const id = await criarSessaoNova({ resetarConversa: true });
    if (id) t.info?.("Sessão apagada · recomeçando do zero");
  }

  // Reabre uma sessão antiga do histórico — carrega mensagens, lead, cargo real e
  // dossiê consolidado do banco. Onda 2026-05-14: antes só puxava msgs + lead_id e
  // resetava o resto pra mock (Atendimento, score 0, sem regras_livres, sem fatos).
  // Agora hidrata cargo_ativo + score + tags + dados_ficha + fatos + episódios
  // numa só passada (4 queries paralelas + RPC).
  // deno-lint-ignore no-explicit-any
  async function abrirSessao(s: SessaoTeste) {
    if (!agente) return;
    if (s.id === refConversaId.current) return;
    const minhaEpoca = ++refAbrirEpoca.current;
    setConvId(s.id);
    const sb = supabase as unknown as { from: (t: string) => any };
    const [msgsRes, convRes] = await Promise.all([
      sb.from("mensagens")
        .select("id, role, content, created_at")
        .eq("conversation_id", s.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(200),
      sb.from("conversas")
        .select("lead_id, cargo_ativo_id, score_lead, status, produto_foco_id")
        .eq("id", s.id)
        .maybeSingle(),
    ]);
    if (minhaEpoca !== refAbrirEpoca.current) return; // abriu outra sessão: obsoleto
    const msgs: Array<{ id: string; role: string; content: string | null; created_at: string }> = msgsRes.data ?? [];
    const convDados = (convRes.data ?? null) as { lead_id: string | null; cargo_ativo_id: string | null; score_lead: number | null; status: string | null; produto_foco_id?: string | null } | null;
    mudarProdutoFoco(convDados?.produto_foco_id ?? null);
    setAnalise(null);
    setErroAnalise(null);
    setCorrecoes(await carregarCorrecoes(s.id));
    if (minhaEpoca !== refAbrirEpoca.current) return;
    const leadIdReal = convDados?.lead_id ?? null;
    refLeadId.current = leadIdReal;
    const cargoAtivoId = convDados?.cargo_ativo_id ?? null;
    const scoreLeadBanco = convDados?.score_lead ?? 0;

    // 2ª onda: lead completo + cargo real + dossiê consolidado em paralelo.
    const [leadRes, cargoRes, dossieRes] = await Promise.all([
      leadIdReal
        ? sb.from("leads")
            .select("id, name, nome_exibicao, phone, url_foto_perfil, tags, dados_ficha")
            .eq("id", leadIdReal)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      cargoAtivoId
        ? sb.from("cargos")
            .select("id, nome, tipologia, objetivo_principal, regras_livres, campos_rastreio")
            .eq("id", cargoAtivoId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      leadIdReal ? enriquecerDossieViaRPC(leadIdReal, s.id) : Promise.resolve(null),
    ]);
    if (minhaEpoca !== refAbrirEpoca.current) return; // abriu outra sessão: obsoleto

    const leadDb = (leadRes as { data: Record<string, unknown> | null }).data;
    const cargoDb = (cargoRes as { data: Record<string, unknown> | null }).data;
    const dossie = dossieRes;

    const mensagens: Mensagem[] = msgs.map((m) => ({
      id: m.id,
      conversa_id: s.id,
      papel: (m.role === "user" ? "lead" : m.role === "assistant" ? "agente" : "sistema") as Mensagem["papel"],
      tipo: "texto" as const,
      conteudo: m.content || "",
      criado_em: m.created_at,
      lido: true,
      enviado: true,
    }));

    const baseConversa = conversaInicial(agente);
    const tipologiaCargo = (cargoDb?.tipologia ?? "atendimento") as CargoTipologia;
    const cargoMontado = cargoDb
      ? montarCargo(
          tipologiaCargo,
          typeof cargoDb.nome === "string" ? cargoDb.nome : undefined,
          typeof cargoDb.objetivo_principal === "string" ? cargoDb.objetivo_principal : undefined,
          Array.isArray(cargoDb.campos_rastreio)
            ? (cargoDb.campos_rastreio as unknown[])
                .map((x): CampoCargo | null => {
                  if (typeof x === "string" && x.length > 0) return { chave: x, obrigatorio: true };
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
                .filter((x): x is CampoCargo => x !== null)
            : [],
        )
      : baseConversa.cargo_ativo;
    // Anexa regras_livres no cargo (Cargo type tem esse campo).
    if (cargoMontado && cargoDb && typeof cargoDb.regras_livres === "string") {
      cargoMontado.regras_livres = cargoDb.regras_livres;
    }

    const tagsLead = Array.isArray(leadDb?.tags) ? (leadDb!.tags as string[]) : [];
    const dadosFicha = (leadDb?.dados_ficha && typeof leadDb.dados_ficha === "object")
      ? leadDb.dados_ficha as Record<string, string | number | null>
      : {};
    const nomeLead = String(leadDb?.nome_exibicao ?? leadDb?.name ?? baseConversa.lead.nome);
    const telLead = String(leadDb?.phone ?? baseConversa.lead.telefone);
    const fotoLead = typeof leadDb?.url_foto_perfil === "string" ? leadDb.url_foto_perfil : undefined;

    // Cobertura calculada com base nos campos_rastreio obrigatórios.
    const obrigatorios = (cargoMontado.campos_rastreio ?? []).filter((c) => c.obrigatorio !== false);
    const cobertura = obrigatorios.length > 0
      ? Math.round(
          (obrigatorios.filter((c) => {
            const v = dadosFicha[c.chave];
            return v !== undefined && v !== null && String(v).trim() !== "";
          }).length / obrigatorios.length) * 100,
        )
      : 0;

    setConversa({
      ...baseConversa,
      id: s.id,
      lead: {
        ...baseConversa.lead,
        id: leadIdReal ?? baseConversa.lead.id,
        nome: dossie?.lead?.nome_exibicao ?? dossie?.lead?.name ?? nomeLead,
        telefone: telLead && !telLead.startsWith("__chat_teste") ? telLead : "—",
        foto_url: fotoLead,
        // Onda 2026-05-16 — reabrir sessão hidrata memoria_longa/timeline reais
        // do RPC (antes herdava o mock de conversaInicial via baseConversa).
        memoria_longa: dossie
          ? montarMemoriaLonga(
              dossie,
              Number(scoreLeadBanco) || 0,
              baseConversa.lead.memoria_longa.primeiro_contato_iso,
            )
          : baseConversa.lead.memoria_longa,
        timeline: dossie ? montarTimelineQuem(dossie) : [],
      },
      mensagens,
      cargo_ativo: cargoMontado,
      ultima_mensagem_em: s.updated_at,
      preview_ultima_mensagem: s.ultima_msg_preview,
      status: s.status === "encerrada" ? "encerrada" : "ativa",
      mente: {
        ...baseConversa.mente,
        cargo_ativo: cargoMontado,
        tags: tagsLead,
        dados_capturados: dadosFicha,
        fatos_do_lead: dossie?.fatos ?? [],
        episodios: dossie?.episodios ?? [],
        alertas: dossie?.alertas ?? [],
        compromissos_ativos: montarCompromissosAtivos(dossie?.compromissos_ativos),
        score_lead: Number(scoreLeadBanco) || 0,
        cobertura_prancheta: cobertura,
        atualizado_em: dossie?.gerado_em ?? new Date().toISOString(),
      },
    });
  }

  useEffect(() => {
    produtosRef.current = produtos;
  }, [produtos]);

  // ── Chat Treino: produto em foco ──
  async function escolherProduto(id: string | null) {
    mudarProdutoFoco(id);
    const convId = refConversaId.current;
    if (!convId) return; // a sessão nasce na 1ª mensagem já com o produto
    try {
      await definirProdutoFoco(convId, id);
      const nome = produtos.find((p) => p.id === id)?.nome;
      t.info?.(nome ? `Treinando: ${nome}` : "Treino geral (sem produto)");
    } catch (e) {
      t.error(`Não troquei o produto: ${(e as Error).message}`);
    }
  }

  // ── Chat Treino: lápis ──
  async function salvarEdicao(textoCorrigido: string, sugestao: string) {
    const m = editando;
    const convId = refConversaId.current;
    if (!m || !convId || !tenantId) return;
    setSalvandoCorrecao(true);
    try {
      const idReal = await resolverIdMensagem(convId, m.id, m.conteudo);
      if (!idReal) throw new Error("não achei essa mensagem no banco — espere a resposta terminar de chegar");
      await salvarCorrecao({
        tenantId,
        conversaId: convId,
        mensagemId: idReal,
        textoOriginal: m.conteudo,
        textoCorrigido,
        sugestao,
      });
      const corrigido = textoCorrigido.trim() && textoCorrigido.trim() !== m.conteudo.trim() ? textoCorrigido.trim() : null;
      setCorrecoes((c) => {
        const novo = { ...c };
        if (!corrigido && !sugestao.trim()) delete novo[m.id];
        else novo[m.id] = { texto_corrigido: corrigido, sugestao: sugestao.trim() || null };
        return novo;
      });
      setEditando(null);
      t.success("Correção salva");
    } catch (e) {
      t.error(`Correção não salva: ${(e as Error).message}`);
    } finally {
      setSalvandoCorrecao(false);
    }
  }

  // ── Chat Treino: Mentor ──
  async function analisar() {
    const convId = refConversaId.current;
    if (!convId || analisando) return;
    setAnalisando(true);
    setErroAnalise(null);
    setPainel("mentor");
    try {
      setAnalise(await analisarConversa(convId));
    } catch (e) {
      setErroAnalise((e as Error).message);
    } finally {
      setAnalisando(false);
    }
  }

  const qtdCorrecoes = Object.keys(correcoes).length;
  const temFalaAgente = !!conversa?.mensagens.some((m) => m.papel === "agente");
  const produtoNome = produtoFoco ? produtos.find((p) => p.id === produtoFoco)?.nome ?? null : null;
  const mostrarEscolhaProduto =
    !!agente && produtoFoco === undefined && (conversa?.mensagens.length ?? 0) === 0;

  const reiniciarBloqueado = enviando || resolvendoAgente;
  const subtitulo = resolvendoAgente
    ? "resolvendo agente…"
    : agente
      ? compacto
        ? agenteDigitando
          ? "digitando…"
          : `treino${produtoNome ? ` · ${produtoNome}` : ""}${agente.pausado ? " · IA Geral pausada" : ""}`
        : `${agente.nome} · ${agente.modelo}${agente.pausado ? " · IA Geral pausada" : ""}`
      : "nenhum agente cadastrado";

  const botaoIcone = {
    background: "none",
    border: "none",
    color: "var(--txt-1)",
    fontSize: 20,
    lineHeight: 1,
    padding: "6px 8px",
    borderRadius: 999,
    cursor: "pointer",
    flexShrink: 0,
  } as const;

  const painelMentor = (
    <PainelMentor
      analisando={analisando}
      analise={analise}
      erro={erroAnalise}
      podeAnalisar={!!conversaIdReal && temFalaAgente}
      qtdCorrecoes={qtdCorrecoes}
      produtoNome={produtoNome}
      onAnalisar={() => void analisar()}
      onFechar={() => setPainel(null)}
    />
  );

  const painelDossie = conversa && (
    <Dossie
      conversa={conversa}
      conversaIdOverride={conversaIdReal}
      onTrocarCargo={() => t.info?.("Modo teste · cargo é decidido pelo motor a cada turno")}
      onExecutarTurno={(turno) => t.info?.(`T+${turno.turno}: ${turno.o_que_fazer}`)}
    />
  );

  return (
    <div
      ref={refRaiz}
      className={compacto ? "chat-teste-celular" : undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
        position: "relative",
        color: "var(--txt-1)",
      }}
    >
      {/* Celular: fonte do composer em 16px — abaixo disso o iOS dá zoom ao focar. */}
      {compacto && (
        <style>{`.chat-teste-celular textarea { font-size: 16px !important; }`}</style>
      )}

      {compacto ? (
        // Barra estilo WhatsApp: histórico · contato (o agente) · ficha · reiniciar.
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "8px 6px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(15, 12, 30, 0.55)",
            flexShrink: 0,
          }}
        >
          <button type="button" style={botaoIcone} onClick={() => setPainel("historico")} aria-label="Abrir histórico de sessões" disabled={!agente}>
            ☰
          </button>
          <button
            type="button"
            onClick={() => conversa && setPainel("ficha")}
            aria-label="Abrir ficha da conversa"
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "none",
              border: "none",
              color: "inherit",
              textAlign: "left",
              padding: "2px 4px",
              cursor: "pointer",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                background: "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.25), oklch(0.65 0.22 280 / 0.25))",
                border: "1px solid oklch(0.7 0.18 220 / 0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                flexShrink: 0,
              }}
            >
              🤖
            </span>
            <span style={{ display: "flex", flexDirection: "column", minWidth: 0, lineHeight: 1.2 }}>
              <span style={{ fontSize: 16, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {agente?.nome ?? "Chat Treino"}
              </span>
              <span
                className="muted"
                style={{
                  fontSize: 12,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  color: agenteDigitando ? "oklch(0.85 0.20 145)" : undefined,
                }}
              >
                {subtitulo}
              </span>
            </span>
          </button>
          <button type="button" style={botaoIcone} onClick={() => setPainel("mentor")} aria-label="Abrir Mentor de Humanização" disabled={!agente}>
            🧠
          </button>
          <button type="button" style={botaoIcone} onClick={() => conversa && setPainel("ficha")} aria-label="Abrir ficha" disabled={!conversa}>
            ⓘ
          </button>
          <button
            type="button"
            style={{ ...botaoIcone, opacity: reiniciarBloqueado ? 0.4 : 1, cursor: reiniciarBloqueado ? "not-allowed" : "pointer" }}
            onClick={() => void reiniciar()}
            disabled={reiniciarBloqueado}
            aria-label="Reiniciar sessão"
          >
            ↻
          </button>
        </header>
      ) : (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 10,
            padding: "10px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.18), oklch(0.65 0.22 280 / 0.18))",
              border: "1px solid oklch(0.7 0.18 220 / 0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
            }}
          >
            🤖
          </span>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Chat Treino</span>
            <span className="muted tiny">{subtitulo}</span>
          </div>
          <span
            style={{
              fontSize: 10,
              padding: "3px 8px",
              borderRadius: 999,
              border: "1px solid oklch(0.72 0.20 145 / 0.40)",
              background: "oklch(0.72 0.20 145 / 0.10)",
              color: "oklch(0.85 0.20 145)",
              fontWeight: 600,
              letterSpacing: 0.2,
            }}
          >
            Motor real · sem Z-API
          </span>
          {agente?.pausado && (
            <span
              title='A IA Geral deste tenant está pausada em "Agente" — o WhatsApp não responde lead nenhum. O teste aqui roda normalmente.'
              style={{
                fontSize: 10,
                padding: "3px 8px",
                borderRadius: 999,
                border: "1px solid oklch(0.78 0.16 75 / 0.40)",
                background: "oklch(0.78 0.16 75 / 0.10)",
                color: "oklch(0.86 0.16 75)",
                fontWeight: 600,
                letterSpacing: 0.2,
              }}
            >
              IA Geral pausada · WhatsApp mudo
            </span>
          )}
          <span style={{ marginLeft: "auto" }} />
          {agente && produtoFoco !== undefined && (
            <SeletorProdutoTopo produtos={produtos} valor={produtoFoco} onTrocar={(id) => void escolherProduto(id)} />
          )}
          <button
            type="button"
            onClick={() => setPainel((p) => (p === "mentor" ? null : "mentor"))}
            disabled={!agente}
            aria-pressed={painel === "mentor"}
            title="Mentor de Humanização — analisa a conversa e grava a conversa padrão"
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid oklch(0.78 0.16 75 / 0.45)",
              background: painel === "mentor" ? "oklch(0.78 0.16 75 / 0.22)" : "oklch(0.78 0.16 75 / 0.10)",
              color: "oklch(0.92 0.12 75)",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            🧠 Mentor · Analisar{qtdCorrecoes ? ` (${qtdCorrecoes} ✎)` : ""}
          </button>
          {!dossieLateral && (
            <button
              type="button"
              onClick={() => setPainel((p) => (p === "ficha" ? null : "ficha"))}
              disabled={!conversa}
              aria-pressed={painel === "ficha"}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid oklch(0.7 0.18 220 / 0.40)",
                background: painel === "ficha" ? "oklch(0.7 0.18 220 / 0.18)" : "rgba(255,255,255,0.04)",
                color: "var(--txt-1)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              ⓘ Ficha
            </button>
          )}
          <button
            type="button"
            onClick={() => void reiniciar()}
            disabled={reiniciarBloqueado}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              color: "var(--txt-2)",
              fontSize: 12,
              cursor: reiniciarBloqueado ? "not-allowed" : "pointer",
              opacity: reiniciarBloqueado ? 0.5 : 1,
            }}
          >
            ↻ Reiniciar
          </button>
        </header>
      )}

      {erroFatal && (
        <div
          role="status"
          style={{
            padding: "8px 16px",
            borderBottom: "1px solid oklch(0.78 0.18 25 / 0.30)",
            background: "oklch(0.78 0.18 25 / 0.08)",
            color: "oklch(0.85 0.18 25)",
            fontSize: 12,
            overflowWrap: "anywhere",
          }}
        >
          ⚠ {erroFatal}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", minHeight: 0, minWidth: 0, position: "relative" }}>
        {agente && !compacto && (
          <SidebarHistorico
            agenteId={agente.id}
            conversaAtivaId={conversaIdReal}
            onAbrir={(s) => void abrirSessao(s)}
            onNova={() => void novaSessao()}
            carregandoAcao={reiniciarBloqueado}
          />
        )}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, position: "relative" }}>
          <ChatAtivo
            conversa={conversa}
            agruparEm={5000}
            onAgrupar={onAgrupar}
            onComitarLocal={onComitarLocal}
            agenteDigitando={agenteDigitando}
            ocultarHeader={compacto}
            onCorrigirMensagem={conversaIdReal ? (m) => setEditando(m) : undefined}
            correcoes={correcoes}
          />
          {mostrarEscolhaProduto && (
            <TelaEscolherProduto produtos={produtos} carregando={carregandoProdutos} onEscolher={(id) => void escolherProduto(id)} />
          )}
          {/* O GenUI inline do ciclo Mentor saiu daqui (2026-09-03): pergunta que a
              agente não sabe responder mora em DOIS lugares só — o sino do topo
              (PerguntasMentorBell, que abre o CardPerguntaMentor no clique) e a aba
              Perguntas dentro do app Agente. Aparecer também no meio do Chat de
              Teste era ruído. Os arquivos `CardPerguntaPendenteInline.tsx` e
              `use-pergunta-pendente-chat-teste.ts` ficaram órfãos. */}
        </div>
        {conversa && dossieLateral && (
          <div
            style={{
              flex: "0 0 360px",
              display: "flex",
              minHeight: 0,
              borderLeft: "1px solid var(--os-vidro-borda, rgba(255,255,255,0.10))",
            }}
          >
            {painelDossie}
          </div>
        )}

        {/* Mentor: sobreposto à direita (qualquer largura, menos celular). */}
        {!compacto && painel === "mentor" && (
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(400px, 100%)",
              display: "flex",
              minHeight: 0,
              borderLeft: "1px solid var(--os-vidro-borda, rgba(255,255,255,0.10))",
              boxShadow: "-12px 0 32px rgba(0,0,0,0.35)",
              zIndex: 6,
            }}
          >
            {painelMentor}
          </div>
        )}

        {/* Largura média: ficha sobreposta à direita, sem empurrar o chat. */}
        {conversa && !dossieLateral && !compacto && painel === "ficha" && (
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(360px, 100%)",
              display: "flex",
              minHeight: 0,
              background: "var(--os-janela-fundo, rgba(18, 14, 34, 0.97))",
              borderLeft: "1px solid var(--os-vidro-borda, rgba(255,255,255,0.10))",
              boxShadow: "-12px 0 32px rgba(0,0,0,0.35)",
              zIndex: 5,
            }}
          >
            {painelDossie}
          </div>
        )}
      </div>

      {/* Celular: histórico e ficha abrem em tela cheia por cima, como telas do WhatsApp. */}
      {compacto && painel && (
        <div
          role="dialog"
          aria-label={painel === "historico" ? "Histórico de sessões" : painel === "mentor" ? "Mentor de Humanização" : "Ficha da conversa"}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            minWidth: 0,
            overflow: "hidden",
            background: "var(--os-janela-fundo, rgb(18, 14, 34))",
          }}
        >
          {painel === "historico" && agente && (
            <SidebarHistorico
              agenteId={agente.id}
              conversaAtivaId={conversaIdReal}
              onAbrir={(s) => {
                setPainel(null);
                void abrirSessao(s);
              }}
              onNova={() => {
                setPainel(null);
                void novaSessao();
              }}
              carregandoAcao={reiniciarBloqueado}
              larguraCheia
              onFechar={() => setPainel(null)}
            />
          )}
          {painel === "mentor" && painelMentor}
          {painel === "ficha" && conversa && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 6px",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  flexShrink: 0,
                }}
              >
                <button type="button" style={botaoIcone} onClick={() => setPainel(null)} aria-label="Voltar para a conversa">
                  ←
                </button>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Ficha da conversa</span>
              </div>
              <div style={{ flex: 1, display: "flex", minHeight: 0, minWidth: 0, overflowX: "hidden" }}>
                {painelDossie}
              </div>
            </>
          )}
        </div>
      )}

      {editando && (
        <ModalCorrecao
          textoOriginal={editando.conteudo}
          corrigidoInicial={correcoes[editando.id]?.texto_corrigido ?? ""}
          sugestaoInicial={correcoes[editando.id]?.sugestao ?? ""}
          salvando={salvandoCorrecao}
          onSalvar={(txt, sug) => void salvarEdicao(txt, sug)}
          onFechar={() => setEditando(null)}
        />
      )}
    </div>
  );
}
