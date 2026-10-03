/**
 * Vercel Function (Node.js, Fluid Compute) — importa o HISTÓRICO do WhatsApp
 * pessoal do tenant, uma vez só, via QR de "dispositivo vinculado" (Baileys).
 *
 * Por quê aqui e não numa edge function Supabase: Baileys precisa de Node.js
 * de verdade (não roda no runtime Deno das edges) e segura uma conexão
 * WebSocket aberta durante o scan + sincronização — isso pode levar dezenas
 * de segundos, incompatível com o modelo request/response das edges. O
 * frontend já vive no Vercel, então a function fica aqui (Fluid Compute,
 * timeout configurado em vercel.json).
 *
 * Protocolo: 1 requisição POST, resposta Server-Sent Events:
 *   event: qr     data: { qr: string }                       — escaneie
 *   event: status data: { mensagem: string }                 — progresso
 *   event: done   data: { leads: [{id,nome,phone,preview}], conversas_importadas }
 *   event: erro   data: { mensagem: string }
 *
 * Autenticação: JWT do próprio tenant (Authorization: Bearer). Todas as
 * escritas em leads/conversas/mensagens usam ESSE JWT (RLS isola por
 * tenant_id automaticamente) — a function nunca usa service_role.
 *
 * Escopo deliberado (2026-09-01): só mensagens de TEXTO, só chats 1:1 (sem
 * grupo). Ao terminar, faz `sock.logout()` — não fica um "dispositivo
 * vinculado" pendurado na conta do tenant. Não marca nada como
 * `desfecho=convertido` sozinho — isso é decisão do tenant, feita depois na
 * tela de revisão (aba Conversas).
 *
 * Histórico completo (2026-09-01): o WhatsApp manda o histórico em VÁRIOS
 * eventos `messaging-history.set` (chunks), não 1 só — e o campo `isLatest`
 * desse evento é bugado na lib (WhiskeySockets/Baileys#2005: significa "é o
 * primeiro chunk", não "é o último"). Por isso a sincronização não termina
 * num timer fixo: cada chunk reseta um timer de SILÊNCIO — só finaliza
 * quando param de chegar chunks novos, com um teto de segurança pra nunca
 * estourar o `maxDuration` da function (ver `SILENCIO_SYNC_MS`/`TETO_SYNC_MS`).
 *
 * Histórico raso por default da lib (2026-09-01): o Baileys, por padrão, (1)
 * DESCARTA em silêncio o chunk `HistorySyncType.FULL` — `shouldSyncHistoryMessage`
 * default só deixa passar INITIAL_BOOTSTRAP/RECENT/etc, e o `FULL` nem chega a
 * virar evento `messaging-history.set` — e (2) se identifica como "Chrome" pro
 * servidor do WhatsApp, que entrega MENOS histórico pra sessão de "navegador
 * comum" (`getWebInfo` só marca a sessão como Desktop de verdade quando
 * `browser[1] === 'Desktop'`). Por isso `criarSocket()` seta
 * `browser: Browsers.windows("Desktop")` — o README do Baileys
 * recomenda `macOS("Desktop")`, mas ver a nota do 428 abaixo — e
 * `shouldSyncHistoryMessage: () => true`. Sem os dois, só chega o bootstrap raso mesmo com `syncFullHistory: true`
 * (esse campo só manda `requireFullSync` pro celular; não muda o filtro local).
 *
 * Risco a registrar: Baileys é um client não-oficial (engenharia reversa do
 * protocolo do WhatsApp Web) — mesma categoria de risco que qualquer
 * ferramenta assim, incluindo chance (baixa, mas real) de o WhatsApp
 * flagar/banir o número por conexão de "dispositivo" incomum. Diferente do
 * Z-API (provedor pago dedicado a isso), aqui é uma leitura pontual e
 * desconectada logo em seguida — reduz mas não zera o risco.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import makeWASocket, {
  Browsers,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import P from "pino";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const config = { maxDuration: 300 };

// Helpers inline (não em arquivo separado): o builder de function do Vercel
// compila cada api/*.ts isoladamente e não resolve import local de sibling —
// `_lib/whatsapp-baileys.ts` ficava de fora do bundle e quebrava em runtime
// (ERR_MODULE_NOT_FOUND). Achado na primeira tentativa de deploy 2026-09-01.

// deno-lint-ignore no-explicit-any
type MensagemBaileys = any;

/** `5511999998888@s.whatsapp.net` → `5511999998888`. Ignora sufixo de device (`:12`). */
function extrairTelefoneDoJid(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const semDominio = jid.split("@")[0];
  const semDevice = semDominio.split(":")[0];
  const digitos = semDevice.replace(/\D/g, "");
  return digitos.length >= 8 ? digitos : null;
}

