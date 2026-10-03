/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
/**
 * analisar-reuniao — transforma a transcrição de uma call em dado.
 *
 * Recebe `{ sala_id, forcar? }`, lê os turnos de `salas_reuniao_turnos`
 * (cliente do usuário — RLS garante que só o time da sala acessa), manda a
 * transcrição pro LLM (OpenRouter, mesmo modelo do Mentor) e grava em
 * `salas_reuniao`: `assunto`, `resumo`, `topicos` (jsonb com tópicos,
 * decisões e pendências) + `analisada_em`.
 *
 * Idempotente: sala já analisada retorna o cache, salvo `forcar: true`.
 * verify_jwt = true — chamada pelo app Reunião com JWT do operador.
 */

import { corsOk, jsonRes } from "../_shared/cors.ts";
import { criarClienteUsuarioDoRequest } from "../_shared/supabase.ts";
import { chamarLlmComTools, type MensagemLlm } from "../_shared/openrouter.ts";

const MODELO = "google/gemini-2.5-flash";
const MAX_CHARS_TRANSCRICAO = 120_000;

type Turno = {
  nome: string | null;
  do_time: boolean | null;
  texto: string | null;
  falado_em: string | null;
};

type Analise = {
  assunto: string;
  resumo: string;
  topicos: string[];
  decisoes: string[];
  pendencias: string[];
};

function horaBrt(iso: string | null): string {
  if (!iso) return "--:--";
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return "--:--";
  }
}

function montarTranscricao(turnos: Turno[]): string {
  const linhas = turnos
    .filter((t) => (t.texto ?? "").trim().length > 0)
    .map((t) => `[${horaBrt(t.falado_em)}] ${t.nome ?? "Participante"}: ${(t.texto ?? "").trim()}`);
  let texto = linhas.join("\n");
  // Corte de segurança: call gigante não pode estourar o contexto do modelo.
  if (texto.length > MAX_CHARS_TRANSCRICAO) {
    texto = `${texto.slice(0, MAX_CHARS_TRANSCRICAO)}\n[transcrição cortada por tamanho]`;
  }
  return texto;
}

/** Extrai o JSON da resposta do modelo, tolerando cercas de código. */
function extrairJson(texto: string): Analise | null {
  const semCerca = texto.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const inicio = semCerca.indexOf("{");
  const fim = semCerca.lastIndexOf("}");
  if (inicio === -1 || fim <= inicio) return null;
  try {
    const bruto = JSON.parse(semCerca.slice(inicio, fim + 1)) as Record<string, unknown>;
    const lista = (v: unknown): string[] =>
      Array.isArray(v) ? v.map((x) => String(x)).filter((x) => x.trim().length > 0) : [];
    const assunto = String(bruto.assunto ?? "").trim();
    const resumo = String(bruto.resumo ?? "").trim();
    if (!assunto || !resumo) return null;
    return {
      assunto: assunto.slice(0, 120),
      resumo,
      topicos: lista(bruto.topicos),
      decisoes: lista(bruto.decisoes),
      pendencias: lista(bruto.pendencias),
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsOk();

  try {
    const cliente = criarClienteUsuarioDoRequest(req);
    if (!cliente) return jsonRes({ ok: false, erro: "Sem autorização." }, 401);

    const corpo = await req.json().catch(() => ({}));
    const salaId = String(corpo?.sala_id ?? "").trim();
    const forcar = corpo?.forcar === true;
    if (!salaId) return jsonRes({ ok: false, erro: "sala_id obrigatório." }, 400);

    // RLS filtra: se o user não é do time da sala, a query volta vazia.
    const { data: sala, error: erroSala } = await cliente
      .from("salas_reuniao")
      .select("id, titulo, assunto, resumo, topicos, analisada_em")
      .eq("id", salaId)
      .is("deleted_at", null)
      .maybeSingle();
    if (erroSala) return jsonRes({ ok: false, erro: erroSala.message }, 500);
    if (!sala) return jsonRes({ ok: false, erro: "Sala não encontrada." }, 404);

    if (sala.analisada_em && !forcar) {
      return jsonRes({
        ok: true,
        cache: true,
        analise: {
          assunto: sala.assunto,
          resumo: sala.resumo,
          ...(sala.topicos ?? {}),
        },
      });
    }

    const { data: turnos, error: erroTurnos } = await cliente
      .from("salas_reuniao_turnos")
      .select("nome, do_time, texto, falado_em")
      .eq("sala_id", salaId)
      .is("deleted_at", null)
      .order("falado_em", { ascending: true })
      .limit(3000);
    if (erroTurnos) return jsonRes({ ok: false, erro: erroTurnos.message }, 500);
    if (!turnos || turnos.length === 0) {
      return jsonRes({ ok: false, erro: "Essa call não tem transcrição salva." }, 400);
    }

    const transcricao = montarTranscricao(turnos as Turno[]);
    const mensagens: MensagemLlm[] = [
      {
        role: "system",
        content:
          "Você é um analista de reuniões. Recebe a transcrição de uma call e devolve SOMENTE um JSON válido, sem texto fora dele, em pt-BR, no formato: " +
          '{ "assunto": "tema principal da call em até 80 caracteres", "resumo": "resumo fiel em 1 a 3 parágrafos curtos", "topicos": ["tópico discutido"], "decisoes": ["decisão tomada"], "pendencias": ["pendência ou próximo passo"] }. ' +
          "Não invente nada que não esteja na transcrição. Listas vazias são permitidas.",
      },
      { role: "user", content: `Transcrição da call:\n\n${transcricao}` },
    ];

    const resposta = await chamarLlmComTools({ modelo: MODELO, mensagens, max_iter: 1 });
    const analise = extrairJson(resposta.texto_final);
    if (!analise) {
      return jsonRes({ ok: false, erro: "O modelo não devolveu uma análise válida." }, 502);
    }

    const { error: erroUpdate } = await cliente
      .from("salas_reuniao")
      .update({
        assunto: analise.assunto,
        resumo: analise.resumo,
        topicos: {
          topicos: analise.topicos,
          decisoes: analise.decisoes,
          pendencias: analise.pendencias,
        },
        analisada_em: new Date().toISOString(),
      })
      .eq("id", salaId);
    if (erroUpdate) return jsonRes({ ok: false, erro: erroUpdate.message }, 500);

    return jsonRes({ ok: true, cache: false, analise });
  } catch (err) {
    console.error("[analisar-reuniao] erro:", err);
    return jsonRes({ ok: false, erro: String(err) }, 500);
  }
});
