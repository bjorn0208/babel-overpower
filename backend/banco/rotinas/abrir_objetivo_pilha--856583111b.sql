CREATE OR REPLACE FUNCTION public.abrir_objetivo_pilha(p_conversa_id uuid, p_tenant_id uuid, p_objetivo text, p_contexto text DEFAULT NULL::text, p_lead_id uuid DEFAULT NULL::uuid, p_prioridade integer DEFAULT 5, p_origem text DEFAULT 'porteiro'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
BEGIN
  -- Limite duro: max 5 objetivos abertos por conversa
  IF (SELECT count(*) FROM public.pilha_objetivos 
      WHERE conversa_id = p_conversa_id AND status = 'aberto' AND deleted_at IS NULL) >= 5 THEN
    -- Fecha o mais antigo automaticamente
    UPDATE public.pilha_objetivos 
    SET status = 'expirado', fechado_em = now(), motivo_fechamento = 'limite excedido (max 5)'
    WHERE id = (SELECT id FROM public.pilha_objetivos 
                WHERE conversa_id = p_conversa_id AND status = 'aberto' AND deleted_at IS NULL
                ORDER BY criado_em ASC LIMIT 1);
  END IF;

  -- Não duplicar: se já tem objetivo igual aberto, retorna ele
  SELECT id INTO v_id FROM public.pilha_objetivos
  WHERE conversa_id = p_conversa_id 
    AND status = 'aberto' 
    AND deleted_at IS NULL
    AND lower(objetivo) = lower(p_objetivo)
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.pilha_objetivos
    (conversa_id, tenant_id, lead_id, objetivo, contexto, prioridade, origem)
  VALUES
    (p_conversa_id, p_tenant_id, p_lead_id, p_objetivo, p_contexto, p_prioridade, p_origem)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$

