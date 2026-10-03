/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// chat-treino-analisar · botão "Analisar" do Chat Treino (2026-09-18).
//
// Lê a conversa de treino (channel='teste'), aplica as correções do lápis, pede ao Mentor de
// Humanização a nota (antes/depois das correções) + diretrizes, e grava a CONVERSA PADRÃO do
// produto em foco: linha em `conversas_padrao` (1 ativa por agente+produto — a anterior é
// desligada) + bloco especial em `blocos_conhecimento` (category='conversa_padrao'). O motor
// injeta a conversa padrão do produto em foco (ver ragentic-processar-inline).
//
// Auth: JWT do dono do tenant ou de alguém da equipe dele. Body: { conversa_id }.

import { corsOk, jsonRes } from "../_shared/cors.ts";
import { criarClienteAdmin } from "../_shared/supabase.ts";
import { getConfigChamada } from "../_shared/config-chamadas.ts";
import {
  type MensagemTreino,
  montarConteudoBloco,
  montarPromptAnalise,
  normalizarAnalise,
} from "../_shared/mentor-humanizacao.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsOk();
  try {
    const sb = criarClienteAdmin();
    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!bearer) return jsonRes({ error: "nao_autorizado" }, 401);
    const { data: auth } = await sb.auth.getUser(bearer);
    const uid = auth?.user?.id;
    if (!uid) return jsonRes({ error: "nao_autorizado" }, 401);

    const body = await req.json().catch(() => ({}));
    const conversaId = String(body?.conversa_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(conversaId)) return jsonRes({ error: "conversa_id obrigatório" }, 400);

    const { data: perfil } = await sb.from("profiles").select("parent_user_id").eq("id", uid).maybeSingle();
    const tenantId = (perfil?.parent_user_id as string | null) ?? uid;

    const { data: conv } = await sb.from("conversas")
      .select("id, tenant_id, agente_id, channel, produto_foco_id")
      .eq("id", conversaId).maybeSingle();
    if (!conv || conv.tenant_id !== tenantId) return jsonRes({ error: "conversa não encontrada" }, 404);
    if (conv.channel !== "teste") return jsonRes({ error: "só conversas do Chat Treino podem virar conversa padrão" }, 400);
    const agenteId = conv.agente_id as string | null;
    if (!agenteId) return jsonRes({ error: "conversa sem agente" }, 400);

    const [msgsRes, corrRes, agRes, empRes, prodRes] = await Promise.all([
      sb.from("mensagens").select("id, role, content, created_at")
        .eq("conversation_id", conversaId).is("deleted_at", null)
        .in("role", ["user", "assistant", "human"])
        .order("created_at", { ascending: true }).limit(200),
      sb.from("chat_treino_correcoes").select("mensagem_id, texto_original, texto_corrigido, sugestao")
        .eq("conversa_id", conversaId),
      sb.from("agentes_usuario").select("nome_agente, identidade").eq("id", agenteId).maybeSingle(),
      sb.from("empresas").select("nome").eq("user_id", tenantId).limit(1).maybeSingle(),
      conv.produto_foco_id
        ? sb.from("produtos").select("id, nome").eq("id", conv.produto_foco_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // deno-lint-ignore no-explicit-any
    const correcoes = new Map<string, any>(((corrRes.data ?? []) as any[]).map((c) => [c.mensagem_id, c]));
    const mensagens: MensagemTreino[] = [];
    // deno-lint-ignore no-explicit-any
    for (const m of (msgsRes.data ?? []) as any[]) {
      const texto = String(m.content ?? "").trim();
      if (!texto || /^\[[A-Z_]+\]$/.test(texto)) continue; // tokens internos
      const papel = m.role === "user" ? "lead" : "agente";
      const c = papel === "agente" ? correcoes.get(m.id) : undefined;
      const corrigido = !!(c?.texto_corrigido && c.texto_corrigido.trim() && c.texto_corrigido.trim() !== texto);
      mensagens.push({
        n: mensagens.length + 1,
        papel,
        texto: corrigido ? c.texto_corrigido.trim() : texto,
        corrigido,
        original: corrigido ? texto : undefined,
        sugestao: c?.sugestao?.trim() || undefined,
      });
    }
    if (!mensagens.some((m) => m.papel === "agente")) {
      return jsonRes({ error: "a agente ainda não falou nada nesta conversa" }, 400);
    }

    const produto = (prodRes as { data: { id: string; nome: string } | null }).data;
    const produtoNome = produto?.nome ?? null;
    // deno-lint-ignore no-explicit-any
    const ident = ((agRes.data as any)?.identidade ?? {}) as { nome?: string };
    const agenteNome = String((agRes.data as { nome_agente?: string } | null)?.nome_agente || ident.nome || "Agente");

    const { system, user } = montarPromptAnalise({
      agenteNome,
      empresaNome: String((empRes.data as { nome?: string } | null)?.nome ?? ""),
      produtoNome,
      mensagens,
    });

    const cfg = await getConfigChamada(sb, "mentor", tenantId, null);
    const { data: prov } = await sb.from("provedores_llm").select("base_url, api_key")
      .eq("slug", "openrouter").eq("is_active", true).single();
    if (!prov?.api_key) return jsonRes({ error: "provedor LLM indisponível" }, 500);
    const r = await fetch(`${prov.base_url}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${prov.api_key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ragentic.app",
        "X-Title": "Babel · Chat Treino · Mentor de Humanização",
      },
      body: JSON.stringify({
        model: cfg.modelo,
        temperature: 0.5,
        max_tokens: 4000,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    if (!r.ok) return jsonRes({ error: `mentor indisponível (${r.status})` }, 502);
    // deno-lint-ignore no-explicit-any
    const j: any = await r.json();
    const analise = normalizarAnalise(String(j?.choices?.[0]?.message?.content ?? ""));

    // Grava: desliga a conversa padrão anterior do mesmo agente+produto (e o bloco dela).
    let anteriores = sb.from("conversas_padrao").select("id, bloco_id").eq("agente_id", agenteId).eq("ativo", true);
    anteriores = produto?.id ? anteriores.eq("produto_id", produto.id) : anteriores.is("produto_id", null);
    const { data: velhas } = await anteriores;
    // deno-lint-ignore no-explicit-any
    const idsVelhas = ((velhas ?? []) as any[]).map((v) => v.id);
    // deno-lint-ignore no-explicit-any
    const blocosVelhos = ((velhas ?? []) as any[]).map((v) => v.bloco_id).filter(Boolean);
    if (idsVelhas.length) await sb.from("conversas_padrao").update({ ativo: false, updated_at: new Date().toISOString() }).in("id", idsVelhas);
    if (blocosVelhos.length) {
      await sb.from("blocos_conhecimento").update({ ativo: false, deleted_at: new Date().toISOString() }).in("id", blocosVelhos);
    }

    const titulo = `Conversa padrão — ${produtoNome ?? "Geral"}`;
    const { data: bloco, error: errBloco } = await sb.from("blocos_conhecimento").insert({
      agente_id: agenteId,
      escopo: "tenant",
      title: titulo,
      content: montarConteudoBloco({ produtoNome, diretrizes: analise.diretrizes, mensagens }),
      category: "conversa_padrao",
      tipo: "processo",
      tag: "conversa_padrao",
      tags: ["conversa_padrao", `produto:${produto?.id ?? "geral"}`],
      embedding_status: "pendente",
    }).select("id").single();
    if (errBloco || !bloco?.id) return jsonRes({ error: `não consegui gravar o bloco: ${errBloco?.message ?? "sem id"}` }, 500);

    const { data: cp, error: errCp } = await sb.from("conversas_padrao").insert({
      tenant_id: tenantId,
      agente_id: agenteId,
      produto_id: produto?.id ?? null,
      produto_nome: produtoNome,
      conversa_origem_id: conversaId,
      bloco_id: bloco.id,
      titulo,
      transcricao: mensagens,
      diretrizes: analise.diretrizes,
      humanizacao_original: analise.humanizacao_original,
      humanizacao_final: analise.humanizacao_final,
      analise: {
        comentario_mentor: analise.comentario_mentor,
        pontos_fortes: analise.pontos_fortes,
        ajustes: analise.ajustes,
        por_mensagem: analise.por_mensagem,
        modelo: cfg.modelo,
      },
    }).select("id").single();
    if (errCp || !cp?.id) return jsonRes({ error: `não consegui gravar a conversa padrão: ${errCp?.message ?? "sem id"}` }, 500);

    return jsonRes({
      ok: true,
      conversa_padrao_id: cp.id,
      bloco_id: bloco.id,
      produto: produto ? { id: produto.id, nome: produto.nome } : null,
      substituiu: idsVelhas.length,
      correcoes_aplicadas: mensagens.filter((m) => m.corrigido).length,
      ...analise,
    });
  } catch (e) {
    console.error("[chat-treino-analisar]", e);
    return jsonRes({ error: (e as Error).message ?? "erro" }, 500);
  }
});
