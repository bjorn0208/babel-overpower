-- obter_consulta_por_token: campos_obrigatorios passa a ser derivado dos toggles
-- VIVOS do tenant (cfg.selfie_ativo / cfg.doc_foto_ativo) em vez do snapshot
-- congelado em consultas.campos_obrigatorios. Assim ligar/desligar a exigência
-- de selfie/documento na config reflete na hora em TODO link público (atual ou
-- antigo), virando 1 fonte de verdade única.
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
    'preco_venda_cpf', cfg.preco_venda_cpf,
    'preco_venda_cnpj', cfg.preco_venda_cnpj,
    'chave_pix', COALESCE(c.chave_pix, cfg.chave_pix, p.chave_pix),
    -- Config viva: deriva da exigência ligada agora pelo tenant (não mais snapshot).
    'campos_obrigatorios',
      (CASE WHEN COALESCE(cfg.selfie_ativo, false) THEN jsonb_build_array('selfie') ELSE '[]'::jsonb END)
      || (CASE WHEN COALESCE(cfg.doc_foto_ativo, false) THEN jsonb_build_array('documento') ELSE '[]'::jsonb END),
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
