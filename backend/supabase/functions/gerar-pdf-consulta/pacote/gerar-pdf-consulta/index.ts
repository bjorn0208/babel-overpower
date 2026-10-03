/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
/**
 * gerar-pdf-consulta — gera o PDF do resultado (pdf-lib), sobe no bucket
 * `consultas-anexos` e grava `pdf_url`. Disparada pelo link público (hook
 * gerarPdf) e disponível como fallback no app interno.
 *
 * verify_jwt: false — recebe `token` (chave_publica) ou `consulta_id`; usa
 * service_role (a chave pública já é o segredo do link). Só gera quando
 * status='concluida' e há resultado.
 */

import { corsOk, jsonRes } from "../_shared/cors.ts";
import { criarClienteAdmin } from "../_shared/supabase.ts";
import { montarPdfConsulta, type ConsultaPdf } from "../_shared/montar-pdf-consulta.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsOk();

  try {
    const body = await req.json().catch(() => ({}));
    const token: string | null = body?.token ?? body?.chave ?? null;
    const consultaId: string | null = body?.consulta_id ?? null;
    if (!token && !consultaId) return jsonRes({ error: "token ou consulta_id obrigatório" }, 400);

    const supabase = criarClienteAdmin();
    const coluna = consultaId ? "id" : "chave_publica";
    const valor = consultaId ?? token;

    const { data: c, error } = await supabase
      .from("consultas")
      .select("id, tenant_id, chave_publica, titulo, nome_empresa, documento, tipo_doc, resultado, consultada_em, status, pdf_url")
      .eq(coluna, valor)
      .is("deleted_at", null)
      .maybeSingle();

    if (error || !c) return jsonRes({ error: "consulta não encontrada" }, 404);
    if (c.status !== "concluida" || !c.resultado) {
      return jsonRes({ error: "consulta sem resultado ainda" }, 409);
    }
    // Sempre regenera (upsert sobrescreve): garante que template, branding do
    // tenant e dados atuais reflitam no PDF. cache-control do storage = no-cache.

    // Branding do tenant (logo/banner/nome) — fonte canônica é `empresas` (por user_id).
    const { data: emp } = await supabase
      .from("empresas")
      .select("nome, logo_url, banner_url")
      .eq("user_id", c.tenant_id)
      .maybeSingle();

    const dados: ConsultaPdf = {
      ...(c as unknown as ConsultaPdf),
      nome_empresa: emp?.nome ?? c.nome_empresa ?? null,
      logo_url: emp?.logo_url ?? null,
      banner_url: emp?.banner_url ?? null,
    };
    const bytes = await montarPdfConsulta(dados);

    const caminho = `${c.chave_publica}/resultado-consulta.pdf`;
    const up = await supabase.storage
      .from("consultas-anexos")
      .upload(caminho, bytes, { contentType: "application/pdf", upsert: true });
    if (up.error) return jsonRes({ error: `falha no upload: ${up.error.message}` }, 500);

    const { data: pub } = supabase.storage.from("consultas-anexos").getPublicUrl(caminho);
    // Cache-busting: a URL do storage é fixa; sem isso o navegador reusa o PDF
    // antigo que já abriu. `?v=<timestamp>` força a buscar a versão recém-gerada.
    const pdfUrl = pub?.publicUrl ? `${pub.publicUrl}?v=${Date.now()}` : null;

    await supabase.from("consultas").update({ pdf_url: pdfUrl }).eq("id", c.id);

    return jsonRes({ ok: true, pdf_url: pdfUrl });
  } catch (err) {
    return jsonRes({ error: String(err) }, 500);
  }
});
