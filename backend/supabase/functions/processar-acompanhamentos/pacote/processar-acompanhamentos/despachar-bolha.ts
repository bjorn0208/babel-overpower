// despachar-bolha.ts — worker de envio de bolha do outbox via Z-API.
//
// Origem: extraída de `chat/actions-send.ts` (aposentado com a edge `chat` no
// commit 5475ed8). O `outbox-consumer.ts` importava de `../chat/actions-send.ts`
// — import órfão desde a remoção do chat; só não estourou porque o bundle
// deployado v21 estava congelado de antes. Trazida pra cá AUTOCONTIDA (a função
// não depende de nada do chat: só SupabaseClient + fetch). Código idêntico ao
// que roda em prod no bundle v21 — fidelidade total, zero risco de regressão.
//
// Usada EXCLUSIVAMENTE pelo worker processar-acompanhamentos (outbox-consumer).

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

type Sb = SupabaseClient;

/**
 * Cache do estado de conexão por instância Z-API (Δ 2026-09-09).
 *
 * INCIDENTE que motivou: o WhatsApp do Fabrício ficou desconectado e a plataforma seguiu
 * mandando pra Z-API — que responde 200 e **enfileira** quando o aparelho está fora do ar
 * (opção "desabilitar enfileiramento quando WhatsApp estiver desconectado", desligada na conta).
 * No instante em que ele reconectou, 09/09 02:36, tudo o que estava represado saiu de uma vez:
 * 770 eventos em 57 segundos, mensagem chegando em uma porção de contatos ao mesmo tempo.
 * Constrangimento com cliente real.
 *
 * O `200` da Z-API significa "aceitei", não "entregou". Então agora a gente pergunta antes.
 * 60s de cache pra não fazer um GET /status por bolha.
 */
const cacheConexao = new Map<string, { conectado: boolean; em: number }>();
const TTL_CACHE_CONEXAO_MS = 60_000;

