CREATE OR REPLACE FUNCTION public.fechar_objetivo_pilha(p_objetivo_id uuid, p_motivo text DEFAULT 'atendido'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.pilha_objetivos
  SET status = 'fechado', fechado_em = now(), motivo_fechamento = p_motivo
  WHERE id = p_objetivo_id AND status = 'aberto';
  RETURN FOUND;
END;
$function$

