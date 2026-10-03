-- Fix Tijolo 1 (completo): impersonação via role dedicado, tudo numa transação.
-- consultor_dados_ro: NOLOGIN, sem BYPASSRLS, não-dono das tabelas (RLS aplica),
-- membro de authenticated (herda grants + policies TO authenticated).
-- A RPC consultar_dados_leitura passa a ser owned por ele; auth.uid() vem do
-- request.jwt.claims setado com o dono validado pela edge (service_role only).

set lock_timeout = '2s';
set statement_timeout = '30s';

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'consultor_dados_ro') then
    create role consultor_dados_ro nologin;
  end if;
end $$;

grant authenticated to consultor_dados_ro;

do $$
begin
  execute format('grant consultor_dados_ro to %I', current_user);
end $$;

grant usage, create on schema public to consultor_dados_ro;

create or replace function public.consultar_dados_leitura(
  p_owner uuid,
  p_sql text,
  p_limite integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sql text;
  v_limite integer;
  v_plano jsonb;
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
  -- Palavras de escrita proibidas em qualquer posição (pega CTE data-modifying
  -- e SELECT ... FOR UPDATE). Demais comandos já morrem no gate ^select|with +
  -- proibição de ';'. Camada 1; o plano de execução confere de novo depois.
  if v_sql ~* '\y(insert|update|delete|merge)\y' then
    return jsonb_build_object('ok', false, 'erro', 'somente consulta de leitura é permitida (palavra de escrita detectada)');
  end if;

  v_limite := least(greatest(coalesce(p_limite, 100), 1), 500);

  -- Identidade do dono: auth.uid() dentro das policies passa a enxergar p_owner.
  perform set_config('search_path', 'public', true);
  perform set_config('statement_timeout', '8000', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_owner::text, 'role', 'authenticated')::text,
    true
  );

  -- Allowlist pelo PLANO: extrai toda relação real tocada (view expandida
  -- inclusa) e nega qualquer nó de escrita — imune a truque de sintaxe.
  begin
    execute 'explain (format json) ' || v_sql into v_plano;
  exception when others then
    return jsonb_build_object('ok', false, 'erro', 'consulta inválida: ' || sqlerrm);
  end;

  if exists (
    select 1 from jsonb_path_query(v_plano, '$.**."Node Type"') nt
    where nt #>> '{}' = 'ModifyTable'
  ) then
    return jsonb_build_object('ok', false, 'erro', 'consulta contém operação de escrita');
  end if;

  select array_agg(distinct x #>> '{}') into v_relacoes
  from jsonb_path_query(v_plano, '$.**."Relation Name"') x;

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

  -- Executa embrulhado com limite+1 pra detectar truncamento.
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
$$;

alter function public.consultar_dados_leitura(uuid, text, integer) owner to consultor_dados_ro;

revoke create on schema public from consultor_dados_ro;

revoke all on function public.consultar_dados_leitura(uuid, text, integer) from public;
revoke all on function public.consultar_dados_leitura(uuid, text, integer) from anon;
revoke all on function public.consultar_dados_leitura(uuid, text, integer) from authenticated;
grant execute on function public.consultar_dados_leitura(uuid, text, integer) to service_role;
;
