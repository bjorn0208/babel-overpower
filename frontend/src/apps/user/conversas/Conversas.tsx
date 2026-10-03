/**
 * Conversas — tela única consolidada (substitui Atendimento Kanban).
 *
 * Layout 3 colunas:
 *  - Esquerda: ListaConversas (320px) — filtros + drag-out
 *  - Centro: ChatAtivo (flex 1) — chat WhatsApp-style
 *  - Direita: Dossiê (360px) — 5 abas
 *
 * Topo: BarraFiltros pílulas (Todas · Atendimento · Vendas · Clientes)
 *
 * Onda A: dados MOCK. Onda B substitui por Supabase live + Realtime + drag-out (janela isolada).
 *
 * Decisões cravadas pelo Theus (2026-05-13):
 *  - Versão B (tela única estado-driven, não 4 telas separadas)
 *  - Drag-out via avatar+nome (gesto na ListaConversas)
 *  - Filtros como pílulas (não sub-abas)
 *  - Pílulas mapeiam por cargo_ativo (Atendimento/Vendas) + estado (Clientes)
 *  - Quando cargo da conversa muda, ela "migra" entre pílulas — funil em movimento
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels";
import { supabase } from "@/integrations/supabase/client";
import { useAbaAlvo } from "@/os/dock/aba-alvo";
import type { AutorHumano, Conversa, ConversasProps, FiltroPilula, MembroEquipe, Mensagem, PlanoTurno } from "./tipos";
import { tornarCliente, voltarParaLead, enviarParaBase, persistirResponsavel, persistirAgenteLigado, retomarConversa, iniciarConversaPorNumero, abordarPorNumero } from "./acoes-cliente";
import { subirMidiaConversa } from "./midia-upload";
import { buscarEquipeReal, buscarPerfilAutor } from "./equipe-real";
import { mensagemErroEnvio, reenviarMensagem } from "./envio-mensagem";
import { useConversasLive, buscarConversasPorTermo, contarConversasAtivas, carregarConversasAntigas, carregarConversaUnica } from "./hooks/useConversasLive";
import { BarraFiltros } from "./BarraFiltros";
import { ListaConversas } from "./ListaConversas";
import { ChatAtivo } from "./ChatAtivo";
import { Dossie } from "./Dossie";
import { ImportarWhatsappPessoal } from "./ImportarWhatsappPessoal";

interface RagenticToast {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info?: (msg: string) => void;
}

function obterToast(): RagenticToast {
  const w = window as unknown as { useToast?: () => RagenticToast };
  return w.useToast?.() ?? { success: () => {}, error: () => {} };
}

function filtrar(c: Conversa, f: FiltroPilula): boolean {
  switch (f) {
    case "todas": return true;
    case "atendimento": return c.cargo_ativo.tipologia === "atendimento";
    // No banco real o cargo de vendas é tipologia "face_cliente" + nome "Vendedor"
    // (não existe tipologia "vendedor"). Filtra pelo nome do cargo.
    case "vendas": return c.cargo_ativo.nome === "Vendedor";
    case "clientes": return c.lead.estado === "cliente" || c.lead.estado === "cliente_em_campanha";
    case "contratos": return c.lead.tem_contrato_assinado === true;
    case "instagram": return c.lead.canal === "instagram";
    default: return true;
  }
}

const PAGINA_LISTA = 50;

/** Última conversa aberta — vive no módulo pra sobreviver fechar/reabrir o app
 *  (Theus 2026-08-11: sair pra outro app voltava pra primeira da lista).
 *  `null` também é estado válido: ESC deixou o app sem conversa de propósito. */
let conversaLembrada: string | null = null;
let conversaFechadaLembrada = false;

/** Limpa marcadores de mídia do conteúdo cru pra usar no preview da lista. */
function limparPreview(texto: string): string {
  return texto.replace(/\[MEDIA_RECEBIDA\]|\[MEDIA_ENVIADA\]/g, "").trim().slice(0, 80);
}

/** Slug do recurso "Agente aborda" no catálogo da Loja (`loja_aplicativos`). */
const SLUG_ABORDAGEM = "abordagem";

/** Slug do import de WhatsApp pessoal por QR (Baileys) no mesmo catálogo. */
const SLUG_IMPORTAR_WHATSAPP = "importar-whatsapp";

/**
 * Catraca de instalação (Otmar, 12/09/2026): recurso que só aparece pra quem tem
 * o app instalado da Loja — mesmo mecanismo que deixa o Rifas só no Fabricio
 * (`loja_aplicativos` + `aplicativos_instalados`), e mesma leitura da catraca do
 * Consulta em `consulta/aba-agente.tsx`. Os slugs chegam em `window.RAGENTIC_DATA`
 * na hidratação, que acontece DEPOIS do primeiro render — por isso o listener.
 */
function useAppInstalado(slug: string): boolean {
  const ler = useCallback(() => {
    if (typeof window === "undefined") return false;
    const dados = (window as unknown as { RAGENTIC_DATA?: { APLICATIVOS_INSTALADOS_SLUGS?: string[] } }).RAGENTIC_DATA;
    const slugs = dados?.APLICATIVOS_INSTALADOS_SLUGS;
    return Array.isArray(slugs) && slugs.includes(slug);
  }, [slug]);
  const [instalado, setInstalado] = useState(ler);
  useEffect(() => {
    const sync = () => setInstalado(ler());
    sync();
    window.addEventListener("ragentic-dados-hidratados", sync);
    window.addEventListener("ragentic-aplicativos-mudaram", sync);
    return () => {
      window.removeEventListener("ragentic-dados-hidratados", sync);
      window.removeEventListener("ragentic-aplicativos-mudaram", sync);
    };
  }, [ler]);
  return instalado;
}

