CREATE OR REPLACE FUNCTION public.gestao_atividade_uso(p_de text, p_ate text)
 RETURNS TABLE(cliente_id uuid, competencia text, tokens_uso bigint, leads_uso integer, tokens_manual bigint, leads_manual integer, tokens_final bigint, leads_final integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_ini date; v_fim date;
begin
  if not public.gestao_tem_papel(array['financeiro']::text[]) then raise exception 'gestao: sem permissao para a atividade' using errcode = '42501'; end if;
  if p_de is null or p_ate is null or p_de !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_ate !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_de > p_ate then
    raise exception 'gestao: competencia invalida (use AAAA-MM, de <= ate)' using errcode = '22023'; end if;
  v_ini := (p_de || '-01')::date; v_fim := ((p_ate || '-01')::date + interval '1 month')::date;
  if v_fim - v_ini > 800 then raise exception 'gestao: intervalo maior que 24 meses' using errcode = '22023'; end if;
  return query
  with mm as (select to_char(g, 'YYYY-MM') as comp from generate_series(v_ini::timestamp, (v_fim - 1)::timestamp, interval '1 month') g),
  -- so o cache: nenhuma leitura de traces ou leads aqui (Missao 8)
  u as (select k.tenant_id, k.competencia, k.tokens, k.leads
          from public.gestao_atividade_uso_mes k
         where k.competencia >= p_de and k.competencia <= p_ate)
  select c.id, mm.comp,
         coalesce(u.tokens, 0)::bigint, coalesce(u.leads, 0)::integer,
         a.tokens, a.leads,
         coalesce(a.tokens, u.tokens, 0)::bigint, coalesce(a.leads, u.leads, 0)::integer
    from public.gestao_clientes c
   cross join mm
    left join u on u.tenant_id = c.profile_id and u.competencia = mm.comp
    left join public.gestao_atividade a on a.cliente_id = c.id and a.competencia = mm.comp and a.deleted_at is null
   where c.deleted_at is null and (coalesce(u.tokens, 0) > 0 or coalesce(u.leads, 0) > 0 or a.id is not null)
   order by c.id, mm.comp;
end $function$

