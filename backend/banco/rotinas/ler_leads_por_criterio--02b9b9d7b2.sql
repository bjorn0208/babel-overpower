CREATE OR REPLACE FUNCTION public.ler_leads_por_criterio(p_tenant_id uuid, p_criterios jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(id uuid, nome text, phone text, temperatura_lead text, fase_pipeline text, desfecho text, origem_lead text, ultima_resposta_lead_em timestamp with time zone, dias_calado integer, comprou boolean, na_base boolean, opt_out boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  j jsonb := coalesce(p_criterios, '{}'::jsonb);
  v_limite integer := least(greatest(coalesce((coalesce(p_criterios, '{}'::jsonb)->>'limite')::int, 500), 1), 2000);
  v_tags text[] := array(select (t->>'chave') || ':' || (t->>'valor')
                           from jsonb_array_elements(coalesce(coalesce(p_criterios, '{}'::jsonb)->'tags', '[]'::jsonb)) t);
begin
  return query
  select l.id, coalesce(l.nome_exibicao, l.name) as nome, l.phone, l.temperatura_lead, l.fase_pipeline, l.desfecho,
         l.origem_lead, l.ultima_resposta_lead_em,
         greatest(0, extract(day from now() - l.ultima_resposta_lead_em))::integer as dias_calado,
         (l.converted_at is not null) as comprou,
         (l.location = 'base') as na_base,
         (l.opt_out_at is not null) as opt_out
    from public.leads l
   where l.tenant_id = p_tenant_id
     and l.deleted_at is null
     and l.opt_out_at is null
     and (coalesce((j->>'so_na_base')::boolean, true) = false or l.location = 'base')
     and not exists (select 1 from public.exclusoes_tenant e where e.tenant_id = p_tenant_id and e.lead_id = l.id)
     and (not (j ? 'temperatura') or l.temperatura_lead = any (array(select jsonb_array_elements_text(j->'temperatura'))))
     and (not (j ? 'fase_pipeline') or l.fase_pipeline = any (array(select jsonb_array_elements_text(j->'fase_pipeline'))))
     and (not (j ? 'desfecho') or l.desfecho = any (array(select jsonb_array_elements_text(j->'desfecho'))))
     and (not (j ? 'origem') or l.origem_lead = any (array(select jsonb_array_elements_text(j->'origem'))))
     and (not (j ? 'comprou') or (l.converted_at is not null) = (j->>'comprou')::boolean)
     and (not (j ? 'dias_calado_min') or l.ultima_resposta_lead_em <= now() - ((j->>'dias_calado_min')::int || ' days')::interval)
     and (not (j ? 'dias_calado_max') or l.ultima_resposta_lead_em >= now() - ((j->>'dias_calado_max')::int || ' days')::interval)
     and (cardinality(v_tags) = 0 or coalesce(l.tags, '{}') @> v_tags)
     and (not (j ? 'ids_restringir') or l.id = any (array(select (jsonb_array_elements_text(j->'ids_restringir'))::uuid)))
   order by l.ultima_resposta_lead_em desc nulls last
   limit v_limite;
end;
$function$

