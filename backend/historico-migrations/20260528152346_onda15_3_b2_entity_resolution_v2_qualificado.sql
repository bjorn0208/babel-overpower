-- Onda 15.3 v2 — qualificar extensions.similarity
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS mesclado_em uuid REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_mesclado_em
  ON public.leads(mesclado_em) WHERE mesclado_em IS NOT NULL;

CREATE OR REPLACE FUNCTION public.normalizar_telefone(p_tel text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT regexp_replace(coalesce(p_tel, ''), '[^0-9]', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.detectar_leads_duplicados(p_tenant_id uuid)
RETURNS TABLE (lead_a uuid, lead_b uuid, motivo text, score numeric)
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT 
    a.id AS lead_a,
    b.id AS lead_b,
    CASE 
      WHEN public.normalizar_telefone(a.phone) = public.normalizar_telefone(b.phone) 
        AND public.normalizar_telefone(a.phone) <> '' THEN 'telefone_identico'
      WHEN extensions.similarity(coalesce(a.name,''), coalesce(b.name,'')) > 0.7 THEN 'nome_similar'
      ELSE 'outros'
    END AS motivo,
    GREATEST(
      CASE WHEN public.normalizar_telefone(a.phone) = public.normalizar_telefone(b.phone) 
              AND public.normalizar_telefone(a.phone) <> '' THEN 1.0 ELSE 0 END,
      extensions.similarity(coalesce(a.name,''), coalesce(b.name,''))::numeric
    )::numeric AS score
  FROM public.leads a
  JOIN public.leads b ON a.id < b.id
  WHERE a.tenant_id = p_tenant_id AND b.tenant_id = p_tenant_id
    AND a.deleted_at IS NULL AND b.deleted_at IS NULL
    AND a.mesclado_em IS NULL AND b.mesclado_em IS NULL
    AND (
      (public.normalizar_telefone(a.phone) = public.normalizar_telefone(b.phone) AND public.normalizar_telefone(a.phone) <> '')
      OR extensions.similarity(coalesce(a.name,''), coalesce(b.name,'')) > 0.7
    )
  ORDER BY score DESC LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.normalizar_telefone TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.detectar_leads_duplicados TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mesclar_lead(p_lead_duplicado_id uuid, p_lead_canonico_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_a uuid; v_b uuid;
BEGIN
  SELECT tenant_id INTO v_a FROM public.leads WHERE id = p_lead_duplicado_id;
  SELECT tenant_id INTO v_b FROM public.leads WHERE id = p_lead_canonico_id;
  IF v_a IS NULL OR v_b IS NULL OR v_a <> v_b THEN
    RAISE EXCEPTION 'leads de tenants diferentes ou inexistentes';
  END IF;
  UPDATE public.leads SET mesclado_em = p_lead_canonico_id, deleted_at = now()
  WHERE id = p_lead_duplicado_id AND mesclado_em IS NULL;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mesclar_lead TO authenticated, service_role;

;
