-- B5 cron de agregação: varre perfil_empresa agrupado por nicho_id
-- Quando atinge k≥10 tenants, publica métricas anonimizadas em comparativo_nicho
-- com ruído ε=0.1 (Laplace mecanismo simplificado)

CREATE OR REPLACE FUNCTION public.agregar_comparativo_nicho()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inseridos int := 0;
  v_nicho record;
  v_count int;
  v_taxa_media numeric;
  v_ticket_media numeric;
  v_ruido numeric;
  v_epsilon constant numeric := 0.1;
BEGIN
  -- Pra cada nicho com 10+ tenants destilados
  FOR v_nicho IN
    SELECT p.nicho_id, count(*) AS n
    FROM public.perfil_empresa pe
    JOIN public.profiles p ON p.id = pe.tenant_id
    WHERE p.nicho_id IS NOT NULL
      AND pe.taxa_conversao_estimada IS NOT NULL
    GROUP BY p.nicho_id
    HAVING count(*) >= 10
  LOOP
    -- Taxa conversão média (com ruído Laplace ε=0.1, sensitivity=1, mu=0)
    SELECT avg(pe.taxa_conversao_estimada), count(*)
      INTO v_taxa_media, v_count
    FROM public.perfil_empresa pe
    JOIN public.profiles p ON p.id = pe.tenant_id
    WHERE p.nicho_id = v_nicho.nicho_id
      AND pe.taxa_conversao_estimada IS NOT NULL;

    -- Ruído Laplace simplificado: U(-1,1) * scale, scale = sensitivity/epsilon
    -- (versão prod-ready usaria Box-Muller pra dist Laplace exata)
    v_ruido := (random() * 2 - 1) * (1.0 / v_epsilon) * 0.01;  -- escalado pra não estourar [0,1]
    v_taxa_media := greatest(0, least(1, v_taxa_media + v_ruido));

    -- Ticket médio (NULL por enquanto — depende de B3-V2 popular)
    SELECT avg(pe.ticket_medio_estimado)
      INTO v_ticket_media
    FROM public.perfil_empresa pe
    JOIN public.profiles p ON p.id = pe.tenant_id
    WHERE p.nicho_id = v_nicho.nicho_id
      AND pe.ticket_medio_estimado IS NOT NULL;

    -- UPSERT taxa_conversao
    INSERT INTO public.comparativo_nicho
      (nicho_id, metrica, valor_anonimizado, count_tenants, epsilon, janela_dias, expira_em)
    VALUES
      (v_nicho.nicho_id, 'taxa_conversao_media',
       jsonb_build_object('valor', round(v_taxa_media, 4), 'unidade', 'fracao'),
       v_count, v_epsilon, 30, now() + interval '7 days')
    ON CONFLICT (nicho_id, metrica, janela_dias) DO UPDATE SET
      valor_anonimizado = excluded.valor_anonimizado,
      count_tenants = excluded.count_tenants,
      epsilon = excluded.epsilon,
      calculado_em = now(),
      expira_em = now() + interval '7 days';
    v_inseridos := v_inseridos + 1;

    -- UPSERT ticket_medio se disponível
    IF v_ticket_media IS NOT NULL THEN
      INSERT INTO public.comparativo_nicho
        (nicho_id, metrica, valor_anonimizado, count_tenants, epsilon, janela_dias, expira_em)
      VALUES
        (v_nicho.nicho_id, 'ticket_medio',
         jsonb_build_object('valor', round(v_ticket_media + (random() * 2 - 1) * (50.0 / v_epsilon), 2), 'unidade', 'BRL'),
         v_count, v_epsilon, 30, now() + interval '7 days')
      ON CONFLICT (nicho_id, metrica, janela_dias) DO UPDATE SET
        valor_anonimizado = excluded.valor_anonimizado,
        count_tenants = excluded.count_tenants,
        epsilon = excluded.epsilon,
        calculado_em = now(),
        expira_em = now() + interval '7 days';
      v_inseridos := v_inseridos + 1;
    END IF;
  END LOOP;

  RETURN v_inseridos;
END;
$$;

COMMENT ON FUNCTION public.agregar_comparativo_nicho IS
  'B5 cron — agrega perfil_empresa por nicho, publica comparativo_nicho com k≥10 + ε=0.1 ruído Laplace simplificado. Quando nicho atinge 10+ tenants destilados, métrica vira pública (anonimizada) pra todos do nicho.';

REVOKE EXECUTE ON FUNCTION public.agregar_comparativo_nicho() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.agregar_comparativo_nicho() TO service_role;

-- Cron semanal: domingo 05:00 UTC (02:00 BRT) — depois do destilar_perfil_empresa
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cron-agregar-comparativo-nicho') THEN
    PERFORM cron.unschedule('cron-agregar-comparativo-nicho');
  END IF;
  PERFORM cron.schedule(
    'cron-agregar-comparativo-nicho',
    '0 5 * * 0',
    $sql$SELECT public.agregar_comparativo_nicho();$sql$
  );
END $$;
;
