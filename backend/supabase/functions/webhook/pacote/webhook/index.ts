import { createClient } from "jsr:@supabase/supabase-js@2";
import type { ZApiPayload, ChannelRow } from "./helpers.ts";
import { sendZApi, sendZApiMedia, sendTypingStatus, extractMessage, fetchProfilePicture, fetchChannelPhoto, isExpirableCdnUrl, persistPhoto, rehospedarMidia, ensureReceivedByMe, resolveLidToPhone, mapearLidViaCache } from "./helpers.ts";
import { classificarPresence } from "../_shared/presence.ts";
import { variantesTelefone } from "../_shared/telefone.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Reconexão/re-scan do QR na Z-API reentrega histórico de mensagens (fromMe E
// recebidas) como se fossem eventos ao vivo — na prática sempre com dias/semanas
// de diferença do momento real de envio. `momment` (nome oficial do campo na Z-API)
// é o epoch ms do envio real; usamos como filtro de replay antigo. 3min de folga
// cobre latência normal de fila da Z-API sem deixar passar backlog.
const LIMIAR_REPLAY_ANTIGO_MS = 180_000;
function ehReplayAntigo(payload: ZApiPayload): boolean {
  return typeof payload.momment === "number" && (Date.now() - payload.momment) > LIMIAR_REPLAY_ANTIGO_MS;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // dbg(): emite log estruturado para Supabase Edge Logs (capturados por `supabase functions logs webhook`).
  // Antes escrevia em public.webhook_debug (22k inserts/dia, 0 leituras em runtime). Tabela será derrubada após deploy estável.
  // Mantido `async` para preservar os call sites `await dbg(...)` sem tocar no restante do arquivo.
  // eslint-disable-next-line @typescript-eslint/require-await
  async function dbg(step: string, data: Record<string, unknown>) {
    try {
      console.log(JSON.stringify({ step, ts: new Date().toISOString(), ...data }));
    } catch (_) { /* nunca bloquear por debug */ }
  }

  try {
    const payload: ZApiPayload = await req.json();

    await dbg("received", {
      instanceId: payload.instanceId, phone: payload.phone, fromMe: payload.fromMe,
      isGroup: payload.isGroup, type: payload.type, hasBody: !!payload.body,
      hasText: !!payload.text?.message, hasImage: !!payload.image?.imageUrl,
      hasAudio: !!payload.audio?.audioUrl, hasSenderPhoto: !!payload.senderPhoto,
    });

    // 2026-09-17: o LOG TEMPORÁRIO de presence (posto em 2026-05-08 "pra remover
    // em 1 dia") saiu daqui. Ele gravava `JSON.stringify(payload).slice(0,500)`
    // — conteúdo de mensagem de lead — nos Edge Logs, todo evento de status.

    // --- fromMe: intervenção humana do dono via WhatsApp ---
    if (payload.fromMe) {
      if (ehReplayAntigo(payload)) {
        await dbg("fromMe_replay_antigo_skip", { phone: payload.phone, momment: payload.momment, atrasoMs: Date.now() - (payload.momment as number) });
        return new Response("ok");
      }
      let fmPhone = payload.phone || payload.chatId?.replace("@c.us", "") || "";
      const fmInstanceId = payload.instanceId || "";
      const { text: fmText, mediaUrl: fmMediaUrl, mediaType: fmMediaType } = extractMessage(payload);
      if (!fmPhone || (!fmText && !fmMediaUrl)) return new Response("ok");
      const { data: fmCh } = await supabase.from("canais")
        .select("id, user_id, zapi_instance_id, zapi_token, zapi_security_token, zapi_api_url, url_foto_perfil, updated_at")
        .eq("zapi_instance_id", fmInstanceId).eq("is_active", true).maybeSingle();
      if (!fmCh) return new Response("ok");

      // Resolver Linked Identity (NNN@lid) → phone real via /chats da Z-API
      if (fmPhone.includes("@lid")) {
        const real = await resolveLidToPhone(supabase, fmCh as ChannelRow, fmPhone);
        if (!real) {
          await dbg("fromMe_lid_unresolved", { lid: fmPhone });
          return new Response("ok");
        }
        await dbg("fromMe_lid_resolved", { lid: fmPhone, phone: real });
        fmPhone = real;
      }

      // Dedup para fromMe (hash com prefixo para nao colidir com incoming)
      const fmHashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`fromMe:${fmPhone}:${fmText || fmMediaUrl || ""}`));
      const fmHash = Array.from(new Uint8Array(fmHashBuf)).map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 32);
      const { data: fmIsDup } = await supabase.rpc("verificar_dedup_webhook", {
        p_zapi_message_id: payload.messageId || null,
        p_hash: fmHash,
        p_window_seconds: 15,
      });
      if (fmIsDup === true) return new Response("ok");

      // Buscar conversa (incluindo closed para reabrir)
      // Δ 2026-09-12 (Otmar): o eco do Z-API vem com o JID sem o 9º dígito enquanto o app
      // grava com o 9 — busca pelas duas formas pra não criar conversa duplicada.
      let fmConv = await supabase.from("conversas")
        .select("id, status").in("phone", variantesTelefone(fmPhone)).eq("tenant_id", fmCh.user_id)
        .in("status", ["ativa", "humano", "encerrada"])
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle().then((r) => r.data);

      // Se nao existe, criar conversa
      if (!fmConv) {
        const { data: agentRow } = await supabase.from("agentes_usuario")
          .select("id").eq("user_id", fmCh.user_id).limit(1).maybeSingle();
        if (!agentRow) return new Response("ok");
        const { data: newConvData } = await supabase.rpc("buscar_ou_criar_conversa", {
          p_phone: fmPhone, p_tenant_id: fmCh.user_id,
          p_agent_id: agentRow.id, p_channel: "whatsapp", p_first_fase: "saudacao",
        });
        if (!newConvData?.conversation?.id) return new Response("ok");
        // Δ 2026-09-11 (Fabrício/Lucy): conversa que NASCE do dono mandando a 1ª mensagem pelo
        // celular ficava 'humano' + agente desligado pra sempre — quando o lead respondia, o
        // motor pulava (human_mode_skip) e a Lucy "não fazia atendimento". Eram 31 conversas
        // presas assim. Mesmo espírito da decisão do Theus de 07/09 (dono digitando não cala o
        // agente): a conversa nasce ATIVA, com a agente ligada; o dono pausa pela tela se quiser.
        await supabase.from("conversas").update({ status: 'ativa', agent_enabled: true }).eq("id", newConvData.conversation.id);
        fmConv = { id: newConvData.conversation.id, status: 'ativa' };
        await dbg("fromMe_created_conv", { phone: fmPhone, convId: fmConv.id });
      }

      // --- Anti-eco: ignorar fromMe que é reflexo de mensagem da plataforma ---
      // Caso 1: agente envia via sendZApi → Z-API devolve fromMe com mesmo texto (role=assistant).
      // Caso 2: dono escreve pela web → send-message UPDATEa zapi_message_id na row já criada
      //         (role=human, content sem prefixo); fromMe chega com content COM prefixo de assinatura.
      // Cobertura: comparar pelo zapi_message_id (cinto) E pelo content+role=assistant (suspensório).
      if (fmConv) {
        if (payload.messageId) {
          const { data: echoById } = await supabase.from("mensagens")
            .select("id").eq("conversation_id", fmConv.id).eq("zapi_message_id", payload.messageId)
            .limit(1).maybeSingle();
          if (echoById) {
            await dbg("fromMe_echo_skip_by_zapi_id", { phone: fmPhone, convId: fmConv.id, zapiId: payload.messageId });
            return new Response("ok");
          }
        }
        if (fmText) {
          const { data: echoMatch } = await supabase.from("mensagens")
            .select("id").eq("conversation_id", fmConv.id).eq("role", "assistant")
            .eq("content", fmText)
            .gte("created_at", new Date(Date.now() - 600_000).toISOString())
            .limit(1).maybeSingle();
          if (echoMatch) {
            await dbg("fromMe_echo_skip", { phone: fmPhone, convId: fmConv.id, text: fmText.slice(0, 80) });
            return new Response("ok");
          }
        }
      }

      // Payload com source marker
      const { data: fmProfile } = await supabase.from("profiles")
        .select("full_name, cargo, avatar_url").eq("id", fmCh.user_id).single();
      const fmPayload: Record<string, unknown> = {
        sender: { name: fmProfile?.full_name || "", cargo: fmProfile?.cargo || null, avatar_url: fmProfile?.avatar_url || null },
        source: "whatsapp_app",
      };
      if (fmMediaUrl) {
        const fmPerm = await rehospedarMidia(supabase, fmMediaUrl, fmMediaType, fmCh.user_id, fmConv.id);
        fmPayload.media_url = fmPerm ?? fmMediaUrl;
        fmPayload.media_type = fmMediaType;
      }

      // BUG-02: reconcilia blocos_acionados do eco com a carga da bolha despachada
      // (motor grava blocos_acionados em caixa_saida_mensagens.carga ao enfileirar).
      // Match por (conversation_id + content + status='enviada') nos últimos 10min.
      // Best-effort: se não casar (texto editado, eco de mensagem manual), grava NULL.
      let fmBlocosAcionados: string[] | null = null;
      // Onda 0 — discriminador de autor: fromMe de TEXTO sem bolha correspondente na
      // caixa de saída = humano digitando no celular da empresa, não eco do agente.
      // Mídia sem texto não tem chave de match segura → mantém 'whatsapp_app'.
      let fmEcoDeAgente = !fmText;
      if (fmText) {
        const { data: outboxMatch } = await supabase.from("caixa_saida_mensagens")
          .select("id, carga")
          .eq("conversation_id", fmConv.id)
          .eq("content", fmText)
          .eq("status", "enviada")
          .gte("dispatched_at", new Date(Date.now() - 600_000).toISOString())
          .order("dispatched_at", { ascending: false })
          .limit(1).maybeSingle();
        fmEcoDeAgente = Boolean(outboxMatch?.id);
        const cargaOutbox = outboxMatch?.carga as { blocos_acionados?: unknown } | null | undefined;
        if (Array.isArray(cargaOutbox?.blocos_acionados)) {
          fmBlocosAcionados = (cargaOutbox.blocos_acionados as unknown[])
            .filter((x): x is string => typeof x === "string");
        }
      }
      fmPayload.autor = fmEcoDeAgente ? "agente" : "humano";
      if (!fmEcoDeAgente) fmPayload.source = "whatsapp_humano";

      await supabase.from("mensagens").insert({
        conversation_id: fmConv.id, role: "human", content: fmText || "[MEDIA_ENVIADA]",
        sender_id: fmCh.user_id, carga: fmPayload,
        blocos_acionados: fmBlocosAcionados && fmBlocosAcionados.length > 0 ? fmBlocosAcionados : null,
      });

      // Reabrir conversa fechada
      //
      // Recuo automático do dono: tentado em 2026-09-07 20:29 e REMOVIDO no mesmo dia às
      // 20:36, a pedido do Theus. A ideia era `!fmEcoDeAgente` também ligar o modo humano —
      // dono digitando na mão em conversa ativa calaria o agente. Não repetir sem ele pedir.
      // O dono segue assumindo a conversa pela tela de Conversas, e o single-flight do motor
      // continua matando o turno quando ele responde PELA PLATAFORMA.
      // Idem pra conversa encerrada que o dono reabre do celular: volta ATIVA com a agente
      // (antes voltava 'humano' e o lead ficava sem resposta).
      if (fmConv.status === 'encerrada') {
        await supabase.from("conversas").update({ status: 'ativa', agent_enabled: true }).eq("id", fmConv.id);
      }

      await dbg("fromMe_inserted", { phone: fmPhone, convId: fmConv.id });
      return new Response("ok");
    }
    if (payload.isGroup) return new Response("ok");
    // --- Presença do chat (digitação) — tratado ANTES do filtro @lid ---
    // Z-API multi-device manda presence com phone NNNN@lid (doc oficial:
    // "phone is no longer a guarantee of a phone number"). Resolvemos o @lid
    // via resolveLidToPhone (mesmo helper do fromMe). O filtro @lid abaixo é
    // só pra MENSAGENS — presence não pode ser descartado lá.
    const tipoPresenca = classificarPresence(payload);
    if (tipoPresenca !== null) {
      const presenceRaw = payload.phone || payload.chatId || "";
      if (!presenceRaw) return new Response("ok");
      const { data: presCh } = await supabase.from("canais")
        .select("id, user_id, zapi_instance_id, zapi_token, zapi_security_token, zapi_api_url, url_foto_perfil")
        .eq("zapi_instance_id", payload.instanceId || "").eq("is_active", true).maybeSingle();
      let presPhone = presenceRaw.replace("@c.us", "");
      if (presPhone.includes("@lid")) {
        if (!presCh) return new Response("ok");
        const resolvido = await resolveLidToPhone(supabase, presCh as ChannelRow, presPhone);
        if (!resolvido) { await dbg("presence_lid_unresolved", { lid: presPhone }); return new Response("ok"); }
        presPhone = resolvido;
      } else if (presCh && !/^\d{10,13}$/.test(presPhone)) {
        // COMPOSING/UNAVAILABLE chegam com o LID CRU (sem @lid), ex "103032675111080".
        // Resolve pelo mapa populado pelas mensagens. Cache miss = mantém como veio
        // (provável número real, ex AVAILABLE) — nunca piora o comportamento atual.
        const viaMapa = await mapearLidViaCache(supabase, presCh as ChannelRow, presPhone);
        if (viaMapa) presPhone = viaMapa;
        else await dbg("presence_lid_cru_sem_mapa", { lid: presPhone });
      }
      if (tipoPresenca === "entrou_chat") return new Response("ok");
      if (tipoPresenca === "produzindo") {
        const { data: conv } = await supabase.from("conversas")
          .select("id").in("phone", variantesTelefone(presPhone)).in("status", ["ativa", "humano"]).limit(1).maybeSingle();
        if (conv) {
          await supabase.from("estado_digitacao").upsert(
            { conversation_id: conv.id, is_typing: true, last_typing_at: new Date().toISOString(), updated_at: new Date().toISOString() },
            { onConflict: "conversation_id" },
          );
        }
        if (presCh) {
          const { data: ba } = await supabase.from("agentes_usuario").select("id").eq("user_id", presCh.user_id).limit(1).maybeSingle();
          if (ba) await supabase.rpc("definir_buffer_compondo", { p_phone: presPhone, p_agent_id: ba.id, p_composing: true });
        }
        return new Response("ok");
      }
      // tipoPresenca === "parou"
      const { data: conv } = await supabase.from("conversas")
        .select("id, tenant_id").in("phone", variantesTelefone(presPhone)).in("status", ["ativa", "humano"]).limit(1).maybeSingle();
      if (conv) {
        await supabase.from("estado_digitacao").upsert(
          { conversation_id: conv.id, is_typing: false, updated_at: new Date().toISOString() },
          { onConflict: "conversation_id" },
        );
        const { data: bufAg } = await supabase.from("agentes_usuario").select("id, configuracao").eq("user_id", conv.tenant_id).limit(1).maybeSingle();
        if (bufAg) await supabase.rpc("definir_buffer_compondo", { p_phone: presPhone, p_agent_id: bufAg.id, p_composing: false });
        // (removido 2026-05-18 · md 1345) Bloco "retomar entregas_pendentes":
        // a tabela entregas_pendentes NÃO existe no banco — este código falhava
        // em silêncio (pending sempre vinha de erro engolido). O buffer de
        // debounce + barge-in já cobrem "responder só no silêncio do lead".
      }
      return new Response("ok");
    }

    // Filtrar newsletters e broadcasts do WhatsApp (só MENSAGENS — presence já tratado acima)
    const rawPhone = payload.phone || payload.chatId || "";
    if (rawPhone.includes("@newsletter") || rawPhone.includes("@broadcast")) return new Response("ok");

    let phone = payload.phone || payload.chatId?.replace("@c.us", "") || "";

    // Δ 2026-09-17: @lid era descartado junto com newsletter/broadcast — a
    // mensagem do lead sumia sem nem virar log. O WhatsApp multi-device entrega
    // cada vez mais o remetente como LID ("phone is no longer a guarantee of a
    // phone number", doc Z-API), então aqui resolvemos igual o fromMe e o
    // presence já fazem. Só descarta se o LID não resolver mesmo.
    if (phone.includes("@lid")) {
      const { data: lidCh } = await supabase.from("canais")
        .select("id, user_id, zapi_instance_id, zapi_token, zapi_security_token, zapi_api_url, url_foto_perfil, updated_at")
        .eq("zapi_instance_id", payload.instanceId || "").eq("is_active", true).maybeSingle();
      if (!lidCh) {
        await dbg("recebida_lid_sem_canal", { lid: phone, instanceId: payload.instanceId });
        return new Response("ok");
      }
      const lidResolvido = await resolveLidToPhone(supabase, lidCh as ChannelRow, phone);
      if (!lidResolvido) {
        await dbg("recebida_lid_unresolved", { lid: phone });
        return new Response("ok");
      }
      await dbg("recebida_lid_resolved", { lid: phone, phone: lidResolvido });
      phone = lidResolvido;
    }

    const { text, mediaUrl, mediaType, extra } = extractMessage(payload);
    // URL final da mídia — re-hospedada no Storage da conta quando possível
    // (URL Z-API expira em ~30d). Fallback = URL crua. Preenchida após
    // resolver a conversa (precisa do conversation_id no path).
    let mediaUrlFinal: string | null = mediaUrl;

    if (!phone || (!text && !mediaUrl && !extra)) {
      await dbg("skip_empty", { phone, text, mediaUrl });
      return new Response("ok");
    }

    if (ehReplayAntigo(payload)) {
      await dbg("recebida_replay_antigo_skip", { phone, momment: payload.momment, atrasoMs: Date.now() - (payload.momment as number) });
      return new Response("ok");
    }

    // --- Dedup: RPC atomica com advisory lock (race-condition-free) ---
    const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${phone}:${text || mediaUrl || ""}`));
    const messageHash = Array.from(new Uint8Array(hashBuf)).map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 32);

    const { data: isDup } = await supabase.rpc("verificar_dedup_webhook", {
      p_zapi_message_id: payload.messageId || null,
      p_hash: messageHash,
      p_window_seconds: 15,
    });
    if (isDup === true) {
      await dbg("dedup_skip", { phone, hash: messageHash });
      return new Response("ok");
    }

    // Buscar canal pela instance_id
    const instanceId = payload.instanceId || "";
    const { data: channel, error: chErr } = await supabase
      .from("canais")
      .select("id, user_id, zapi_instance_id, zapi_token, zapi_security_token, zapi_api_url, url_foto_perfil, updated_at")
      .eq("zapi_instance_id", instanceId)
      .eq("is_active", true)
      .maybeSingle();

    if (chErr || !channel) {
      await dbg("no_channel", { instanceId, error: chErr?.message });
      return new Response("channel not found", { status: 404 });
    }

    // ── Assistente financeiro: mensagem vinda do NÚMERO DO DONO cadastrado ──
    // `financeiro_config_tenant` ativo + numero_dono == phone → NÃO é lead: roteia
    // pro canal interno (cargo Financeiro) e responde direto via Z-API send-text.
    // Fail-safe duplo: (1) sem config ativa → zero mudança no fluxo normal;
    // (2) detectado o dono, NUNCA cai pro fluxo de lead (mesmo em erro — responde
    // fallback), senão o dono viraria lead/conversa fantasma.
    let ehDonoFinanceiro = false;
    let autorFinanceiro: string | null = null;
    try {
      const { data: finCfg } = await supabase
        .from("financeiro_config_tenant")
        .select("ativo")
        .eq("tenant_id", channel.user_id)
        .eq("ativo", true)
        .maybeSingle();
      if (finCfg?.ativo) {
        const { data: numAut } = await supabase
          .from("financeiro_numeros_autorizados")
          .select("rotulo")
          .eq("tenant_id", channel.user_id)
          .eq("ativo", true)
          .eq("numero", phone.replace(/\D/g, ""))
          .maybeSingle();
        if (numAut) {
          ehDonoFinanceiro = true;
          autorFinanceiro = (numAut.rotulo as string | null) || null;
        }
      }
    } catch (eCfg) {
      await dbg("financeiro_cfg_erro", { error: (eCfg as Error).message });
    }
    if (ehDonoFinanceiro) {
      await dbg("financeiro_dono_detectado", { phone, tenant: channel.user_id });
      let respostaFin = "Tive uma falha técnica aqui. Me manda de novo em instantes?";
      try {
        const { processarMensagemFinanceiro } = await import("../_shared/canal-financeiro.ts");
        const r = await processarMensagemFinanceiro({
          supabase,
          tenantId: channel.user_id,
          texto: text || "",
          mediaUrl: mediaUrl || null,
          mediaType: mediaType || null,
          autor: autorFinanceiro,
          numero: phone.replace(/\D/g, ""),
        });
        respostaFin = r.resposta;
      } catch (eFin) {
        await dbg("financeiro_processar_erro", { error: (eFin as Error).message });
      }
      try {
        const zapiBase = `${channel.zapi_api_url || "https://api.z-api.io"}/instances/${channel.zapi_instance_id}/token/${channel.zapi_token}`;
        const envio = await fetch(`${zapiBase}/send-text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Client-Token": channel.zapi_security_token || "" },
          body: JSON.stringify({ phone, message: respostaFin }),
        });
        await dbg("financeiro_respondido", { envioStatus: envio.status });
      } catch (eEnvio) {
        await dbg("financeiro_envio_erro", { error: (eEnvio as Error).message });
      }
      return new Response(JSON.stringify({ ok: true, financeiro: true }), { headers: { "Content-Type": "application/json" } });
    }

    // Mapa LID↔número: toda mensagem do lead traz phone (número) + chatLid (LID).
    // Popula cache_kv pra o caminho de presence resolver o COMPOSING, que chega
    // só com o LID cru (sem número). Fire-and-forget, idempotente.
    {
      const chatLidRaw = (payload as { chatLid?: string }).chatLid;
      if (chatLidRaw && chatLidRaw.includes("@lid") && phone) {
        const lidKey = `lid_map_${channel.zapi_instance_id}_${chatLidRaw.split("@")[0]}`;
        supabase.from("cache_kv").upsert(
          { key: lidKey, value: { phone }, updated_at: new Date().toISOString() },
          { onConflict: "key" },
        ).then(() => {}, () => {});
      }
    }

    // Garantir que Z-API envie webhooks de mensagens enviadas pelo dono (receivedByMe)
    ensureReceivedByMe(supabase, channel as ChannelRow).catch(() => {});

    const { data: agent } = await supabase
      .from("agentes_usuario")
      .select("id, configuracao, is_active")
      .eq("user_id", channel.user_id)
      .limit(1)
      .maybeSingle();

    if (!agent?.id) {
      await dbg("no_agent", { userId: channel.user_id });
      return new Response("agent not found", { status: 404 });
    }

    // Modo restrito a disparo: agente configurado pra só RESPONDER quem tá
    // na lista de disparo de rifa (rifa_lista_disparo) do tenant. Opt-in via
    // agentes_usuario.configuracao.apenas_leads_disparados (Theus 2026-09-02
    // — número de teste do Fabricio, pra não sujar com leads que ele não
    // disparou). Fail-open em erro de leitura (não bloqueia o fluxo normal).
    //
    // Δ 2026-09-17: o filtro retornava AQUI, antes do INSERT em `mensagens` —
    // a mensagem do lead era descartada e nunca espelhava na Babel. O dono via
    // no celular, respondia por lá, e o caminho fromMe gravava só a resposta
    // dele: 200 das 290 conversas do Fabricio ficaram com um lado só. Agora o
    // filtro só marca; a decisão de não chamar o motor acontece depois do
    // INSERT, igual ao human_mode_skip (espelha sempre, IA é que fica quieta).
    const configAgente = agent.configuracao as Record<string, unknown> | null;
    let foraDaListaDisparo = false;
    if (configAgente?.apenas_leads_disparados === true) {
      try {
        const sufixoAlvo = phone.replace(/\D/g, "").slice(-10);
        const { data: listaDisparo } = await supabase
          .from("rifa_lista_disparo")
          .select("phone")
          .eq("tenant_id", channel.user_id)
          .limit(5000);
        const estaNaLista = (listaDisparo || []).some(
          (l) => (l.phone || "").replace(/\D/g, "").slice(-10) === sufixoAlvo,
        );
        foraDaListaDisparo = !estaNaLista;
      } catch (eFiltro) {
        await dbg("filtro_disparo_erro", { error: (eFiltro as Error).message });
      }
    }

    // 2026-05-08 v62 · INSERT IMEDIATO de cada msg recebida ANTES do buffer.
    // Cada chamada do webhook (1a, 2a, 3a de uma rajada) gera 1 bolha individual
    // em `mensagens`. UI mostra na hora (~200ms) via realtime. Buffer continua
    // agrupando o texto pra IA processar combinado, e chat recebe
    // inbound_persistida=true pra RPC pular o INSERT da user e nao duplicar.
    let convIdEntrada: string | null = null;
    let inboundPersistidaFlag = false;
    try {
      const { data: convExist } = await supabase.from("conversas")
        .select("id, lead_id").in("phone", variantesTelefone(phone)).eq("tenant_id", channel.user_id)
        .in("status", ["ativa", "humano"])
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      let leadIdEntrada: string | null = null;
      if (convExist?.id) {
        convIdEntrada = convExist.id;
        leadIdEntrada = convExist.lead_id ?? null;
      } else {
        const { data: convCriada } = await supabase.rpc("buscar_ou_criar_conversa", {
          p_phone: phone, p_tenant_id: channel.user_id,
          p_agent_id: agent.id, p_channel: "whatsapp", p_first_fase: "saudacao",
        });
        convIdEntrada = convCriada?.conversation?.id ?? null;
        leadIdEntrada = convCriada?.conversation?.lead_id ?? null;
      }
      // Volta da Base (Theus 2026-07-05): contato arquivado mandou mensagem →
      // reaparece no app Conversas (location='atendimento'). A pasta
      // (pasta_base_id) fica intacta — o chip do Conversas nasce dela.
      // No-op (0 linhas) pra quem não está na Base.
      if (leadIdEntrada) {
        await supabase.from("leads")
          .update({ location: "atendimento" })
          .eq("id", leadIdEntrada)
          .eq("location", "base");
      }
      if (convIdEntrada) {
        if (mediaUrl) {
          mediaUrlFinal = (await rehospedarMidia(supabase, mediaUrl, mediaType, channel.user_id, convIdEntrada)) ?? mediaUrl;
        }
        const cargaUser = (mediaUrlFinal || extra)
          ? {
              ...(mediaUrlFinal ? { media_url: mediaUrlFinal, media_type: mediaType } : {}),
              ...(extra ?? {}),
            }
          : null;
        const { error: insErr } = await supabase.from("mensagens").insert({
          conversation_id: convIdEntrada,
          role: "user",
          content: text || "[MEDIA_RECEBIDA]",
          carga: cargaUser,
        });
        if (insErr) {
          await dbg("inbound_insert_falhou", { phone, convId: convIdEntrada, error: insErr.message });
        } else {
          inboundPersistidaFlag = true;
          await dbg("inbound_persistida_imediata", { phone, convId: convIdEntrada });
          // Barge-in: lead mandou msg nova — cancela bolhas pendentes da
          // resposta anterior pra não sobrepor (empilhamento de 6-8 bolhas).
          // O motor reprocessa o buffer (com esta msg junto) e responde
          // fresco quando o lead silenciar. Reusa substituir_caixa_saida_pendentes.
          await supabase.rpc("substituir_caixa_saida_pendentes", { p_conversation_id: convIdEntrada });
          // Lead ENVIOU a mensagem → parou de digitar aquilo. Zera is_typing aqui
          // (sinal confiável: a msg sempre traz o número real e convIdEntrada já
          // está resolvido), em vez de depender só do presence PAUSED/UNAVAILABLE
          // do Z-API — que nem sempre chega e pode vir com LID que não casa, o que
          // deixava is_typing PRESO em true e travava o despacho (agente mudo).
          // Se o lead seguir digitando, o próximo COMPOSING religa.
          await supabase.from("estado_digitacao")
            .update({ is_typing: false, updated_at: new Date().toISOString() })
            .eq("conversation_id", convIdEntrada);
        }
      }
    } catch (e) {
      await dbg("inbound_insert_excecao", { phone, error: (e as Error).message });
    }

    // Triagem de quem está fora da lista (Fabricio 2026-09-22): em vez de silêncio,
    // manda UMA vez o texto de `configuracao.triagem_fora_lista.texto` ("rifa ou
    // falar com o Fabrício?"). Quem responde "rifa" (ou já chega falando de rifa)
    // entra em rifa_lista_disparo com marcado=false — a agente passa a atender, mas
    // o contato não recebe disparo nem bom-dia (esses só pegam marcado=true).
    // Qualquer outra resposta segue em silêncio: é família/pessoal, o dono atende.
    // `desde` (ISO): só conversa criada a partir daí entra na triagem — quem já
    // conversava antes (família, contatos antigos) continua como estava.
    const triagem = configAgente?.triagem_fora_lista as { ativo?: boolean; texto?: string; desde?: string } | undefined;
    if (foraDaListaDisparo && triagem?.ativo === true && triagem.texto && convIdEntrada) {
      try {
        if (triagem.desde) {
          const { data: convTri } = await supabase.from("conversas").select("created_at").eq("id", convIdEntrada).maybeSingle();
          if (!convTri?.created_at || new Date(convTri.created_at) < new Date(triagem.desde)) {
            throw new Error("conversa_anterior_ao_corte");
          }
        }
        const falaDeRifa = /\brifa\b/.test((text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase());
        if (falaDeRifa) {
          const { error: listaErr } = await supabase.from("rifa_lista_disparo").upsert(
            { tenant_id: channel.user_id, phone: phone.replace(/\D/g, ""), nome: payload.senderName || null, origem: "triagem", marcado: false },
            { onConflict: "tenant_id,phone", ignoreDuplicates: true },
          );
          if (listaErr) {
            await dbg("triagem_lista_erro", { phone, error: listaErr.message });
          } else {
            foraDaListaDisparo = false;
            await dbg("triagem_entrou_lista", { phone, convId: convIdEntrada });
          }
        } else {
          const { data: jaTriada } = await supabase.from("mensagens").select("id")
            .eq("conversation_id", convIdEntrada).eq("role", "assistant")
            .contains("carga", { origem: "triagem_fora_lista" })
            .limit(1).maybeSingle();
          if (!jaTriada) {
            // Grava ANTES de enviar: o eco fromMe casa por role=assistant+content e é descartado.
            await supabase.from("mensagens").insert({
              conversation_id: convIdEntrada, role: "assistant", content: triagem.texto,
              carga: { origem: "triagem_fora_lista", autor: "agente" },
            });
            await sendZApi(channel as ChannelRow, phone, triagem.texto);
            await dbg("triagem_enviada", { phone, convId: convIdEntrada });
          }
        }
      } catch (eTri) {
        await dbg("triagem_erro", { phone, error: (eTri as Error).message });
      }
    }

    // Modo restrito a disparo (ver bloco acima): mensagem já foi espelhada em
    // `mensagens` — a conversa aparece inteira no app pro operador responder na
    // mão. Daqui pra frente só não acionamos o motor.
    if (foraDaListaDisparo) {
      await dbg("fora_lista_disparo_sem_motor", { phone, tenant: channel.user_id, convId: convIdEntrada });
      return new Response(JSON.stringify({ ok: true, ignorado_fora_disparo: true, espelhado: inboundPersistidaFlag }), { headers: { "Content-Type": "application/json" } });
    }

    // --- Buffer debounce: agrupar msgs rapidas ---
    // 2026-08-19: silêncio exigido sorteado entre 3/5/7/10s por turno (antes 7s fixo)
    // — humaniza o tempo de resposta do agente sem mexer na esteira.
    const BUFFER_THRESHOLD_S = [3, 5, 7, 10][Math.floor(Math.random() * 4)], POLL_MS = 2000, MAX_WAIT_MS = 90000;
    const { data: bufResult } = await supabase.rpc("bufferar_mensagem_entrante", {
      p_phone: phone, p_agent_id: agent.id, p_channel_id: channel.id,
      p_text: text || "[MEDIA_RECEBIDA]", p_media_url: mediaUrlFinal || null, p_media_type: mediaType || null,
    });
    if (!bufResult?.is_first) {
      await dbg("buffered", { phone, agentId: agent.id });
      return new Response(JSON.stringify({ ok: true, buffered: true }), { headers: { "Content-Type": "application/json" } });
    }
    // Poll ate buffer pronto (composing=false + 7s inatividade)
    const waitStart = Date.now();
    while (true) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (Date.now() - waitStart > MAX_WAIT_MS) break;
      const { data: bs } = await supabase.rpc("verificar_buffer_pronto", {
        p_phone: phone, p_agent_id: agent.id, p_threshold_seconds: BUFFER_THRESHOLD_S,
      });
      if (!bs?.exists || bs.ready) break;
    }
    // Single-flight (caso Dantas 2026-06-10): só 1 execução do motor por conversa.
    // ANTES do claim, adquire a trava (TTL 180s). Não conseguiu = execução viva →
    // segue esperando; quando ela terminar (libera no finally) este poll claima o
    // buffer COMPLETO (msgs antigas rebufferadas + novas) e o motor responde tudo
    // junto com 1 recall só. MAX_WAIT estourou = varredor pg_cron resgata (1/min).
    // Kill-switch: USAR_TRAVA_CONVERSA=false volta ao comportamento antigo.
    const usarTrava = (Deno.env.get("USAR_TRAVA_CONVERSA") ?? "true") !== "false" && !!convIdEntrada;
    let travaAdquirida = false;
    if (usarTrava) {
      while (true) {
        const { data: lock } = await supabase.rpc("adquirir_trava_motor", {
          p_conversation_id: convIdEntrada, p_ttl_segundos: 180,
        });
        if (lock === true) { travaAdquirida = true; break; }
        if (Date.now() - waitStart > MAX_WAIT_MS) {
          await dbg("trava_max_wait", { phone, convId: convIdEntrada });
          return new Response(JSON.stringify({ ok: true, aguardando_trava: true }), { headers: { "Content-Type": "application/json" } });
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    }
    const { data: claimed } = await supabase.rpc("reivindicar_buffer_mensagem", { p_phone: phone, p_agent_id: agent.id });
    // Libera a trava single-flight (idempotente). Chamar em TODO caminho que sai
    // depois do claim — claim vazio, modo humano, e após o retorno do motor.
    const soltarTrava = async () => {
      if (!travaAdquirida) return;
      travaAdquirida = false;
      try { await supabase.rpc("liberar_trava_motor", { p_conversation_id: convIdEntrada }); } catch (_e) { /* TTL cobre */ }
    };
    if (!claimed || claimed.count === 0) { await soltarTrava(); return new Response("ok"); }
    const bufMsgs = (claimed.mensagens || []) as { text: string; media_url: string | null; media_type: string | null }[];
    const combinedText = bufMsgs.map((m) => m.text).filter(Boolean).join("\n") || "";
    const firstMedia = bufMsgs.find((m) => m.media_url);
    // Guard: verificar se conversa está em modo humano, agente desligado por
    // conversa, OU IA Geral pausada no tenant (agentes_usuario.is_active=false
    // — toggle "Desativar IA geral" do app Conversas grava aqui). O INSERT da
    // user em mensagens já foi feito antes do buffer (UI mostra na hora pra
    // operador humano ver e responder manualmente); aqui só não chamamos o
    // motor. A pausa global só sai com novo clique do tenant — nem cobrança
    // nem retomada reativam silenciosamente.
    const { data: convCheck } = await supabase.from("conversas")
      .select("id, status, agent_enabled")
      .in("phone", variantesTelefone(phone)).eq("tenant_id", channel.user_id)
      .in("status", ["ativa", "humano"])
      .limit(1).maybeSingle();
    const iaGeralPausada = agent.is_active === false;
    if (iaGeralPausada || (convCheck && (convCheck.status === 'humano' || convCheck.agent_enabled === false))) {
      await dbg("human_mode_skip", { phone, convId: convCheck?.id ?? null, status: convCheck?.status ?? null, agentEnabled: convCheck?.agent_enabled ?? null, iaGeralPausada });
      await soltarTrava();
      return new Response(JSON.stringify({ ok: true, human_mode: true, ia_geral_pausada: iaGeralPausada }), { headers: { "Content-Type": "application/json" } });
    }

    await sendTypingStatus(channel as ChannelRow, phone);

    // Motor único do agente vivo: `ragentic-processar-inline`. O legado `chat` foi
    // aposentado em 2026-05-12; o ramo condicional por env RAGENTIC_OFICIAL era uma
    // bomba — se a env saísse de "true", caía num `chat` inexistente → 404 geral.
    const motorSlug = "ragentic-processar-inline";
    await dbg("calling_motor", { motor: motorSlug, phone, agentId: agent.id, text: combinedText.slice(0, 100), bufCount: claimed.count, inboundPersistida: inboundPersistidaFlag });
    // Chamar edge function do motor escolhido
    const chatRes = await fetch(`${SUPABASE_URL}/functions/v1/${motorSlug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({
        message: combinedText || "[MEDIA_RECEBIDA]",
        agente_id: agent.id,
        phone,
        media_url: firstMedia?.media_url || mediaUrl,
        media_type: firstMedia?.media_type || mediaType,
        channel: "whatsapp",
        source: "webhook",
        // 2026-05-08 · webhook ja inseriu user em `mensagens` (UI mostra na hora).
        // Chat propaga pra RPC pular o INSERT da user e nao duplicar.
        inbound_persistida: inboundPersistidaFlag,
        // Fase B · marca de corte: msg do lead que chegar depois disto torna
        // esta resposta obsoleta (guard anti-duplicata no outbox-consumer).
        corte_em: new Date().toISOString(),
        ...(convIdEntrada ? { conversation_id: convIdEntrada } : {}),
      }),
    });

    const chatData = await chatRes.json();
    // Motor terminou (todos os efeitos dele já aconteceram) → libera a trava.
    // Bolhas ainda pendentes no outbox são protegidas pelo guard gerada_ate.
    await soltarTrava();

    await dbg("chat_response", {
      status: chatRes.status,
      keys: Object.keys(chatData),
      error: chatData.error || null,
      mensagensCount: chatData.mensagens?.length ?? 0,
      reply: chatData.reply?.slice(0, 100) ?? null,
      mediaDescricao: chatData.media_descricao ? chatData.media_descricao.slice(0, 80) : null,
    });

    if (chatData.error) {
      // FASE 1 item #1 · bloqueio silencioso · 402 (plano inativo/expirado/limite) não é erro-500:
      // Z-API recebe 200, agente não envia nada, dono segue vendo a conversa no kanban e pode
      // responder manualmente via modo humano. Outros erros (500 real) mantêm o comportamento antigo.
      if (chatRes.status === 402) {
        await dbg("plano_bloqueado_silencioso", { phone, status: chatRes.status, error: chatData.error });
        return new Response(JSON.stringify({ ok: true, bloqueado: true, motivo: chatData.error }), { headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: chatData.error }), { status: 500 });
    }

    const convId0 = chatData.conversation_id;
    // (removido 2026-05-18 · md 1345) delete em entregas_pendentes — tabela fantasma.

    // FASE 11.5.a — bug C.2: enriquecer msg user com transcricao/descricao de midia.
    // Sem isso, historico futuro perde contexto de audios/imagens (701 casos prod).
    // chat/index.ts ja salvou a msg via save_turn_results — agora updateamos payload.
    if (convId0 && chatData.media_descricao && (firstMedia?.media_url || mediaUrl)) {
      try {
        const { data: ultimaUserMsg } = await supabase.from("mensagens")
          .select("id, carga")
          .eq("conversation_id", convId0).eq("role", "user")
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (ultimaUserMsg?.id) {
          const novoPayload = {
            ...((ultimaUserMsg.carga as Record<string, unknown>) || {}),
            media_descricao: chatData.media_descricao,
          };
          await supabase.from("mensagens").update({ carga: novoPayload }).eq("id", ultimaUserMsg.id);
        }
      } catch (e) {
        await dbg("media_descricao_update_err", { error: (e as Error).message });
      }
    }

    // Texto do assistente: só caixa_saida_mensagens + process-followups (evita duplo envio e rajada send-text)
    const outCount = (chatData.mensagens?.length ?? 0) || (chatData.reply ? 1 : 0);
    await dbg("outbox_only_text", { convId: convId0, bolhas: outCount });

    if (chatData.media_items?.length > 0) {
      for (const item of chatData.media_items) {
        await sendZApiMedia(channel as ChannelRow, phone, item.url, item.tipo || "imagem", item.descricao || undefined);
      }
    } else if (chatData.media_url) {
      await sendZApiMedia(channel as ChannelRow, phone, chatData.media_url, chatData.media_type || "imagem");
    }

    // --- Atualizar fotos de perfil (persistir no Storage) ---
    const convId = chatData.conversation_id;
    const senderPhoto = payload.senderPhoto || payload.photo || null;
    const channelUpdatedAt = channel.updated_at ? new Date(channel.updated_at).getTime() : 0;
    const channelStale = !channelUpdatedAt || (Date.now() - channelUpdatedAt) > 6 * 3600 * 1000;
    const needsChannelRefresh = !channel.url_foto_perfil || channel.url_foto_perfil === "null" || isExpirableCdnUrl(channel.url_foto_perfil) || channelStale;

    const photoTasks: Promise<void>[] = [];

    if (convId) {
      photoTasks.push((async () => {
        try {
          const { data: conv } = await supabase
            .from("conversas").select("lead_id").eq("id", convId).single();
          if (!conv?.lead_id) return;

          const { data: lead } = await supabase
            .from("leads").select("url_foto_perfil, nome_exibicao").eq("id", conv.lead_id).single();

          if (payload.senderName && !lead?.nome_exibicao) {
            await supabase.from("leads").update({ nome_exibicao: payload.senderName }).eq("id", conv.lead_id);
          }

          // Skip if already has a permanent (storage) URL
          if (lead?.url_foto_perfil && !isExpirableCdnUrl(lead.url_foto_perfil)) return;

          let cdnUrl = senderPhoto;
          if (!cdnUrl) cdnUrl = await fetchProfilePicture(channel as ChannelRow, phone);
          if (!cdnUrl || cdnUrl === "null") return;

          const permanentUrl = await persistPhoto(supabase, cdnUrl, `leads/${conv.lead_id}/photo.jpg`);
          // Cache-buster: URL Storage e estavel; sem ?v=ts o browser serve cache antigo
          const baseUrl = permanentUrl || cdnUrl;
          const finalUrl = permanentUrl ? `${baseUrl}?v=${Date.now()}` : baseUrl;
          await dbg("photo_lead", { leadId: conv.lead_id, persisted: !!permanentUrl });

          if (finalUrl !== lead?.url_foto_perfil) {
            await supabase.from("leads").update({ url_foto_perfil: finalUrl }).eq("id", conv.lead_id);
          }
        } catch (e) { await dbg("photo_lead_error", { error: (e as Error).message }); }
      })());
    }

    if (needsChannelRefresh) {
      photoTasks.push((async () => {
        try {
          const cdnUrl = await fetchChannelPhoto(channel as ChannelRow);
          if (!cdnUrl || cdnUrl === "null") {
            // Mesmo sem nova foto, registra now() em updated_at pra destravar TTL ate o proximo refresh
            await supabase.from("canais").update({ updated_at: new Date().toISOString() }).eq("id", channel.id);
            return;
          }

          const permanentUrl = await persistPhoto(supabase, cdnUrl, `channels/${channel.id}/photo.jpg`);
          // Cache-buster: URL Storage e estavel; sem ?v=ts o browser serve cache antigo apos overwrite
          const baseUrl = permanentUrl || cdnUrl;
          const finalUrl = permanentUrl ? `${baseUrl}?v=${Date.now()}` : baseUrl;
          await dbg("photo_channel", { channelId: channel.id, persisted: !!permanentUrl });

          if (finalUrl) {
            await supabase.from("canais")
              .update({ url_foto_perfil: finalUrl, updated_at: new Date().toISOString() })
              .eq("id", channel.id);
          }
        } catch (e) { await dbg("photo_channel_error", { error: (e as Error).message }); }
      })());
    }

    await Promise.allSettled(photoTasks);
    await dbg("done", { phone, mensagens: outCount, photosAttempted: photoTasks.length });

    return new Response(JSON.stringify({ ok: true, mensagens: outCount }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    await dbg("error", { message: (e as Error).message, stack: (e as Error).stack?.slice(0, 300) });
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }
});
