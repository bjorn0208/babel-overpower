/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// _shared/whatsapp-oficial.ts — cliente da WhatsApp Cloud API (Meta).
//
// Canal OFICIAL, usado pelo disparo em massa da Babel. Não substitui a Z-API:
// a Z-API continua atendendo o WhatsApp de cada tenant (`canais.zapi_*`). Este
// arquivo é a outra ponta — número da Babel, API oficial, mensagem ativa.
//
// Por que oficial aqui: disparo ativo em volume por API não-oficial viola o
// termo do WhatsApp e o ban é permanente e sem recurso. A Z-API declara por
// escrito que não impõe limite e que o risco é de quem usa.
//
// O módulo é PURO: recebe credencial por parâmetro, não lê banco nem env.
// Quem chama decide de onde vem o token (vault, tabela `canais`, env).
//
// Contrato conferido na doc da Meta em 2026-09-08:
//   POST https://graph.facebook.com/v26.0/<PHONE_NUMBER_ID>/messages
//   https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages

/** Graph API v26.0 — lançada em 29/07/2026. Trocar por aqui quando subir. */
export const VERSAO_GRAPH_PADRAO = "v26.0";

export interface CredenciaisWhatsAppOficial {
  /** PHONE_NUMBER_ID do número na conta WhatsApp Business (não é o telefone). */
  idNumero: string;
  /** Token de acesso permanente do app da Meta. */
  token: string;
  /** Sobrescreve a versão da Graph API — só pra teste/rollback. */
  versaoGraph?: string;
}

export type CategoriaErroEnvio =
  | "fora_da_janela"
  | "modelo_invalido"
  | "modelo_pausado"
  | "limite_taxa"
  | "numero_invalido"
  | "token_expirado"
  | "conta_bloqueada"
  | "transporte"
  | "desconhecido";

export interface ErroEnvio {
  categoria: CategoriaErroEnvio;
  /** Código numérico da Meta (`error.code`), quando veio. */
  codigo: number | null;
  mensagem: string;
  /** `error.error_data.details` — costuma ser a explicação legível. */
  detalhe: string | null;
  /** Falha de transporte/limite vale nova tentativa; erro de negócio, não. */
  podeTentarDeNovo: boolean;
}

export type ResultadoEnvio =
  | { ok: true; /** wamid — amarra com o webhook de status. */ id: string }
  | { ok: false; erro: ErroEnvio };

/** https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/ */
const CATEGORIA_POR_CODIGO: Record<number, CategoriaErroEnvio> = {
  131047: "fora_da_janela", // passaram 24h desde a última resposta do destinatário
  132001: "modelo_invalido", // modelo não existe naquele idioma / não aprovado
  132015: "modelo_pausado", // pausado por qualidade baixa
  130429: "limite_taxa", // throughput da Cloud API estourado
  80007: "limite_taxa", // conta excedeu o limite
  131009: "numero_invalido", // valor de parâmetro inválido — número malformado cai aqui
  190: "token_expirado",
  131031: "conta_bloqueada",
};

const CATEGORIAS_RETENTAVEIS = new Set<CategoriaErroEnvio>(["limite_taxa", "transporte"]);

const erroDe = (
  categoria: CategoriaErroEnvio,
  mensagem: string,
  codigo: number | null = null,
  detalhe: string | null = null,
): ErroEnvio => ({
  categoria,
  codigo,
  mensagem,
  detalhe,
  podeTentarDeNovo: CATEGORIAS_RETENTAVEIS.has(categoria),
});

/**
 * Só dígitos, com DDI. A Meta aceita o número em formato livre, mas manda a
 * resposta com o `wa_id` já normalizado — mandar limpo evita divergência entre
 * o que gravamos e o que o webhook devolve.
 */
export function normalizarTelefone(bruto: string | null | undefined): string | null {
  const digitos = String(bruto ?? "").replace(/\D/g, "");
  return digitos.length >= 10 ? digitos : null;
}

