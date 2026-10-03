CREATE OR REPLACE FUNCTION public.resetar_ciclo_assinatura(p_user_id uuid, p_dias integer DEFAULT 30)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.assinaturas_usuario SET conversas_usadas = 0, data_inicio = now(),
    data_expiracao = now() + (p_dias || ' days')::interval, updated_at = now()
  WHERE user_id = p_user_id AND status IN ('active','ativa');
END;
$function$

