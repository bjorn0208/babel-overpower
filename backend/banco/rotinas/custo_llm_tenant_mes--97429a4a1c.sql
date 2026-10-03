CREATE OR REPLACE FUNCTION public.custo_llm_tenant_mes(p_tenant_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(sum(l.custo_total), 0)::numeric
    from public.logs_requisicao_llm l
   where l.tenant_id = p_tenant_id
     and l.created_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
$function$

