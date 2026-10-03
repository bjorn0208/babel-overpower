CREATE OR REPLACE FUNCTION public.solicitar_exclusao_conta()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  UPDATE public.profiles 
  SET deletion_requested_at = now()
  WHERE id = v_uid;
  
  INSERT INTO public.activity_logs (user_id, action, entity_type, metadata)
  VALUES (v_uid, 'request_deletion', 'profile', '{"type":"lgpd_deletion_request"}'::jsonb);
END;
$function$