export function Conversas(_props: ConversasProps) {
  const props = _props;
  const live = useConversasLive();
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [filtro, setFiltro] = useState<FiltroPilula>("todas");
  // Ramo do dock pode cair direto num filtro (ex: Conversas → Atendimento).
  // Valor "conversa:<id>" (vindo de outro app, ex: Contratos) abre a conversa exata.
  useAbaAlvo("conversas", (alvo) => {
    if (alvo.startsWith("conversa:")) { void abrirConversaPorId(alvo.slice("conversa:".length)); return; }
    setFiltro(alvo as FiltroPilula);
  });
  const [conversaSelecionadaId, setConversaSelecionadaId] = useState<string | null>(() => conversaLembrada);
  // ESC fechou a conversa de propósito: a auto-seleção não pode reabrir nada.
  const [conversaFechadaPeloUsuario, setConversaFechadaPeloUsuario] = useState(() => conversaFechadaLembrada);

  const selecionarConversa = useCallback((id: string | null) => {
    setConversaSelecionadaId(id);
    setConversaFechadaPeloUsuario(id === null);
    conversaLembrada = id;
    conversaFechadaLembrada = id === null;
  }, []);

  // Abre uma conversa vinda de fora da lista carregada (ex: botão do Contratos):
  // carrega a conversa única se preciso e seleciona.
  const abrirConversaPorId = useCallback(async (id: string) => {
    if (!id) return;
    const conv = await carregarConversaUnica(id);
    if (conv) setConversas((xs) => (xs.some((c) => c.id === id) ? xs : [conv, ...xs]));
    selecionarConversa(id);
  }, [selecionarConversa]);

  // Nova conversa por número (igual WhatsApp) — 2026-08-19.
  const [novaConversaAberta, setNovaConversaAberta] = useState(false);
  const [telefoneNovo, setTelefoneNovo] = useState("");
  const [criandoConversa, setCriandoConversa] = useState(false);
  const [importarWhatsappAberto, setImportarWhatsappAberto] = useState(false);
  // "Agente aborda" é liberado por instalação (hoje só o tenant do Otmar).
  const podeAbordar = useAppInstalado(SLUG_ABORDAGEM);
  // Import por QR é Baileys (client não-oficial, risco de ban no número): fica só
  // em quem tem o recurso instalado — hoje o tenant contato@babel-os.com.
  const podeImportarWhatsapp = useAppInstalado(SLUG_IMPORTAR_WHATSAPP);

  // ESC = sai da conversa e fica sem nenhuma à mostra (Theus 2026-08-11: não
  // parecer que está lendo o cliente ao sair do app com uma conversa aberta).
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      selecionarConversa(null);
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [selecionarConversa]);
  // `retomando`: true enquanto o disparo `[RETOMADA_MANUAL]` está em curso (religar
  // conversa + invoke `ragentic-processar-inline`). Mantém o botão disabled e o
  // ícone girando — evita duplo-clique disparar o motor 2x pra mesma conversa.
  const [retomandoConversaId, setRetomandoConversaId] = useState<string | null>(null);
  const [limiteVisivel, setLimiteVisivel] = useState<number>(PAGINA_LISTA);
  // Scroll infinito server-side: quando o pool local (as ~1000 mais recentes)
  // esgota, busca lotes de conversas antigas no banco por cursor keyset.
  // `temMaisAntigas` apaga a sentinela quando o histórico acabou; a ref
  // bloqueia fetches concorrentes enquanto um lote está em voo.
  const [temMaisAntigas, setTemMaisAntigas] = useState<boolean>(true);
  const refCarregandoAntigas = useRef<boolean>(false);
  const [carregandoMensagens, setCarregandoMensagens] = useState<boolean>(false);
  const [busca, setBusca] = useState<string>("");
  const [exportando, setExportando] = useState(false);
  // Resultados da busca server-side (nome/telefone) — conversas do tenant que
  // podem estar além das ~300 carregadas na lista. Mescladas em conversasFiltradas.
  const [resultadosBusca, setResultadosBusca] = useState<Conversa[]>([]);
  // Total REAL de contatos ativos do tenant (count no banco), pra mostrar no topo
  // mesmo com a lista carregando só o limite. null = ainda contando.
  const [totalAtivos, setTotalAtivos] = useState<number | null>(null);

  // Busca no BANCO (debounced) — acha QUALQUER conversa do tenant, mesmo além
  // das carregadas na lista. RLS isola o tenant. Sem termo, limpa os resultados.
  useEffect(() => {
    const termo = busca.trim();
    if (termo.length < 2) { setResultadosBusca([]); return; }
    let ativo = true;
    const id = setTimeout(() => {
      void buscarConversasPorTermo(termo).then((res) => { if (ativo) setResultadosBusca(res); });
    }, 400);
    return () => { ativo = false; clearTimeout(id); };
  }, [busca]);

  // Contador do total real de contatos ativos (não-arquivados) — count no banco,
  // não traz linhas. Recarrega no boot; ações locais (enviar à Base / apagar) ajustam.
  useEffect(() => {
    let ativo = true;
    void contarConversasAtivas().then((n) => { if (ativo) setTotalAtivos(n); });
    return () => { ativo = false; };
  }, []);

  // Ao selecionar um resultado de busca que não está na lista local, mescla-o ao
  // estado — assim o chat abre e o lazy-load de mensagens funciona normalmente.
  useEffect(() => {
    if (!conversaSelecionadaId) return;
    setConversas((xs) => {
      if (xs.some((c) => c.id === conversaSelecionadaId)) return xs;
      const achada = resultadosBusca.find((c) => c.id === conversaSelecionadaId);
      return achada ? [achada, ...xs] : xs;
    });
  }, [conversaSelecionadaId, resultadosBusca]);
  // Ref imperativa pro Panel da lista — sanfona chama collapse/expand.
  const refPainelLista = usePanelRef();
  const [listaColapsada, setListaColapsada] = useState<boolean>(false);

  const onToggleLista = () => {
    const p = refPainelLista.current;
    if (!p) return;
    if (p.isCollapsed()) p.expand();
    else p.collapse();
  };

  // Carga ÚNICA na hora que `live` fica disponível. Updates subsequentes do hook
  // são IGNORADOS aqui — mensagens novas chegam via realtime granular abaixo,
  // não via refetch global. Sem isso o substituir do array causava re-paint
  // pesado + perda de mensagens lazy carregadas + sensação de "refresh".
  const [sincronizadoInicialmente, setSincronizadoInicialmente] = useState(false);
  useEffect(() => {
    if (live.fonte === "carregando") return;
    if (sincronizadoInicialmente) return;
    setConversas(live.conversas);
    // Respeita a memória do módulo: última aberta volta; ESC anterior mantém vazio.
    setConversaSelecionadaId((atual) =>
      atual ?? (conversaFechadaLembrada ? null : live.conversas[0]?.id ?? null)
    );
    setSincronizadoInicialmente(true);
  }, [live.conversas, live.fonte, sincronizadoInicialmente]);

  // Conversa nova (lead inédito) que o hook trouxe depois da carga inicial: o
  // hook tem realtime próprio e recarrega quando entra conversa/mensagem nova.
  // Aqui pegamos só as que ainda não existem no estado local e adicionamos ao
  // topo — sem tocar nas existentes (preserva mensagens lazy já carregadas).
  useEffect(() => {
    if (!sincronizadoInicialmente) return;
    setConversas((xs) => {
      const ids = new Set(xs.map((c) => c.id));
      const novas = live.conversas.filter((c) => !ids.has(c.id));
      return novas.length ? [...novas, ...xs] : xs;
    });
  }, [live.conversas, sincronizadoInicialmente]);

  // Ao abrir uma conversa, zera o contador de não-lidas dela.
  useEffect(() => {
    if (!conversaSelecionadaId) return;
    setConversas((xs) =>
      xs.some((c) => c.id === conversaSelecionadaId && c.mensagens_nao_lidas > 0)
        ? xs.map((c) => (c.id === conversaSelecionadaId ? { ...c, mensagens_nao_lidas: 0 } : c))
        : xs,
    );
  }, [conversaSelecionadaId]);

  // Ref síncrona da conversa selecionada — o realtime global lê daqui pra decidir
  // entre append (conversa aberta) ou só marcar não-lida, sem re-subscrever o
  // canal a cada clique de seleção.
  const refSelecionada = useRef<string | null>(null);
  useEffect(() => {
    refSelecionada.current = conversaSelecionadaId;
  }, [conversaSelecionadaId]);

  // Realtime GLOBAL: toda mensagem nova (qualquer conversa) atualiza a lista ao
  // vivo — preview + horário sobem a conversa pro topo (ver sort em
  // conversasFiltradas). A conversa aberta recebe a bolha na hora; as demais
  // acendem o badge de não-lidas. Conversa nova (lead inédito) entra via merge
  // do hook abaixo. Assina 1x (sem dep), usa refSelecionada pra contexto.
  useEffect(() => {
    const ch = supabase
      .channel("mensagens-lista-global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mensagens" },
        (payload) => {
          const m = payload.new as { id: string; conversation_id: string; role: string | null; content: string | null; created_at: string | null; carga?: unknown };
          if (!m.id || !m.conversation_id) return;
          const ehSelecionada = m.conversation_id === refSelecionada.current;
          const role = m.role === "lead" || m.role === "user" ? "lead" : m.role === "system" ? "sistema" : "agente";
          const preview = limparPreview(String(m.content ?? ""));
          const quando = String(m.created_at ?? new Date().toISOString());
          // id temporário que ESTE cliente cravou na carga do insert (client_msg_id).
          // É a âncora estável pra reconciliar a bolha otimista com a real.
          const cargaObj = m.carga && typeof m.carga === "object" ? (m.carga as { client_msg_id?: unknown }) : null;
          const idTempReconciliar = typeof cargaObj?.client_msg_id === "string" ? cargaObj.client_msg_id : null;
          setConversas((xs) => {
            let achou = false;
            const atualizado = xs.map((c) => {
              if (c.id !== m.conversation_id) return c;
              achou = true;
              // Já temos a mensagem REAL (evento duplicado ou onEnviar já reconciliou).
              const jaTemReal = c.mensagens.some((mm) => mm.id === String(m.id));
              let mensagens = c.mensagens;
              if (ehSelecionada && !jaTemReal) {
                // Reconcilia a bolha otimista (id "m-<ts>") com a real casando pelo
                // client_msg_id da carga. Antes o dedup só comparava com o id REAL,
                // mas quando o evento realtime chega ANTES de onEnviar trocar o id
                // temporário pelo real, a lista ainda só tinha o id temp → o dedup
                // não achava e uma SEGUNDA bolha era criada (duplicata).
                const idxTemp = idTempReconciliar
                  ? c.mensagens.findIndex((mm) => mm.id === idTempReconciliar)
                  : -1;
                if (idxTemp >= 0) {
                  mensagens = c.mensagens.slice();
                  mensagens[idxTemp] = { ...mensagens[idxTemp], id: String(m.id), enviado: true };
                } else {
                  mensagens = [...c.mensagens, {
                    id: String(m.id),
                    conversa_id: String(m.conversation_id),
                    papel: role as "lead" | "agente" | "sistema",
                    tipo: "texto" as const,
                    conteudo: String(m.content ?? ""),
                    criado_em: quando,
                    lido: true,
                    enviado: true,
                  }];
                }
              }
              return {
                ...c,
                mensagens,
                preview_ultima_mensagem: preview,
                ultima_mensagem_em: quando,
                mensagens_nao_lidas: ehSelecionada ? 0 : (c.mensagens_nao_lidas ?? 0) + 1,
              };
            });
            // Conversa não está no array (lead novo) → o merge do hook a traz.
            return achou ? atualizado : xs;
          });
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, []);

  // `todas` mostra o total REAL do tenant (count no banco), não só os carregados —
  // é o número que o dono quer ver. As demais pílulas contam o pool carregado
  // (filtro operacional). Enquanto o count não volta, cai pra conversas.length.
  const contadores = useMemo<Record<FiltroPilula, number>>(() => ({
    todas: totalAtivos ?? conversas.length,
    atendimento: conversas.filter((c) => filtrar(c, "atendimento")).length,
    vendas: conversas.filter((c) => filtrar(c, "vendas")).length,
    clientes: conversas.filter((c) => filtrar(c, "clientes")).length,
    contratos: conversas.filter((c) => filtrar(c, "contratos")).length,
    instagram: conversas.filter((c) => filtrar(c, "instagram")).length,
  }), [conversas, totalAtivos]);

  const [equipe, setEquipe] = useState<MembroEquipe[]>([]);
  useEffect(() => {
    let ativo = true;
    void buscarEquipeReal().then((membros) => { if (ativo) setEquipe(membros); });
    return () => { ativo = false; };
  }, []);

  const [perfilAutor, setPerfilAutor] = useState<AutorHumano | null>(null);
  useEffect(() => {
    let ativo = true;
    void buscarPerfilAutor().then((p) => { if (ativo) setPerfilAutor(p); });
    return () => { ativo = false; };
  }, []);

  // Estado da pausa "IA Geral" do tenant — mora em agentes_usuario.is_active
  // (true = IA ligada · false = pausada). Toggle escreve aqui; webhook + RPC
  // buscar_ou_criar_conversa leem daqui pra bloquear a entrada e fazer conv
  // nova nascer com agent_enabled=false quando o tenant tá pausado.
  const [agenteIsActive, setAgenteIsActive] = useState<boolean>(true);
  useEffect(() => {
    let ativo = true;
    (async () => {
      const { data: sessao } = await supabase.auth.getSession();
      const uid = sessao?.session?.user?.id;
      if (!uid) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data } = await sb
        .from("agentes_usuario")
        .select("is_active")
        .eq("user_id", uid)
        .limit(1)
        .maybeSingle();
      if (ativo && data) setAgenteIsActive(data.is_active !== false);
    })();
    return () => { ativo = false; };
  }, []);

  const conversasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const apenasDigitos = termo.replace(/\D+/g, "");
    const casaTermo = (c: Conversa) => {
      if (!termo) return true;
      const nomeOk = c.lead.nome.toLowerCase().includes(termo);
      const telOk = apenasDigitos.length > 0 &&
        c.lead.telefone.replace(/\D+/g, "").includes(apenasDigitos);
      return nomeOk || telOk;
    };
    const locais = conversas.filter((c) => filtrar(c, filtro) && casaTermo(c));
    // Com termo, anexa os resultados do banco que não estão na lista local
    // (a busca server-side já filtrou por nome/telefone) — respeitando a pílula.
    let base = locais;
    if (termo && resultadosBusca.length > 0) {
      const ids = new Set(locais.map((c) => c.id));
      const extras = resultadosBusca.filter((c) => !ids.has(c.id) && filtrar(c, filtro));
      if (extras.length) base = [...locais, ...extras];
    }
    // Mais recente no topo — reordena ao vivo quando o realtime atualiza
    // `ultima_mensagem_em` de qualquer conversa.
    return base.sort(
      (a, b) =>
        new Date(b.ultima_mensagem_em).getTime() -
        new Date(a.ultima_mensagem_em).getTime(),
    );
  }, [conversas, filtro, busca, resultadosBusca]);

  useEffect(() => {
    // Sem conversa DE PROPÓSITO (ESC): não reabre nada sozinho.
    if (conversaFechadaPeloUsuario) return;
    if (conversasFiltradas.length === 0) return;
    const aindaVisivel = conversasFiltradas.some((c) => c.id === conversaSelecionadaId);
    if (!aindaVisivel) {
      setConversaSelecionadaId(conversasFiltradas[0].id);
      conversaLembrada = conversasFiltradas[0].id;
    }
  }, [filtro, conversasFiltradas, conversaSelecionadaId, conversaFechadaPeloUsuario]);

  useEffect(() => {
    setLimiteVisivel(PAGINA_LISTA);
  }, [filtro, busca]);

  // "Ver mais" do scroll infinito: primeiro consome o pool local em páginas;
  // quando a página seguinte já não enche, puxa o próximo lote de conversas
  // antigas do banco e mescla no fim do pool (sem duplicar id).
  const verMais = useCallback(() => {
    setLimiteVisivel((n) => n + PAGINA_LISTA);
    if (live.fonte !== "live") return;
    if (!temMaisAntigas || refCarregandoAntigas.current) return;
    if (limiteVisivel + PAGINA_LISTA < conversasFiltradas.length) return;
    refCarregandoAntigas.current = true;
    void carregarConversasAntigas()
      .then(({ antigas, esgotou }) => {
        if (esgotou) setTemMaisAntigas(false);
        if (antigas.length === 0) return;
        setConversas((xs) => {
          const ids = new Set(xs.map((c) => c.id));
          const novas = antigas.filter((c) => !ids.has(c.id));
          return novas.length ? [...xs, ...novas] : xs;
        });
      })
      .finally(() => {
        refCarregandoAntigas.current = false;
      });
  }, [live.fonte, temMaisAntigas, limiteVisivel, conversasFiltradas.length]);

  const conversaSelecionada = useMemo(
    () => conversas.find((c) => c.id === conversaSelecionadaId) ?? null,
    [conversas, conversaSelecionadaId],
  );

  useEffect(() => {
    if (!conversaSelecionadaId) return;
    const conv = conversas.find((c) => c.id === conversaSelecionadaId);
    if (!conv || conv.mensagens.length > 0) return;
    let ativo = true;
    setCarregandoMensagens(true);
    live.carregarMensagensConversa(conversaSelecionadaId)
      .then((msgs) => {
        if (!ativo) return;
        setConversas((xs) =>
          xs.map((c) => {
            if (c.id !== conversaSelecionadaId) return c;
            const ultima = msgs[msgs.length - 1];
            return {
              ...c,
              mensagens: msgs,
              preview_ultima_mensagem: ultima?.conteudo.slice(0, 80) ?? "",
              ultima_mensagem_em: ultima?.criado_em ?? c.ultima_mensagem_em,
            };
          }),
        );
      })
      .catch((e) => console.warn("[Conversas] lazy fetch falhou:", e))
      .finally(() => {
        if (ativo) setCarregandoMensagens(false);
      });
    return () => { ativo = false; };
  }, [conversaSelecionadaId, conversas, live]);

  const t = obterToast();

  const exportarConversas = async () => {
    if (exportando || conversasFiltradas.length === 0) return;
    setExportando(true);
    try {
      const XLSX = await import("xlsx");
      const responsavelPorId = new Map(equipe.map((m) => [m.id, m.nome]));
      const linhas = conversasFiltradas.map((c) => ({
        Nome: c.lead.nome,
        Telefone: c.lead.telefone,
        Canal: c.lead.canal,
        Estado: c.lead.estado,
        Cargo: c.cargo_ativo.nome,
        Status: c.status,
        Agente: c.agente_ligado ? "Ligado" : "Desligado",
        Responsavel: c.responsavel_id ? responsavelPorId.get(c.responsavel_id) ?? c.responsavel_id : "",
        "Última mensagem": c.ultima_mensagem_em,
        Preview: c.preview_ultima_mensagem,
      }));
      const planilha = XLSX.utils.json_to_sheet(linhas);
      const livro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(livro, planilha, "Atendimento");
      const data = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(livro, `atendimento-${filtro}-${data}.xlsx`);
      t.success(`${linhas.length} conversa(s) exportada(s).`);
    } catch (e) {
      t.error(`Falha ao exportar: ${(e as Error).message}`);
    } finally {
      setExportando(false);
    }
  };

  const onArrastarFora = (c: Conversa, _x: number, _y: number) => {
    const slugUnico = `conversa-isolada__${c.id.slice(0, 8)}-${Date.now().toString(36).slice(-4)}`;
    const w = window as unknown as {
      __PAYLOADS_CONVERSAS?: Record<string, Conversa>;
    };
    if (!w.__PAYLOADS_CONVERSAS) w.__PAYLOADS_CONVERSAS = {};
    w.__PAYLOADS_CONVERSAS[slugUnico] = c;
    if (props.onAbrirApp) {
      props.onAbrirApp(slugUnico);
      t.success(`Abrindo "${c.lead.nome}" em janela isolada`);
    } else {
      t.info?.(`Conversa "${c.lead.nome}" pronta — mas Conversas não recebeu onAbrirApp.`);
      console.warn("[Conversas] drag-out: onAbrirApp ausente em props.");
    }
  };

  const aplicarAgenteLigado = async (alvo: string, novo: boolean): Promise<void> => {
    setConversas((xs) =>
      xs.map((c) => (c.id === alvo ? { ...c, agente_ligado: novo } : c)),
    );
    try {
      await persistirAgenteLigado(alvo, novo);
    } catch (e) {
      console.error("[Conversas] toggle IA da conversa falhou:", e);
      setConversas((xs) =>
        xs.map((c) => (c.id === alvo ? { ...c, agente_ligado: !novo } : c)),
      );
      throw e;
    }
  };

  const onCriarNovaConversa = async () => {
    if (criandoConversa) return;
    setCriandoConversa(true);
    try {
      const id = await iniciarConversaPorNumero(telefoneNovo);
      const conv = await carregarConversaUnica(id);
      if (conv) {
        setConversas((xs) => (xs.some((c) => c.id === id) ? xs : [conv, ...xs]));
      }
      selecionarConversa(id);
      setNovaConversaAberta(false);
      setTelefoneNovo("");
      t.success("Conversa pronta — é só digitar a mensagem");
    } catch (e) {
      console.error("[Conversas] nova conversa falhou:", e);
      t.error(`Falha ao iniciar: ${(e as Error).message ?? "erro desconhecido"}`);
    } finally {
      setCriandoConversa(false);
    }
  };

  // Abordagem pela agente (Otmar, 12/09/2026): mesmo modal de "Nova conversa",
  // mas quem manda a primeira mensagem é a IA — apresentação + produto.
  const onAbordarPelaAgente = async () => {
    if (criandoConversa) return;
    setCriandoConversa(true);
    try {
      const id = await abordarPorNumero(telefoneNovo);
      const conv = await carregarConversaUnica(id);
      if (conv) {
        setConversas((xs) => (xs.some((c) => c.id === id) ? xs : [conv, ...xs]));
      }
      selecionarConversa(id);
      setNovaConversaAberta(false);
      setTelefoneNovo("");
      t.success("A agente vai abordar esse número — as mensagens saem em instantes");
    } catch (e) {
      console.error("[Conversas] abordagem pela agente falhou:", e);
      t.error(`Falha ao abordar: ${(e as Error).message ?? "erro desconhecido"}`);
    } finally {
      setCriandoConversa(false);
    }
  };

  const onToggleAgente = async (novo: boolean) => {
    if (!conversaSelecionada) return;
    try {
      await aplicarAgenteLigado(conversaSelecionada.id, novo);
      t.success(novo ? "IA reativada" : "IA pausada · modo humano");
    } catch (e) {
      t.error(`Falha ao alterar IA: ${(e as Error).message ?? "erro desconhecido"}`);
    }
  };

  const onEnviar = async (texto: string) => {
    if (!conversaSelecionada) return;
    const idTemp = `m-${Date.now()}`;
    const agora = new Date().toISOString();
    const nova = {
      id: idTemp,
      conversa_id: conversaSelecionada.id,
      papel: "humano" as const,
      tipo: "texto" as const,
      conteudo: texto,
      // Otimista: identidade do logado já na hora; a recarga (realtime)
      // confirma com o autor de carga.sender (nome — cargo + foto).
      autor: perfilAutor ?? { nome: "Você" },
      criado_em: agora,
      lido: true,
      enviado: false,
    };
    setConversas((xs) =>
      xs.map((c) =>
        c.id === conversaSelecionada.id
          ? {
              ...c,
              mensagens: [...c.mensagens, nova],
              preview_ultima_mensagem: texto.slice(0, 60),
              ultima_mensagem_em: agora,
            }
          : c,
      ),
    );

    try {
      const { data: msgReal, error: erroIns } = await supabase
        .from("mensagens")
        .insert({
          conversation_id: conversaSelecionada.id,
          role: "human",
          content: texto,
          sender_id: perfilAutor?.id ?? null,
          // carga.sender SEM `source` → a regra de exibição classifica como
          // humano identificado (o eco do agente tem source='whatsapp_app').
          // client_msg_id: âncora estável pro realtime reconciliar a bolha otimista
          // com a real e não duplicar (ver handler de mensagens-lista-global).
          carga: {
            client_msg_id: idTemp,
            ...(perfilAutor
              ? {
                  sender: {
                    name: perfilAutor.nome,
                    cargo: perfilAutor.cargo ?? null,
                    avatar_url: perfilAutor.foto_url ?? null,
                  },
                }
              : {}),
          },
        })
        .select("id")
        .single();
      if (erroIns) throw erroIns;

      const { data: respEnv, error: erroEnv } = await supabase.functions.invoke("enviar-mensagem", {
        body: {
          lead_id: conversaSelecionada.lead.id,
          message: texto,
          message_id: msgReal.id,
          // Assinatura no WhatsApp (*Nome — Cargo*) — a edge enviar-mensagem
          // monta o prefixo a partir destes campos. Paridade com o antigo.
          sender_name: perfilAutor?.nome,
          sender_cargo: perfilAutor?.cargo ?? undefined,
        },
      });
      if (erroEnv) throw erroEnv;
      const corpo = respEnv as { ok?: boolean; reason?: string; zapi_message_id?: string } | null;
      if (corpo && corpo.ok === false) {
        throw new Error(mensagemErroEnvio(corpo.reason ?? "edge retornou ok:false sem motivo"));
      }

      // Casa por idTemp OU id real: se o evento realtime já reconciliou a bolha
      // (trocou o id temp pelo real), ainda encontramos e confirmamos como enviada.
      setConversas((xs) =>
        xs.map((c) =>
          c.id === conversaSelecionada.id
            ? {
                ...c,
                mensagens: c.mensagens.map((m) =>
                  m.id === idTemp || m.id === msgReal.id ? { ...m, id: msgReal.id, enviado: true } : m,
                ),
              }
            : c,
        ),
      );
      t.success("Mensagem enviada");
    } catch (e) {
      console.error("[Conversas] onEnviar falhou:", e);
      // Marca a bolha como não entregue — sem isso ela fica com cara de enviada
      // e o atendente segue a conversa achando que o lead recebeu.
      setConversas((xs) =>
        xs.map((c) =>
          c.id === conversaSelecionada.id
            ? { ...c, mensagens: c.mensagens.map((m) => (m.id === idTemp ? { ...m, falhou: true } : m)) }
            : c,
        ),
      );
      t.error(`Falha ao enviar: ${(e as Error).message ?? "erro desconhecido"}`);
    }
  };

  const onReenviar = async (msg: Mensagem) => {
    if (!conversaSelecionada) return;
    const alvo = conversaSelecionada.id;
    try {
      await reenviarMensagem({
        mensagemId: msg.id,
        leadId: conversaSelecionada.lead.id,
        texto: msg.conteudo,
        perfilAutor,
      });
      setConversas((xs) =>
        xs.map((c) =>
          c.id === alvo
            ? { ...c, mensagens: c.mensagens.map((m) => (m.id === msg.id ? { ...m, falhou: false, enviado: true } : m)) }
            : c,
        ),
      );
      t.success("Mensagem reenviada");
    } catch (e) {
      console.error("[Conversas] reenvio falhou:", e);
      t.error(`Falha ao reenviar: ${(e as Error).message ?? "erro desconhecido"}`);
    }
  };

  const onEnviarMidia = async (
    midia: { arquivo?: File; blob?: Blob; tipo: "imagem" | "audio" | "video" | "documento"; nome?: string; duracao_segundos?: number },
    legenda: string,
  ) => {
    if (!conversaSelecionada) return;
    // Fase 1 do canal Instagram: envio de mídia fica pra fase 2
    if (conversaSelecionada.lead.canal === "instagram") {
      t.info?.("Mídia pro Instagram entra na próxima fase — por enquanto só texto");
      return;
    }
    const conversaId = conversaSelecionada.id;
    const leadId = conversaSelecionada.lead.id;
    const arquivo =
      midia.arquivo ??
      (midia.blob
        ? new File([midia.blob], midia.nome ?? `audio-${Date.now()}.webm`, {
            type: midia.blob.type || "audio/webm",
          })
        : null);
    if (!arquivo) {
      t.error("Arquivo de mídia inválido");
      return;
    }

    const idTemp = `m-${Date.now()}`;
    const agora = new Date().toISOString();
    const previewUrl = URL.createObjectURL(arquivo);
    const nova = {
      id: idTemp,
      conversa_id: conversaId,
      papel: "humano" as const,
      tipo: midia.tipo,
      conteudo: legenda,
      autor: perfilAutor ?? { nome: "Você" },
      midia_url: previewUrl,
      nome_arquivo: arquivo.name,
      duracao_segundos: midia.duracao_segundos,
      tamanho_bytes: arquivo.size,
      criado_em: agora,
      lido: true,
      enviado: false,
    };
    setConversas((xs) =>
      xs.map((c) =>
        c.id === conversaId
          ? {
              ...c,
              mensagens: [...c.mensagens, nova],
              preview_ultima_mensagem: `📎 ${midia.tipo}${legenda ? ` · ${legenda.slice(0, 40)}` : ""}`,
              ultima_mensagem_em: agora,
            }
          : c,
      ),
    );

    try {
      const { data: sess } = await supabase.auth.getSession();
      const uidLogado = perfilAutor?.id ?? sess?.session?.user?.id;
      if (!uidLogado) throw new Error("sessão sem usuário");
      const up = await subirMidiaConversa(arquivo, uidLogado, conversaId);

      const { data: msgReal, error: erroIns } = await supabase
        .from("mensagens")
        .insert({
          conversation_id: conversaId,
          role: "human",
          content: legenda.trim() || `[arquivo] ${up.nome}`,
          sender_id: perfilAutor?.id ?? uidLogado,
          // carga.file (sem `source`) → exibição classifica como humano
          // identificado; mapearMensagem deriva tipo/midia_url/nome/tamanho.
          // client_msg_id: âncora pro realtime reconciliar a bolha otimista.
          carga: {
            client_msg_id: idTemp,
            file: { url: up.url, name: up.nome, type: up.tipo, size: up.tamanho },
            ...(perfilAutor
              ? {
                  sender: {
                    name: perfilAutor.nome,
                    cargo: perfilAutor.cargo ?? null,
                    avatar_url: perfilAutor.foto_url ?? null,
                  },
                }
              : {}),
          },
        })
        .select("id")
        .single();
      if (erroIns) throw erroIns;

      const { data: respEnv, error: erroEnv } = await supabase.functions.invoke("enviar-mensagem", {
        body: {
          lead_id: leadId,
          file_url: up.url,
          file_name: up.nome,
          file_type: up.tipo,
          message_id: msgReal.id,
          sender_name: perfilAutor?.nome,
          sender_cargo: perfilAutor?.cargo ?? undefined,
        },
      });
      if (erroEnv) throw erroEnv;
      const corpo = respEnv as { ok?: boolean; reason?: string } | null;
      if (corpo && corpo.ok === false) {
        throw new Error(corpo.reason ?? "edge retornou ok:false sem motivo");
      }

      // Casa por idTemp OU id real (o realtime pode ter reconciliado antes). Troca a
      // URL do preview (blob) pela real e revoga o blob — sem revogar, cada mídia
      // enviada vazava um object URL preso na memória até o reload.
      setConversas((xs) =>
        xs.map((c) =>
          c.id === conversaId
            ? {
                ...c,
                mensagens: c.mensagens.map((m) =>
                  m.id === idTemp || m.id === msgReal.id
                    ? { ...m, id: msgReal.id, midia_url: up.url, enviado: true }
                    : m,
                ),
              }
            : c,
        ),
      );
      URL.revokeObjectURL(previewUrl);
      t.success("Mídia enviada");
    } catch (e) {
      console.error("[Conversas] onEnviarMidia falhou:", e);
      // Marca a bolha como falhou (paridade com o texto) — sem isso a mídia ficava
      // com cara de enviada e o atendente seguia achando que o lead recebeu. O blob
      // do preview é mantido pra bolha continuar visível; será revogado no reload.
      setConversas((xs) =>
        xs.map((c) =>
          c.id === conversaId
            ? { ...c, mensagens: c.mensagens.map((m) => (m.id === idTemp ? { ...m, falhou: true } : m)) }
            : c,
        ),
      );
      t.error(`Falha ao enviar mídia: ${(e as Error).message ?? "erro desconhecido"}`);
    }
  };

  const onExecutarTurno = (turno: PlanoTurno) => {
    t.success(`Executando T+${turno.turno}: ${turno.o_que_fazer.slice(0, 60)}`);
  };

  const onTrocarCargo = () => {
    t.info?.("Onda B: dropdown de cargos do agente disponíveis pra essa conversa.");
  };

  const onAtribuirResponsavel = async (membroId: string | null) => {
    if (!conversaSelecionada) return;
    const alvo = conversaSelecionada.id;
    const anterior = conversaSelecionada.responsavel_id ?? null;
    setConversas((xs) =>
      xs.map((c) => (c.id === alvo ? { ...c, responsavel_id: membroId } : c)),
    );
    try {
      await persistirResponsavel(alvo, membroId);
      const membro = equipe.find((m) => m.id === membroId);
      // Humano assumiu → pausa a IA desta conversa (presume atendimento
      // humano). Voltou pra "IA responde" (sem responsável) → reativa.
      let sufixo = "";
      const iaLigada = conversaSelecionada.agente_ligado;
      if (membroId && iaLigada) {
        await aplicarAgenteLigado(alvo, false);
        sufixo = " · IA pausada";
      } else if (!membroId && !iaLigada) {
        await aplicarAgenteLigado(alvo, true);
        sufixo = " · IA responde";
      }
      t.success((membro ? `Conversa atribuída a ${membro.nome}` : "Responsável removido") + sufixo);
    } catch (e) {
      console.error("[Conversas] atribuir responsável falhou:", e);
      setConversas((xs) =>
        xs.map((c) => (c.id === alvo ? { ...c, responsavel_id: anterior } : c)),
      );
      t.error(`Falha ao atribuir: ${(e as Error).message ?? "erro desconhecido"}`);
    }
  };

  const onTornarCliente = async () => {
    if (!conversaSelecionada) return;
    const conv = conversaSelecionada;
    if (conv.lead.estado === "cliente" || conv.lead.estado === "cliente_em_campanha") {
      t.info?.(`${conv.lead.nome} já é cliente.`);
      return;
    }
    const agora = new Date().toISOString();
    setConversas((xs) =>
      xs.map((c) =>
        c.id === conv.id
          ? { ...c, lead: { ...c.lead, estado: "cliente", converted_at: agora } }
          : c,
      ),
    );
    try {
      const { fase_cliente } = await tornarCliente(conv.lead.id, conv.lead.produto);
      t.success(
        fase_cliente
          ? `${conv.lead.nome} virou cliente · fluxo iniciado em "${fase_cliente}"`
          : `${conv.lead.nome} virou cliente · configure o fluxo na aba Operação`,
      );
    } catch (e) {
      console.error("[Conversas] tornar cliente falhou:", e);
      setConversas((xs) =>
        xs.map((c) =>
          c.id === conv.id
            ? { ...c, lead: { ...c.lead, estado: conv.lead.estado, converted_at: conv.lead.converted_at ?? null } }
            : c,
        ),
      );
      t.error(`Falha ao converter: ${(e as Error).message ?? "erro desconhecido"}`);
    }
  };

  const onVoltarParaLead = async () => {
    if (!conversaSelecionada) return;
    const conv = conversaSelecionada;
    if (conv.lead.estado !== "cliente" && conv.lead.estado !== "cliente_em_campanha") {
      t.info?.(`${conv.lead.nome} já é lead.`);
      return;
    }
    const estadoAnterior = conv.lead.estado;
    const convertedAnterior = conv.lead.converted_at ?? null;
    setConversas((xs) =>
      xs.map((c) =>
        c.id === conv.id
          ? { ...c, lead: { ...c.lead, estado: "lead", converted_at: null } }
          : c,
      ),
    );
    try {
      await voltarParaLead(conv.lead.id);
      t.success(`${conv.lead.nome} voltou pra lead`);
    } catch (e) {
      console.error("[Conversas] voltar pra lead falhou:", e);
      setConversas((xs) =>
        xs.map((c) =>
          c.id === conv.id
            ? { ...c, lead: { ...c.lead, estado: estadoAnterior, converted_at: convertedAnterior } }
            : c,
        ),
      );
      t.error(`Falha ao voltar pra lead: ${(e as Error).message ?? "erro desconhecido"}`);
    }
  };

  const onEnviarBase = async () => {
    if (!conversaSelecionada) return;
    const id = conversaSelecionada.id;
    const nome = conversaSelecionada.lead.nome;
    const leadId = conversaSelecionada.lead.id;
    try {
      await enviarParaBase(leadId);
      setConversas((xs) => xs.filter((c) => c.id !== id));
      setTotalAtivos((n) => (n != null ? Math.max(0, n - 1) : n));
      setConversaSelecionadaId((atual) => (atual === id ? null : atual));
      t.success(`${nome} enviado para a Base`);
    } catch (e) {
      console.error("[Conversas] enviar à base falhou:", e);
      t.error(`Falha ao enviar à base: ${(e as Error).message ?? "erro desconhecido"}`);
    }
  };

  const onRetomar = async () => {
    if (!conversaSelecionada) return;
    const conv = conversaSelecionada;
    if (retomandoConversaId === conv.id) return; // já em curso
    setRetomandoConversaId(conv.id);
    // Otimismo na UI: marca conversa como ativa + agente ligado na hora
    // (mesmo se a edge demorar, o usuário vê estado coerente).
    setConversas((xs) =>
      xs.map((c) =>
        c.id === conv.id ? { ...c, status: "ativa", agente_ligado: true } : c,
      ),
    );
    try {
      await retomarConversa(conv.id, conv.lead.telefone);
      t.success(`Retomando conversa com ${conv.lead.nome}…`);
    } catch (e) {
      console.error("[Conversas] retomar conversa falhou:", e);
      t.error(`Falha ao retomar: ${(e as Error).message ?? "erro desconhecido"}`);
    } finally {
      setRetomandoConversaId((atual) => (atual === conv.id ? null : atual));
    }
  };

  const onApagar = async () => {
    if (!conversaSelecionada) return;
    const id = conversaSelecionada.id;
    const leadId = conversaSelecionada.lead.id;
    const nome = conversaSelecionada.lead.nome;
    try {
      // Apaga o CONTATO inteiro (não só a conversa aberta): junta todas as
      // conversas do lead pra que a RPC remova o lead e tudo pendurado nele
      // (ficha, memória, engajamento, PII, campanha, pagamentos, contratos…).
      let conversaIds = [id];
      if (leadId) {
        const { data: convs } = await supabase
          .from("conversas")
          .select("id")
          .eq("lead_id", leadId);
        const ids = (convs ?? []).map((c) => c.id as string);
        if (ids.length > 0) conversaIds = ids;
      }
      const { error } = await supabase.rpc(
        "excluir_conversas_profundo_para_atendimento",
        { p_conversa_ids: conversaIds },
      );
      if (error) throw error;
      setConversas((xs) => xs.filter((c) => !conversaIds.includes(c.id)));
      setTotalAtivos((n) => (n != null ? Math.max(0, n - conversaIds.length) : n));
      setConversaSelecionadaId((atual) =>
        atual && conversaIds.includes(atual) ? null : atual,
      );
      t.success(`Contato ${nome} apagado por completo`);
    } catch (e) {
      console.error("[Conversas] apagar contato falhou:", e);
      t.error(`Falha ao apagar: ${(e as Error).message ?? "erro desconhecido"}`);
    }
  };

  // Estado do toggle "IA Geral" = pausa persistente do tenant
  // (agentes_usuario.is_active). Antes lia `some(c.agente_ligado)` — bug:
  // conversa nova nasce com agent_enabled=true (default da RPC) e acendia o
  // toggle sozinho, fazendo o próximo click LIGAR tudo em massa em vez de
  // desligar. Agora a fonte é o flag persistente do agente.
  const iaGeralAtiva = agenteIsActive;

  const onToggleIAGeral = async () => {
    const novoValor = !iaGeralAtiva;
    // Otimista: estado persistente + cada conversa em memória.
    setAgenteIsActive(novoValor);
    setConversas((xs) => xs.map((c) => ({ ...c, agente_ligado: novoValor })));
    try {
      const { data: sessao } = await supabase.auth.getSession();
      if (!sessao?.session) throw new Error("sem sessão ativa");
      const tenantId = sessao.session.user.id;
      // (1) pausa persistente do tenant — webhook e RPC respeitam daqui.
      const { error: errAgente } = await supabase
        .from("agentes_usuario")
        .update({ is_active: novoValor })
        .eq("user_id", tenantId);
      if (errAgente) throw errAgente;
      // (2) propaga pras conversas existentes (UI sincroniza, outbox cancela bolhas pendentes via guard).
      const { error: errConv } = await supabase
        .from("conversas")
        .update({ agent_enabled: novoValor })
        .eq("tenant_id", tenantId);
      if (errConv) throw errConv;
      t.success(novoValor ? "IA reativada em todas as conversas" : "IA pausada em todas as conversas");
    } catch (e) {
      console.error("[Conversas] toggle IA geral falhou:", e);
      t.error(`Falha ao alterar IA: ${(e as Error).message}`);
      setAgenteIsActive(!novoValor);
      setConversas((xs) => xs.map((c) => ({ ...c, agente_ligado: !novoValor })));
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        color: "var(--txt-1)",
      }}
    >

      <BarraFiltros
        filtro={filtro}
        contadores={contadores}
        onMudar={setFiltro}
        iaGeralAtiva={iaGeralAtiva}
        onToggleIAGeral={onToggleIAGeral}
        onExportar={() => void exportarConversas()}
        exportando={exportando}
      />

      {importarWhatsappAberto && (
        <ImportarWhatsappPessoal onFechar={() => setImportarWhatsappAberto(false)} />
      )}

      <Group
        id="conversas-layout"
        orientation="horizontal"
        defaultLayout={{ lista: 22, chat: 52, dossie: 26 }}
        style={{ flex: 1, minHeight: 0 }}
      >
        <Panel
          id="lista"
          panelRef={refPainelLista}
          collapsible
          collapsedSize="64px"
          minSize="14%"
          maxSize="40%"
          onResize={(size) => {
            const colapsado = size.inPixels <= 80;
            setListaColapsada(colapsado);
          }}
        >
          {live.fonte === "carregando" ? (
            <SkeletonListaConversas />
          ) : (
            <ListaConversas
              conversas={conversasFiltradas.slice(0, limiteVisivel)}
              totalFiltrado={conversasFiltradas.length}
              onVerMais={verMais}
              temMaisNoBanco={temMaisAntigas && live.fonte === "live"}
              busca={busca}
              onBuscaChange={setBusca}
              conversaSelecionadaId={conversaSelecionadaId}
              onSelecionar={selecionarConversa}
              onArrastarFora={onArrastarFora}
              colapsada={listaColapsada}
              onToggleColapsada={onToggleLista}
              onNovaConversa={() => setNovaConversaAberta(true)}
              // Import via QR (Baileys). O "428 intermitente" de 03/09 tinha causa
              // fixa — sub-plataforma DARWIN aposentada pelo WhatsApp —, corrigida
              // em 12/09 no `whatsapp-importar.ts` (windows/Desktop + patch
              // WIN_HYBRID). Sem o prop, `ListaConversas` não desenha o botão.
              onImportarWhatsapp={podeImportarWhatsapp ? () => setImportarWhatsappAberto(true) : undefined}
            />
          )}
        </Panel>
        <Separator className="separador-painel" />
        <Panel id="chat" minSize="30%">
          <ChatAtivo
            conversa={conversaSelecionada}
            onEnviar={onEnviar}
            onEnviarMidia={onEnviarMidia}
            onReenviar={onReenviar}
            onTornarCliente={() => void onTornarCliente()}
            onVoltarParaLead={() => void onVoltarParaLead()}
            onEnviarBase={() => void onEnviarBase()}
            onApagar={() => void onApagar()}
            onRetomar={() => void onRetomar()}
            retomando={retomandoConversaId === conversaSelecionada?.id}
            onToggleAgente={(n) => void onToggleAgente(n)}
            termoBusca={busca}
          />
        </Panel>
        {conversaSelecionada && (
          <>
            <Separator className="separador-painel" />
            <Panel id="dossie" minSize="18%" maxSize="42%">
              <Dossie
                conversa={conversaSelecionada}
                equipe={equipe}
                onTrocarCargo={onTrocarCargo}
                onExecutarTurno={onExecutarTurno}
                onAtribuirResponsavel={(id) => void onAtribuirResponsavel(id)}
                onToggleAgente={(n) => void onToggleAgente(n)}
              />
            </Panel>
          </>
        )}
      </Group>

      {novaConversaAberta && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Iniciar conversa nova por número"
          onClick={() => !criandoConversa && setNovaConversaAberta(false)}
          style={{ position: "absolute", inset: 0, zIndex: 60, display: "grid", placeItems: "center", background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="os-vidro"
            style={{ width: 360, padding: 20, borderRadius: 16, border: "1px solid rgba(255,255,255,0.12)", display: "flex", flexDirection: "column", gap: 12 }}
          >
            <div style={{ fontSize: 14, fontWeight: 700 }}>Nova conversa</div>
            <div className="muted tiny">Digite o número com DDD (o 55 entra sozinho se faltar).{podeAbordar ? ' "Iniciar conversa" abre o chat pra você digitar; "Agente aborda" deixa a IA mandar a apresentação e o produto.' : ""}</div>
            <input
              type="tel"
              autoFocus
              value={telefoneNovo}
              onChange={(e) => setTelefoneNovo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void onCriarNovaConversa(); if (e.key === "Escape") setNovaConversaAberta(false); }}
              placeholder="Ex: 21 99999-9999"
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)", color: "var(--txt-1)", fontSize: 14, outline: "none" }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNovaConversaAberta(false)} disabled={criandoConversa}>
                Cancelar
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onCriarNovaConversa()} disabled={criandoConversa || telefoneNovo.replace(/\D/g, "").length < 10}>
                {criandoConversa ? "Iniciando…" : "Iniciar conversa"}
              </button>
              {podeAbordar && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void onAbordarPelaAgente()} disabled={criandoConversa || telefoneNovo.replace(/\D/g, "").length < 10} title="A IA manda a apresentação e o produto e segue a negociação sozinha">
                  {criandoConversa ? "Abordando…" : "Agente aborda"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * SkeletonListaConversas — placeholder aurora durante o primeiro fetch.
 *
 * Estética alinhada com a lista real: bloco do filtro topo + 8 linhas de
 * conversa (avatar + 2 linhas de texto). Shimmer suave via CSS keyframes
 * inline pra não exigir dependência nova. Apenas opacity/transform — zero
 * impacto em layout.
 */
function SkeletonListaConversas() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        padding: "12px 10px",
        gap: 10,
        color: "var(--txt-1)",
      }}
    >
      <style>{`
        @keyframes conversas-shimmer {
          0%   { background-position: -200px 0; }
          100% { background-position: calc(200px + 100%) 0; }
        }
        .skel-bar {
          background: linear-gradient(
            90deg,
            oklch(0.7 0.18 220 / 0.06) 0%,
            oklch(0.65 0.22 280 / 0.14) 50%,
            oklch(0.7 0.18 220 / 0.06) 100%
          );
          background-size: 200px 100%;
          background-repeat: no-repeat;
          animation: conversas-shimmer 1.4s ease-in-out infinite;
          border-radius: 8px;
        }
        @media (prefers-reduced-motion: reduce) {
          .skel-bar { animation: none; }
        }
      `}</style>
      <div className="skel-bar" style={{ height: 38, width: "100%", borderRadius: 12 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 8px",
              borderRadius: 10,
              opacity: 1 - i * 0.08,
            }}
          >
            <div className="skel-bar" style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="skel-bar" style={{ height: 11, width: `${70 - i * 4}%` }} />
              <div className="skel-bar" style={{ height: 9, width: `${90 - i * 5}%`, opacity: 0.65 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
