/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// canal-financeiro.ts — pipeline do assistente financeiro via WhatsApp.
//
// Chamado EXCLUSIVAMENTE pelo webhook quando o telefone da mensagem é o
// `numero_dono` de um `financeiro_config_tenant` ATIVO do tenant do canal.
// Fluxo: mídia? → baixa 1x → hash anti-duplicata → Storage `financeiro` →
// leitura estruturada via Gemini (INSTRUCAO_EXTRACAO_FINANCEIRA) → registra
// `documentos_financeiros` → monta a mensagem efetiva → processarCanalInterno
// (cargo Financeiro global + TOOLS_FINANCEIRO). A decisão gasto × pagamento de
// cliente × pergunta é do LLM com as regras do cargo (RAG-first) — aqui só
// preparamos FATOS determinísticos (dados extraídos, aviso de duplicata).

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { classificarMidia, interpretarMidia, rotuloMidia } from "./midia-gemini.ts";
import { INSTRUCAO_EXTRACAO_FINANCEIRA } from "./tools-financeiro.ts";
import { processarCanalInterno } from "./canal-interno.ts";

// deno-lint-ignore no-explicit-any
type AnyClient = SupabaseClient<any, "public", any>;

const MODELO_MIDIA_FALLBACK = "google/gemini-3.5-flash";

export type ArgsMensagemFinanceira = {
  supabase: AnyClient;
  /** Dono do caixa (tenant) — validado pelo webhook via financeiro_config_tenant. */
  tenantId: string;
  texto: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  /** Rótulo de quem enviou (financeiro_numeros_autorizados.rotulo) — autoria nos lançamentos. */
  autor?: string | null;
  /** Número de quem enviou (dígitos) — define a conversa da pessoa (1 fio por número). */
  numero?: string | null;
};

export type ResultadoFinanceiro = { ok: boolean; resposta: string };

/** Extensão de arquivo a partir do media_type/URL (pro path no Storage). */
function extensaoMidia(mediaType: string | null | undefined, url = ""): string {
  const t = `${mediaType ?? ""} ${url}`.toLowerCase();
  if (/pdf/.test(t)) return "pdf";
  if (/png/.test(t)) return "png";
  if (/webp/.test(t)) return "webp";
  if (/ogg|opus/.test(t)) return "ogg";
  if (/mp3|mpeg/.test(t)) return "mp3";
  return "jpg";
}

