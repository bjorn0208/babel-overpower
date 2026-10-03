CREATE OR REPLACE FUNCTION public.detectar_leads_duplicados(p_tenant_id uuid)
 RETURNS TABLE(lead_a uuid, lead_b uuid, motivo text, score numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$

