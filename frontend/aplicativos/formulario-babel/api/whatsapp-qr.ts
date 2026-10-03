/**
 * Vercel Function (Node.js, Fluid Compute) — QR de "aparelho conectado" do
 * WhatsApp (Baileys), lê o histórico 1 vez e manda as conversas pra aba do
 * tenant na planilha (Apps Script). Ao terminar faz `logout()`.
 *
 * Portado de BABEL OS 2/frontend/api/whatsapp-importar.ts (2026-09-11). O que
 * mudou: sem JWT/Supabase (o body traz `aba` e `id_envio`), e o final grava
 * na planilha em vez de leads/conversas/mensagens. Toda a mecânica de
 * conexão — versão do WA com fallback, `restartRequired`, refresh de QR,
 * backoff com jitter, timers de silêncio/teto do history sync — é a mesma;
 * os comentários explicando cada armadilha estão no arquivo original.
 *
 * Protocolo: 1 POST { aba, id_envio, metodo, telefone }, resposta Server-Sent Events:
 *   event: qr     data: { qr }        (metodo "qr")
 *   event: codigo data: { codigo }    (metodo "codigo" — pareamento por número)
 *   event: status data: { mensagem }
 *   event: done   data: { conversas, mensagens, aba }
 *   event: erro   data: { mensagem }
 *
 * Escopo: só texto, só chats 1:1. Risco: Baileys é client não-oficial;
 * chance baixa-mas-real de o WhatsApp flagar o número. Leitura pontual +
 * logout reduz, não zera.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import makeWASocket, {
  Browsers,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  fetchLatestWaWebVersion,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import type { Boom } from "@hapi/boom";
import P from "pino";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const config = { maxDuration: 300 };

// deno-lint-ignore no-explicit-any
type MensagemBaileys = any;

// Prazo pra vincular, contado do início e NÃO renovado a cada QR novo (antes
// era renovado e a function ficava girando QR até o timeout de 300s da Vercel).
// Digitar o código de pareamento é mais lento que apontar a câmera, então ganha
// mais tempo — o que sobra pro history sync é calculado em `iniciarJanelaSync`.
const TIMEOUT_QR_MS = 120_000;
const TIMEOUT_CODIGO_MS = 180_000;
const LIMITE_FUNCTION_MS = 300_000;
const RESERVA_GRAVACAO_MS = 55_000; // tempo guardado pra postar os lotes na planilha
// 60s, não os 20s da Babel: no 1º teste real (2026-09-11) só chegaram os chunks
// INITIAL_BOOTSTRAP (syncType 0) e INITIAL_STATUS_V3 (1) e o silêncio de 20s
// fechou antes de qualquer FULL/RECENT — 305 conversas com 1,5 msg cada.
// O celular demora mais que isso pra empurrar o histórico fundo.
const SILENCIO_SYNC_MS = 60_000;
const TETO_SYNC_MS = 220_000; // 40s a menos que na Babel: sobra tempo pra postar os lotes na planilha antes do maxDuration
const LIMITE_TECNICO_MSGS_POR_CHAT = 20_000;
const LIMITE_CELULA = 49_000; // Sheets aguenta 50.000 chars por célula
const LOTE_MAX_LINHAS = 150;
const LOTE_MAX_BYTES = 2_000_000;
const FALLBACK_WA_VERSION: [number, number, number] = [2, 3000, 1047595053];

function extrairTelefoneDoJid(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const digitos = jid.split("@")[0].split(":")[0].replace(/\D/g, "");
  return digitos.length >= 8 ? digitos : null;
}

function ehChatIndividual(jid: string): boolean {
  return jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid");
}

function extrairTextoMensagem(msg: MensagemBaileys): string | null {
  const m = msg?.message;
  if (!m) return null;
  const texto = m.conversation ?? m.extendedTextMessage?.text ?? m.imageMessage?.caption ?? m.videoMessage?.caption ?? null;
  return typeof texto === "string" && texto.trim() ? texto.trim() : null;
}

function timestampSegundos(ts: unknown): number {
  if (typeof ts === "number") return ts;
  if (typeof ts === "bigint") return Number(ts);
  if (typeof ts === "object" && ts && "low" in (ts as Record<string, unknown>)) return Number((ts as { low: number }).low);
  return Math.floor(Date.now() / 1000);
}

const fmtBrt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});
function formatarData(segundos: number): string {
  return fmtBrt.format(new Date(segundos * 1000)).replace(",", "");
}

function formatarTelefone(digitos: string): string {
  // 5584999998888 → +55 84 99999-8888 (só pra leitura; se não bater o padrão BR, devolve cru)
  const m = digitos.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : `+${digitos}`;
}

function enviarEvento(res: VercelResponse, evento: string, dados: unknown) {
  res.write(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`);
}

async function postarPlanilha(corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = process.env.PLANILHA_WEBAPP_URL;
  const token = process.env.PLANILHA_TOKEN;
  if (!url || !token) throw new Error("PLANILHA_WEBAPP_URL/PLANILHA_TOKEN não configurados.");
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ token, ...corpo }),
    redirect: "follow",
  });
  const texto = await resp.text();
  let json: Record<string, unknown>;
  try { json = JSON.parse(texto); } catch { throw new Error(`Planilha respondeu algo inesperado (HTTP ${resp.status}): ${texto.slice(0, 200)}`); }
  if (!json.ok) throw new Error(String(json.erro ?? "Planilha recusou a gravação."));
  return json;
}

async function postarComRetry(corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    return await postarPlanilha(corpo);
  } catch (e) {
    console.warn("[whatsapp-qr] lote falhou, tentando 1x mais:", (e as Error).message);
    await new Promise((r) => setTimeout(r, 2000));
    return await postarPlanilha(corpo);
  }
}

/** Uma conversa → [[nome, texto], [nome (parte 2), texto], ...] respeitando o limite da célula. */
function fatiarConversa(nome: string, linhas: string[]): [string, string][] {
  const partes: [string, string][] = [];
  let atual: string[] = [];
  let tamanho = 0;
  for (const l of linhas) {
    const custo = l.length + 1;
    if (atual.length && tamanho + custo > LIMITE_CELULA) {
      partes.push([nome, atual.join("\n")]);
      atual = [];
      tamanho = 0;
    }
    atual.push(l.length > LIMITE_CELULA ? l.slice(0, LIMITE_CELULA - 1) + "…" : l);
    tamanho += custo;
  }
  if (atual.length) partes.push([nome, atual.join("\n")]);
  return partes.map(([n, t], i) => [partes.length > 1 ? `${n} (parte ${i + 1})` : n, t]);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ erro: "Use POST." });
    return;
  }
  const { aba, id_envio: idEnvio, metodo, telefone } = (req.body ?? {}) as
    { aba?: string; id_envio?: string; metodo?: string; telefone?: string };
  if (!aba || typeof aba !== "string") {
    res.status(400).json({ erro: "Faltou o nome da empresa (aba)." });
    return;
  }
  const porCodigo = metodo === "codigo";
  // Baileys quer o número internacional só com dígitos (55 + DDD + número).
  const telefoneDigitos = String(telefone ?? "").replace(/\D/g, "");
  if (porCodigo && (telefoneDigitos.length < 12 || telefoneDigitos.length > 13)) {
    res.status(400).json({ erro: "Número inválido pra gerar o código — confira o DDD." });
    return;
  }
  if (!process.env.PLANILHA_WEBAPP_URL || !process.env.PLANILHA_TOKEN) {
    res.status(500).json({ erro: "Planilha não configurada no servidor." });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const inicio = Date.now();
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

    // Versão do WhatsApp Web que o socket anuncia. Com versão velha o celular
    // recusa o vínculo com "Não foi possível conectar o dispositivo" (visto no
    // iPhone em 2026-09-15). O fetchLatestBaileysVersion lê um JSON do repo do
    // Baileys que fica dias atrasado e ainda diz isLatest=true (issue #2679):
    // em 15/09 dava 1043857760 com a web já em 1047595053. Então: 1º a versão
    // real do web.whatsapp.com, depois a do Baileys, depois o fallback fixo.
    let version: [number, number, number] = FALLBACK_WA_VERSION;
    let origemVersao = "fallback";
    try {
      const r = await fetchLatestWaWebVersion({ signal: AbortSignal.timeout(8000) } as never);
      if (!r.isLatest) throw new Error((r as { error?: unknown }).error ? String((r as { error?: unknown }).error) : "sem versão");
      version = r.version as [number, number, number];
      origemVersao = "web.whatsapp.com";
    } catch (e) {
      console.warn(`[whatsapp-qr] fetchLatestWaWebVersion falhou (${String((e as Error)?.message ?? e)})`);
      try {
        const r = await fetchLatestBaileysVersion();
        if (r.isLatest && r.version[2] > FALLBACK_WA_VERSION[2]) {
          version = r.version as [number, number, number];
          origemVersao = "baileys";
        }
      } catch { /* fica no fallback */ }
    }
    console.warn(`[whatsapp-qr] WA version=${version.join(".")} origem=${origemVersao}`);

    const porChat = new Map<string, { mensagens: MensagemBaileys[]; nome: string | null }>();
    let sincronizando = false;
    let finalizando = false;
    let totalMensagensRecebidas = 0;
    let sock: ReturnType<typeof makeWASocket>;
    let tentativasReconexao = 0;
    const MAX_RECONEXOES = 2;
    let refreshsQr = 0;
    const MAX_REFRESH_QR = 2;

    let codigoPedido = false;

    const timeoutQr = setTimeout(() => {
      enviarEvento(res, "erro", {
        mensagem: porCodigo ? "Tempo esgotado esperando o código ser digitado no celular." : "Tempo esgotado esperando o scan do QR.",
      });
      void encerrar(sock).then(() => res.end());
    }, porCodigo ? TIMEOUT_CODIGO_MS : TIMEOUT_QR_MS);

    let timeoutSilencio: ReturnType<typeof setTimeout> | undefined;
    let timeoutTeto: ReturnType<typeof setTimeout> | undefined;

    const rearmarSilencio = () => {
      clearTimeout(timeoutSilencio);
      timeoutSilencio = setTimeout(() => { void finalizar(sock); }, SILENCIO_SYNC_MS);
    };

    const iniciarJanelaSync = () => {
      if (sincronizando) return;
      sincronizando = true;
      enviarEvento(res, "status", { mensagem: "Conectado — lendo o histórico completo…" });
      rearmarSilencio();
      const restante = inicio + LIMITE_FUNCTION_MS - RESERVA_GRAVACAO_MS - Date.now();
      timeoutTeto = setTimeout(() => { void finalizar(sock); }, Math.max(30_000, Math.min(TETO_SYNC_MS, restante)));
    };

    function criarSocket(): ReturnType<typeof makeWASocket> {
      const s = makeWASocket({
        version,
        auth: state,
        logger: P({ level: "silent" }) as never,
        syncFullHistory: true,
        // Windows/Desktop, NÃO macOS/Desktop (que a Babel usa): em 2026-09-11 o
        // WhatsApp passou a derrubar com 428, antes do QR, qualquer socket que
        // se anuncie como DARWIN ou WIN32. Windows só funciona porque o
        // scripts/patch-baileys.mjs (postinstall) troca WIN32 → WIN_HYBRID na
        // lib, igual ao fix do Baileys de 04/08 (PR #2741) que não está no rc14.
        // Testado 3/3 localmente; macOS/Desktop e Windows/Desktop sem patch
        // caem 100% das vezes.
        browser: Browsers.windows("Desktop"),
        shouldSyncHistoryMessage: () => true,
        markOnlineOnConnect: false,
        printQRInTerminal: false,
      });

      s.ev.on("creds.update", saveCreds);

      s.ev.on("connection.update", (update) => {
        const { connection, qr, lastDisconnect } = update;
        if (qr) {
          // No modo código o QR é ignorado: o `qr` só serve de sinal de que o
          // handshake terminou e já dá pra pedir o pareamento por número.
          if (porCodigo) {
            if (!codigoPedido) {
              codigoPedido = true;
              void s.requestPairingCode(telefoneDigitos)
                .then((codigo) => {
                  console.warn(`[whatsapp-qr] código de pareamento gerado (tentativa ${tentativasReconexao})`);
                  enviarEvento(res, "codigo", { codigo });
                })
                .catch((e) => {
                  console.error("[whatsapp-qr] falha ao pedir o código de pareamento:", e);
                  enviarEvento(res, "erro", { mensagem: "Não consegui gerar o código pra esse número. Confira o número ou use o QR code." });
                  void encerrar(sock).then(() => res.end());
                });
            }
            return;
          }
          console.warn(`[whatsapp-qr] QR gerado (tentativa ${tentativasReconexao}) — aguardando scan`);
          enviarEvento(res, "qr", { qr });
        }
        if (connection === "connecting") console.warn(`[whatsapp-qr] connecting (tentativa ${tentativasReconexao})`);
        if (connection === "open") {
          clearTimeout(timeoutQr);
          console.warn("[whatsapp-qr] CONNECTION OPEN — scan confirmado, iniciando sync");
          iniciarJanelaSync();
        }
        if (connection === "close") {
          const motivo = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
          const jaEscaneou = Boolean((state.creds as { registered?: boolean }).registered);
          console.warn(
            "[whatsapp-qr] connection close — motivo:", motivo,
            "jaEscaneou:", jaEscaneou, "sincronizando:", sincronizando,
            "reconexoes:", tentativasReconexao, "refreshsQr:", refreshsQr,
            lastDisconnect?.error,
          );

          if (motivo === DisconnectReason.restartRequired) {
            enviarEvento(res, "status", { mensagem: "Confirmado o vínculo — reconectando…" });
            sock = criarSocket();
            return;
          }

          if (!jaEscaneou && !sincronizando && !finalizou && motivo !== DisconnectReason.loggedOut) {
            if (refreshsQr < MAX_REFRESH_QR) {
              refreshsQr++;
              codigoPedido = false; // socket novo, pareamento novo
              const esperaMs = 1500 + Math.floor(Math.random() * 1500);
              enviarEvento(res, "status", { mensagem: porCodigo ? "Gerando um código novo…" : "Gerando um QR novo…" });
              setTimeout(() => { if (!finalizou) sock = criarSocket(); }, esperaMs);
              return;
            }
            enviarEvento(res, "erro", { mensagem: "Não consegui manter o QR aberto pra você escanear. Tente de novo em ~1 min." });
            void encerrar(sock).then(() => res.end());
            return;
          }

          if (
            jaEscaneou && !sincronizando && !finalizou &&
            (motivo === DisconnectReason.connectionClosed || motivo === DisconnectReason.connectionLost) &&
            tentativasReconexao < MAX_RECONEXOES
          ) {
            tentativasReconexao++;
            const esperaMs = tentativasReconexao * 4000 + Math.floor(Math.random() * 2000);
            enviarEvento(res, "status", { mensagem: `Conexão caiu — aguardando ${Math.round(esperaMs / 1000)}s pra tentar de novo (${tentativasReconexao}/${MAX_RECONEXOES})…` });
            setTimeout(() => { if (!finalizou) sock = criarSocket(); }, esperaMs);
            return;
          }

          if (motivo !== DisconnectReason.loggedOut && !sincronizando && !finalizou) {
            enviarEvento(res, "erro", { mensagem: "Conexão caiu antes de terminar. Tente de novo." });
            void encerrar(sock).then(() => res.end());
          }
        }
      });

      s.ev.on("messaging-history.set", ({ chats, contacts, messages, syncType, progress }) => {
        if (finalizou || finalizando) return;
        console.warn("[whatsapp-qr] chunk de histórico — syncType:", syncType, "progresso:", progress, "mensagens no chunk:", (messages ?? []).length);

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
          if (!entrada.nome && nomePorJid.has(jid)) entrada.nome = nomePorJid.get(jid)!;
          if (entrada.mensagens.length < LIMITE_TECNICO_MSGS_POR_CHAT) {
            entrada.mensagens.push(msg);
            totalMensagensRecebidas++;
          }
          porChat.set(jid, entrada);
        }

        if (sincronizando) {
          rearmarSilencio();
          enviarEvento(res, "status", { mensagem: `Lendo o histórico… ${totalMensagensRecebidas.toLocaleString("pt-BR")} mensagens em ${porChat.size} conversa(s) até agora.` });
        }
      });

      return s;
    }

    sock = criarSocket();

    async function finalizar(sockAtual: ReturnType<typeof makeWASocket>) {
      if (finalizou || finalizando) return;
      finalizando = true;
      clearTimeout(timeoutSilencio);
      clearTimeout(timeoutTeto);

      // Desconecta ANTES de gravar: não precisa mais do socket, e o logout
      // imediato reduz o tempo que o "aparelho" fica pendurado na conta.
      try { await sockAtual.logout(); } catch { /* noop */ }
      try { sockAtual.end?.(undefined); } catch { /* noop */ }

      // Monta as linhas [nome, conversa] — uma conversa por chat, ordenada.
      const linhas: [string, string][] = [];
      let totalMensagens = 0;
      let totalConversas = 0;
      for (const [jid, { mensagens, nome }] of porChat) {
        const phone = extrairTelefoneDoJid(jid);
        if (!mensagens.length) continue;
        const ordenadas = [...mensagens].sort((a, b) => timestampSegundos(a?.messageTimestamp) - timestampSegundos(b?.messageTimestamp));
        const rotuloContato = nome ?? (phone ? formatarTelefone(phone) : "Contato");
        const textoLinhas: string[] = [];
        for (const msg of ordenadas) {
          const texto = extrairTextoMensagem(msg);
          if (!texto) continue;
          const quem = msg?.key?.fromMe ? aba : rotuloContato;
          textoLinhas.push(`[${formatarData(timestampSegundos(msg?.messageTimestamp))}] ${quem}: ${texto}`);
        }
        if (!textoLinhas.length) continue;
        totalMensagens += textoLinhas.length;
        totalConversas++;
        const nomeCelula = nome && phone ? `${nome}\n${formatarTelefone(phone)}` : rotuloContato;
        linhas.push(...fatiarConversa(nomeCelula, textoLinhas));
      }

      enviarEvento(res, "status", { mensagem: `Enviando ${totalConversas} conversa(s) pra planilha…` });

      // Lotes por quantidade E por tamanho. O 1º lote pede `novo: true` pra
      // planilha decidir o nome final da aba (ex.: "Nome (2)" se já existia).
      let abaFinal = aba;
      let enviadas = 0;
      let primeiro = true;
      let i = 0;
      try {
        while (i < linhas.length) {
          const lote: [string, string][] = [];
          let bytes = 0;
          while (i < linhas.length && lote.length < LOTE_MAX_LINHAS) {
            const custo = linhas[i][0].length + linhas[i][1].length;
            if (lote.length && bytes + custo > LOTE_MAX_BYTES) break;
            lote.push(linhas[i]);
            bytes += custo;
            i++;
          }
          const r = await postarComRetry({ acao: "conversas", aba: abaFinal, linhas: lote, novo: primeiro });
          if (primeiro && typeof r.aba === "string") abaFinal = r.aba;
          primeiro = false;
          enviadas += lote.length;
          enviarEvento(res, "status", { mensagem: `Enviando conversas pra planilha… ${Math.min(enviadas, linhas.length)}/${linhas.length} linha(s).` });
        }
        if (idEnvio) {
          try { await postarComRetry({ acao: "total_conversas", id_envio: idEnvio, total: totalConversas, aba: abaFinal }); } catch (e) {
            console.warn("[whatsapp-qr] não atualizou o total na aba Dados:", (e as Error).message);
          }
        }
        console.warn(`[whatsapp-qr] done — ${totalConversas} conversas / ${totalMensagens} mensagens → aba "${abaFinal}"`);
        enviarEvento(res, "done", { conversas: totalConversas, mensagens: totalMensagens, aba: abaFinal });
      } catch (e) {
        console.error("[whatsapp-qr] falha ao enviar pra planilha:", e);
        enviarEvento(res, "erro", { mensagem: `As conversas foram lidas, mas a planilha falhou no meio (${enviadas} de ${linhas.length} linhas gravadas). Tente de novo.` });
      }
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
