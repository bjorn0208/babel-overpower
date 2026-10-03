CREATE OR REPLACE FUNCTION public.recomputar_humor_relacao(p_dias integer DEFAULT 30)
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH base AS (
    SELECT
      me.lead_id,
      c.agente_id,
      me.tenant_id,
      me.criado_em,
      COALESCE(me.decay_factor, 1.0) * COALESCE(me.relevancia, 0.5) AS peso,
      COALESCE(m.valencia, 0.0) AS valencia,
      COALESCE(m.ativacao, 0.3) AS ativacao
    FROM public.memoria_episodica me
    JOIN public.conversas c ON c.id = me.conversation_id
    LEFT JOIN public.mapa_emocao_afeto m ON m.emocao = me.emocao
    WHERE me.ativa = true
      AND me.lead_id IS NOT NULL
      AND c.agente_id IS NOT NULL
      AND me.criado_em >= now() - make_interval(days => p_dias)
  ),
  agreg AS (
    SELECT
      lead_id,
      agente_id,
      tenant_id,
      sum(valencia * peso) / NULLIF(sum(peso), 0) AS valencia,
      sum(ativacao * peso) / NULLIF(sum(peso), 0) AS ativacao,
      max(criado_em) FILTER (WHERE valencia < -0.4) AS ultima_ruptura_em
    FROM base
    GROUP BY lead_id, agente_id, tenant_id
  ),
  calc AS (
    SELECT
      lead_id, agente_id, tenant_id,
      round(GREATEST(-1, LEAST(1, COALESCE(valencia, 0)))::numeric, 3)             AS valencia,
      round(GREATEST(0,  LEAST(1, COALESCE(ativacao, 0.3)))::numeric, 3)           AS ativacao,
      round(GREATEST(0,  LEAST(1, 0.5 + 0.5 * COALESCE(valencia, 0)))::numeric, 3) AS confianca,
      ultima_ruptura_em
    FROM agreg
  ),
  up AS (
    INSERT INTO public.estado_afetivo_lead
      (lead_id, agente_id, tenant_id, valencia, ativacao, confianca, ultima_ruptura_em, resumo_humor, atualizado_em)
    SELECT
      lead_id, agente_id, tenant_id, valencia, ativacao, confianca, ultima_ruptura_em,
      CASE
        WHEN valencia >= 0.5  THEN 'relação calorosa, lead engajado'
        WHEN valencia >= 0.15 THEN 'relação positiva, lead receptivo'
        WHEN valencia > -0.15 THEN 'relação morna, lead neutro'
        WHEN valencia > -0.5  THEN 'relação fria, lead cético ou resistente'
        ELSE 'relação tensa, houve atrito — priorizar reparação'
      END,
      now()
    FROM calc
    ON CONFLICT (lead_id, agente_id) DO UPDATE SET
      tenant_id         = excluded.tenant_id,
      valencia          = excluded.valencia,
      ativacao          = excluded.ativacao,
      confianca         = excluded.confianca,
      ultima_ruptura_em = excluded.ultima_ruptura_em,
      resumo_humor      = excluded.resumo_humor,
      atualizado_em     = now()
    RETURNING 1
  )
  SELECT count(*)::int FROM up;
$function$

