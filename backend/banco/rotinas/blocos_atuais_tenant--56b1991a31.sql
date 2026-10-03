CREATE OR REPLACE FUNCTION public.blocos_atuais_tenant(p_tenant_id uuid, p_gaveta text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_resultado jsonb;
v_query text;
BEGIN
  PERFORM set_config('search_path', 'public', true);
  PERFORM set_config('statement_timeout', '5s', true);

  IF p_gaveta NOT IN ('blocos_conhecimento','blocos_comportamento','blocos_gatilho','blocos_humanizacao','blocos_variacao','blocos_meta','blocos_procedurais','emocao_blocos','prova_social_blocos','acao_pausa_blocos','automacao_blocos','diretriz_bolha_blocos') THEN
    RETURN jsonb_build_object('erro', 'gaveta_invalida');
  END IF;

  v_query := format('SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM (SELECT id, escopo, ativo FROM public.%I WHERE (escopo=''tenant'' AND tenant_id=%L) OR escopo=''global'' OR (escopo=''nicho'') LIMIT 200) t', p_gaveta, p_tenant_id);
  EXECUTE v_query INTO v_resultado;

  RETURN coalesce(v_resultado, '[]'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('erro', SQLERRM);
END $function$