/** Grupo, broadcast, status, newsletter — nada disso é conversa 1:1 de venda. */
function ehChatIndividual(jid: string): boolean {
  return jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid");
}

/** Extrai o texto puro de um WebMessageInfo do Baileys (só os formatos comuns). */
function extrairTextoMensagem(msg: MensagemBaileys): string | null {
  const m = msg?.message;
  if (!m) return null;
  const texto =
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    null;
  return typeof texto === "string" && texto.trim() ? texto.trim() : null;
}

/** `messageTimestamp` do Baileys pode vir como number ou Long-like `{low, high}`. */
function timestampParaIso(ts: unknown): string {
  let segundos: number;
  if (typeof ts === "number") segundos = ts;
  else if (typeof ts === "object" && ts && "low" in (ts as Record<string, unknown>)) {
    segundos = Number((ts as { low: number }).low);
  } else {
    segundos = Math.floor(Date.now() / 1000);
  }
  return new Date(segundos * 1000).toISOString();
}

const TIMEOUT_QR_MS = 90_000; // quanto esperar o scan antes de desistir
/**
 * Δ 2026-09-12: era 20s e encerrava o import cedo demais.
 *
 * Medido numa importação real (626 conversas gravadas): chegou `INITIAL_BOOTSTRAP`
 * com 939 mensagens — ~1 por chat, que é o que esse chunk é — e o `FULL` não veio
 * dentro dos 20s. Resultado: 568 das 626 conversas ficaram com UMA mensagem só.
 * O celular ainda está montando o histórico completo quando o bootstrap chega;
 * 20s de silêncio não são "acabou", são "ainda nem começou a parte grande".
 *
 * 60s dá margem pro `FULL` aparecer e ainda cabe folgado no teto de 260s.
 */
const SILENCIO_SYNC_MS = 60_000;
const TETO_SYNC_MS = 260_000; // teto de segurança (maxDuration é 300s — sobra margem pra gravar no banco)
const LIMITE_TECNICO_MSGS_POR_CHAT = 20_000; // não é regra de negócio, só válvula anti-estouro de memória

/**
 * Marca, em `conversas.titulo`, a conversa criada por esta importação.
 *
 * Δ 2026-09-12: antes cada scan INSERIA uma conversa nova pro mesmo lead — duas
 * importações no mesmo dia deixaram 313 leads com 626 conversas, e limpar isso
 * virava DELETE manual em produção. Com a marca, o import reaproveita a conversa
 * que ele mesmo criou. `titulo` é campo livre (49 linhas preenchidas em 15.701) e
 * nada no app Conversas filtra por ele — dá pra marcar sem mexer em `channel`,
 * que é usado em vários filtros.
 *
 * O mesmo valor é lido pelo botão "limpar" do modal — se mudar aqui, muda lá
 * (`ImportarWhatsappPessoal.tsx`).
 */
const MARCA_IMPORT = "WhatsApp pessoal (importado)";

// Versão do WhatsApp Web usada se `fetchLatestBaileysVersion()` falhar/estourar
// (fetch bate num JSON remoto; se travar, uma versão vazia/errada faz o WhatsApp
// fechar a conexão com 428/precondição). É a mesma baked-in da lib rc14 —
// atualizar junto quando subir a versão do @whiskeysockets/baileys.
const FALLBACK_WA_VERSION: [number, number, number] = [2, 3000, 1043857760];

