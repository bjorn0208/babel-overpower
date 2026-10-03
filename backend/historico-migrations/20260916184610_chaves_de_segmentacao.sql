create or replace function public.chaves_de_segmentacao(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with vivos as (
    select l.tags, l.temperatura_lead, l.fase_pipeline, l.desfecho, l.origem_lead, l.converted_at,
           l.ultima_resposta_lead_em, l.location, l.opt_out_at
      from public.leads l
     where l.tenant_id = p_tenant_id and l.deleted_at is null
  ),
  tags as (
    select split_part(t, ':', 1) as chave, substr(t, position(':' in t) + 1) as valor, count(*) as n
      from vivos v, unnest(coalesce(v.tags, '{}')) as t
     where position(':' in t) > 0
     group by 1, 2
  ),
  tags_agrupadas as (
    select chave, jsonb_agg(jsonb_build_object('valor', valor, 'n', n) order by n desc) as valores, sum(n) as total
      from (select * from tags order by n desc) x
     group by chave
  )
  select jsonb_build_object(
    'tenant_id', p_tenant_id,
    'total_leads', (select count(*) from vivos),
    'na_base', (select count(*) from vivos where location = 'base'),
    'com_opt_out', (select count(*) from vivos where opt_out_at is not null),
    'temperatura', (select coalesce(jsonb_object_agg(coalesce(temperatura_lead,'sem'), n), '{}'::jsonb)
                      from (select temperatura_lead, count(*) n from vivos group by 1) t),
    'fase_pipeline', (select coalesce(jsonb_object_agg(coalesce(fase_pipeline,'sem'), n), '{}'::jsonb)
                        from (select fase_pipeline, count(*) n from vivos group by 1) t),
    'desfecho', (select coalesce(jsonb_object_agg(coalesce(desfecho,'sem'), n), '{}'::jsonb)
                   from (select desfecho, count(*) n from vivos group by 1) t),
    'origem', (select coalesce(jsonb_object_agg(coalesce(origem_lead,'sem'), n), '{}'::jsonb)
                 from (select origem_lead, count(*) n from vivos group by 1) t),
    'comprou', (select count(*) from vivos where converted_at is not null),
    'calados_7d', (select count(*) from vivos where ultima_resposta_lead_em < now() - interval '7 days'),
    'calados_15d', (select count(*) from vivos where ultima_resposta_lead_em < now() - interval '15 days'),
    'calados_30d', (select count(*) from vivos where ultima_resposta_lead_em < now() - interval '30 days'),
    'tags', (select coalesce(jsonb_object_agg(chave, jsonb_build_object('total', total, 'valores', valores)), '{}'::jsonb)
               from (select * from tags_agrupadas order by total desc limit 40) g)
  );
$$;
revoke all on function public.chaves_de_segmentacao(uuid) from public, anon;
grant execute on function public.chaves_de_segmentacao(uuid) to authenticated, service_role;

create or replace function public.ler_leads_por_criterio(p_tenant_id uuid, p_criterios jsonb default '{}'::jsonb)
returns table (
  id uuid, nome text, phone text, temperatura_lead text, fase_pipeline text, desfecho text,
  origem_lead text, ultima_resposta_lead_em timestamptz, dias_calado integer, comprou boolean,
  na_base boolean, opt_out boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
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
$$;
revoke all on function public.ler_leads_por_criterio(uuid, jsonb) from public, anon;
grant execute on function public.ler_leads_por_criterio(uuid, jsonb) to authenticated, service_role;
;
