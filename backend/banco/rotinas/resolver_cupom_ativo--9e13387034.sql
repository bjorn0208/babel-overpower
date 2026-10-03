CREATE OR REPLACE FUNCTION public.resolver_cupom_ativo(p_tenant_id uuid, p_codigo text)
 RETURNS TABLE(campaign_id uuid, comissao_tipo text, comissao_valor numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  RETURN QUERY SELECT m.campaign_id, m.comissao_tipo, m.comissao_valor FROM public.meta_indicacao_campanha m
  JOIN public.campanhas c ON c.id = m.campaign_id
  WHERE m.tenant_id = p_tenant_id AND lower(m.cupom) = lower(p_codigo)
    AND c.status IN ('active','ativa') AND c.deleted_at IS NULL
    AND (c.ends_at IS NULL OR c.ends_at > now()) AND (c.starts_at <= now()) LIMIT 1;
END;
$function$

