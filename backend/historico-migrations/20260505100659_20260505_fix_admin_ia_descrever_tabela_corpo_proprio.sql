-- Limpeza Geral v1.0 - Onda B+ (correcao bloqueante apontada por auditoria)
-- A funcao admin_ia_descrever_tabela delegava para admin_ia_descrever_tabela_v2,
-- mas a _v2 foi dropada no Bloco A. Esta migration substitui o corpo da funcao
-- canonica por uma implementacao auto-suficiente (copia do que estava na _v2).

CREATE OR REPLACE FUNCTION public.admin_ia_descrever_tabela(p_tabela text)
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

COMMENT ON FUNCTION public.admin_ia_descrever_tabela(text) IS 'Funcao canonica auto-suficiente (Limpeza Geral v1.0). Body restaurado apos drop de admin_ia_descrever_tabela_v2.';

GRANT EXECUTE ON FUNCTION public.admin_ia_descrever_tabela(text) TO service_role;

;
