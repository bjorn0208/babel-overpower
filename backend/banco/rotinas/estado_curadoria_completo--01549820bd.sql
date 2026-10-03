CREATE OR REPLACE FUNCTION public.estado_curadoria_completo()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_resultado jsonb;
BEGIN
  PERFORM set_config('search_path', 'public', true);
  PERFORM set_config('statement_timeout', '5s', true);

  SELECT jsonb_build_object(
    'gavetas', jsonb_build_object(
      'blocos_conhecimento',     (SELECT COUNT(*) FROM public.blocos_conhecimento WHERE ativo IS NOT FALSE),
      'blocos_comportamento',      (SELECT COUNT(*) FROM public.blocos_comportamento WHERE ativo IS NOT FALSE),
      'blocos_gatilho',       (SELECT COUNT(*) FROM public.blocos_gatilho WHERE ativo IS NOT FALSE),
      'blocos_humanizacao',         (SELECT COUNT(*) FROM public.blocos_humanizacao WHERE ativo IS NOT FALSE),
      'blocos_variacao',     (SELECT COUNT(*) FROM public.blocos_variacao WHERE ativo IS NOT FALSE),
      'blocos_meta',          (SELECT COUNT(*) FROM public.blocos_meta WHERE ativo IS NOT FALSE),
      'blocos_procedurais',    (SELECT COUNT(*) FROM public.blocos_procedurais WHERE ativo IS NOT FALSE),
      'emocao_blocos',        (SELECT COUNT(*) FROM public.emocao_blocos WHERE ativo IS NOT FALSE),
      'prova_social_blocos',  (SELECT COUNT(*) FROM public.prova_social_blocos WHERE ativo IS NOT FALSE),
      'manipulacao_blocos',   (SELECT COUNT(*) FROM public.manipulacao_blocos WHERE ativo IS NOT FALSE),
      'diretriz_bolha_blocos',(SELECT COUNT(*) FROM public.diretriz_bolha_blocos WHERE ativo IS NOT FALSE),
      'automacao_blocos',     (SELECT COUNT(*) FROM public.automacao_blocos WHERE ativo IS NOT FALSE),
      'acao_pausa_blocos',    (SELECT COUNT(*) FROM public.acao_pausa_blocos WHERE ativo IS NOT FALSE),
      'regras_operacionais_blocos', (SELECT COUNT(*) FROM public.regras_operacionais_blocos WHERE ativo IS NOT FALSE)
    ),
    'tenants_ativos', (SELECT COUNT(*) FROM public.profiles WHERE system_role='user' AND deletion_requested_at IS NULL),
    'reflexoes_7d', (SELECT COUNT(*) FROM public.registro_reflexao WHERE criado_em > now() - interval '7 days' AND deleted_at IS NULL),
    'candidates_pendentes', (SELECT COUNT(*) FROM public.candidatos_bloco WHERE status IN ('pendente','pending')),
    'gerado_em', now()
  ) INTO v_resultado;

  RETURN v_resultado;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('erro', SQLERRM);
END $function$