async function whatsappConectado(
  instanceId: string,
  zapiBase: string,
  headers: Record<string, string>,
): Promise<boolean> {
  const cache = cacheConexao.get(instanceId);
  if (cache && Date.now() - cache.em < TTL_CACHE_CONEXAO_MS) return cache.conectado;
  try {
    const res = await fetch(`${zapiBase}/status`, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return true; // não dá pra saber → deixa passar (não trava a fila por dúvida)
    const corpo = await res.json();
    const conectado = corpo?.connected === true;
    cacheConexao.set(instanceId, { conectado, em: Date.now() });
    return conectado;
  } catch {
    return true; // idem: falha de rede na checagem não pode virar bloqueio de envio
  }
}

/**
 * Despacha uma bolha do outbox diretamente via Z-API e atualiza status.
 *
 * `adiar: true` no retorno = não é falha da mensagem, é o canal fora do ar. O consumidor
 * reagenda SEM gastar retry — senão 3 minutos de queda do WhatsApp matariam a bolha.
 */
export async function despacharBolhaViaZapi(
  supabase: Sb,
  bolha: {
    id: string;
    conversation_id: string;
    tenant_id: string;
    content: string;
    retries: number;
    typing_seconds?: number;
    delay_message_s?: number;
    assistant_message_id?: string | null;
    /**
     * URL da imagem quando a bolha é foto (2026-09-07). Vem de `carga.midia_url`.
     * Com ela a bolha sai por `send-image` e o `content` vira legenda; sem ela,
     * segue o caminho de sempre em `send-text`.
     */
    midia_url?: string | null;
    /** Δ 2026-09-17: "video" troca a rota pra send-video (campo `video` + caption). */
    tipo_midia?: "foto" | "video" | null;
  },
  phone: string,
): Promise<{ ok: boolean; error?: string; adiar?: boolean }> {
  // DEFESA EM PROFUNDIDADE (incidente 2026-04-28 23:54).
  // Bloqueia QUALQUER content que comece com sentinela técnico [TOKEN_TIPO]
  // — esses tokens são INPUTS pro LLM, nunca devem ir pro Z-API como mensagem.
  // Se chegou aqui é regressão arquitetural. Marca outbox como superseded
  // e retorna sem chamar Z-API.
  const trimmedContent = (bolha.content || "").trimStart();
  if (/^\[[A-Z][A-Z0-9_]+(?::[^\]]*)?\]/.test(trimmedContent)) {
    console.error(
      `[despachar-zapi] BLOQUEADO token cru bolha=${bolha.id} content="${trimmedContent.slice(0, 80)}" — defesa em profundidade DEC-015`,
    );
    await supabase.from("caixa_saida_mensagens")
      .update({
        status: 'substituida',
        error_reason: `defesa em profundidade · token cru bloqueado · content="${trimmedContent.slice(0, 120)}"`,
      })
      .eq("id", bolha.id);
    return { ok: false, error: "token cru bloqueado pela defesa em profundidade" };
  }

  try {
    const { data: ch } = await supabase.from("canais")
      .select("zapi_instance_id, zapi_token, zapi_security_token, zapi_api_url")
      .eq("user_id", bolha.tenant_id).eq("type", "whatsapp").eq("is_active", true).limit(1).maybeSingle();

    if (!ch?.zapi_instance_id || !ch?.zapi_token) {
      return { ok: false, error: "canal Z-API não configurado" };
    }

    const zapiBase = `${ch.zapi_api_url || "https://api.z-api.io"}/instances/${ch.zapi_instance_id}/token/${ch.zapi_token}`;
    const headers = { "Content-Type": "application/json", "Client-Token": ch.zapi_security_token || "" };

    // WhatsApp fora do ar? Não manda — a Z-API aceitaria e guardaria pra despejar tudo junto
    // na reconexão (ver comentário do cache lá em cima). Melhor a bolha esperar aqui, na nossa
    // fila, onde a gente controla a ordem e o ritmo.
    if (!(await whatsappConectado(ch.zapi_instance_id, zapiBase, headers))) {
      console.warn(`[despachar-zapi] canal desconectado — adiando bolha=${bolha.id}`);
      return { ok: false, adiar: true, error: "whatsapp desconectado — bolha adiada" };
    }

    const typingRaw = Math.max(0, bolha.typing_seconds ?? 0);
    const delayMsgRaw = Math.max(0, bolha.delay_message_s ?? 0);
    const typingSeconds = typingRaw > 0 ? Math.min(15, Math.max(1, typingRaw)) : 0;
    const delayMessageSeconds = delayMsgRaw > 0 ? Math.min(15, Math.max(1, delayMsgRaw)) : 0;
    // Foto: Z-API troca de rota e o campo da mensagem vira `caption`. Legenda vazia é
    // omitida — a rota aceita imagem sem texto. `delayTyping` não existe em send-image.
    const midiaUrl = (bolha.midia_url ?? "").trim();
    const temMidia = midiaUrl.length > 0;
    const ehVideo = temMidia && bolha.tipo_midia === "video";
    const rotaZapi = ehVideo ? "send-video" : temMidia ? "send-image" : "send-text";

    const body: Record<string, unknown> = ehVideo
      ? { phone, video: midiaUrl }
      : temMidia
        ? { phone, image: midiaUrl }
        : { phone, message: bolha.content };
    if (temMidia && bolha.content.trim().length > 0) body.caption = bolha.content;
    if (!temMidia && typingSeconds > 0) body.delayTyping = typingSeconds;
    if (delayMessageSeconds > 0) body.delayMessage = delayMessageSeconds;

    // Janela em que Z-API vai mostrar "digitando..." pro lead. A UI da plataforma
    // pisca o mesmo "digitando..." pro humano que acompanha o atendimento, via
    // realtime de public.estado_digitacao.agente_digitando.
    const aguardarMs = (delayMessageSeconds + (temMidia ? 0 : typingSeconds)) * 1000;
    const sinalizarDigitando = aguardarMs > 0;

    if (sinalizarDigitando) {
      await supabase.from("estado_digitacao").upsert(
        {
          conversation_id: bolha.conversation_id,
          agente_digitando: true,
          agente_digitando_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "conversation_id" },
      );
    }

    const desligarDigitando = async () => {
      if (!sinalizarDigitando) return;
      await supabase.from("estado_digitacao")
        .update({ agente_digitando: false, updated_at: new Date().toISOString() })
        .eq("conversation_id", bolha.conversation_id);
    };

    // 2026-09-17: sem timeout, a requisição podia pendurar até o worker morrer;
    // o consumer então reagendava e o lead recebia a mesma bolha 2-3x. Com corte
    // em 20s a falha é explícita e o retry fica sob controle do consumer.
    const res = await fetch(`${zapiBase}/${rotaZapi}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });

    const resText = await res.text();
    if (!res.ok) {
      await desligarDigitando();
      return { ok: false, error: `Z-API status ${res.status} ${resText.slice(0, 120)}` };
    }

    let zapiMsgId: string | null = null;
    try {
      const p = JSON.parse(resText) as { zapiMessageId?: string; messageId?: string };
      zapiMsgId = p.zapiMessageId || p.messageId || null;
    } catch {
      /* corpo não-JSON */
    }

    // Sincronia UI ↔ WhatsApp do lead.
    // Z-API aceita o POST imediatamente, mas só mostra a bolha pro lead depois
    // de (delayMessage + delayTyping) segundos. Se marcasse entregue_at agora,
    // a UI da plataforma adiantaria o tempo real e a bolha apareceria ANTES
    // do lead ver. Esperamos a janela completa e só então marcamos entregue_at —
    // a UI mostra a bolha praticamente no mesmo instante que aparece no WPP do
    // lead, replicando o ritmo humano (digita, envia, digita, envia).
    if (aguardarMs > 0) {
      await new Promise((r) => setTimeout(r, aguardarMs));
    }

    await desligarDigitando();

    if (bolha.assistant_message_id) {
      const updateMsg: Record<string, unknown> = { entregue_at: new Date().toISOString() };
      if (zapiMsgId) updateMsg.zapi_message_id = zapiMsgId;
      await supabase.from("mensagens")
        .update(updateMsg)
        .eq("id", bolha.assistant_message_id);
    }

    await supabase.from("caixa_saida_mensagens")
      .update({ status: 'enviada', dispatched_at: new Date().toISOString() })
      .eq("id", bolha.id);

    return { ok: true };
  } catch (e) {
    // Defesa: se exceção rolar com agente_digitando=true, desliga pra UI não ficar travada.
    try {
      await supabase.from("estado_digitacao")
        .update({ agente_digitando: false, updated_at: new Date().toISOString() })
        .eq("conversation_id", bolha.conversation_id);
    } catch { /* best-effort */ }
    return { ok: false, error: (e as Error).message };
  }
}
