CREATE OR REPLACE FUNCTION public.obter_consulta_por_token(p_token uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'chave_publica', c.chave_publica,
    'titulo', c.titulo,
    'nome_empresa', COALESCE(c.nome_empresa, e.nome),
    'logo_url', COALESCE(c.logo_url, e.logo_url),
    'banner_url', COALESCE(c.banner_url, e.banner_url),
    'cor_pagina', c.cor_pagina,
    'tipo_doc', COALESCE(c.tipo_doc, t.tipo_doc),
    'preco', c.preco,
    'chave_pix', COALESCE(c.chave_pix, cfg.chave_pix, p.chave_pix),
    'campos_obrigatorios', c.campos_obrigatorios,
    'campos_formulario', COALESCE(cfg.campos_formulario, '[]'::jsonb),
    'instrucao_selfie', c.instrucao_selfie,
    'aviso_final', c.aviso_final,
    'status', c.status,
    'resultado', CASE WHEN c.status = 'concluida' THEN c.resultado ELSE NULL END,
    'pdf_url', CASE WHEN c.status = 'concluida' THEN c.pdf_url ELSE NULL END
  )
  FROM public.consultas c
  LEFT JOIN public.consultas_tipos t ON t.id = c.tipo_id
  LEFT JOIN public.empresas e ON e.user_id = c.tenant_id
  LEFT JOIN public.consultas_config_tenant cfg ON cfg.tenant_id = c.tenant_id
  LEFT JOIN public.profiles p ON p.id = c.tenant_id
  WHERE c.chave_publica = p_token AND c.deleted_at IS NULL;
$function$;
;