async function chamar(
  credenciais: CredenciaisWhatsAppOficial,
  corpo: Record<string, unknown>,
): Promise<ResultadoEnvio> {
  const versao = credenciais.versaoGraph ?? VERSAO_GRAPH_PADRAO;
  const url = `https://graph.facebook.com/${versao}/${credenciais.idNumero}/messages`;

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credenciais.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(corpo),
    });
  } catch (e) {
    // Rede caiu antes de a Meta responder: não sabemos se enviou. Retentar é
    // seguro porque a Meta deduplica por conteúdo em janela curta; ainda assim
    // quem chama deve gravar a tentativa antes de repetir.
    return { ok: false, erro: erroDe("transporte", e instanceof Error ? e.message : String(e)) };
  }

  const texto = await resposta.text();
  let dados: Record<string, unknown>;
  try {
    dados = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      erro: erroDe("transporte", `resposta não-JSON (HTTP ${resposta.status})`, null, texto.slice(0, 300)),
    };
  }

  if (!resposta.ok || dados.error) {
    const erro = (dados.error ?? {}) as {
      code?: number;
      message?: string;
      error_data?: { details?: string };
    };
    const codigo = typeof erro.code === "number" ? erro.code : null;
    const categoria = (codigo !== null && CATEGORIA_POR_CODIGO[codigo]) ||
      (resposta.status >= 500 ? "transporte" : "desconhecido");
    return {
      ok: false,
      erro: erroDe(
        categoria,
        erro.message ?? `HTTP ${resposta.status}`,
        codigo,
        erro.error_data?.details ?? null,
      ),
    };
  }

  const mensagens = dados.messages as Array<{ id?: string }> | undefined;
  const id = mensagens?.[0]?.id;
  if (!id) {
    return { ok: false, erro: erroDe("desconhecido", "resposta sem messages[0].id", null, texto.slice(0, 300)) };
  }

  // `message_status: "accepted"` = aceita pra envio. Entrega só se confirma
  // pelo webhook de status.
  return { ok: true, id };
}

/**
 * Texto livre — só vale DENTRO da janela de 24h (a pessoa falou com a gente
 * nas últimas 24h). Fora da janela a Meta devolve 131047: use `enviarModelo`.
 */
export function enviarTexto(
  credenciais: CredenciaisWhatsAppOficial,
  opcoes: { telefone: string; texto: string; permitirPreviaDeLink?: boolean },
): Promise<ResultadoEnvio> {
  const telefone = normalizarTelefone(opcoes.telefone);
  if (!telefone) {
    return Promise.resolve({ ok: false, erro: erroDe("numero_invalido", "telefone sem dígitos suficientes") });
  }
  return chamar(credenciais, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: telefone,
    type: "text",
    text: { body: opcoes.texto, preview_url: opcoes.permitirPreviaDeLink ?? false },
  });
}

/** Um parâmetro do corpo do modelo, na ordem em que aparece no texto aprovado. */
export type ParametroModelo = string;

/**
 * Modelo de mensagem ("message template" no painel da Meta) — o único jeito de
 * iniciar conversa fora da janela de 24h. O modelo precisa estar aprovado no
 * idioma pedido, senão volta 132001.
 *
 * Só parâmetros POSICIONAIS: a doc de parâmetros nomeados não abriu na
 * confirmação de 2026-09-08, então não escrevemos em cima do que não vimos.
 */
