-- RPCs determinísticas pra cron-admin-ia-schemas regenerar glossário do banco

CREATE OR REPLACE FUNCTION public.admin_ia_descrever_tabela_v2(p_tabela text)
RETURNS TABLE (
  nome text,
  tipo text,
  nullable boolean,
  default_val text,
  enum_valores text[],
  comentario text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH cols AS (
    SELECT
      c.column_name,
      c.data_type,
      (c.is_nullable = 'YES') AS nullable,
      c.column_default,
      c.ordinal_position,
      pg_catalog.col_description(
        (c.table_schema || '.' || c.table_name)::regclass,
        c.ordinal_position
      ) AS comentario
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = p_tabela
  ),
  enum_constraints AS (
    SELECT
      pgc.conrelid,
      pg_catalog.pg_get_constraintdef(pgc.oid) AS def
    FROM pg_catalog.pg_constraint pgc
    WHERE pgc.conrelid = ('public.' || p_tabela)::regclass
      AND pgc.contype = 'c'
  )
  SELECT
    cl.column_name::text AS nome,
    cl.data_type::text AS tipo,
    cl.nullable,
    LEFT(COALESCE(cl.column_default, ''), 80)::text AS default_val,
    (
      SELECT array_agg(DISTINCT match[1])
      FROM enum_constraints ec,
        regexp_matches(ec.def, '''([^'']+)''', 'g') AS match
      WHERE ec.def LIKE '%' || cl.column_name || '%'
        AND ec.def LIKE '%ANY (ARRAY%'
    )::text[] AS enum_valores,
    cl.comentario::text
  FROM cols cl
  ORDER BY cl.ordinal_position;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_ia_listar_fks(p_tabela text)
RETURNS TABLE (
  coluna text,
  ref_tabela text,
  ref_coluna text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.attname::text AS coluna,
    cl.relname::text AS ref_tabela,
    af.attname::text AS ref_coluna
  FROM pg_catalog.pg_constraint c
  JOIN pg_catalog.pg_class t ON t.oid = c.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
  JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
  JOIN pg_catalog.pg_class cl ON cl.oid = c.confrelid
  JOIN pg_catalog.pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = ANY(c.confkey)
  WHERE c.contype = 'f'
    AND n.nspname = 'public'
    AND t.relname = p_tabela
  ORDER BY a.attname;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_ia_descrever_tabela_v2(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_ia_listar_fks(text) TO service_role;
;
