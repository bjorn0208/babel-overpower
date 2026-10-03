CREATE OR REPLACE FUNCTION public.recalcular_pesos_gavetas_tenant(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_resultado jsonb := '{}'::jsonb;
BEGIN
  -- V1 placeholder: registra que rodou. V2 implementa lógica real de peso
  -- baseada em quantas vezes cada gaveta foi consultada em conversas convertidas vs perdidas.
  
  -- Pra V1: incrementa contador simbólico
  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', p_tenant_id,
    'recalculado_em', now(),
    'nota', 'V1 placeholder — implementação real do feedback loop pendente. Estrutura pronta pra V2.'
  );
END;
$function$

