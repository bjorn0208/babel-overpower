/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

import { createClient } from "jsr:@supabase/supabase-js@2";
import * as zip from "jsr:@zip-js/zip-js@2";

interface ConversaExtraida {
  titulo: string;
  conteudo: string;
  fonte: string;
}

// Edge runtime tem ~150MB de limite de memória. ZIP grande + descompactação
// em memória estoura fácil (caso real: "Memory limit exceeded" com pasta de
// conversas). Limite conservador de entrada.
const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024; // 15MB
// Corta conteúdo de cada TXT pra não estourar memória num arquivo gigante
// escondido dentro do ZIP.
const TAMANHO_MAXIMO_POR_ARQUIVO = 2 * 1024 * 1024; // 2MB por .txt

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
    });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const tenantId = formData.get("tenantId") as string;

    if (!file || !file.name.endsWith(".zip")) {
      return new Response(JSON.stringify({ error: "Arquivo não é ZIP" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (file.size > TAMANHO_MAXIMO_BYTES) {
      return new Response(
        JSON.stringify({
          error: `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo: ${TAMANHO_MAXIMO_BYTES / 1024 / 1024}MB.`,
        }),
        { status: 413, headers: { "Content-Type": "application/json" } },
      );
    }

    const buffer = await file.arrayBuffer();
    const blocos: ConversaExtraida[] = [];
    const nomeArquivo = file.name;

    try {
      // Uint8ArrayReader evita a cópia extra que BlobReader(new Blob([buffer]))
      // fazia — era a principal causa do estouro de memória.
      const zipReader = new zip.ZipReader(new zip.Uint8ArrayReader(new Uint8Array(buffer)));
      const entries = await zipReader.getEntries();

      for (const entry of entries) {
        if (entry.filename.endsWith(".txt") && !entry.directory) {
          const writer = new zip.TextWriter();
          const conteudo = (await entry.getData?.(writer)) || "";

          const blocoTitulo = entry.filename.replace(/\.txt$/, "").split("/").pop() || "Conversa importada";
          const blocoConteudo = conteudo.trim().slice(0, TAMANHO_MAXIMO_POR_ARQUIVO);

          if (blocoConteudo.length > 0) {
            blocos.push({
              titulo: blocoTitulo,
              conteudo: blocoConteudo,
              fonte: `${nomeArquivo} / ${entry.filename}`,
            });
          }
        }
      }

      await zipReader.close();

      // Fallback: se nenhum TXT encontrado, trata como texto único
      if (blocos.length === 0) {
        const textoRaw = new TextDecoder().decode(buffer).slice(0, TAMANHO_MAXIMO_POR_ARQUIVO);
        blocos.push({
          titulo: "Conversas importadas",
          conteudo: textoRaw,
          fonte: nomeArquivo,
        });
      }
    } catch (err) {
      console.error("[processar-conversas-zip] Erro ao parsear ZIP:", err);
      // Fallback: processa como texto bruto
      const textoRaw = new TextDecoder().decode(buffer).slice(0, TAMANHO_MAXIMO_POR_ARQUIVO);
      blocos.push({
        titulo: "Conversas importadas",
        conteudo: textoRaw,
        fonte: nomeArquivo,
      });
    }

    return new Response(JSON.stringify({ blocos, total: blocos.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[processar-conversas-zip] Erro:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
