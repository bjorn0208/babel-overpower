/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
import { corsOk, jsonRes } from "./_shared/cors.ts";
import { criarClienteAdmin, criarClienteUsuario } from "./_shared/supabase.ts";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";

const LIMITE_BYTES = 8 * 1024 * 1024;
const MODELO_PRINCIPAL = "google/gemini-3.1-flash-lite";
const MODELO_FALLBACK = "google/gemini-3.1-pro-preview-customtools";

const SCHEMA_DESCRICAO = `Devolva SOMENTE um JSON com exatamente estas chaves (string vazia "" quando o
formulário não trouxer o dado — nunca invente valor):

{
  "responsavel_nome": string,
  "responsavel_email": string,
  "responsavel_whatsapp": string,
  "razao_social": string,
  "nome_comercial": string,
  "documento": string,
  "segmento": string,
  "segmento_outro": string,
  "descricao_negocio": string,
  "modo_atendimento": string,
  "endereco": string,
  "tem_mais_unidades": boolean,
  "unidades_endereco": string,
  "site": string,
  "instagram": string,
  "outros_links": string,
  "chave_pix": string,
  "whatsapp_agente": string,
  "tipo_numero_whatsapp": string,
  "tempo_numero": string,
  "historico_conversas": string,
  "volume_semanal": string,
  "horario_atendimento": string,
  "periodos_fechamento": string,
  "nome_agente": string,
  "tom_de_voz": string,
  "mensagem_exemplo": string,
  "quantidade_produtos_texto": string,
  "formas_pagamento": string[],
  "parcelamento": string,
  "saudacao": string,
  "informacoes_necessarias": string,
  "informacao_indispensavel": string,
  "etapas_funil": string,
  "politica_garantia": string,
  "politica_cancelamento": string,
  "ate_onde_vai_funil": string,
  "observacao_extra": string
}

REGRA INVIOLÁVEL: a seção do formulário chamada "O que o agente vai oferecer"
(lista de produtos/serviços com preço e prazo) deve ser IGNORADA por completo.
Não copie nomes de produto, preço ou descrição de serviço pra nenhum campo.
Só "quantidade_produtos_texto" pode conter o que a pergunta "Quantos produtos
ou serviços o agente deve conhecer?" respondeu, sem detalhar preço/descrição.`;

async function extrairTextoPdf(buffer: ArrayBuffer): Promise<string> {
  const doc = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(doc, { mergePages: true });
  return (Array.isArray(text) ? text.join("\n\n") : String(text ?? "")).trim();
}

function base64ParaBuffer(b64: string): ArrayBuffer {
  const limpo = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const binario = atob(limpo);
  const buffer = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) buffer[i] = binario.charCodeAt(i);
  return buffer.buffer;
}

async function estruturarComLlm(texto: string, admin: ReturnType<typeof criarClienteAdmin>) {
  const { data: prov } = await admin
    .from("provedores_llm")
    .select("base_url, api_key")
    .eq("slug", "openrouter")
    .eq("is_active", true)
    .single();
  if (!prov?.api_key) throw new Error("credencial do provedor de IA indisponível");

  const mensagens = [
    {
      role: "system",
      content:
        "Você extrai dados de um formulário de implementação de cliente (Google Forms exportado em PDF) " +
        "pra um painel administrativo de SaaS. Leia o texto bruto (pergunta seguida da resposta) e " +
        "responda em português. " + SCHEMA_DESCRICAO,
    },
    { role: "user", content: texto.slice(0, 20000) },
  ];

  const chamar = async (modelo: string) => {
    const resp = await fetch(`${prov.base_url}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${prov.api_key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ragentic.app",
        "X-Title": "Ragentic · extrair-tenant-pdf",
      },
      body: JSON.stringify({
        model: modelo,
        messages: mensagens,
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) throw new Error(`LLM ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const json = await resp.json();
    const bruto: string = json.choices?.[0]?.message?.content ?? "";
    return JSON.parse(bruto);
  };

  try {
    return await chamar(MODELO_PRINCIPAL);
  } catch (e) {
    console.warn("[extrair-tenant-pdf] modelo principal falhou, tentando fallback:", e);
    return await chamar(MODELO_FALLBACK);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsOk();

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return jsonRes({ error: "Authorization header ausente." }, 401);

    const clienteUser = criarClienteUsuario(authHeader);
    const { data: { user }, error: authError } = await clienteUser.auth.getUser();
    if (authError || !user) return jsonRes({ error: "Token inválido." }, 401);

    const admin = criarClienteAdmin();
    const { data: perfilChamador, error: perfilErr } = await admin
      .from("profiles")
      .select("system_role")
      .eq("id", user.id)
      .single();
    if (perfilErr || perfilChamador?.system_role !== "platform_admin") {
      return jsonRes({ error: "Apenas o admin da plataforma pode importar tenant via PDF." }, 403);
    }

    let body: { arquivo_base64?: string };
    try {
      body = await req.json();
    } catch {
      return jsonRes({ error: "Body inválido — esperado JSON { arquivo_base64 }." }, 400);
    }

    const b64 = body.arquivo_base64?.trim();
    if (!b64) return jsonRes({ error: "arquivo_base64 obrigatório." }, 400);

    const buffer = base64ParaBuffer(b64);
    if (buffer.byteLength > LIMITE_BYTES) {
      return jsonRes({ ok: false, mensagem: "PDF grande demais. Limite 8MB." }, 413);
    }

    let texto: string;
    try {
      texto = await extrairTextoPdf(buffer);
    } catch (e) {
      console.error("[extrair-tenant-pdf] PDF falhou:", e);
      return jsonRes({ ok: false, mensagem: `Falha ao ler o PDF: ${(e as Error).message}` }, 422);
    }
    if (!texto) {
      return jsonRes({
        ok: false,
        mensagem: "PDF sem texto extraível (parece ser imagem/scan). Exporte o formulário como PDF de texto.",
      }, 422);
    }

    const dados = await estruturarComLlm(texto, admin);
    return jsonRes({ ok: true, dados });
  } catch (err) {
    console.error("extrair-tenant-pdf erro:", err);
    return jsonRes({ ok: false, mensagem: String((err as Error).message ?? err) }, 500);
  }
});
