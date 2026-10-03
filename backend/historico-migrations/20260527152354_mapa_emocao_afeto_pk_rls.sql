-- Adicionar PK + RLS na mapa_emocao_afeto (tabela existia com 19 rows sem proteção)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mapa_emocao_afeto_pkey' AND conrelid = 'public.mapa_emocao_afeto'::regclass
  ) THEN
    ALTER TABLE public.mapa_emocao_afeto ADD CONSTRAINT mapa_emocao_afeto_pkey PRIMARY KEY (emocao);
  END IF;
END $$;

ALTER TABLE public.mapa_emocao_afeto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mapa_emocao_afeto_leitura ON public.mapa_emocao_afeto;
DROP POLICY IF EXISTS mapa_emocao_afeto_admin_write ON public.mapa_emocao_afeto;

CREATE POLICY mapa_emocao_afeto_leitura ON public.mapa_emocao_afeto
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY mapa_emocao_afeto_admin_write ON public.mapa_emocao_afeto
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (select auth.uid()) AND ur.role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (select auth.uid()) AND ur.role = 'platform_admin'));

COMMENT ON TABLE public.mapa_emocao_afeto IS
  'Onda E — mapa de 19 emoções → valência (-1..1) + ativação (0..1). Editável só por platform_admin via Curadoria > Empatia.';

-- View: heatmap real de mudanças de humor (estado_afetivo_lead.atualizado_em últimos 7d)
DO $$
DECLARE
  v_existe boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='estado_afetivo_lead' AND column_name='atualizado_em'
  ) INTO v_existe;

  IF v_existe THEN
    EXECUTE $sql$
      CREATE OR REPLACE VIEW public.vw_heatmap_humor_7d
      WITH (security_invoker = true)
      AS
      WITH grid AS (
        SELECT
          dow.d AS dia_semana,
          hr.h AS hora
        FROM generate_series(0,6) AS dow(d)
        CROSS JOIN generate_series(0,23) AS hr(h)
      ),
      mudancas AS (
        SELECT
          EXTRACT(DOW FROM atualizado_em)::int AS dia_semana,
          EXTRACT(HOUR FROM atualizado_em)::int AS hora,
          count(*)::int AS qtd,
          coalesce(avg(valencia), 0)::numeric(4,2) AS valencia_media
        FROM public.estado_afetivo_lead
        WHERE atualizado_em >= now() - interval '7 days'
        GROUP BY 1, 2
      )
      SELECT
        g.dia_semana,
        g.hora,
        coalesce(m.qtd, 0) AS qtd,
        coalesce(m.valencia_media, 0) AS valencia_media
      FROM grid g
      LEFT JOIN mudancas m ON m.dia_semana = g.dia_semana AND m.hora = g.hora
      ORDER BY g.dia_semana, g.hora;
    $sql$;

    GRANT SELECT ON public.vw_heatmap_humor_7d TO authenticated, service_role;
  END IF;
END $$;
;
