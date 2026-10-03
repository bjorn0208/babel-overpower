// Edge function — espelho do api/cron-tick.ts (Vercel) para rodar no ambiente Supabase.
// Drena fila_zapi_inbound → fila_sintese → fila_caixa_saida.
// Agendada via pg_cron a cada minuto.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { autorizarCron } from "../_shared/auth-cron.ts";
import { carregarFerramentasDoCargo, despacharFerramenta, resolverCargoIdPorAlvo } from "../_shared/tools-internas.ts";
const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: {
    persistSession: false
  }
});
const MODELO_PORTEIRO = "google/gemma-3-27b-it";
const MODELO_SINTESE = "google/gemini-2.5-flash";
// ===== Filas via wrappers public.fila_* =====
async function lerFila(fila, vt = 30, qty = 5) {
  const { data, error } = await supabase.rpc("fila_ler", {
    queue_name: fila,
    vt,
    qty
  });
  if (error) throw new Error(`fila_ler:${fila} ${error.message}`);
  return data || [];
}
async function apagar(fila, msg_id) {
  await supabase.rpc("fila_apagar", {
    queue_name: fila,
    msg_id
  });
}
async function arquivar(fila, msg_id) {
  await supabase.rpc("fila_arquivar", {
    queue_name: fila,
    msg_id
  });
}
async function enviar(fila, msg) {
  const { error } = await supabase.rpc("fila_enviar", {
    queue_name: fila,
    msg,
    delay: 0
  });
  if (error) throw new Error(`fila_enviar:${fila} ${error.message}`);
}
// ===== LLM via OpenRouter (credenciais em provedores_llm) =====
const provCache = new Map();
async function provedor(slug) {
  const c = provCache.get(slug);
  if (c && Date.now() - c.em < 60_000) return c;
  const { data, error } = await supabase.from("provedores_llm").select("base_url, api_key").eq("slug", slug).eq("is_active", true).single();
  if (error || !data?.api_key) throw new Error(`provedor ${slug} ausente`);
  const novo = {
    url: data.base_url,
    key: data.api_key,
    em: Date.now()
  };
  provCache.set(slug, novo);
  return novo;
}
async function chat(opts) {
  const p = await provedor("openrouter");
  const inicio = Date.now();
  const corpo = {
    model: opts.modelo,
    messages: opts.mensagens,
    temperature: opts.temperatura ?? 0.4,
    max_tokens: opts.max_tokens ?? 1024
  };
  if (opts.json_mode) corpo.response_format = {
    type: "json_object"
  };
  if (opts.tools?.length) {
    corpo.tools = opts.tools.map((t)=>({
        type: t.type,
        function: t.function
      }));
    corpo.tool_choice = "auto";
  }
  const r = await fetch(`${p.url}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${p.key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://ragentic.app",
      "X-Title": "Ragentic LLM-OS"
    },
    body: JSON.stringify(corpo)
  });
  const latencia_ms = Date.now() - inicio;
  if (!r.ok) throw new Error(`chat ${opts.modelo} ${r.status} ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const msg = j.choices?.[0]?.message ?? {};
  return {
    texto: msg.content ?? "",
    tool_calls: msg.tool_calls ?? null,
    tokens_entrada: j.usage?.prompt_tokens ?? 0,
    tokens_saida: j.usage?.completion_tokens ?? 0,
    latencia_ms
  };
}
// ===== Z-API por tenant =====
const canalCache = new Map();
async function canalDoTenant(userId) {
  const cc = canalCache.get(userId);
  if (cc && Date.now() - cc.em < 60_000) return cc.c;
  const { data } = await supabase.from("canais").select("zapi_instance_id, zapi_token, zapi_security_token, zapi_api_url").eq("user_id", userId).eq("type", "whatsapp").eq("is_active", true).maybeSingle();
  if (!data?.zapi_instance_id || !data?.zapi_token) throw new Error(`canal Z-API ausente para tenant ${userId}`);
  const c = {
    instance: data.zapi_instance_id,
    token: data.zapi_token,
    client: data.zapi_security_token || "",
    api: data.zapi_api_url || "https://api.z-api.io"
  };
  canalCache.set(userId, {
    c,
    em: Date.now()
  });
  return c;
}
async function enviarTexto(userId, telefone, texto) {
  const c = await canalDoTenant(userId);
  const r = await fetch(`${c.api}/instances/${c.instance}/token/${c.token}/send-text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Token": c.client
    },
    body: JSON.stringify({
      phone: telefone,
      message: texto
    })
  });
  if (!r.ok) throw new Error(`zapi ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return j.messageId || j.id || null;
}
// ===== Passos =====
async function passoPorteiro() {
  const lote = await lerFila("fila_zapi_inbound", 30, 5);
  for (const item of lote){
    const m = item.message;
    try {
      const { data: conv } = await supabase.from("conversas").upsert({
        tenant_id: m.tenant_id,
        phone: m.telefone,
        channel: "whatsapp",
        status: "ativa",
        agent_enabled: true
      }, {
        onConflict: "tenant_id,phone"
      }).select("id").single();
      const conversa_id = conv?.id;
      if (!conversa_id) throw new Error("conversa_id ausente");
      await supabase.from("mensagens").insert({
        conversation_id: conversa_id,
        role: "user",
        content: m.texto,
        zapi_message_id: m.zapi_message_id
      });
      const r = await chat({
        modelo: MODELO_PORTEIRO,
        temperatura: 0.2,
        max_tokens: 256,
        json_mode: true,
        mensagens: [
          {
            role: "system",
            content: 'Você é o Porteiro do LLM-OS. Classifique a mensagem do usuário e retorne JSON com: ' + '{"intencao": string curta, "cargo_alvo": "atendimento"|"vendedor"|"financeiro"|"suporte"|"mentor", "urgencia": "baixa"|"media"|"alta", "resumo": string}'
          },
          {
            role: "user",
            content: m.texto
          }
        ]
      });
      let classificacao = {
        intencao: "indefinida",
        cargo_alvo: "atendimento",
        urgencia: "media",
        resumo: m.texto
      };
      try {
        classificacao = JSON.parse(r.texto);
      } catch  {}
      await supabase.from("traces").insert({
        tenant_id: m.tenant_id,
        conversa_id,
        tipo: "decisao_porteiro",
        modelo_llm: MODELO_PORTEIRO,
        decisao: classificacao,
        latencia_ms: r.latencia_ms,
        tokens_entrada: r.tokens_entrada,
        tokens_saida: r.tokens_saida
      });
      await enviar("fila_sintese", {
        tenant_id: m.tenant_id,
        conversa_id,
        telefone: m.telefone,
        texto: m.texto,
        classificacao
      });
      await apagar("fila_zapi_inbound", item.msg_id);
    } catch (e) {
      console.error("[porteiro]", e.message);
      if (item.read_ct >= 3) await arquivar("fila_zapi_inbound", item.msg_id);
    }
  }
  return lote.length;
}
async function passoSintese() {
  const lote = await lerFila("fila_sintese", 60, 3);
  for (const item of lote){
    const m = item.message;
    try {
      const { data: hist } = await supabase.from("mensagens").select("role, content").eq("conversation_id", m.conversa_id).is("deleted_at", null).order("created_at", {
        ascending: false
      }).limit(10);
      const historico = (hist || []).reverse();
      // ── carrega cargo + ferramentas ──
      const cargoAlvo = m.classificacao?.cargo_alvo || "atendimento";
      const cargoId = await resolverCargoIdPorAlvo(supabase, cargoAlvo);
      const tools = cargoId ? await carregarFerramentasDoCargo(supabase, cargoId) : [];
      const { data: conv } = await supabase.from("conversas").select("lead_id").eq("id", m.conversa_id).maybeSingle();
      const ctxFerr = {
        tenant_id: m.tenant_id,
        conversa_id: m.conversa_id,
        telefone: m.telefone,
        lead_id: conv?.lead_id ?? null,
        cargo_ativo: cargoAlvo
      };
      const sistema = `Você é um agente conversacional. Cargo ativo: ${cargoAlvo}. ` + `Intenção detectada: ${m.classificacao?.intencao || "indefinida"}. ` + `Use as tools quando necessário (ex: transferir_humano, agendar_compromisso). ` + `Responda em português brasileiro, tom natural e objetivo. Máximo 2 parágrafos curtos.`;
      const mensagens = [
        {
          role: "system",
          content: sistema
        },
        ...historico.map((h)=>({
            role: h.role,
            content: h.content || ""
          }))
      ];
      // ── loop de tool-calling (máx 3 iterações) ──
      let resposta_final = "";
      let total_in = 0, total_out = 0, total_lat = 0;
      const tools_usadas = [];
      for(let iter = 0; iter < 3; iter++){
        const r = await chat({
          modelo: MODELO_SINTESE,
          temperatura: 0.6,
          max_tokens: 600,
          mensagens,
          tools: tools.length ? tools : undefined
        });
        total_in += r.tokens_entrada;
        total_out += r.tokens_saida;
        total_lat += r.latencia_ms;
        if (r.tool_calls?.length) {
          mensagens.push({
            role: "assistant",
            content: r.texto || null,
            tool_calls: r.tool_calls
          });
          for (const tc of r.tool_calls){
            const nome = tc.function?.name;
            const ferr = tools.find((t)=>t.function.name === nome);
            let resultado = {
              ok: false,
              mensagem: `tool '${nome}' não disponível`
            };
            if (ferr) {
              let args = {};
              try {
                args = JSON.parse(tc.function.arguments || "{}");
              } catch  {}
              resultado = await despacharFerramenta(supabase, ferr._endpoint, ctxFerr, args);
              tools_usadas.push(nome);
              await supabase.from("traces").insert({
                tenant_id: m.tenant_id,
                conversa_id: m.conversa_id,
                tipo: "tool_call",
                modelo_llm: MODELO_SINTESE,
                decisao: {
                  ferramenta: nome,
                  args,
                  resultado
                }
              });
            }
            mensagens.push({
              role: "tool",
              tool_call_id: tc.id,
              name: nome,
              content: JSON.stringify(resultado)
            });
          }
          continue; // pede ao LLM a resposta final após o tool result
        }
        resposta_final = r.texto || "";
        break;
      }
      if (!resposta_final) resposta_final = "(sem resposta)";
      await supabase.from("mensagens").insert({
        conversation_id: m.conversa_id,
        role: "assistant",
        content: resposta_final
      });
      await supabase.from("traces").insert({
        tenant_id: m.tenant_id,
        conversa_id: m.conversa_id,
        tipo: "sintese",
        modelo_llm: MODELO_SINTESE,
        decisao: {
          resposta_preview: resposta_final.slice(0, 200),
          tools_usadas,
          cargo: cargoAlvo
        },
        latencia_ms: total_lat,
        tokens_entrada: total_in,
        tokens_saida: total_out
      });
      await enviar("fila_caixa_saida", {
        tenant_id: m.tenant_id,
        conversa_id: m.conversa_id,
        telefone: m.telefone,
        texto: resposta_final
      });
      await apagar("fila_sintese", item.msg_id);
    } catch (e) {
      console.error("[sintese]", e.message);
      if (item.read_ct >= 3) await arquivar("fila_sintese", item.msg_id);
    }
  }
  return lote.length;
}
async function passoEnvio() {
  const lote = await lerFila("fila_caixa_saida", 30, 5);
  for (const item of lote){
    const m = item.message;
    try {
      const messageId = await enviarTexto(m.tenant_id, m.telefone, m.texto);
      await supabase.from("mensagens").update({
        zapi_message_id: messageId,
        entregue_at: new Date().toISOString()
      }).eq("conversation_id", m.conversa_id).eq("role", "assistant").is("zapi_message_id", null).order("created_at", {
        ascending: false
      }).limit(1);
      await apagar("fila_caixa_saida", item.msg_id);
    } catch (e) {
      console.error("[envio]", e.message);
      if (item.read_ct >= 5) await arquivar("fila_caixa_saida", item.msg_id);
    }
  }
  return lote.length;
}
Deno.serve(async (req: Request)=>{
  // Auth (2026-09-17): a função era aberta (`Deno.serve(async ()=>{})`), com
  // service_role e chamada ao LLM — qualquer um drenava a fila e queimava
  // crédito. O job do pg_cron passou a mandar o service_role no Authorization.
  const { ok: cronOk } = await autorizarCron(req);
  if (!cronOk) {
    return new Response(JSON.stringify({ ok: false, erro: "nao_autorizado" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }
  const inicio = Date.now();
  try {
    const [p, s, e] = await Promise.all([
      passoPorteiro(),
      passoSintese(),
      passoEnvio()
    ]);
    return new Response(JSON.stringify({
      ok: true,
      processado: {
        porteiro: p,
        sintese: s,
        envio: e
      },
      duracao_ms: Date.now() - inicio
    }), {
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      erro: e.message,
      duracao_ms: Date.now() - inicio
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
});
