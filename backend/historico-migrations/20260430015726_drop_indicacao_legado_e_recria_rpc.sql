-- 1) Drop e recria RPC resolver_cupom_ativo (mudança de coluna OUT campanha_id → campaign_id)
DROP FUNCTION IF EXISTS public.resolver_cupom_ativo(uuid, text);

CREATE FUNCTION public.resolver_cupom_ativo(p_tenant_id uuid, p_codigo text)
RETURNS TABLE(campaign_id uuid, comissao_tipo text, comissao_valor numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
BEGIN
  RETURN QUERY
  SELECT m.campaign_id, m.comissao_tipo, m.comissao_valor
  FROM public.campaign_indicacao_meta m
  JOIN public.campaigns c ON c.id = m.campaign_id
  WHERE m.tenant_id = p_tenant_id
    AND lower(m.cupom) = lower(p_codigo)
    AND c.status = 'active'
    AND c.deleted_at IS NULL
    AND (c.ends_at IS NULL OR c.ends_at > now())
    AND (c.starts_at <= now())
  LIMIT 1;
END;
$function$;

-- 2) Limpa testes
DELETE FROM public.indicacao_comissoes;
DELETE FROM public.indicacao_campanhas;

-- 3) Drop coluna legada em leads
ALTER TABLE public.leads DROP COLUMN IF EXISTS indicacao_campanha_id;

-- 4) Drop tabelas legadas
DROP TABLE IF EXISTS public.indicacao_comissoes CASCADE;
DROP TABLE IF EXISTS public.indicacao_campanhas CASCADE;
;
