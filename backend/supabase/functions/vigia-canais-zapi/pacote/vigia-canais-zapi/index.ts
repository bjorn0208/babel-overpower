/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// vigia-canais-zapi · vigia + auto-cura dos callbacks da Z-API.
//
// Por quê: a Babel nunca configurou os callbacks da Z-API. O único PUT que existia
// (`ensureReceivedByMe`, em webhook/helpers.ts) roda DENTRO do webhook — ovo e galinha:
// canal cujo callback aponta pra fora nunca recebe webhook, logo nunca se conserta
// sozinho. Cravar na mão era passo manual, e já falhou 4x: Carlos (2026-06-02),
// Fabricio (2026-08-20), Tríade (2026-08-31) e Otmar (2026-09-04) — este último ficou
// 3 dias entregando toda mensagem de lead na plataforma ANTERIOR do cliente, com o
// tenant achando que a Babel estava quebrada.
//
// O que faz, por canal WhatsApp ativo com credencial:
//   1. GET /me → estado real dos 6 callbacks + connected + vencimento do plano.
//   2. Callback apontando pra host que não é o nosso → PUT corrige na hora.
//   3. Junta ocorrência quando algo precisa de humano.
//   4. Havendo ocorrência, abre UM alerta em `alertas_operacao`. Sem ocorrência não
//      escreve nada — silêncio = tudo bem, mesmo contrato do `vigia_bolhas_barradas`.
//
// Body opcional `{ "canal_id": "<uuid>" }` roda num canal só — é o que o trigger de
// `canais` manda quando um canal nasce ou é reativado. `{ "corrigir": false }` faz
// passagem só de leitura (diagnóstico sem escrever na Z-API).
//
// Schedule: cron horário via pg_cron (`vigia-canais-zapi`).

import { criarClienteAdmin } from "../_shared/supabase.ts";
import { autorizarCron } from "../_shared/auth-cron.ts";

const URL_WEBHOOK = `${Deno.env.get("SUPABASE_URL")}/functions/v1/webhook`;
const HOST_NOSSO = new URL(URL_WEBHOOK).origin;

// Os 7 callbacks, TODOS apontando pra cá. Não existe "campo legado que pode ficar
// vazio" — ver a lição abaixo.
//
// LIÇÃO CARA (2026-09-04, custou meia manhã do Otmar): `receivedAndDeliveryCallbackUrl`
// NÃO cobre a mensagem que o lead manda. Ele entrega só a metade "delivery" (enviadas
// pelo dono). Quem entrega a mensagem ENTRANTE é o `receivedCallbackUrl`.
//
// Como isso foi provado: às 10:11 zerei `receivedCallbackUrl`/`deliveryCallbackUrl` do
// Otmar por achar que os 5 "canônicos" bastavam. A partir daí o webhook passou a receber
// da instância dele SÓ evento `fromMe: true` e `MessageStatusCallback` — nenhum
// `fromMe: false`. Mensagem de lead continuou não chegando. Restaurados os 7 pra nossa
// URL, igual aos canais que funcionam (Diego, Carlos, Tríade), o fluxo normalizou.
//
// Regra prática: a configuração que a frota usa e que comprovadamente funciona é os 7
// campos com a URL do webhook. Não "limpar" nada.
const CALLBACKS: { endpoint: string; campo: string }[] = [
  { endpoint: "update-webhook-received", campo: "receivedCallbackUrl" },
  { endpoint: "update-webhook-delivery", campo: "deliveryCallbackUrl" },
  { endpoint: "update-webhook-received-delivery", campo: "receivedAndDeliveryCallbackUrl" },
  { endpoint: "update-webhook-chat-presence", campo: "presenceChatCallbackUrl" },
  { endpoint: "update-webhook-connected", campo: "connectedCallbackUrl" },
  { endpoint: "update-webhook-disconnected", campo: "disconnectedCallbackUrl" },
  { endpoint: "update-webhook-message-status", campo: "messageStatusCallbackUrl" },
];

const TIMEOUT_ZAPI_MS = 20_000;

type Canal = {
  id: string;
  user_id: string;
  zapi_instance_id: string | null;
  zapi_token: string | null;
  zapi_security_token: string | null;
  zapi_api_url: string | null;
  created_at: string;
};

type Ocorrencia = {
  canal_id: string;
  tenant: string;
  instancia: string;
  motivo: string;
  detalhe: string;
};

function baseZapi(canal: Canal): string {
  const raiz = (canal.zapi_api_url || "https://api.z-api.io").replace(/\/+$/, "");
  return `${raiz}/instances/${canal.zapi_instance_id}/token/${canal.zapi_token}`;
}

function apontaPraTerceiro(valor: string): boolean {
  if (!valor) return false;
  try {
    return new URL(valor).origin !== HOST_NOSSO;
  } catch (_) {
    return true; // URL que nem parseia não é nossa
  }
}

