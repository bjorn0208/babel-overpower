/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

/**
 * criar-bloco-da-pergunta
 *
 * Edge chamada pelo frontend quando o dono aprova "virar bloco" após
 * o loop Mentor entregar a resposta ao lead.
 *
 * verify_jwt = true (chamada autenticada pelo frontend).
 *
 * Fluxo:
 * 1. Valida JWT: user_id deve ser o tenant_id da pergunta.
 * 2. INSERT na gaveta aprovada (blocos_conhecimento, blocos_procedurais, etc).
 * 3. Trigger `trg_enqueue_embedding_*` na tabela de destino cuida do embedding automaticamente.
 * 4. UPDATE `perguntas_sem_resposta`: status_loop='virou_bloco', bloco_criado_id.
 * 5. Retorna { ok: true, bloco_id }.
 *
 * Body: {
 *   pergunta_id: string,
 *   gaveta_aprovada: string,   // ex: "blocos_conhecimento"
 *   escopo_aprovado: string,   // "tenant" | "nicho" | "global"
 *   texto_bloco_editado?: string  // opcional: dono pode editar antes de salvar
 * }
 */

// deno-lint-ignore-file no-explicit-any

import { criarClienteUsuarioDoRequest, criarClienteAdmin } from "../_shared/supabase.ts";
import { corsOk, jsonRes } from "../_shared/cors.ts";

// Gavetas suportadas → tabela de destino + campos mínimos obrigatórios
const GAVETAS: Record<string, { tabela: string; campoTexto: string; campoTitulo?: string }> = {
  blocos_conhecimento: { tabela: "blocos_conhecimento", campoTexto: "content", campoTitulo: "title" },
  blocos_procedurais: { tabela: "blocos_procedurais", campoTexto: "passos", campoTitulo: "titulo" },
  blocos_gatilho: { tabela: "blocos_gatilho", campoTexto: "acao_disparada", campoTitulo: "nome_trigger" },
  blocos_humanizacao: { tabela: "blocos_humanizacao", campoTexto: "regra", campoTitulo: "categoria" },
  blocos_comportamento: { tabela: "blocos_comportamento", campoTexto: "instrucao", campoTitulo: "titulo" },
  blocos_meta: { tabela: "blocos_meta", campoTexto: "conteudo", campoTitulo: "titulo" },
};

