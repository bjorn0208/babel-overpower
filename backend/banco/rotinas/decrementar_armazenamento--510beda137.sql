CREATE OR REPLACE FUNCTION public.decrementar_armazenamento(p_user_id uuid, p_bytes bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.assinaturas_usuario SET storage_used_bytes = GREATEST(0, storage_used_bytes - p_bytes), updated_at = now()
  WHERE user_id = p_user_id AND status IN ('active', 'ativa');
END;
$function$