async function chamarZapi(
  url: string,
  canal: Canal,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; corpo: unknown; erro?: string }> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_ZAPI_MS);
  try {
    const resp = await fetch(url, {
      ...init,
      signal: controle.signal,
      headers: {
        "Content-Type": "application/json",
        "Client-Token": canal.zapi_security_token || "",
        ...(init.headers ?? {}),
      },
    });
    let corpo: unknown = null;
    try { corpo = await resp.json(); } catch (_) { /* corpo não-JSON não é fatal */ }
    return { ok: resp.ok, status: resp.status, corpo };
  } catch (e) {
    return { ok: false, status: 0, corpo: null, erro: (e as Error).message };
  } finally {
    clearTimeout(relogio);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
    });
  }

  const { ok: autorizado } = await autorizarCron(req);
  if (!autorizado) {
    return new Response(JSON.stringify({ ok: false, erro: "nao_autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let canalAlvo: string | null = null;
  let corrigir = true;
  try {
    const body = await req.json();
    if (typeof body?.canal_id === "string") canalAlvo = body.canal_id;
    if (body?.corrigir === false) corrigir = false;
  } catch (_) { /* body vazio = varredura completa, é o caso do cron */ }

  const supabase = criarClienteAdmin();

  let consulta = supabase.from("canais")
    .select("id, user_id, zapi_instance_id, zapi_token, zapi_security_token, zapi_api_url, created_at")
    .eq("type", "whatsapp")
    .eq("is_active", true)
    .not("zapi_instance_id", "is", null)
    .not("zapi_token", "is", null);
  if (canalAlvo) consulta = consulta.eq("id", canalAlvo);

  const { data: canais, error: erroCanais } = await consulta;
  if (erroCanais) {
    return new Response(JSON.stringify({ ok: false, erro: erroCanais.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const lista = (canais ?? []) as Canal[];
  const tenantIds = [...new Set(lista.map((c) => c.user_id))];

  const nomes = new Map<string, string>();
  const agenteLigado = new Map<string, boolean>();
  if (tenantIds.length > 0) {
    const { data: perfis } = await supabase.from("profiles")
      .select("id, full_name").in("id", tenantIds);
    for (const p of (perfis ?? []) as { id: string; full_name: string | null }[]) {
      nomes.set(p.id, p.full_name || p.id);
    }
    // Agente desligado = tenant não está operando. Instância caída ou plano vencido
    // nesse caso não é incidente, é canal parado — alertar viraria ruído horário que
    // ninguém lê (na frota de hoje isso é a maioria dos canais).
    const { data: agentes } = await supabase.from("agentes_usuario")
      .select("user_id, is_active").in("user_id", tenantIds);
    for (const a of (agentes ?? []) as { user_id: string; is_active: boolean }[]) {
      agenteLigado.set(a.user_id, a.is_active === true);
    }
  }

  const ocorrencias: Ocorrencia[] = [];
  const consertados: Record<string, string[]> = {};
  let conferidos = 0;

  for (const canal of lista) {
    const tenant = nomes.get(canal.user_id) ?? canal.user_id;
    const instancia = canal.zapi_instance_id ?? "";
    const operando = agenteLigado.get(canal.user_id) === true;
    const base = baseZapi(canal);

    const me = await chamarZapi(`${base}/me`, canal);
    if (!me.ok || me.corpo === null || typeof me.corpo !== "object") {
      if (operando) {
        ocorrencias.push({
          canal_id: canal.id,
          tenant,
          instancia,
          motivo: "zapi_inacessivel",
          detalhe: me.erro
            ? `falha de rede: ${me.erro}`
            : `GET /me devolveu ${me.status} — credencial recusada ou instância removida`,
        });
      }
      continue;
    }
    conferidos++;

    const estado = me.corpo as Record<string, unknown>;
    const ler = (campo: string) => typeof estado[campo] === "string" ? estado[campo] as string : "";

    if (operando && estado.connected !== true) {
      ocorrencias.push({
        canal_id: canal.id,
        tenant,
        instancia,
        motivo: "instancia_desconectada",
        detalhe: "precisa reler o QR code no painel da Z-API — a Babel não conserta sozinha",
      });
    }

    // Sem checagem de vencimento de plano: o campo `due` do /me foi lido como "plano
    // vencido" na v2 e abriu alarme falso em tenant com a Z-API paga em dia (Theus
    // confirmou 2026-09-04). Não sei o que `due` significa de fato — enquanto não
    // souber, não afirmo nada sobre a cobrança de ninguém.

    // --- callbacks: compara e conserta ---
    const aCorrigir: { endpoint: string; campo: string; valor: string; atual: string }[] = [];
    for (const { endpoint, campo } of CALLBACKS) {
      const atual = ler(campo);
      if (atual !== URL_WEBHOOK) aCorrigir.push({ endpoint, campo, valor: URL_WEBHOOK, atual });
    }

    if (aCorrigir.length > 0) {
      // Callback em host de terceiro = mensagem de lead saindo da plataforma. Isso é
      // vazamento, não deriva de config — sobe a severidade e alerta mesmo com o
      // agente desligado (o dado vaza do mesmo jeito).
      const vazando = aCorrigir.some((c) => apontaPraTerceiro(c.atual));

      const falhas: string[] = [];
      if (corrigir) {
        for (const alvo of aCorrigir) {
          const put = await chamarZapi(`${base}/${alvo.endpoint}`, canal, {
            method: "PUT",
            body: JSON.stringify({ value: alvo.valor }),
          });
          if (put.ok) (consertados[tenant] ??= []).push(alvo.campo);
          else falhas.push(`${alvo.campo} (${put.erro ?? `HTTP ${put.status}`})`);
        }
      }

      if (operando || vazando) {
        ocorrencias.push({
          canal_id: canal.id,
          tenant,
          instancia,
          motivo: vazando ? "callback_apontado_pra_terceiro" : "callback_divergente",
          detalhe: [
            aCorrigir.map((c) => `${c.campo}=${c.atual || "(vazio)"}`).join(" · "),
            corrigir
              ? (falhas.length > 0
                ? `PUT falhou em: ${falhas.join(", ")} — precisa de humano`
                : "corrigido automaticamente")
              : "modo leitura, nada corrigido",
          ].join(" | "),
        });
      }
    }

    // --- canal que nunca recebeu nada ---
    // Sinal apertado de propósito: "sem mensagem há N horas" daria falso positivo em
    // todo tenant de baixo volume e viraria ruído. Canal ativo há mais de 24h que NUNCA
    // teve mensagem de lead POR WHATSAPP é a assinatura do caso Otmar.
    //
    // O filtro `channel = 'whatsapp'` é o que faz a checagem valer: o Chat de Teste
    // grava `mensagens.role = 'user'` em conversa `channel = 'teste'`, e sem o filtro o
    // Otmar aparecia com 70 mensagens de "lead" — a checagem teria deixado passar
    // justamente o caso que ela existe pra pegar (pego na varredura de 2026-09-04).
    const idadeHoras = (Date.now() - new Date(canal.created_at).getTime()) / 3_600_000;
    if (operando && idadeHoras > 24) {
      const { count } = await supabase
        .from("mensagens")
        .select("id, conversas!inner(tenant_id, channel)", { count: "exact", head: true })
        .eq("role", "user")
        .eq("conversas.tenant_id", canal.user_id)
        .eq("conversas.channel", "whatsapp");
      if ((count ?? 0) === 0) {
        ocorrencias.push({
          canal_id: canal.id,
          tenant,
          instancia,
          motivo: "canal_nunca_recebeu",
          detalhe: `canal ativo há ${Math.floor(idadeHoras / 24)}d e nenhuma mensagem de lead entrou por WhatsApp até hoje`,
        });
      }
    }
  }

  // Alerta só nasce se a situação MUDOU. O cron roda de hora em hora; reabrir o mesmo
  // alerta 24x/dia é o jeito mais rápido de ensinar o operador a ignorar `alertas_operacao`.
  let alertaId: string | null = null;
  let repetido = false;
  if (ocorrencias.length > 0) {
    const impressao = ocorrencias
      .map((o) => `${o.canal_id}:${o.motivo}`)
      .sort()
      .join("|");

    const { data: aberto } = await supabase.from("alertas_operacao")
      .select("id, detalhes")
      .eq("tipo", "canal_zapi")
      .is("visto_em", null)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if ((aberto?.detalhes as Record<string, unknown> | null)?.impressao === impressao) {
      repetido = true;
      alertaId = aberto?.id ?? null;
    } else {
      const grave = ocorrencias.some((o) =>
        o.motivo === "callback_apontado_pra_terceiro" ||
        o.motivo === "instancia_desconectada" ||
        o.motivo === "zapi_inacessivel"
      );
      const { data: alerta } = await supabase.from("alertas_operacao").insert({
        tipo: "canal_zapi",
        severidade: grave ? "critico" : "alerta",
        resumo: `${ocorrencias.length} problema(s) de canal Z-API em ${new Set(ocorrencias.map((o) => o.tenant)).size} tenant(s)`,
        detalhes: {
          impressao,
          canais_conferidos: conferidos,
          corrigido_automaticamente: consertados,
          ocorrencias,
        },
      }).select("id").maybeSingle();
      alertaId = alerta?.id ?? null;
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      canais_lidos: lista.length,
      canais_conferidos: conferidos,
      ocorrencias: ocorrencias.length,
      corrigido_automaticamente: consertados,
      alerta_id: alertaId,
      alerta_repetido: repetido,
      detalhe: ocorrencias,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
