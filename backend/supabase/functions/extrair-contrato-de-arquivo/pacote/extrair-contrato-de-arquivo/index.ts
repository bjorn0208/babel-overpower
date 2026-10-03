/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
/**
 * extrair-contrato-de-arquivo v2 — Onda 3-b (2026-05-13)
 *
 * Recebe `{ caminho_arquivo }` (path no bucket `mestre-anexos`) e devolve
 * `{ ok, tipo, texto, tamanho_bytes }` pra o agente mestre alimentar
 * `gerar_link_contrato_livre` / `criar_template_contrato`.
 *
 * v2 acrescenta extração real de PDF (`npm:unpdf`) e DOCX (`npm:mammoth`).
 * Texto plano segue retorno direto.
 *
 * verify_jwt: true (só tenant autenticado).
 */

import { corsOk, jsonRes } from "../_shared/cors.ts";
import { criarClienteAdmin, criarClienteUsuarioDoRequest } from "../_shared/supabase.ts";

// unpdf é Deno-friendly (sem deps de Node fs). Usa pdf.js por baixo.
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";
// mammoth lida bem com DOCX dentro de Deno via npm: specifier.
import mammoth from "npm:mammoth@1.8.0";

const LIMITE_BYTES = 8 * 1024 * 1024; // 8MB · igual ao bucket

async function extrairPdf(buffer: ArrayBuffer): Promise<string> {
  const doc = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(doc, { mergePages: true });
  return Array.isArray(text) ? text.join("\n\n") : String(text ?? "");
}

