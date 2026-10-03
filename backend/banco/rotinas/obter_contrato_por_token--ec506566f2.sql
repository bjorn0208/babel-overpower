CREATE OR REPLACE FUNCTION public.obter_contrato_por_token(p_token uuid)
 RETURNS TABLE(id uuid, chave_publica uuid, titulo text, texto_contrato text, logo_url text, descricao_empresa text, nome_empresa text, cor_pagina text, dados_cliente jsonb, status text, assinado_em timestamp with time zone, campos_obrigatorios jsonb, instrucao_selfie text, num_testemunhas integer, campos_cliente text[], opcoes_pagamento jsonb, metodo_pagamento text, posicao_pagamento text, chave_pix text, link_parcelamento text, url_comprovante_pagamento text, pdf_url text, conversa_id uuid, agente_id uuid, origem text, placeholders jsonb, dados_pagamento jsonb, forma_pagamento_escolhida jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_user_agent text;
  v_ip text;
  v_headers jsonb;
BEGIN
  IF p_token IS NULL THEN
    RAISE EXCEPTION 'token obrigatorio' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
    v_user_agent := v_headers->>'user-agent';
    v_ip := COALESCE(split_part(v_headers->>'x-forwarded-for', ',', 1),
                     v_headers->>'cf-connecting-ip');
    INSERT INTO public.log_acesso_contrato (chave_publica, evento, user_agent, ip)
    VALUES (p_token, 'carregamento', v_user_agent, v_ip);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN QUERY
  SELECT
    c.id, c.chave_publica, c.titulo, c.texto_contrato,
    -- Logo viva: empresas manda; snapshot do contrato e fallback.
    COALESCE(e.logo_url, c.logo_url)        AS logo_url,
    c.descricao_empresa, c.nome_empresa, c.cor_pagina,
    c.dados_cliente, c.status, c.assinado_em,
    c.campos_obrigatorios, c.instrucao_selfie, c.num_testemunhas,
    c.campos_cliente, c.opcoes_pagamento, c.metodo_pagamento,
    c.posicao_pagamento, c.chave_pix, c.link_parcelamento,
    c.url_comprovante_pagamento, c.pdf_url, c.conversa_id,
    c.agente_id, c.origem,
    COALESCE(NULLIF(c.campos_formulario, '[]'::jsonb), NULLIF(ct.campos_cliente, '[]'::jsonb), ct.placeholders, '[]'::jsonb) AS placeholders,
    c.dados_pagamento, c.forma_pagamento_escolhida
  FROM public.contratos c
  LEFT JOIN public.contratos_template ct
    ON ct.nome = c.nome_template AND ct.user_id = c.tenant_id
  LEFT JOIN public.empresas e
    ON e.user_id = c.tenant_id
  WHERE c.chave_publica = p_token
  LIMIT 1;
END;
$function$

