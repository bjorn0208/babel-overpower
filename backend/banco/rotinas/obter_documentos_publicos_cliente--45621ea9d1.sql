CREATE OR REPLACE FUNCTION public.obter_documentos_publicos_cliente(p_token uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lead_id uuid; v_result json;
BEGIN
  SELECT id INTO v_lead_id FROM public.leads WHERE chave_rastreamento = p_token LIMIT 1;
  IF v_lead_id IS NULL THEN RETURN '[]'::json; END IF;
  SELECT COALESCE(json_agg(json_build_object('id', d.id,'file_name', d.file_name,'label', d.label,'file_path', d.file_path,'file_type', d.file_type,'created_at', d.created_at) ORDER BY d.created_at DESC), '[]'::json) INTO v_result
  FROM public.documentos_cliente d WHERE d.lead_id = v_lead_id;
  RETURN v_result;
END;
$function$

