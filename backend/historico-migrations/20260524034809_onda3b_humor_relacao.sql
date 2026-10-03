-- Onda 3B — humor da relação (estado afetivo persistente lead×agente).
-- Russell (1980) circumplex (valência × ativação) + Ekman (emoção ≠ humor).
-- Preenchido no SONO (cron noturno, SQL puro determinístico, zero LLM). Lido no turno (1 SELECT).

-- 1) Mapa emoção→afeto: tabela-dado curável. Cobre as emoções reais do extrator;
--    emoção desconhecida cai em neutro via LEFT JOIN + COALESCE no recomputo.
CREATE TABLE IF NOT EXISTS public.mapa_emocao_afeto (
  emocao    text PRIMARY KEY,
  valencia  numeric NOT NULL,   -- -1 (negativo) .. 1 (positivo)
  ativacao  numeric NOT NULL,   -- 0 (calmo) .. 1 (intenso)
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mapa_emocao_afeto ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='mapa_emocao_afeto' AND policyname='mapa_emocao_afeto_leitura'
  ) THEN
    CREATE POLICY "mapa_emocao_afeto_leitura" ON public.mapa_emocao_afeto
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

INSERT INTO public.mapa_emocao_afeto (emocao, valencia, ativacao) VALUES
  ('neutro',        0.0, 0.3),
  ('preocupado',   -0.4, 0.6),
  ('esperançoso',   0.5, 0.5),
  ('curioso',       0.3, 0.6),
  ('frustrado',    -0.6, 0.7),
  ('entusiasmado',  0.7, 0.8),
  ('desconfiante', -0.3, 0.5),
  ('ansioso',      -0.4, 0.8),
  ('alegre',        0.7, 0.6),
  ('resistente',   -0.4, 0.5),
  ('surpreso',      0.1, 0.8),
  ('urgente',      -0.1, 0.9),
  ('confuso',      -0.2, 0.5),
  ('desesperado',  -0.8, 0.9),
  ('aliviado',      0.5, 0.3),
  ('informativo',   0.0, 0.3),
  ('tranquilo',     0.4, 0.2),
  ('decepção',     -0.6, 0.4),
  ('determinado',   0.4, 0.7)
ON CONFLICT (emocao) DO NOTHING;

-- 2) Estado afetivo persistente por (lead, agente). Diferente de memoria_episodica.emocao (por episódio).
CREATE TABLE IF NOT EXISTS public.estado_afetivo_lead (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  agente_id         uuid NOT NULL,
  tenant_id         uuid NOT NULL,
  valencia          numeric NOT NULL DEFAULT 0,     -- -1 .. 1
  ativacao          numeric NOT NULL DEFAULT 0.3,   -- 0 .. 1
  confianca         numeric NOT NULL DEFAULT 0.5,   -- confiança do agente no lead 0 .. 1
  ultima_ruptura_em timestamptz,
  resumo_humor      text,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='estado_afetivo_lead_lead_agente_uk') THEN
    ALTER TABLE public.estado_afetivo_lead
      ADD CONSTRAINT estado_afetivo_lead_lead_agente_uk UNIQUE (lead_id, agente_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS estado_afetivo_lead_lead_idx   ON public.estado_afetivo_lead (lead_id);
CREATE INDEX IF NOT EXISTS estado_afetivo_lead_tenant_idx ON public.estado_afetivo_lead (tenant_id);

ALTER TABLE public.estado_afetivo_lead ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='estado_afetivo_lead' AND policyname='estado_afetivo_lead_tenant'
  ) THEN
    CREATE POLICY "estado_afetivo_lead_tenant" ON public.estado_afetivo_lead
      FOR ALL TO authenticated
      USING (tenant_id = (select auth.uid()))
      WITH CHECK (tenant_id = (select auth.uid()));
  END IF;
END $$;

-- 3) Recomputo determinístico no SONO: média ponderada por (decay_factor × relevancia)
--    das emoções dos episódios recentes. Agente vem de conversas.agente_id (memoria_episodica não tem).
CREATE OR REPLACE FUNCTION public.recomputar_humor_relacao(p_dias integer DEFAULT 30)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
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
$function$;
;
