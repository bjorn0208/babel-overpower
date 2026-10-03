CREATE OR REPLACE FUNCTION public.definir_segredo_consulta(p_nome text, p_valor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.eh_admin_plataforma() THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'nao_autorizado');
  END IF;
  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'nome_vazio');
  END IF;

  SELECT id INTO v_id FROM vault.secrets WHERE name = p_nome;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_valor, p_nome, 'Credencial API de consulta');
  ELSE
    PERFORM vault.update_secret(v_id, p_valor);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$function$

