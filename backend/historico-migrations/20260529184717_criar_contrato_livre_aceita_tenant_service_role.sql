DROP FUNCTION IF EXISTS public.criar_contrato_livre(text, text, uuid, uuid, jsonb, text, jsonb, text, integer, text, text, text);

CREATE OR REPLACE FUNCTION public.criar_contrato_livre(
  p_texto text,
  p_titulo text DEFAULT 'Contrato'::text,
  p_lead_id uuid DEFAULT NULL::uuid,
  p_conversa_id uuid DEFAULT NULL::uuid,
  p_dados_cliente jsonb DEFAULT '{}'::jsonb,
  p_origem text DEFAULT 'mestre_livre'::text,
  p_campos_obrigatorios jsonb DEFAULT '[]'::jsonb,
  p_instrucao_selfie text DEFAULT NULL::text,
  p_num_testemunhas integer DEFAULT 0,
  p_chave_pix text DEFAULT NULL::text,
  p_link_parcelamento text DEFAULT NULL::text,
  p_posicao_pagamento text DEFAULT NULL::text,
  p_tenant_id uuid DEFAULT NULL::uuid
)
 RETURNS TABLE(id uuid, chave_publica uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tenant_id uuid;
  v_agente_id uuid;
  v_id        uuid;
  v_chave     uuid := gen_random_uuid();
BEGIN
  IF p_texto IS NULL OR btrim(p_texto) = '' THEN
    RAISE EXCEPTION 'texto do contrato obrigatorio' USING ERRCODE = '22023';
  END IF;

  -- auth.uid() prevalece (frontend). Só usa p_tenant_id quando null (service_role / Mentor).
  v_tenant_id := COALESCE((SELECT auth.uid()), p_tenant_id);
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'autenticacao obrigatoria' USING ERRCODE = '42501';
  END IF;

  SELECT a.id INTO v_agente_id
  FROM public.agentes a
  WHERE a.user_id = v_tenant_id
  ORDER BY a.created_at ASC
  LIMIT 1;

  INSERT INTO public.contratos (
    chave_publica, conversa_id, lead_id, agente_id, tenant_id,
    titulo, texto_contrato, dados_cliente, status, origem,
    campos_obrigatorios, instrucao_selfie, num_testemunhas,
    chave_pix, link_parcelamento, posicao_pagamento, created_at
  ) VALUES (
    v_chave, p_conversa_id, p_lead_id, v_agente_id, v_tenant_id,
    p_titulo, p_texto, p_dados_cliente, 'pendente', p_origem,
    coalesce(p_campos_obrigatorios, '[]'::jsonb), p_instrucao_selfie,
    coalesce(p_num_testemunhas, 0),
    p_chave_pix, p_link_parcelamento, p_posicao_pagamento, now()
  )
  RETURNING public.contratos.id INTO v_id;

  RETURN QUERY SELECT v_id, v_chave;
END;
$function$;
;
