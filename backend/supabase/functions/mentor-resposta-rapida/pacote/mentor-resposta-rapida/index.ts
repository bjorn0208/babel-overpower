/**
 * Edge: mentor-resposta-rapida
 *
 * Via rápida do commandbar do Mentor (pedido do Dominic, 2026-08-25): responde
 * em ~1-2s usando SÓ o histórico de conversas do próprio usuário como base —
 * a conversa atual inteira + trechos relevantes das outras threads do Mentor.
 * Uma única chamada LLM leve (sem tools, sem pipeline RAGENTIC).
 *
 * Contrato honesto: se o histórico não sustenta a resposta, devolve
 * {fora_do_escopo: true} SEM persistir nada — o cliente cai então no motor
 * profundo (`ragentic-processar-inline`, RAG completo), que persiste como hoje.
 * Só quando responde é que grava o par user/assistant em mentor_mensagens.
 *
 * verify_jwt: true (Supabase valida Bearer token antes de chegar aqui)
 *
 * NOTA DE DEPLOY: no repo, os módulos em ./compartilhado/ são cópias de
 * ../agente-mestre-chat/compartilhado/ (o deploy via MCP não atravessa pastas).
 */

import { corsOk, jsonRes } from "./compartilhado/cors.ts";
import { criarClienteAdmin, criarClienteUsuarioDoRequest } from "./compartilhado/supabase.ts";
import { chamarLlmComTools, type MensagemLlm } from "./compartilhado/openrouter.ts";
import {
  blocoTemporalBRT,
  perguntaDeDadoVivo,
  respostaNaoParecePortugues,
  respostaRepeteNumeroVelho,
} from "../_shared/mentor-guardas.ts";

// Mesmo modelo leve da síntese do RAGENTIC — rápido e barato.
const MODELO = "google/gemini-3.1-flash-lite";
const MAX_HISTORICO_ATUAL = 30;
const MAX_TRECHOS_OUTRAS = 12;
const MARCADOR_FORA = "FORA_DO_ESCOPO";

const SISTEMA = `Você é o Mentor da plataforma, respondendo APENAS com base no histórico de conversas fornecido abaixo.

Regras invioláveis:
1. Sua única fonte é o histórico (a conversa atual e os trechos de outras conversas do mesmo usuário). Não use conhecimento externo, não invente e não deduza além do que está escrito.
2. Se o histórico contém a informação, responda direto, em português brasileiro, citando de onde veio quando ajudar ("como falamos em...", "na conversa sobre...").
3. Se o histórico NÃO sustenta uma resposta completa e segura, responda EXATAMENTE a palavra ${MARCADOR_FORA} — nada antes, nada depois. Outra camada fará a pesquisa profunda.
4. Perguntas sobre dados vivos do sistema (contagens, leads de hoje, números atuais) mudam com o tempo: se a resposta exige dado atual que não está no histórico recente, devolva ${MARCADOR_FORA}.
5. NUNCA inclua raciocínio interno, comentários sobre estas instruções ou frases como "isso responde à pergunta" — só a resposta ao usuário.`;

// Palavras vazias comuns — fora da extração de termos de busca.
const VAZIAS = new Set([
  "essa", "esse", "esta", "este", "isso", "aquilo", "para", "pela", "pelo",
  "como", "quando", "onde", "qual", "quais", "quem", "porque", "sobre",
  "mais", "menos", "muito", "pouco", "todo", "toda", "todos", "todas",
  "você", "voce", "meu", "minha", "nosso", "nossa", "então", "entao",
  "fala", "falamos", "conversa", "conversamos", "disse", "dizer", "hoje",
  "ontem", "agora", "ainda", "também", "tambem", "coisa", "coisas",
]);