async function extrairDocx(buffer: ArrayBuffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ arrayBuffer: buffer });
  return value ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsOk();

  try {
    const clienteUser = criarClienteUsuarioDoRequest(req);
    if (!clienteUser) return jsonRes({ error: "Authorization header ausente." }, 401);

    const { data: { user }, error: authError } = await clienteUser.auth.getUser();
    if (authError || !user) return jsonRes({ error: "Token inválido." }, 401);

    let body: { caminho_arquivo?: string };
    try {
      body = await req.json();
    } catch {
      return jsonRes({ error: "Body inválido — esperado JSON { caminho_arquivo }." }, 400);
    }

    const caminho = body.caminho_arquivo?.trim();
    if (!caminho) return jsonRes({ error: "caminho_arquivo obrigatório." }, 400);

    if (!caminho.startsWith(`${user.id}/`)) {
      return jsonRes({ error: "caminho_arquivo fora da pasta do usuário." }, 403);
    }

    const admin = criarClienteAdmin();
    const { data: arquivo, error: dlErr } = await admin.storage
      .from("mestre-anexos")
      .download(caminho);
    if (dlErr || !arquivo) {
      return jsonRes({ error: `Falha ao baixar: ${dlErr?.message ?? "desconhecido"}` }, 404);
    }

    const tamanho = arquivo.size;
    if (tamanho > LIMITE_BYTES) {
      return jsonRes({
        ok: false,
        mensagem: `Arquivo grande demais (${(tamanho / 1024).toFixed(0)}KB). Limite 8MB.`,
      }, 413);
    }

    const tipo = arquivo.type || "application/octet-stream";
    const minuscula = caminho.toLowerCase();

    if (tipo.startsWith("text/") || minuscula.endsWith(".txt") || minuscula.endsWith(".md")) {
      const texto = (await arquivo.text()).trim();
      return jsonRes({
        ok: true,
        tipo: "texto_plano",
        texto,
        tamanho_bytes: tamanho,
        caracteres: texto.length,
      });
    }

    if (tipo === "application/pdf" || minuscula.endsWith(".pdf")) {
      try {
        const buffer = await arquivo.arrayBuffer();
        const texto = (await extrairPdf(buffer)).trim();
        if (!texto) {
          return jsonRes({
            ok: false,
            tipo: "pdf",
            mensagem: "PDF parece estar vazio ou ser apenas imagem (sem texto extraível).",
            tamanho_bytes: tamanho,
          }, 422);
        }
        return jsonRes({
          ok: true,
          tipo: "pdf",
          texto,
          tamanho_bytes: tamanho,
          caracteres: texto.length,
        });
      } catch (e) {
        console.error("[extrair-contrato] PDF falhou:", e);
        return jsonRes({
          ok: false,
          tipo: "pdf",
          mensagem: `Falha ao extrair PDF: ${(e as Error).message}`,
          tamanho_bytes: tamanho,
        }, 500);
      }
    }

    if (
      tipo === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      || minuscula.endsWith(".docx")
    ) {
      try {
        const buffer = await arquivo.arrayBuffer();
        const texto = (await extrairDocx(buffer)).trim();
        if (!texto) {
          return jsonRes({
            ok: false,
            tipo: "docx",
            mensagem: "DOCX parece estar vazio.",
            tamanho_bytes: tamanho,
          }, 422);
        }
        return jsonRes({
          ok: true,
          tipo: "docx",
          texto,
          tamanho_bytes: tamanho,
          caracteres: texto.length,
        });
      } catch (e) {
        console.error("[extrair-contrato] DOCX falhou:", e);
        return jsonRes({
          ok: false,
          tipo: "docx",
          mensagem: `Falha ao extrair DOCX: ${(e as Error).message}`,
          tamanho_bytes: tamanho,
        }, 500);
      }
    }

    // Imagem (2026-08-02): print, foto de tabela, comprovante. Não tem texto
    // extraível por biblioteca — quem "lê" é o modelo multimodal, pelo mesmo
    // helper que o agente usa em mídia de WhatsApp. Bucket é privado, então a
    // leitura vai por URL assinada de curta duração.
    if (tipo.startsWith("image/") || /\.(png|jpe?g|webp|heic|gif)$/.test(minuscula)) {
      try {
        const { data: assinado, error: urlErr } = await admin.storage
          .from("mestre-anexos")
          .createSignedUrl(caminho, 300);
        if (urlErr || !assinado?.signedUrl) {
          throw new Error(urlErr?.message ?? "não consegui gerar link de leitura");
        }

        const { data: provedor } = await admin
          .from("provedores_llm")
          .select("api_key, base_url")
          .eq("slug", "openrouter")
          .eq("is_active", true)
          .limit(1)
          .single();
        if (!provedor?.api_key) throw new Error("credencial do provedor de IA indisponível");

        const { interpretarMidia } = await import("../_shared/midia-gemini.ts");
        const texto = (await interpretarMidia({
          mediaUrl: assinado.signedUrl,
          mediaType: tipo,
          apiKey: provedor.api_key as string,
          baseUrl: (provedor.base_url as string) ?? "https://openrouter.ai/api/v1",
          modelo: "google/gemini-3.1-flash-lite",
          modeloFallback: "google/gemini-3.1-pro-preview-customtools",
          maxTokens: 2500,
          instrucao:
            "Leia esta imagem para um assistente de negócios. Transcreva TODO texto visível " +
            "(tabelas, valores, prazos, nomes, datas) preservando a estrutura, e descreva em 1 linha " +
            "o que é a imagem. Português brasileiro, sem comentários extras.",
        })).trim();

        if (!texto) {
          return jsonRes({
            ok: false,
            tipo: "imagem",
            mensagem: "Não consegui ler essa imagem. Tente uma foto mais nítida ou envie o arquivo original.",
            tamanho_bytes: tamanho,
          }, 422);
        }
        return jsonRes({
          ok: true,
          tipo: "imagem",
          texto,
          tamanho_bytes: tamanho,
          caracteres: texto.length,
        });
      } catch (e) {
        console.error("[extrair-contrato] imagem falhou:", e);
        return jsonRes({
          ok: false,
          tipo: "imagem",
          mensagem: `Falha ao ler a imagem: ${(e as Error).message}`,
          tamanho_bytes: tamanho,
        }, 500);
      }
    }

    return jsonRes({
      ok: false,
      tipo,
      mensagem: "Tipo de arquivo não suportado. Use TXT, PDF, DOCX ou imagem (PNG/JPG/WEBP).",
      tamanho_bytes: tamanho,
    }, 400);
  } catch (err) {
    console.error("extrair-contrato-de-arquivo erro:", err);
    return jsonRes({ error: String(err) }, 500);
  }
});
