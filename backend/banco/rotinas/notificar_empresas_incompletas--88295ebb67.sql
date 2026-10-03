CREATE OR REPLACE FUNCTION public.notificar_empresas_incompletas()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tenant uuid;
  v_pontuacao int;
  v_faltantes text[];
  v_criadas int := 0;
BEGIN
  FOR v_tenant IN SELECT DISTINCT au.user_id FROM public.agentes_usuario au LOOP
    SELECT c.pontuacao, c.faltantes INTO v_pontuacao, v_faltantes
    FROM public.completude_empresa(v_tenant) c;

    CONTINUE WHEN v_pontuacao >= 80;

    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.notificacoes n
      WHERE n.user_id = v_tenant
        AND n.tipo = 'empresa_incompleta'
        AND (n.lida = false OR n.created_at > now() - interval '6 days')
    );

    INSERT INTO public.notificacoes (user_id, tipo, icone, titulo, mensagem, acao, acao_label)
    VALUES (
      v_tenant,
      'empresa_incompleta',
      'building-2',
      'Cadastro da empresa em ' || v_pontuacao || '%',
      'Seu agente vende melhor quando conhece a empresa. Falta: ' || array_to_string(v_faltantes, ', ') || '.',
      '/empresa',
      'Completar cadastro'
    );
    v_criadas := v_criadas + 1;
  END LOOP;

  RETURN v_criadas;
END;
$function$

