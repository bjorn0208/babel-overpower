/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
//
// gerar-pdf-contrato
//
// Gera o PDF do contrato assinado (server-side, pdf-lib), sobe no bucket
// `contract-signatures` e grava `pdf_url` no contrato. Disparada pelo frontend
// logo após o aceite (e disponível como fallback manual no app interno).
//
// verify_jwt: false — recebe `token` (chave_publica) ou `contrato_id`; usa
// service_role pra ler/gravar (a chave pública já é o segredo do link).
//
import { corsOk, jsonRes } from "../_shared/cors.ts";
import { criarClienteAdmin } from "../_shared/supabase.ts";
import { montarPdfContrato, type ContratoPdf } from "./montar-pdf.ts";

const COLUNAS =
  "id, chave_publica, titulo, nome_empresa, texto_contrato, dados_cliente, " +
  "dados_signatario, assinado_em, ip_assinatura, hash_contrato, url_selfie, " +
  "url_documento, url_assinatura, url_comprovante_pagamento, " +
  "url_selfie_testemunha, url_documento_testemunha, url_assinatura_testemunha, " +
  "dados_testemunha, metodo_pagamento";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsOk();

  try {
    const body = await req.json().catch(() => ({}));
    const token: string | null = body?.token ?? body?.chave ?? null;
    const contratoId: string | null = body?.contrato_id ?? null;
    if (!token && !contratoId) {
      return jsonRes({ error: "token ou contrato_id obrigatório" }, 400);
    }

    const supabase = criarClienteAdmin();

    // Auth (2026-09-17): por `token` (chave_publica) segue público — a chave do
    // link é o segredo. Por `contrato_id`, que é adivinhável em massa, agora
    // exige service_role ou usuário logado dono do contrato.
    if (!token && contratoId) {
      const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
      const servico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      let liberado = !!bearer && bearer === servico;
      if (!liberado && bearer) {
        const { data: auth } = await supabase.auth.getUser(bearer);
        const uid = auth?.user?.id as string | undefined;
        if (uid) {
          const { data: perfil } = await supabase
            .from("profiles").select("parent_user_id, system_role").eq("id", uid).maybeSingle();
          const tenant = (perfil?.parent_user_id as string | null) ?? uid;
          const { data: ct } = await supabase
            .from("contratos").select("tenant_id").eq("id", contratoId).maybeSingle();
          liberado = perfil?.system_role === "platform_admin" || (!!ct && ct.tenant_id === tenant);
        }
      }
      if (!liberado) return jsonRes({ error: "nao_autorizado" }, 401);
    }
    const coluna = contratoId ? "id" : "chave_publica";
    const valor = contratoId ?? token;

    const { data: contrato, error } = await supabase
      .from("contratos")
      .select(COLUNAS)
      .eq(coluna, valor)
      .maybeSingle();

    if (error || !contrato) {
      return jsonRes({ error: "contrato não encontrado" }, 404);
    }

    const ct = contrato as unknown as ContratoPdf & { id: string; chave_publica: string };
    const bytes = await montarPdfContrato(ct);

    const caminho = `${ct.chave_publica}/contrato-assinado.pdf`;
    const up = await supabase.storage
      .from("contract-signatures")
      .upload(caminho, bytes, { contentType: "application/pdf", upsert: true });
    if (up.error) {
      return jsonRes({ error: `falha no upload: ${up.error.message}` }, 500);
    }

    const { data: pub } = supabase.storage
      .from("contract-signatures")
      .getPublicUrl(caminho);
    const pdfUrl = pub?.publicUrl ?? null;

    await supabase.from("contratos").update({ pdf_url: pdfUrl }).eq("id", ct.id);

    return jsonRes({ pdf_url: pdfUrl });
  } catch (err) {
    return jsonRes({ error: String(err) }, 500);
  }
});