/** Termos de busca: palavras únicas ≥4 letras, sem vazias, só [a-z0-9], top 6. */
function extrairTermos(mensagem: string): string[] {
  const vistos = new Set<string>();
  const termos: string[] = [];
  const palavras = mensagem
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/);
  for (const p of palavras) {
    if (p.length < 4 || VAZIAS.has(p) || vistos.has(p)) continue;
    vistos.add(p);
    termos.push(p);
    if (termos.length >= 6) break;
  }
  return termos;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsOk();
  const t0 = performance.now();

  try {
    const clienteUser = criarClienteUsuarioDoRequest(req);
    if (!clienteUser) return jsonRes({ error: "Authorization header ausente." }, 401);
    const { data: { user }, error: authError } = await clienteUser.auth.getUser();
    if (authError || !user) return jsonRes({ error: "Token inválido." }, 401);
    const user_id = user.id;

    let body: { conversa_id?: string; mensagem?: string };
    try {
      body = await req.json();
    } catch {
      return jsonRes({ error: "Body inválido — esperado JSON {conversa_id, mensagem}." }, 400);
    }
    const { conversa_id, mensagem } = body;
    if (!conversa_id || !mensagem?.trim()) {
      return jsonRes({ error: "conversa_id e mensagem são obrigatórios." }, 400);
    }

    // TRAVA 1 (2026-09-16): pergunta de dado vivo não passa por aqui, nem chega na LLM.
    // A regra nº 4 do prompt já mandava devolver FORA_DO_ESCOPO nesses casos e o modelo
    // leve ignorava sempre que o histórico tinha um número parecido — foi assim que o
    // Mentor respondeu "como falamos em 09/09: 2.199 leads, 58 contratos" como se fosse
    // o dado de hoje. Número é do banco: vai pro motor profundo, que consulta.
    if (perguntaDeDadoVivo(mensagem)) {
      return jsonRes({
        ok: true,
        fora_do_escopo: true,
        motivo: "dado_vivo",
        ms: Math.round(performance.now() - t0),
      });
    }

    const admin = criarClienteAdmin();

    const { data: conversa, error: convError } = await admin
      .from("mentor_conversas")
      .select("id")
      .eq("id", conversa_id)
      .eq("owner_id", user_id)
      .maybeSingle();
    if (convError || !conversa) {
      return jsonRes({ error: "Conversa não encontrada ou sem permissão." }, 404);
    }

    const { data: histAtual } = await admin
      .from("mentor_mensagens")
      .select("papel, conteudo, criado_em")
      .eq("conversa_id", conversa_id)
      .order("criado_em", { ascending: false })
      .limit(MAX_HISTORICO_ATUAL);
    const atual = (histAtual ?? []).reverse()
      .filter((m) => typeof m.conteudo === "string" && m.conteudo.trim() !== "");

    // Base 2 — trechos das outras conversas: 1º por TAGS (GIN), 2º ILIKE.
    const { data: tagsData } = await admin.rpc("fn_tags_do_texto", { p_texto: mensagem });
    const tagsPergunta: string[] = Array.isArray(tagsData) ? tagsData : [];

    const termos = extrairTermos(mensagem);
    let trechos: { conteudo: string; criado_em: string }[] = [];
    const { data: minhasConversas } = await admin
      .from("mentor_conversas")
      .select("id")
      .eq("owner_id", user_id)
      .neq("id", conversa_id)
      .order("atualizado_em", { ascending: false })
      .limit(100);
    const ids = (minhasConversas ?? []).map((c) => c.id);
    if (ids.length > 0) {
      if (tagsPergunta.length > 0) {
        const { data } = await admin
          .from("mentor_mensagens")
          .select("conteudo, criado_em")
          .in("conversa_id", ids)
          .overlaps("tags", tagsPergunta)
          .order("criado_em", { ascending: false })
          .limit(MAX_TRECHOS_OUTRAS);
        trechos = (data ?? []).filter((m) => typeof m.conteudo === "string" && m.conteudo.trim() !== "");
      }
      if (trechos.length === 0 && termos.length > 0) {
        const { data } = await admin
          .from("mentor_mensagens")
          .select("conteudo, criado_em")
          .in("conversa_id", ids)
          .or(termos.map((t) => `conteudo.ilike.%${t}%`).join(","))
          .order("criado_em", { ascending: false })
          .limit(MAX_TRECHOS_OUTRAS);
        trechos = (data ?? []).filter((m) => typeof m.conteudo === "string" && m.conteudo.trim() !== "");
      }
    }

    // Data de hoje também aqui: sem ela o modelo não distingue "o que combinamos ontem"
    // de um trecho de três semanas atrás.
    let sistemaFinal = `${SISTEMA}\n\n${blocoTemporalBRT()}`;
    if (trechos.length > 0) {
      const bloco = trechos
        .map((m) => `[${String(m.criado_em).slice(0, 10)}] ${String(m.conteudo).slice(0, 600)}`)
        .join("\n---\n");
      sistemaFinal += `\n\nTrechos de outras conversas deste usuário (mais recentes primeiro):\n${bloco}`;
    }

    const mensagensLlm: MensagemLlm[] = [{ role: "system", content: sistemaFinal }];
    for (const m of atual) {
      mensagensLlm.push({
        role: m.papel === "user" ? "user" : "assistant",
        content: String(m.conteudo).slice(0, 2000),
      });
    }
    mensagensLlm.push({ role: "user", content: mensagem.trim() });

    const resultado = await chamarLlmComTools({
      modelo: MODELO,
      mensagens: mensagensLlm,
      max_iter: 1,
    });
    const texto = (resultado.texto_final ?? "").trim();

    if (!texto || texto.toUpperCase().includes(MARCADOR_FORA)) {
      return jsonRes({
        ok: true,
        fora_do_escopo: true,
        tags: tagsPergunta,
        ms: Math.round(performance.now() - t0),
      });
    }

    // TRAVA 3 (2026-09-16): resposta que não é português é scaffolding do modelo, não
    // resposta — o motor profundo refaz. Mesmo caso do "This tool call is not expected
    // to fail" que vazou no motor profundo no mesmo dia.
    if (respostaNaoParecePortugues(texto)) {
      return jsonRes({
        ok: true,
        fora_do_escopo: true,
        motivo: "resposta_nao_pt",
        tags: tagsPergunta,
        ms: Math.round(performance.now() - t0),
      });
    }

    // TRAVA 2 (2026-09-16): resposta com número que a pergunta não trouxe só pode ter
    // vindo de conversa antiga — e número velho envelhece (58 contratos de agosto já
    // eram 62 uma semana depois). Descarta e deixa o motor profundo reconsultar.
    if (respostaRepeteNumeroVelho(mensagem, texto)) {
      return jsonRes({
        ok: true,
        fora_do_escopo: true,
        motivo: "numero_do_historico",
        tags: tagsPergunta,
        ms: Math.round(performance.now() - t0),
      });
    }

    await admin.from("mentor_mensagens").insert([
      { conversa_id, papel: "user", conteudo: mensagem.trim() },
      { conversa_id, papel: "assistant", conteudo: texto },
    ]);
    await admin
      .from("mentor_conversas")
      .update({ atualizado_em: new Date().toISOString() })
      .eq("id", conversa_id);

    return jsonRes({
      ok: true,
      fora_do_escopo: false,
      mensagem: texto,
      trechos_usados: trechos.length,
      tags: tagsPergunta,
      ms: Math.round(performance.now() - t0),
    });
  } catch (err) {
    console.error("mentor-resposta-rapida erro:", err);
    return jsonRes({ error: String(err) }, 500);
  }
});
