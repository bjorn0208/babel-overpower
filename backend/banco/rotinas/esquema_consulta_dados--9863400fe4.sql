CREATE OR REPLACE FUNCTION public.esquema_consulta_dados()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    jsonb_object_agg(
      t.tabela,
      jsonb_build_object('descricao', t.descricao, 'aceita_escrita', t.permite_escrita, 'colunas', t.colunas)
    ),
    '{}'::jsonb
  )
  from (
    select p.tabela,
           p.descricao,
           p.permite_escrita,
           (
             select jsonb_agg(c.column_name || ' ' || c.data_type order by c.ordinal_position)
             from information_schema.columns c
             where c.table_schema = 'public' and c.table_name = p.tabela
           ) as colunas
    from public.tabelas_consulta_permitidas p
    where p.ativo
  ) t;
$function$

