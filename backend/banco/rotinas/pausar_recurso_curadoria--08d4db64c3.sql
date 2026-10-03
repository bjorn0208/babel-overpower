CREATE OR REPLACE FUNCTION public.pausar_recurso_curadoria(p_chave text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = (SELECT auth.uid()) AND role IN ('admin','platform_admin')) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem permissao');
  END IF;
  UPDATE public.recursos_ativacao_curadoria
  SET status = 'pausado', atualizado_por = (SELECT auth.uid())
  WHERE chave_recurso = p_chave AND status <> 'bloqueado';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'erro', 'recurso bloqueado ou inexistente'); END IF;
  RETURN jsonb_build_object('ok', true);
END;
$function$

