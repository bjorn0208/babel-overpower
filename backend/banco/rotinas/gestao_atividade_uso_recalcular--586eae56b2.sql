CREATE OR REPLACE FUNCTION public.gestao_atividade_uso_recalcular(p_de text, p_ate text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_ini date; v_fim date; v_tenants uuid[]; v_lim timestamptz[]; v_comp text[]; v_n integer;
begin
  if not (coalesce(current_setting('role', true), 'none') in ('none', 'service_role') or public.gestao_tem_papel(array['financeiro']::text[])) then
    raise exception 'gestao: sem permissao para recalcular a atividade' using errcode = '42501'; end if;
  if p_de is null or p_ate is null or p_de !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_ate !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_de > p_ate then
    raise exception 'gestao: competencia invalida (use AAAA-MM, de <= ate)' using errcode = '22023'; end if;
  v_ini := (p_de || '-01')::date; v_fim := ((p_ate || '-01')::date + interval '1 month')::date;
  if v_fim - v_ini > 800 then raise exception 'gestao: intervalo maior que 24 meses' using errcode = '22023'; end if;
  select array_agg((g::timestamp at time zone 'America/Sao_Paulo') order by g), array_agg(to_char(g, 'YYYY-MM') order by g) into v_lim, v_comp
    from generate_series(v_ini::timestamp, v_fim::timestamp, interval '1 month') g;
  select coalesce(array_agg(distinct c.profile_id), '{}') into v_tenants from public.gestao_clientes c where c.deleted_at is null and c.profile_id is not null;
  insert into public.gestao_atividade_uso_mes (tenant_id, competencia, tokens, leads, atualizado_em)
  select tn.tenant_id, mm.comp, coalesce(t.tokens, 0), coalesce(l.leads, 0), now()
    from unnest(v_tenants) as tn(tenant_id)
   cross join (select to_char(g, 'YYYY-MM') as comp from generate_series(v_ini::timestamp, (v_fim - 1)::timestamp, interval '1 month') g) mm
    left join (select x.tenant_id, v_comp[width_bucket(x.criado_em, v_lim)] as comp, sum(coalesce(x.custo_tokens_in, 0) + coalesce(x.custo_tokens_out, 0))::bigint as tokens
                 from public.traces x
                where x.tenant_id = any (v_tenants) and x.criado_em >= (v_ini::timestamp at time zone 'America/Sao_Paulo') and x.criado_em < (v_fim::timestamp at time zone 'America/Sao_Paulo')
                group by 1, 2) t on t.tenant_id = tn.tenant_id and t.comp = mm.comp
    left join (select y.tenant_id, v_comp[width_bucket(y.created_at, v_lim)] as comp, count(*)::integer as leads
                 from public.leads y
                where y.tenant_id = any (v_tenants) and y.deleted_at is null and y.created_at >= (v_ini::timestamp at time zone 'America/Sao_Paulo') and y.created_at < (v_fim::timestamp at time zone 'America/Sao_Paulo')
                group by 1, 2) l on l.tenant_id = tn.tenant_id and l.comp = mm.comp
  on conflict (tenant_id, competencia) do update set tokens = excluded.tokens, leads = excluded.leads, atualizado_em = excluded.atualizado_em;
  get diagnostics v_n = row_count;
  return v_n;
end $function$