const ESCOPOS_VALIDOS = new Set(["tenant", "nicho", "global"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsOk();

  // Valida JWT — este cliente opera com os privilégios do usuário autenticado
  const clienteUsuario = criarClienteUsuarioDoRequest(req);
  if (!clienteUsuario) {
    return jsonRes({ ok: false, erro: "autorização obrigatória" }, 401);
  }

  // Admin para operações que exigem service_role (INSERT em gavetas com RLS restrito)
  const supabaseAdmin = criarClienteAdmin();

  try {
    const body = await req.json();
    const pergunta_id: string = body?.pergunta_id;
    const gaveta_aprovada: string = body?.gaveta_aprovada;
    const escopo_aprovado: string = body?.escopo_aprovado ?? "tenant";
    const texto_bloco_editado: string | undefined = body?.texto_bloco_editado;

    // Validações básicas
    if (!pergunta_id) {
      return jsonRes({ ok: false, erro: "pergunta_id obrigatório" }, 400);
    }
    const gavetaCfg = GAVETAS[gaveta_aprovada];
    if (!gavetaCfg) {
      return jsonRes({ ok: false, erro: `gaveta_aprovada inválida: ${gaveta_aprovada}` }, 400);
    }
    if (!ESCOPOS_VALIDOS.has(escopo_aprovado)) {
      return jsonRes({ ok: false, erro: `escopo_aprovado inválido: ${escopo_aprovado}` }, 400);
    }

    // Verifica identidade do usuário autenticado
    const { data: { user }, error: errUser } = await clienteUsuario.auth.getUser();
    if (errUser || !user?.id) {
      return jsonRes({ ok: false, erro: "usuário não autenticado" }, 401);
    }
    const uid = user.id;

    // Lê a pergunta para validar ownership e obter os dados
    const { data: pergunta, error: errP } = await supabaseAdmin
      .from("perguntas_sem_resposta")
      .select("id, tenant_id, conversation_id, lead_id, agente_id, pergunta, resposta_do_dono, status_loop, gaveta_proposta, escopo_proposto")
      .eq("id", pergunta_id)
      .maybeSingle();

    if (errP || !pergunta) {
      return jsonRes({ ok: false, erro: "pergunta não encontrada" }, 404);
    }

    // Só o tenant dono da pergunta pode criar o bloco
    if (pergunta.tenant_id !== uid) {
      return jsonRes({ ok: false, erro: "sem permissão para esta pergunta" }, 403);
    }

    // Só pode virar bloco se já foi entregue ao lead (ou aguardando, caso dono pule)
    const statusPermitidos = ["entregue_lead", "dono_respondeu", "aguardando_dono"];
    if (!statusPermitidos.includes(pergunta.status_loop as string)) {
      return jsonRes({ ok: false, erro: `status_loop incompatível: ${pergunta.status_loop}` }, 422);
    }

    const textoFinal: string = texto_bloco_editado?.trim() ||
      String(pergunta.resposta_do_dono ?? pergunta.pergunta ?? "").trim();

    if (!textoFinal) {
      return jsonRes({ ok: false, erro: "sem texto para criar o bloco" }, 422);
    }

    // Prepara o agente_id para o bloco (só aplica em escopo tenant)
    const agenteIdBloco: string | null = escopo_aprovado === "tenant"
      ? (pergunta.agente_id as string | null)
      : null;

    // Lê nicho_id do tenant para escopo nicho
    let nichoId: string | null = null;
    if (escopo_aprovado === "nicho" || escopo_aprovado === "global") {
      const { data: perfil } = await supabaseAdmin
        .from("profiles")
        .select("nicho_id")
        .eq("id", uid)
        .maybeSingle();
      nichoId = (perfil?.nicho_id as string | null) ?? null;
    }

    // Monta o objeto de inserção conforme a gaveta
    const titulo = `Resposta do mentor: ${String(pergunta.pergunta ?? "").slice(0, 80)}`;
    const dadosBloco: Record<string, unknown> = {
      escopo: escopo_aprovado,
      ativo: true,
      tag: "mentor", // marca como originado do loop Mentor (distingue de blocos manuais/auto)
    };

    // Campo título (quando existe na tabela de destino)
    if (gavetaCfg.campoTitulo) {
      dadosBloco[gavetaCfg.campoTitulo] = titulo;
    }
    // Campo texto principal
    dadosBloco[gavetaCfg.campoTexto] = textoFinal;

    // Vínculos de escopo
    if (escopo_aprovado === "tenant" && agenteIdBloco) {
      dadosBloco.agente_id = agenteIdBloco;
    }
    if (escopo_aprovado === "nicho" && nichoId) {
      dadosBloco.nicho_id = nichoId;
    }

    // INSERT na gaveta (service_role bypassa RLS — validação de ownership feita acima)
    const { data: blocoInserido, error: errInsert } = await supabaseAdmin
      .from(gavetaCfg.tabela)
      .insert(dadosBloco)
      .select("id")
      .single();

    if (errInsert || !blocoInserido?.id) {
      console.warn("[criar-bloco-da-pergunta] INSERT falhou:", errInsert?.message);
      return jsonRes({ ok: false, erro: `falha ao criar bloco: ${errInsert?.message ?? "sem id"}` }, 500);
    }

    const bloco_id = blocoInserido.id as string;

    // UPDATE pergunta: virou_bloco
    await supabaseAdmin
      .from("perguntas_sem_resposta")
      .update({
        status_loop: "virou_bloco",
        bloco_criado_id: bloco_id,
        gaveta_proposta: gaveta_aprovada,
        escopo_proposto: escopo_aprovado,
      })
      .eq("id", pergunta_id);

    return jsonRes({ ok: true, bloco_id, tabela: gavetaCfg.tabela, escopo: escopo_aprovado });
  } catch (err) {
    console.warn("[criar-bloco-da-pergunta] erro:", (err as Error).message);
    return jsonRes({ ok: false, erro: String(err) }, 500);
  }
});
