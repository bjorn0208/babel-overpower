CREATE OR REPLACE FUNCTION public.exportar_meus_dados()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'profile', (
      SELECT row_to_json(p)::jsonb FROM public.profiles p WHERE p.id = v_uid
    ),
    'leads', (
      SELECT COALESCE(jsonb_agg(row_to_json(l)::jsonb), '[]'::jsonb)
      FROM public.leads l WHERE l.tenant_id = v_uid
    ),
    'contratos', (
      SELECT COALESCE(jsonb_agg(row_to_json(c)::jsonb), '[]'::jsonb)
      FROM public.contratos c WHERE c.tenant_id = v_uid
    ),
    'comissoes', (
      SELECT COALESCE(jsonb_agg(row_to_json(mc)::jsonb), '[]'::jsonb)
      FROM public.multinivel_comissoes mc WHERE mc.beneficiario_id = v_uid
    ),
    'saques', (
      SELECT COALESCE(jsonb_agg(row_to_json(ms)::jsonb), '[]'::jsonb)
      FROM public.multinivel_saques ms WHERE ms.user_id = v_uid
    ),
    'pedidos_compra', (
      SELECT COALESCE(jsonb_agg(row_to_json(po)::jsonb), '[]'::jsonb)
      FROM public.pedidos_compra po WHERE po.user_id = v_uid
    ),
    'activity_logs', (
      SELECT COALESCE(jsonb_agg(row_to_json(al)::jsonb), '[]'::jsonb)
      FROM public.activity_logs al WHERE al.user_id = v_uid
    ),
    'exported_at', now()::text
  ) INTO v_result;
  
  -- Log a exportacao
  INSERT INTO public.activity_logs (user_id, action, entity_type, metadata)
  VALUES (v_uid, 'export_data', 'profile', '{"type":"lgpd_export"}'::jsonb);
  
  RETURN v_result;
END;
$function$

