/**
 * Edge: agente-mestre-chat
 *
 * Cargo Mentor — conversa estratégica com tool-calling.
 * Recebe {conversa_id, mensagem}, executa loop LLM + tools,
 * persiste em mentor_mensagens e retorna {ok, mensagem, tool_calls}.
 *
 * verify_jwt: true (Supabase valida Bearer token antes de chegar aqui)
 */

import { corsOk, jsonRes } from "./compartilhado/cors.ts";
import { criarClienteAdmin, criarClienteUsuarioDoRequest } from "./compartilhado/supabase.ts";
import { chamarLlmComTools, type MensagemLlm } from "./compartilhado/openrouter.ts";
import { executarTool, type CtxMentor } from "./handlers.ts";
import { TOOLS_MENTOR } from "./tools.ts";

const MODELO = "google/gemini-2.5-flash";
const MAX_HISTORICO = 20;

const SISTEMA = `Você é o assistente operacional da Plataforma Limpa, falando direto com quem comanda.
Seja direto, útil e confiante. Quando pedirem uma ação no sistema, use as tools disponíveis.
Responda SEMPRE em português brasileiro e SEMPRE com pelo menos uma frase de texto para o usuário,
mesmo quando acionar uma tool. NUNCA devolva resposta vazia: se faltar contexto, pergunte.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsOk();

  try {
    // Valida JWT e extrai user_id
    const clienteUser = criarClienteUsuarioDoRequest(req);
    if (!clienteUser) return jsonRes({ error: "Authorization header ausente." }, 401);

    const { data: { user }, error: authError } = await clienteUser.auth.getUser();
    if (authError || !user) return jsonRes({ error: "Token inválido." }, 401);

    const user_id = user.id;

    // Parse body
    let body: { conversa_id?: string; mensagem?: string; cargo_tipologia?: string };
    try {
      body = await req.json();
    } catch {
      return jsonRes({ error: "Body inválido — esperado JSON {conversa_id, mensagem}." }, 400);
    }

    const { conversa_id, mensagem } = body;
    if (!conversa_id || !mensagem?.trim()) {
      return jsonRes({ error: "conversa_id e mensagem são obrigatórios." }, 400);
    }

    const admin = criarClienteAdmin();
    const ctx: CtxMentor = { user_id, supabase_admin: admin };

    // Verifica que a conversa pertence ao user
    const { data: conversa, error: convError } = await admin
      .from("mentor_conversas")
      .select("id")
      .eq("id", conversa_id)
      .eq("owner_id", user_id)
      .maybeSingle();

    if (convError || !conversa) {
      return jsonRes({ error: "Conversa não encontrada ou sem permissão." }, 404);
    }

    // Insere mensagem do usuário
    await admin.from("mentor_mensagens").insert({
      conversa_id,
      papel: "user",
      conteudo: mensagem.trim(),
    });

    // Carrega histórico (últimas MAX_HISTORICO mensagens)
    const { data: historico } = await admin
      .from("mentor_mensagens")
      .select("papel, conteudo")
      .eq("conversa_id", conversa_id)
      .order("criado_em", { ascending: true })
      .limit(MAX_HISTORICO);

    // Cargo por escopo (determinístico + verificado no servidor — nunca confiar no cliente
    // pra elevar privilégio: 'admin' só vale se eh_super_admin(user_id) confirmar no banco).
    const tipologiaPedida = body.cargo_tipologia === "admin" ? "admin" : "mentor";
    let tipologiaEfetiva: "admin" | "mentor" = "mentor";
    if (tipologiaPedida === "admin") {
      // Verificação server-side determinística: o super-admin da plataforma tem
      // profiles.system_role = 'platform_admin' (não 'admin'). Nunca confiar no cliente.
      const { data: perfil } = await admin
        .from("profiles")
        .select("system_role")
        .eq("id", user_id)
        .maybeSingle();
      if (perfil?.system_role === "platform_admin") tipologiaEfetiva = "admin";
    }

    const { data: cargo } = await admin
      .from("cargos")
      .select("nome, objetivo_principal, regras_livres")
      .eq("tipologia", tipologiaEfetiva)
      .eq("escopo", "global")
      .eq("ativo", true)
      .order("ordem", { ascending: true })
      .limit(1)
      .maybeSingle();

    // System prompt = base robusta SEMPRE presente + contexto do cargo POR CIMA
    // (nunca substituir a base por um campo curto — cargo Admin tem objetivo de
    // 60 chars e regras_livres NULL; sem a base, a LLM não tinha instrução suficiente).
    const sistemaPrompt = cargo?.objetivo_principal
      ? `${SISTEMA}

Cargo ativo: "${cargo.nome}". Objetivo do cargo: ${cargo.objetivo_principal}${cargo.regras_livres ? `\nRegras cravadas pelo tenant: ${cargo.regras_livres}` : ""}`
      : SISTEMA;

    // Monta mensagens pra LLM
    // Higiene de histórico: NUNCA mandar mensagem de conteúdo vazio pra LLM.
    // Gemini engasga com content vazio e devolve vazio → grava vazio → loop de
    // degradação que se auto-alimenta (causa raiz do bug do cargo Admin).
    // Sanear histórico pra LLM: (1) sem conteúdo vazio; (2) alternância estrita
    // user/assistant (Gemini devolve vazio se receber papéis repetidos em sequência
    // ou histórico só de 'user'); (3) precisa começar com 'user' após o system.
    const histLimpo = (historico ?? [])
      .filter((m) => typeof m.conteudo === "string" && m.conteudo.trim() !== "")
      .map((m) => ({
        role: (m.papel === "user" ? "user" : "assistant") as "user" | "assistant",
        content: m.conteudo as string,
      }));
    const histAlternado: { role: "user" | "assistant"; content: string }[] = [];
    for (const msg of histLimpo) {
      const ult = histAlternado[histAlternado.length - 1];
      if (ult && ult.role === msg.role) {
        histAlternado[histAlternado.length - 1] = msg; // papel repetido: mantém o mais recente
      } else {
        histAlternado.push(msg);
      }
    }
    while (histAlternado.length > 0 && histAlternado[0].role !== "user") {
      histAlternado.shift(); // Gemini exige primeira mensagem 'user' após o system
    }
    const mensagensLlm: MensagemLlm[] = [
      { role: "system", content: sistemaPrompt },
      ...histAlternado,
    ];

    // Loop tool-calling
    const resultado = await chamarLlmComTools({
      modelo: MODELO,
      mensagens: mensagensLlm,
      tools: TOOLS_MENTOR,
      max_iter: 3,
      executarTool: (nome, args) => executarTool(nome, args, ctx),
    });

    // Persiste resposta do assistente
    const toolCallsParaGravar =
      resultado.tool_calls_executados.length > 0
        ? resultado.tool_calls_executados.map((tc) => ({
            toolName: tc.nome,
            args: tc.args,
          }))
        : null;

    await admin.from("mentor_mensagens").insert({
      conversa_id,
      papel: "assistant",
      conteudo: resultado.texto_final,
      tool_calls: toolCallsParaGravar,
    });

    // Atualiza atualizado_em da conversa
    await admin
      .from("mentor_conversas")
      .update({ atualizado_em: new Date().toISOString() })
      .eq("id", conversa_id);

    return jsonRes({
      ok: true,
      mensagem: resultado.texto_final,
      tool_calls: resultado.tool_calls_executados,
    });
  } catch (err) {
    console.error("agente-mestre-chat erro:", err);
    return jsonRes({ error: String(err) }, 500);
  }
});

