CREATE OR REPLACE FUNCTION public.preparar_exclusao_dados_nucleo(p_owner uuid, p_conversa uuid, p_sql text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sql text;
  v_tabela text;
  v_where text;
  v_permitida boolean;
  v_amostra jsonb;
  v_total integer;
  v_id uuid;
  v_teto constant integer := 200;
begin
  if p_owner is null or p_conversa is null then
    return jsonb_build_object('ok', false, 'erro', 'dono ou conversa ausente');
  end if;

  v_sql := btrim(coalesce(p_sql, ''));
  v_sql := regexp_replace(v_sql, ';\s*$', '');
  if v_sql = '' then
    return jsonb_build_object('ok', false, 'erro', 'comando vazio');
  end if;
  if position(';' in v_sql) > 0 then
    return jsonb_build_object('ok', false, 'erro', 'apenas um comando por vez');
  end if;
  if v_sql !~* '^delete\s+from\s' then
    return jsonb_build_object('ok', false, 'erro', 'o comando precisa começar com DELETE FROM');
  end if;
  if v_sql !~* '\ywhere\y' then
    return jsonb_build_object('ok', false, 'erro', 'DELETE sem WHERE é proibido');
  end if;
  if v_sql ~* '\y(update|insert|drop|alter|create|grant|revoke|truncate|returning)\y' then
    return jsonb_build_object('ok', false, 'erro', 'comando inválido pra exclusão');
  end if;

  v_tabela := lower((regexp_match(v_sql, '^delete\s+from\s+(?:only\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?', 'i'))[1]);
  v_where := (regexp_match(v_sql, '\ywhere\y(.*)$', 'i'))[1];
  if v_tabela is null or btrim(coalesce(v_where, '')) = '' then
    return jsonb_build_object('ok', false, 'erro', 'não consegui ler a tabela ou o filtro do comando');
  end if;

  select coalesce(bool_or(permite_exclusao and ativo), false) into v_permitida
  from public.tabelas_consulta_permitidas where tabela = v_tabela;
  if not v_permitida then
    return jsonb_build_object('ok', false, 'erro',
      'tabela ''' || v_tabela || ''' não pode ser excluída por aqui. Nesses casos use atualizar_dados pra desativar o registro.');
  end if;

  perform set_config('search_path', 'public', true);
  perform set_config('statement_timeout', '8000', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_owner::text, 'role', 'authenticated')::text, true);

  -- Prévia: conta e amostra o que SERIA apagado (RLS do dono aplicada).
  begin
    execute format('select count(*) from public.%I where %s', v_tabela, v_where) into v_total;
    execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from public.%I where %s limit 5) t',
                   v_tabela, v_where) into v_amostra;
  exception when others then
    return jsonb_build_object('ok', false, 'erro', 'filtro inválido: ' || sqlerrm);
  end;

  if v_total = 0 then
    return jsonb_build_object('ok', false, 'erro', 'nenhum registro casou com esse filtro — nada a excluir');
  end if;
  if v_total > v_teto then
    return jsonb_build_object('ok', false, 'erro',
      'o filtro pegaria ' || v_total || ' registros (teto ' || v_teto || ') — estreite o WHERE');
  end if;

  insert into public.confirmacoes_exclusao (owner_id, conversa_id, tabela, comando, linhas_previstas, resumo)
  values (p_owner, p_conversa, v_tabela, v_sql, v_total, v_amostra)
  returning id into v_id;

  return jsonb_build_object(
    'ok', true, 'etapa', 'preparado', 'bilhete', v_id,
    'tabela', v_tabela, 'linhas_previstas', v_total, 'amostra', v_amostra
  );
end;
$function$

