CREATE OR REPLACE FUNCTION public.colunas_da_tabela(p_tabela text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    jsonb_agg(c.column_name || ' ' || c.data_type order by c.ordinal_position),
    '[]'::jsonb
  )
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = lower(btrim(coalesce(p_tabela, '')))
    and exists (
      select 1 from public.tabelas_consulta_permitidas t
      where t.tabela = lower(btrim(coalesce(p_tabela, ''))) and t.ativo
    );
$function$

