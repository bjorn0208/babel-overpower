-- CommandBar · tool universal de ESCRITA `atualizar_dados` (v2 — concede CREATE
-- temporário pro ALTER OWNER, igual à migration da leitura).
-- Irmã da consultar_dados_leitura: mesma impersonação (role consultor_dados_ro,
-- RLS do dono vale), allowlist de escrita própria, só UPDATE/INSERT, UPDATE
-- exige WHERE, teto de linhas com rollback, RETURNING embrulhado. service_role only.

set lock_timeout = '2s';
set statement_timeout = '30s';

alter table public.tabelas_consulta_permitidas
  add column if not exists permite_escrita boolean not null default false;

update public.tabelas_consulta_permitidas
set permite_escrita = true
where tabela in (
  'produtos', 'produto_conhecimento', 'empresas', 'socios',
  'categorias_produto', 'tipos_de_produto',
  'contas_a_pagar', 'metas_financeiras', 'categorias_financeiras',
  'compromissos', 'eventos_agenda', 'disponibilidade',
  'contratos_template', 'leads'
);

create or replace function public.atualizar_dados_escrita(
  p_owner uuid,
  p_sql text,
  p_confirmar_em_massa boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sql text;
  v_tabela text;
  v_permitida boolean;
  v_linhas jsonb;
  v_total integer;
  v_teto constant integer := 50;
begin
  if p_owner is null then
    return jsonb_build_object('ok', false, 'erro', 'dono da operação ausente');
  end if;

  v_sql := btrim(coalesce(p_sql, ''));
  v_sql := regexp_replace(v_sql, ';\s*$', '');
  if v_sql = '' then
    return jsonb_build_object('ok', false, 'erro', 'comando vazio');
  end if;
  if length(v_sql) > 8000 then
    return jsonb_build_object('ok', false, 'erro', 'comando longo demais (máx 8000 caracteres)');
  end if;
  if position(';' in v_sql) > 0 then
    return jsonb_build_object('ok', false, 'erro', 'apenas um comando por vez');
  end if;
  if v_sql ~* '\yreturning\y' then
    return jsonb_build_object('ok', false, 'erro', 'não use RETURNING — o resultado já volta sozinho');
  end if;
  if v_sql ~* '\y(delete|truncate|drop|alter|create|grant|revoke|merge)\y' then
    return jsonb_build_object('ok', false, 'erro', 'só UPDATE ou INSERT são permitidos. Apagar = UPDATE com deleted_at/ativo (soft delete).');
  end if;

  if v_sql ~* '^update\s' then
    v_tabela := lower((regexp_match(v_sql, '^update\s+(?:only\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?', 'i'))[1]);
    if v_sql !~* '\ywhere\y' then
      return jsonb_build_object('ok', false, 'erro', 'UPDATE sem WHERE é proibido — filtre pelo id ou por condição específica');
    end if;
  elsif v_sql ~* '^insert\s+into\s' then
    v_tabela := lower((regexp_match(v_sql, '^insert\s+into\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?', 'i'))[1]);
  else
    return jsonb_build_object('ok', false, 'erro', 'comando precisa começar com UPDATE ou INSERT INTO');
  end if;

  if v_tabela is null then
    return jsonb_build_object('ok', false, 'erro', 'não consegui identificar a tabela alvo');
  end if;

  select coalesce(bool_or(permite_escrita and ativo), false) into v_permitida
  from public.tabelas_consulta_permitidas where tabela = v_tabela;
  if not v_permitida then
    return jsonb_build_object('ok', false, 'erro',
      'tabela ''' || v_tabela || ''' não aceita escrita por aqui. Consulte a ação esquema pra ver o que é editável.');
  end if;

  perform set_config('search_path', 'public', true);
  perform set_config('statement_timeout', '8000', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_owner::text, 'role', 'authenticated')::text,
    true
  );

  begin
    execute format(
      'with _r as (%s returning *) select coalesce(jsonb_agg(_r), ''[]''::jsonb) from _r',
      v_sql
    ) into v_linhas;
    v_total := coalesce(jsonb_array_length(v_linhas), 0);
    if v_total > v_teto and not coalesce(p_confirmar_em_massa, false) then
      raise exception 'TETO_MASSA:%', v_total;
    end if;
  exception
    when others then
      if sqlerrm like 'TETO_MASSA:%' then
        return jsonb_build_object('ok', false, 'erro',
          'a operação afetaria ' || replace(sqlerrm, 'TETO_MASSA:', '') || ' linhas (teto ' || v_teto ||
          ') — NADA foi alterado. Refine o WHERE, ou repita com confirmar_em_massa=true SÓ se o usuário confirmar explicitamente.');
      end if;
      return jsonb_build_object('ok', false, 'erro', 'falha ao executar: ' || sqlerrm);
  end;

  if length(v_linhas::text) > 60000 then
    v_linhas := jsonb_build_array(jsonb_build_object('aviso', 'resultado grande demais pra exibir — alteração feita'));
  end if;

  return jsonb_build_object(
    'ok', true,
    'tabela', v_tabela,
    'linhas_afetadas', v_total,
    'linhas', coalesce(v_linhas, '[]'::jsonb)
  );
end;
$$;

grant usage, create on schema public to consultor_dados_ro;
alter function public.atualizar_dados_escrita(uuid, text, boolean) owner to consultor_dados_ro;
revoke create on schema public from consultor_dados_ro;

revoke all on function public.atualizar_dados_escrita(uuid, text, boolean) from public;
revoke all on function public.atualizar_dados_escrita(uuid, text, boolean) from anon;
revoke all on function public.atualizar_dados_escrita(uuid, text, boolean) from authenticated;
grant execute on function public.atualizar_dados_escrita(uuid, text, boolean) to service_role;
;
