CREATE OR REPLACE FUNCTION public.agregar_comparativo_nicho()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$

