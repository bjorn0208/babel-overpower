CREATE OR REPLACE FUNCTION public.buscar_triggers_temporais(p_condicao_tipo text, p_escopo text DEFAULT NULL::text, p_nicho_id uuid DEFAULT NULL::uuid, p_tenant_id uuid DEFAULT NULL::uuid, p_fase_aplicavel text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, nome_trigger text, tempo_aguardar_minutos integer, acao_disparada text, acao_payload jsonb, fase_aplicavel text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- Δ 2026-09-15 (Amorim): tenant com gatilho PRÓPRIO (linha escopo='tenant', ativa OU
  -- inativa, não deletada) pro condicao_tipo SUBSTITUI os globais/nicho desse tipo — senão a
  -- cadência sob medida ("a cada 2 dias") somava com a global (1h/6h/24h/3d). Linha inativa
  -- serve pra só desligar os globais de um tipo. Sem linha de tenant: comportamento antigo.
  WITH tem_proprio AS (
    SELECT EXISTS (
      SELECT 1 FROM public.blocos_gatilho g
      WHERE g.escopo = 'tenant' AND g.tenant_id = p_tenant_id
        AND g.condicao_tipo = p_condicao_tipo AND g.deleted_at IS NULL
    ) AS sim
  )
  SELECT
    tc.id,
    tc.nome_trigger,
    tc.tempo_aguardar_minutos,
    tc.acao_disparada,
    tc.acao_payload,
    tc.fase_aplicavel
  FROM public.blocos_gatilho tc, tem_proprio
  WHERE tc.ativo = true
    AND tc.deleted_at IS NULL
    AND tc.condicao_tipo = p_condicao_tipo
    AND (
      p_fase_aplicavel IS NULL
      OR tc.fase_aplicavel = p_fase_aplicavel
      OR tc.fase_aplicavel IS NULL
    )
    AND (
      (p_escopo = 'global' AND tc.escopo = 'global')
      OR (p_escopo = 'nicho'
          AND tc.escopo IN ('global', 'nicho')
          AND (tc.nicho_id = p_nicho_id OR tc.escopo = 'global'))
      OR (p_escopo = 'tenant'
          AND (
            (NOT tem_proprio.sim AND tc.escopo = 'global')
            OR (NOT tem_proprio.sim AND tc.escopo = 'nicho' AND tc.nicho_id = p_nicho_id)
            OR (tc.escopo = 'tenant' AND tc.tenant_id = p_tenant_id)
          ))
      OR p_escopo IS NULL
    )
  ORDER BY
    CASE tc.escopo
      WHEN 'tenant' THEN 1
      WHEN 'nicho'  THEN 2
      WHEN 'global' THEN 3
      ELSE 4
    END,
    tc.tempo_aguardar_minutos ASC;
$function$

