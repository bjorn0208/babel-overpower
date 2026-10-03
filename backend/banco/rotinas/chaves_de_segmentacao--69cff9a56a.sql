CREATE OR REPLACE FUNCTION public.chaves_de_segmentacao(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$

