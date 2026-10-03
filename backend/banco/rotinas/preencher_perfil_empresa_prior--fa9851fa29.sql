CREATE OR REPLACE FUNCTION public.preencher_perfil_empresa_prior()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tem_metricas boolean;
BEGIN
  -- Só dispara se profile tem nicho_id E não já existe perfil_empresa pro tenant
  IF NEW.nicho_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.perfil_empresa WHERE tenant_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Verificar se nicho tem ≥1 métrica em comparativo_nicho (k-anon já garante count_tenants≥10)
  SELECT EXISTS (
    SELECT 1 FROM public.comparativo_nicho cn
    WHERE cn.nicho_id = NEW.nicho_id AND (cn.expira_em IS NULL OR cn.expira_em > now())
  ) INTO v_tem_metricas;

  IF NOT v_tem_metricas THEN RETURN NEW; END IF;

  -- Criar perfil_empresa com prior herdado
  INSERT INTO public.perfil_empresa (
    tenant_id,
    ticket_medio_estimado,
    prazo_decisao_medio_dias,
    taxa_conversao_estimada,
    origem_por_campo
  )
  SELECT
    NEW.id,
    (SELECT valor_anonimizado FROM public.comparativo_nicho WHERE nicho_id = NEW.nicho_id AND metrica = 'ticket_medio' LIMIT 1),
    (SELECT (valor_anonimizado * 1)::int FROM public.comparativo_nicho WHERE nicho_id = NEW.nicho_id AND metrica = 'prazo_decisao_dias' LIMIT 1),
    (SELECT valor_anonimizado FROM public.comparativo_nicho WHERE nicho_id = NEW.nicho_id AND metrica = 'taxa_conversao' LIMIT 1),
    '{
      "ticket_medio_estimado": "prior_nicho",
      "prazo_decisao_medio_dias": "prior_nicho",
      "taxa_conversao_estimada": "prior_nicho"
    }'::jsonb
  ON CONFLICT (tenant_id) DO NOTHING;

  RETURN NEW;
END;
$function$