function mimeUpload(ext: string): string {
  switch (ext) {
    case "pdf": return "application/pdf";
    case "png": return "image/png";
    case "webp": return "image/webp";
    case "ogg": return "audio/ogg";
    case "mp3": return "audio/mpeg";
    default: return "image/jpeg";
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Garante a conversa do assistente financeiro — 1 por NÚMERO autorizado (contexto isolado
 *  por pessoa). Exportada: o cron-lembretes-financeiro grava o lembrete no mesmo histórico. */
export async function conversaFinanceira(
  sb: AnyClient,
  tenantId: string,
  numero: string,
  rotulo?: string | null,
): Promise<string | null> {
  const digitos = numero.replace(/\D/g, "");
  const { data: existente } = await sb
    .from("mentor_conversas")
    .select("id")
    .eq("owner_id", tenantId)
    .eq("canal", "financeiro")
    .eq("numero_wpp", digitos)
    .order("atualizado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existente?.id) return existente.id as string;
  const { data: nova, error } = await sb
    .from("mentor_conversas")
    .insert({
      owner_id: tenantId,
      titulo: `Financeiro — ${rotulo || digitos}`,
      canal: "financeiro",
      numero_wpp: digitos,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[canal-financeiro] falha ao criar conversa:", error.message);
    return null;
  }
  return (nova?.id as string) ?? null;
}

/**
 * Processa 1 mensagem do dono no canal financeiro e devolve a resposta do agente.
 * Nunca lança: falha vira resposta honesta pro dono (fail-safe, sem silêncio mudo).
 */
export async function processarMensagemFinanceiro(args: ArgsMensagemFinanceira): Promise<ResultadoFinanceiro> {
  const { supabase: sb, tenantId, texto, mediaUrl, mediaType, autor = null, numero = null } = args;

  const conversaId = await conversaFinanceira(sb, tenantId, numero ?? "", autor);
  if (!conversaId) {
    return { ok: false, resposta: "Tive um problema técnico pra abrir sua conversa financeira. Tenta de novo em instantes." };
  }

  // ── Documento anexado: baixa 1x, hash, Storage, extração estruturada ──────
  let blocoDocumento = "";
  let documentoTurnoId: string | null = null;
  let origemTurno: string | null = null;

  if (mediaUrl) {
    const tipoMidia = classificarMidia(mediaType, mediaUrl);
    try {
      const resp = await fetch(mediaUrl);
      if (!resp.ok) throw new Error(`download mídia ${resp.status}`);
      const bytes = new Uint8Array(await resp.arrayBuffer());
      const hash = await sha256Hex(bytes);

      // Anti-duplicata pelo binário: mesmo arquivo já processado → NÃO reprocessa.
      const { data: docDup } = await sb
        .from("documentos_financeiros")
        .select("id, criado_em, tipo")
        .eq("tenant_id", tenantId)
        .eq("hash_arquivo", hash)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();

      if (docDup?.id) {
        const quando = new Date(docDup.criado_em as string).toISOString().slice(0, 10);
        blocoDocumento =
          `\n\n[DOCUMENTO ANEXADO — DUPLICADO] Este exato arquivo já foi recebido e processado em ${quando} ` +
          `(${docDup.tipo}). NÃO registre nada de novo — avise o dono que esse documento já está registrado.`;
      } else if (tipoMidia === "image" || tipoMidia === "pdf") {
        // Leitura estruturada (Gemini) — mesma esteira de mídia do motor, instrução própria.
        const { data: prov } = await sb
          .from("provedores_llm")
          .select("base_url, api_key")
          .eq("slug", "openrouter")
          .eq("is_active", true)
          .single();
        let dadosExtraidos: Record<string, unknown> = {};
        let leituraCrua = "";
        if (prov?.api_key) {
          const { getConfigChamada } = await import("./config-chamadas.ts");
          leituraCrua = await interpretarMidia({
            mediaUrl,
            mediaType,
            apiKey: prov.api_key as string,
            baseUrl: prov.base_url as string,
            modelo: (await getConfigChamada(sb, "sintese", tenantId, null)).modelo,
            modeloFallback: MODELO_MIDIA_FALLBACK,
            instrucao: INSTRUCAO_EXTRACAO_FINANCEIRA,
          });
          try {
            const inicioJson = leituraCrua.indexOf("{");
            const fimJson = leituraCrua.lastIndexOf("}");
            if (inicioJson >= 0 && fimJson > inicioJson) {
              dadosExtraidos = JSON.parse(leituraCrua.slice(inicioJson, fimJson + 1));
            }
          } catch {
            dadosExtraidos = {};
          }
        }

        // Persiste o binário no bucket privado + o registro do documento.
        const tipoDoc = dadosExtraidos.tipo_documento === "extrato" ? "extrato" : "comprovante";
        const ext = extensaoMidia(mediaType, mediaUrl);
        const docId = crypto.randomUUID();
        const storagePath = `${tenantId}/${docId}.${ext}`;
        const { error: upErr } = await sb.storage
          .from("financeiro")
          .upload(storagePath, bytes, { contentType: mimeUpload(ext), upsert: false });
        if (upErr) console.warn("[canal-financeiro] upload storage falhou:", upErr.message);

        const { error: docErr } = await sb.from("documentos_financeiros").insert({
          id: docId,
          tenant_id: tenantId,
          tipo: tipoDoc,
          storage_path: upErr ? null : storagePath,
          hash_arquivo: hash,
          dados_extraidos: dadosExtraidos,
        });
        if (!docErr) {
          documentoTurnoId = docId;
          origemTurno = tipoDoc;
        }

        const lancs = Array.isArray(dadosExtraidos.lancamentos) ? dadosExtraidos.lancamentos : [];
        blocoDocumento = lancs.length > 0
          ? `\n\n[DOCUMENTO ANEXADO — ${tipoDoc.toUpperCase()}] Dados extraídos (fatos lidos do documento, use-os nas ferramentas):\n` +
            JSON.stringify(lancs).slice(0, 4000)
          : `\n\n[DOCUMENTO ANEXADO — ${rotuloMidia(mediaType, mediaUrl)}] Não consegui extrair lançamentos legíveis. ` +
            `Peça ao dono os dados (valor, data, do que se trata) antes de registrar qualquer coisa.` +
            (leituraCrua ? `\nLeitura crua: ${leituraCrua.slice(0, 800)}` : "");
      } else if (tipoMidia === "audio") {
        // Áudio: transcrição normal (o texto transcrito entra como fala do dono).
        const { data: prov } = await sb
          .from("provedores_llm")
          .select("base_url, api_key")
          .eq("slug", "openrouter")
          .eq("is_active", true)
          .single();
        if (prov?.api_key) {
          const { getConfigChamada } = await import("./config-chamadas.ts");
          const transcricao = await interpretarMidia({
            mediaUrl,
            mediaType,
            apiKey: prov.api_key as string,
            baseUrl: prov.base_url as string,
            modelo: (await getConfigChamada(sb, "sintese", tenantId, null)).modelo,
            modeloFallback: MODELO_MIDIA_FALLBACK,
          });
          if (transcricao) blocoDocumento = `\n\n[ÁUDIO DO DONO — transcrição] ${transcricao.slice(0, 2000)}`;
        }
      }
    } catch (e) {
      console.warn("[canal-financeiro] falha na mídia:", (e as Error).message);
      blocoDocumento =
        `\n\n[DOCUMENTO ANEXADO] Falha técnica ao ler o arquivo. Peça ao dono pra reenviar ou digitar os dados (valor, data, descrição).`;
    }
  }

  // Autoria no histórico: prefixo identifica quem da equipe mandou (o LLM vê e a
  // aba Conversa do app mostra). Sem rótulo cadastrado → sem prefixo (dono único).
  const prefixoAutor = autor ? `[de ${autor}] ` : "";
  const mensagemEfetiva = `${prefixoAutor}${(texto || "").trim() || "(sem texto — só o anexo)"}${blocoDocumento}`;

  const resultado = await processarCanalInterno({
    mensagem: mensagemEfetiva,
    conversaId,
    userId: tenantId,
    ehAdmin: false,
    tenantId,
    canal: "financeiro",
    documentoTurnoId,
    origemTurno,
    autorTurno: autor,
  });

  if (!resultado.ok || !resultado.mensagem?.trim()) {
    return { ok: false, resposta: "Não consegui processar agora. Me manda de novo em instantes?" };
  }
  return { ok: true, resposta: resultado.mensagem.trim() };
}
