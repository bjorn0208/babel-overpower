-- App Consulta F5 — link público: bucket de anexos + RPCs por token (anon)

-- 1. Bucket privado pros anexos do cliente (selfie/doc/comprovante)
INSERT INTO storage.buckets (id, name, public)
VALUES ('consultas-anexos', 'consultas-anexos', false)
ON CONFLICT (id) DO NOTHING;

-- Upload anônimo (cliente do link sobe anexo); leitura só service_role/signed URL
DROP POLICY IF EXISTS "consulta_anon_upload" ON storage.objects;
CREATE POLICY "consulta_anon_upload" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'consultas-anexos');

-- 2. Leitura pública por token — só campos do link, nunca tenant_id/custo interno
CREATE OR REPLACE FUNCTION public.obter_consulta_por_token(p_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'chave_publica', c.chave_publica,
    'titulo', c.titulo,
    'nome_empresa', c.nome_empresa,
    'logo_url', c.logo_url,
    'banner_url', c.banner_url,
    'cor_pagina', c.cor_pagina,
    'tipo_doc', COALESCE(c.tipo_doc, t.tipo_doc),
    'preco', c.preco,
    'chave_pix', c.chave_pix,
    'campos_obrigatorios', c.campos_obrigatorios,
    'instrucao_selfie', c.instrucao_selfie,
    'aviso_final', c.aviso_final,
    'status', c.status,
    -- resultado e pdf só quando concluída (PII de dívida não vaza antes)
    'resultado', CASE WHEN c.status = 'concluida' THEN c.resultado ELSE NULL END,
    'pdf_url', CASE WHEN c.status = 'concluida' THEN c.pdf_url ELSE NULL END
  )
  FROM public.consultas c
  LEFT JOIN public.consultas_tipos t ON t.id = c.tipo_id
  WHERE c.chave_publica = p_token AND c.deleted_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.obter_consulta_por_token(uuid) TO anon, authenticated;

-- 3. Submissão do cliente — grava dados/documento/anexos e marca comprovante enviado
CREATE OR REPLACE FUNCTION public.submeter_consulta_publica(p_token uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_status text;
  v_origem text;
BEGIN
  SELECT id, status, origem INTO v_id, v_status, v_origem
  FROM public.consultas
  WHERE chave_publica = p_token AND deleted_at IS NULL
  FOR UPDATE;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'consulta_nao_encontrada');
  END IF;
  IF v_origem <> 'link' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'consulta_nao_e_link');
  END IF;
  IF v_status IN ('consultando', 'concluida') THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'consulta_ja_processada');
  END IF;

  UPDATE public.consultas SET
    documento = COALESCE(p_payload->>'documento', documento),
    tipo_doc = COALESCE(p_payload->>'tipo_doc', tipo_doc),
    dados_cliente = COALESCE(p_payload->'dados_cliente', dados_cliente),
    url_selfie = COALESCE(p_payload->>'url_selfie', url_selfie),
    url_documento = COALESCE(p_payload->>'url_documento', url_documento),
    url_comprovante_pagamento = COALESCE(p_payload->>'url_comprovante', url_comprovante_pagamento),
    status = 'comprovante_enviado'
  WHERE id = v_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submeter_consulta_publica(uuid, jsonb) TO anon, authenticated;
;
