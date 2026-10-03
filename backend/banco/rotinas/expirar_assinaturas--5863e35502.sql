CREATE OR REPLACE FUNCTION public.expirar_assinaturas()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.assinaturas_usuario SET status = 'expirada', updated_at = now()
  WHERE status IN ('active','ativa') AND data_expiracao < now();
END;
$function$

