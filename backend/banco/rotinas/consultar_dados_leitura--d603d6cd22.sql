CREATE OR REPLACE FUNCTION public.consultar_dados_leitura(p_owner uuid, p_sql text, p_limite integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sql text;
  v_limite integer;
  v_relacoes text[];
  v_bloqueadas text[];
  v_linhas jsonb;
  v_total integer;
begin
  if p_owner is null then
    return jsonb_build_object('ok', false, 'erro', 'dono da consulta ausente');
  end if;

  v_sql := btrim(coalesce(p_sql, ''));
  v_sql := regexp_replace(v_sql, ';\s*$', '');
  if v_sql = '' then
    return jsonb_build_object('ok', false, 'erro', 'consulta vazia');
  end if;
  if length(v_sql) > 8000 then
    return jsonb_build_object('ok', false, 'erro', 'consulta longa demais (máx 8000 caracteres)');
  end if;
  if v_sql !~* '^(select|with)\y' then
    return jsonb_build_object('ok', false, 'erro', 'somente SELECT é permitido');
  end if;
  if position(';' in v_sql) > 0 then
    return jsonb_build_object('ok', false, 'erro', 'apenas um comando por consulta');
  end if;
  if v_sql ~* '\y(insert|update|delete|merge)\y' then
    return jsonb_build_object('ok', false, 'erro', 'somente consulta de leitura é permitida (palavra de escrita detectada)');
  end if;

  v_limite := least(greatest(coalesce(p_limite, 100), 1), 500);

  perform set_config('search_path', 'public', true);
  perform set_config('statement_timeout', '8000', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_owner::text, 'role', 'authenticated')::text,
    true
  );

  -- Valida sintaxe + extrai relações citadas diretamente (sem executar nada).
  -- CREATE VIEW já rejeita CTE data-modifying e FOR UPDATE por regra do Postgres.
  begin
    execute 'create or replace temp view _consulta_llm_v as ' || v_sql;
  exception when others then
    return jsonb_build_object('ok', false, 'erro', 'consulta inválida: ' || sqlerrm);
  end;

  select array_agg(distinct c2.relname) into v_relacoes
  from pg_catalog.pg_class c1
  join pg_catalog.pg_rewrite r on r.ev_class = c1.oid
  join pg_catalog.pg_depend d on d.objid = r.oid and d.refclassid = 'pg_class'::pg_catalog.regclass
  join pg_catalog.pg_class c2 on c2.oid = d.refobjid and c2.oid <> c1.oid
  where c1.relname = '_consulta_llm_v'
    and c1.relnamespace = pg_catalog.pg_my_temp_schema();

  execute 'drop view if exists _consulta_llm_v';

  select array_agg(rel) into v_bloqueadas
  from unnest(coalesce(v_relacoes, array[]::text[])) rel
  where rel not in (select tabela from public.tabelas_consulta_permitidas where ativo);

  if v_bloqueadas is not null and array_length(v_bloqueadas, 1) > 0 then
    return jsonb_build_object(
      'ok', false,
      'erro', 'tabela(s) fora da área permitida: ' || array_to_string(v_bloqueadas, ', ')
        || '. Chame a ação esquema pra ver as tabelas disponíveis.'
    );
  end if;

  -- Executa embrulhado com limite+1 pra detectar truncamento. RLS vale como o dono.
  begin
    execute format(
      'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select q.* from (%s) q limit %s) t',
      v_sql, v_limite + 1
    ) into v_linhas;
  exception when others then
    return jsonb_build_object('ok', false, 'erro', 'falha ao executar: ' || sqlerrm);
  end;

  v_total := coalesce(jsonb_array_length(v_linhas), 0);
  if v_total > v_limite then
    select jsonb_agg(t.e) into v_linhas
    from (
      select e from jsonb_array_elements(v_linhas) with ordinality as x(e, ord)
      where x.ord <= v_limite
    ) t(e);
  end if;

  if length(v_linhas::text) > 60000 then
    return jsonb_build_object(
      'ok', false,
      'erro', 'resultado grande demais — refaça com agregação (count, sum, group by) ou menos colunas'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'linhas', coalesce(v_linhas, '[]'::jsonb),
    'total_retornado', least(v_total, v_limite),
    'truncado', v_total > v_limite
  );
end;
$function$