function enviarEvento(res: VercelResponse, evento: string, dados: unknown) {
  res.write(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`);
}

function clienteTenant(jwt: string) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const anon = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  return createClient(url, anon, { global: { headers: { Authorization: jwt } } });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ erro: "Método não suportado — use POST." });
    return;
  }
  const auth = req.headers.authorization;
  if (!auth) {
    res.status(401).json({ erro: "Authorization header ausente." });
    return;
  }

  const supabase = clienteTenant(auth);
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    res.status(401).json({ erro: "Token inválido." });
    return;
  }
  const tenantId = user.id;

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const authDir = await mkdtemp(path.join(tmpdir(), "baileys-"));
  let finalizou = false;

  const encerrar = async (sock?: ReturnType<typeof makeWASocket>) => {
    if (finalizou) return;
    finalizou = true;
    try { await sock?.logout(); } catch { /* já pode estar desconectado */ }
    try { sock?.end?.(undefined); } catch { /* noop */ }
    try { await rm(authDir, { recursive: true, force: true }); } catch { /* noop */ }
  };

  try {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    // Resolver a versão do WA de forma robusta e LOGAR qual saiu: se o fetch
    // remoto travar/falhar, cai no fallback embutido em vez de arriscar um 428
    // por versão vazia. O log é o que revela, nos logs da Vercel, se um 428
    // veio de versão incompatível.
    let version: [number, number, number] = FALLBACK_WA_VERSION;
    try {
      const r = await fetchLatestBaileysVersion();
      version = r.version as [number, number, number];
      console.warn(`[whatsapp-importar] WA version=${version.join(".")} isLatest=${r.isLatest}`);
    } catch (e) {
      console.warn(`[whatsapp-importar] fetchLatestBaileysVersion falhou (${String((e as Error)?.message ?? e)}) — usando fallback ${FALLBACK_WA_VERSION.join(".")}`);
    }

    // Coleta bruta — vira leads/conversas/mensagens só no final, depois de
    // fechar a conexão (evita escrever no banco enquanto o socket ainda
    // processa histórico).
    const porChat = new Map<string, { mensagens: MensagemBaileys[]; nome: string | null }>();
    let sincronizando = false;
    let finalizando = false;
    let totalMensagensRecebidas = 0;
    let sock: ReturnType<typeof makeWASocket>;
    let tentativasReconexao = 0;
    const MAX_RECONEXOES = 2; // queda de rede DEPOIS do scan, antes de sincronizar (428/408) — com espera real entre tentativas (ver abaixo)
    let refreshsQr = 0;
    const MAX_REFRESH_QR = 2; // fechou ANTES do scan (QR expirou) — reemite QR novo, teto próprio pra não girar infinito no IP compartilhado da Vercel

    let timeoutQr = setTimeout(() => {
      enviarEvento(res, "erro", { mensagem: "Tempo esgotado esperando o scan do QR." });
      void encerrar(sock).then(() => res.end());
    }, TIMEOUT_QR_MS);

    let timeoutSilencio: ReturnType<typeof setTimeout> | undefined;
    let timeoutTeto: ReturnType<typeof setTimeout> | undefined;

    /** Cada chunk de histórico reseta esse timer — só dispara quando o WhatsApp
     * realmente parou de mandar chunk novo (não dá pra confiar em `isLatest`). */
    const rearmarSilencio = () => {
      clearTimeout(timeoutSilencio);
      timeoutSilencio = setTimeout(() => { void finalizarImportacao(sock); }, SILENCIO_SYNC_MS);
    };

    const iniciarJanelaSync = () => {
      if (sincronizando) return;
      sincronizando = true;
      enviarEvento(res, "status", { mensagem: "Conectado — lendo o histórico completo…" });
      rearmarSilencio();
      timeoutTeto = setTimeout(() => { void finalizarImportacao(sock); }, TETO_SYNC_MS);
    };

    function criarSocket(): ReturnType<typeof makeWASocket> {
      const s = makeWASocket({
        version,
        auth: state,
        logger: P({ level: "silent" }) as never,
        syncFullHistory: true,
        // Δ 2026-09-12: era `Browsers.macOS("Desktop")`. O WhatsApp aposentou as
        // sub-plataformas DARWIN e WIN32 — socket que se identifica assim é
        // derrubado com 428 em ~1s, ANTES do QR, 100% das vezes (medido em 6
        // variantes). Era esse o "428 intermitente" que derrubou o botão em
        // 03/09. Windows/Desktop funciona COM o patch WIN32→WIN_HYBRID que o
        // `scripts/patch-baileys.mjs` aplica no build (PR #2741 do Baileys,
        // ainda fora do rc14 do npm). "Desktop" na segunda posição continua
        // sendo obrigatório: é o que faz o WhatsApp mandar o histórico cheio.
        browser: Browsers.windows("Desktop"),
        shouldSyncHistoryMessage: () => true,
        markOnlineOnConnect: false,
        printQRInTerminal: false,
      });

      s.ev.on("creds.update", saveCreds);

      s.ev.on("connection.update", (update) => {
        const { connection, qr, lastDisconnect } = update;
        // Log de cada etapa (não só da queda): sem isso não dá pra saber, pelo
        // log da Vercel, se o QR chegou a sair antes de cair — a única coisa
        // que aparecia era o `connection close`. Achado 2026-09-03.
        if (qr) {
          clearTimeout(timeoutQr);
          console.warn(`[whatsapp-importar] QR gerado (tentativa ${tentativasReconexao}) — aguardando scan`);
          enviarEvento(res, "qr", { qr });
        }
        if (connection === "connecting") {
          console.warn(`[whatsapp-importar] connecting (tentativa ${tentativasReconexao})`);
        }
        if (connection === "open") {
          clearTimeout(timeoutQr);
          console.warn("[whatsapp-importar] CONNECTION OPEN — scan confirmado, iniciando sync");
          iniciarJanelaSync();
        }
        if (connection === "close") {
          const motivo = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
          // `registered` vira true só DEPOIS que o celular parear (scan feito).
          // É o que separa "QR ainda não escaneado / expirou" de "escaneou e a
          // rede caiu no meio" — que pedem tratamentos diferentes.
          const jaEscaneou = Boolean((state.creds as { registered?: boolean }).registered);
          console.warn(
            "[whatsapp-importar] connection close — motivo:", motivo,
            "jaEscaneou:", jaEscaneou, "sincronizando:", sincronizando,
            "reconexoes:", tentativasReconexao, "refreshsQr:", refreshsQr,
            lastDisconnect?.error,
          );

          if (motivo === DisconnectReason.restartRequired) {
            // Comportamento NORMAL do pairing multi-device do Baileys: depois do
            // scan, o WhatsApp força 1 restart pra confirmar as chaves. Reconecta
            // com o MESMO auth state (já tem as credenciais salvas) — sem isso,
            // todo import falhava logo após o scan (achado 2026-09-01).
            enviarEvento(res, "status", { mensagem: "Confirmado o vínculo — reconectando…" });
            sock = criarSocket();
            return;
          }

          // Fechou ANTES de o usuário escanear (QR expirou / rotação esgotada /
          // IP compartilhado da Vercel "resfriado" pelo WhatsApp). Não é erro de
          // rede real — é só QR velho. Recria pra emitir um QR NOVO e re-arma o
          // timeout de scan (que foi limpo quando o 1º QR saiu), com teto próprio
          // pra não ficar girando no mesmo IP (o que dispara a defesa antiabuso).
          if (!jaEscaneou && !sincronizando && !finalizou && motivo !== DisconnectReason.loggedOut) {
            if (refreshsQr < MAX_REFRESH_QR) {
              refreshsQr++;
              const esperaMs = 1500 + Math.floor(Math.random() * 1500); // jitter curto
              enviarEvento(res, "status", { mensagem: "Gerando um QR novo…" });
              clearTimeout(timeoutQr);
              timeoutQr = setTimeout(() => {
                enviarEvento(res, "erro", { mensagem: "Tempo esgotado esperando o scan do QR." });
                void encerrar(sock).then(() => res.end());
              }, TIMEOUT_QR_MS);
              setTimeout(() => { if (!finalizou) sock = criarSocket(); }, esperaMs);
              return;
            }
            enviarEvento(res, "erro", {
              mensagem: "Não consegui manter o QR aberto pra você escanear. Feche e tente de novo em ~1 min.",
            });
            void encerrar(sock).then(() => res.end());
            return;
          }

          // Já escaneou, mas caiu antes de terminar de sincronizar: queda de rede
          // de verdade. Retry imediato (achado 2026-09-03 de manhã) piorava —
          // reconectar em rajada, do mesmo "dispositivo", tem cara de abuso pro
          // WhatsApp e cada tentativa caía mais rápido. Fix: backoff COM JITTER
          // (4-6s / 8-10s), não instantâneo, e teto de 2.
          if (
            jaEscaneou && !sincronizando && !finalizou &&
            (motivo === DisconnectReason.connectionClosed || motivo === DisconnectReason.connectionLost) &&
            tentativasReconexao < MAX_RECONEXOES
          ) {
            tentativasReconexao++;
            const esperaMs = tentativasReconexao * 4000 + Math.floor(Math.random() * 2000);
            enviarEvento(res, "status", {
              mensagem: `Conexão caiu — aguardando ${Math.round(esperaMs / 1000)}s pra tentar de novo (${tentativasReconexao}/${MAX_RECONEXOES})…`,
            });
            setTimeout(() => {
              if (finalizou) return; // desistiu/terminou enquanto esperava
              sock = criarSocket();
            }, esperaMs);
            return;
          }

          if (motivo !== DisconnectReason.loggedOut && !sincronizando && !finalizou) {
            // Esgotou as tentativas ou motivo inesperado — não é o fluxo de um
            // import pontual. Encerra com mensagem de retry.
            enviarEvento(res, "erro", { mensagem: "Conexão caiu antes de terminar. Feche e tente de novo." });
            void encerrar(sock).then(() => res.end());
          }
        }
      });

      s.ev.on("messaging-history.set", ({ chats, contacts, messages, syncType, progress }) => {
        if (finalizou || finalizando) return; // chunk tardio depois de já ter fechado

        // syncType por nome: `0` sozinho no log não diz se veio o bootstrap raso
        // (1 msg por chat) ou o histórico completo. Ver proto.HistorySync.HistorySyncType.
        const NOME_SYNC: Record<number, string> = {
          0: "INITIAL_BOOTSTRAP (raso: ~1 msg por chat)",
          1: "INITIAL_STATUS_V3",
          2: "FULL (histórico completo)",
          3: "RECENT",
          4: "PUSH_NAME",
          5: "NON_BLOCKING_DATA",
          6: "ON_DEMAND",
        };
        console.warn(
          "[whatsapp-importar] chunk de histórico — syncType:", syncType,
          NOME_SYNC[Number(syncType)] ?? "desconhecido",
          "progresso:", progress,
          "mensagens no chunk:", (messages ?? []).length,
          "acumulado:", totalMensagensRecebidas, "msgs em", porChat.size, "chats",
        );

        const nomePorJid = new Map<string, string>();
        for (const c of (contacts ?? []) as MensagemBaileys[]) {
          if (c?.id && (c?.name || c?.notify)) nomePorJid.set(c.id, c.name || c.notify);
        }
        for (const chat of (chats ?? []) as MensagemBaileys[]) {
          if (chat?.id && chat?.name) nomePorJid.set(chat.id, chat.name);
        }
        for (const msg of (messages ?? []) as MensagemBaileys[]) {
          const jid = msg?.key?.remoteJid;
          if (!jid || !ehChatIndividual(jid)) continue;
          const texto = extrairTextoMensagem(msg);
          if (!texto) continue;
          const entrada = porChat.get(jid) ?? { mensagens: [], nome: nomePorJid.get(jid) ?? null };
          if (entrada.mensagens.length < LIMITE_TECNICO_MSGS_POR_CHAT) {
            entrada.mensagens.push(msg);
            totalMensagensRecebidas++;
          }
          porChat.set(jid, entrada);
        }

        // Chunk novo chegou → histórico ainda não parou. Rearma o silêncio e
        // avisa o tenant que tá progredindo (senão a tela fica muda por minutos).
        if (sincronizando) {
          rearmarSilencio();
          enviarEvento(res, "status", {
            mensagem: `Lendo o histórico… ${totalMensagensRecebidas} mensagens em ${porChat.size} conversa(s) até agora.`,
          });
        }
      });

      return s;
    }

    sock = criarSocket();

    async function finalizarImportacao(sockAtual: ReturnType<typeof makeWASocket>) {
      if (finalizou || finalizando) return;
      finalizando = true;
      clearTimeout(timeoutSilencio);
      clearTimeout(timeoutTeto);
      enviarEvento(res, "status", { mensagem: "Gravando conversas na sua base…" });

      const resumoLeads: { id: string; conversaId: string; nome: string; phone: string; preview: string }[] = [];
      let conversasImportadas = 0;

      for (const [jid, { mensagens, nome }] of porChat) {
        const phone = extrairTelefoneDoJid(jid);
        if (!phone || !mensagens.length) continue;

        let leadId: string;
        const { data: leadExistente } = await supabase
          .from("leads")
          .select("id, name")
          .eq("tenant_id", tenantId)
          .eq("phone", phone)
          .maybeSingle();

        if (leadExistente?.id) {
          leadId = leadExistente.id as string;
        } else {
          const { data: leadNovo, error: erroLead } = await supabase
            .from("leads")
            .insert({
              tenant_id: tenantId,
              phone,
              name: nome ?? phone,
              nome_exibicao: nome ?? phone,
              canal_externo: "whatsapp",
              origem_lead: "importado_whatsapp_pessoal",
            })
            .select("id")
            .single();
          if (erroLead || !leadNovo) continue;
          leadId = leadNovo.id as string;
        }

        // Reaproveita a conversa que a própria importação criou pra este lead.
        // `.limit(1)` + índice 0 em vez de `.maybeSingle()`: maybeSingle ERRA
        // quando volta mais de uma linha, e o erro viraria uma conversa nova em
        // silêncio — exatamente o bug que se quer matar aqui.
        const { data: jaImportadas } = await supabase
          .from("conversas")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("lead_id", leadId)
          .eq("titulo", MARCA_IMPORT)
          .order("created_at", { ascending: false })
          .limit(1);
        let conversaId = ((jaImportadas ?? []) as Array<{ id: string }>)[0]?.id;

        if (!conversaId) {
          const { data: conversaNova, error: erroConversa } = await supabase
            .from("conversas")
            .insert({
              tenant_id: tenantId,
              lead_id: leadId,
              phone,
              status: "encerrada",
              channel: "whatsapp",
              agent_enabled: false,
              titulo: MARCA_IMPORT,
            })
            .select("id")
            .single();
          if (erroConversa || !conversaNova) continue;
          conversaId = conversaNova.id as string;
        }

        const ordenadas = [...mensagens].sort((a, b) => {
          const ta = Number((a?.messageTimestamp as { low?: number })?.low ?? a?.messageTimestamp ?? 0);
          const tb = Number((b?.messageTimestamp as { low?: number })?.low ?? b?.messageTimestamp ?? 0);
          return ta - tb;
        });

        const linhasMsg = ordenadas.map((msg) => ({
          conversation_id: conversaId,
          role: msg?.key?.fromMe ? "assistant" : "human",
          content: extrairTextoMensagem(msg) ?? "",
          created_at: timestampParaIso(msg?.messageTimestamp),
        })).filter((l) => l.content.trim().length > 0);

        // Só insere o que ainda não está lá. De propósito NÃO apaga as antigas:
        // o webhook pode ter reaberto esta conversa (buscar_ou_criar_conversa
        // reativa conversa encerrada dos últimos 30 dias), e aí ela teria
        // mensagem real dentro. Apagar pra reimportar destruiria conversa viva.
        // Comparação por instante + texto; o banco devolve a data num formato
        // diferente do que mandamos, então normaliza pelos milissegundos.
        const { data: jaGravadas } = await supabase
          .from("mensagens")
          .select("content, created_at")
          .eq("conversation_id", conversaId)
          .limit(LIMITE_TECNICO_MSGS_POR_CHAT);
        const chavesExistentes = new Set(
          ((jaGravadas ?? []) as Array<{ content: string | null; created_at: string }>)
            .map((m) => `${new Date(m.created_at).getTime()}|${m.content ?? ""}`),
        );
        const linhasNovas = linhasMsg.filter(
          (l) => !chavesExistentes.has(`${new Date(l.created_at).getTime()}|${l.content}`),
        );

        if (linhasMsg.length) {
          if (linhasNovas.length) await supabase.from("mensagens").insert(linhasNovas);
          conversasImportadas++;
          resumoLeads.push({
            id: leadId,
            conversaId: conversaId as string,
            nome: nome ?? phone,
            phone,
            preview: linhasMsg[linhasMsg.length - 1]?.content.slice(0, 140) ?? "",
          });
        }
      }

      enviarEvento(res, "done", { leads: resumoLeads, conversas_importadas: conversasImportadas });
      await encerrar(sockAtual);
      res.end();
    }

    req.on("close", () => { void encerrar(sock); });
  } catch (err) {
    enviarEvento(res, "erro", { mensagem: String((err as Error).message ?? err) });
    await encerrar();
    res.end();
  }
}