export function enviarModelo(
  credenciais: CredenciaisWhatsAppOficial,
  opcoes: {
    telefone: string;
    nome: string;
    /** Código do idioma cadastrado no modelo. Ex.: `pt_BR`. */
    idioma?: string;
    parametrosCorpo?: ParametroModelo[];
    parametrosCabecalho?: ParametroModelo[];
  },
): Promise<ResultadoEnvio> {
  const telefone = normalizarTelefone(opcoes.telefone);
  if (!telefone) {
    return Promise.resolve({ ok: false, erro: erroDe("numero_invalido", "telefone sem dígitos suficientes") });
  }

  const componentes: Array<Record<string, unknown>> = [];
  const comoParametros = (valores: ParametroModelo[]) => valores.map((text) => ({ type: "text", text }));

  if (opcoes.parametrosCabecalho?.length) {
    componentes.push({ type: "header", parameters: comoParametros(opcoes.parametrosCabecalho) });
  }
  if (opcoes.parametrosCorpo?.length) {
    componentes.push({ type: "body", parameters: comoParametros(opcoes.parametrosCorpo) });
  }

  return chamar(credenciais, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: telefone,
    type: "template",
    template: {
      name: opcoes.nome,
      language: { code: opcoes.idioma ?? "pt_BR" },
      ...(componentes.length ? { components: componentes } : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

export type StatusEntrega = "enviado" | "entregue" | "lido" | "falhou";

/**
 * A Meta repete o mesmo status mais de uma vez e manda vários numa callback só.
 * Guardar a ordem deixa a gravação idempotente: o status só avança, nunca
 * regride de `lido` pra `entregue`. `falhou` é terminal.
 */
export const ORDEM_STATUS: Record<StatusEntrega, number> = {
  enviado: 1,
  entregue: 2,
  lido: 3,
  falhou: 9,
};

const STATUS_TRADUZIDO: Record<string, StatusEntrega> = {
  sent: "enviado",
  delivered: "entregue",
  read: "lido",
  failed: "falhou",
};

export interface AtualizacaoStatus {
  /** wamid devolvido no envio. */
  id: string;
  status: StatusEntrega;
  telefone: string;
  em: string;
  erro: string | null;
}

/** De onde o lead veio, quando a conversa nasceu de um anúncio click-to-WhatsApp. */
export interface OrigemAnuncio {
  /** Click ID — a chave da atribuição. */
  ctwaClid: string | null;
  /** ID do anúncio ou do post. */
  idOrigem: string | null;
  tipoOrigem: string | null;
  urlOrigem: string | null;
  titulo: string | null;
  corpo: string | null;
}

export interface MensagemRecebida {
  id: string;
  telefone: string;
  em: string;
  tipo: string;
  texto: string | null;
  /** Só vem na PRIMEIRA mensagem de quem clicou no anúncio. Grave na hora. */
  origemAnuncio: OrigemAnuncio | null;
}

type ValorWebhook = {
  statuses?: Array<{
    id?: string;
    status?: string;
    timestamp?: string;
    recipient_id?: string;
    errors?: Array<{ title?: string; message?: string }>;
  }>;
  messages?: Array<{
    id?: string;
    from?: string;
    timestamp?: string;
    type?: string;
    text?: { body?: string };
    referral?: Record<string, unknown>;
  }>;
};

function valoresDoWebhook(corpo: unknown): ValorWebhook[] {
  const raiz = corpo as { entry?: Array<{ changes?: Array<{ value?: ValorWebhook }> }> } | null;
  return (raiz?.entry ?? []).flatMap((e) => (e.changes ?? []).map((c) => c.value ?? {}));
}

const emIso = (timestamp: string | undefined): string =>
  new Date(Number(timestamp ?? 0) * 1000 || Date.now()).toISOString();

/** Status desconhecido é descartado — melhor ignorar do que gravar lixo. */
export function lerStatusDoWebhook(corpo: unknown): AtualizacaoStatus[] {
  return valoresDoWebhook(corpo).flatMap((valor) =>
    (valor.statuses ?? []).flatMap((s) => {
      const status = STATUS_TRADUZIDO[String(s.status ?? "").toLowerCase()];
      if (!status || !s.id) return [];
      const falha = s.errors?.[0];
      return [{
        id: s.id,
        status,
        telefone: s.recipient_id ?? "",
        em: emIso(s.timestamp),
        erro: falha ? `${falha.title ?? ""}: ${falha.message ?? ""}`.trim() : null,
      }];
    })
  );
}

function lerOrigemAnuncio(referral: Record<string, unknown> | undefined): OrigemAnuncio | null {
  if (!referral) return null;
  const texto = (chave: string) => {
    const v = referral[chave];
    return typeof v === "string" && v.length > 0 ? v : null;
  };
  return {
    ctwaClid: texto("ctwa_clid"),
    idOrigem: texto("source_id"),
    tipoOrigem: texto("source_type"),
    urlOrigem: texto("source_url"),
    titulo: texto("headline"),
    corpo: texto("body"),
  };
}

export function lerMensagensDoWebhook(corpo: unknown): MensagemRecebida[] {
  return valoresDoWebhook(corpo).flatMap((valor) =>
    (valor.messages ?? []).flatMap((m) => {
      if (!m.id || !m.from) return [];
      return [{
        id: m.id,
        telefone: m.from,
        em: emIso(m.timestamp),
        tipo: m.type ?? "desconhecido",
        texto: m.text?.body ?? null,
        origemAnuncio: lerOrigemAnuncio(m.referral),
      }];
    })
  );
}

/** Handshake de subscrição: a Meta chama em GET e espera o desafio de volta. */
export function responderDesafio(url: URL, tokenEsperado: string): Response | null {
  if (url.searchParams.get("hub.mode") !== "subscribe") return null;
  if (url.searchParams.get("hub.verify_token") !== tokenEsperado) {
    return new Response("verify_token inválido", { status: 403 });
  }
  return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
}

const paraHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");

/** Comparação de tempo constante — não vaza o segredo pelo tempo de resposta. */
function igualConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

/**
 * Valida `X-Hub-Signature-256` sobre o corpo CRU. Tem que ser o texto exato
 * que chegou — reserializar o JSON muda o byte e derruba a assinatura.
 */
export async function assinaturaValida(
  corpoBruto: string,
  cabecalho: string | null,
  segredoDoApp: string,
): Promise<boolean> {
  if (!cabecalho?.startsWith("sha256=") || !segredoDoApp) return false;
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredoDoApp),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpoBruto));
  return igualConstante(`sha256=${paraHex(mac)}`, cabecalho);
}
