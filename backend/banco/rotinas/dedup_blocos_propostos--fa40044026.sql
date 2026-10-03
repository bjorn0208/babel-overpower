CREATE OR REPLACE FUNCTION public.dedup_blocos_propostos(p_propostas jsonb, p_threshold numeric DEFAULT 0.85)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Stub · dedup real será implementado no Sprint 6 com embedding match
  RETURN p_propostas;
END $function$

