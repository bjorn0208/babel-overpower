-- CommandBar · CRUD universal — exclusão REAL em 2 turnos, com lixeira.
-- Regra do Theus: soft delete não basta (agente continuaria respondendo com o
-- conhecimento). Some do banco → some do RAG. Segurança:
--   1) allowlist própria de exclusão (mais estreita que a de escrita)
--   2) aperto de mão em 2 turnos VERIFICADO NO BANCO: preparar grava bilhete;
--      confirmar só executa se houve mensagem NOVA do usuário depois disso.
--   3) backup da linha inteira em lixeira_exclusoes (resgatável 30 dias)
--   4) WHERE obrigatório, teto de linhas, RLS do dono (role consultor_dados_ro)

set lock_timeout = '2s';
set statement_timeout = '60s';

alter table public.tabelas_consulta_permitidas
  add column if not exists permite_exclusao boolean not null default false;

-- Escrita ampliada pras demais tabelas de negócio do tenant.
update public.tabelas_consulta_permitidas
set permite_escrita = true
where tabela in (
  'conversas', 'fichas_lead', 'memoria_lead', 'engajamento_lead',
  'campanhas', 'fases_campanha', 'leads_campanha',
  'contratos', 'contrato_itens', 'tickets_conversa', 'carrinho_da_conversa'
);

-- Exclusão: catálogo do tenant (o que ele cadastrou e pode querer sumir),
-- inclusive conhecimento de produto — motivo do pedido.
update public.tabelas_consulta_permitidas
set permite_exclusao = true
where tabela in (
  'produtos', 'produto_conhecimento', 'categorias_produto', 'tipos_de_produto',
  'contratos_template', 'socios',
  'contas_a_pagar', 'metas_financeiras', 'categorias_financeiras',
  'compromissos', 'eventos_agenda', 'disponibilidade',
  'campanhas', 'fases_campanha', 'leads_campanha',
  'memoria_lead'
);

create table if not exists public.confirmacoes_exclusao (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  conversa_id uuid not null references public.mentor_conversas (id) on delete cascade,
  tabela text not null,
  comando text not null,
  linhas_previstas integer not null,
  resumo jsonb,
  criado_em timestamptz not null default now(),
  usado_em timestamptz
);
create index if not exists idx_confirmacoes_exclusao_owner
  on public.confirmacoes_exclusao (owner_id, criado_em desc);
create index if not exists idx_confirmacoes_exclusao_conversa
  on public.confirmacoes_exclusao (conversa_id);
alter table public.confirmacoes_exclusao enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='confirmacoes_exclusao' and policyname='dono_le_confirmacoes') then
    create policy "dono_le_confirmacoes" on public.confirmacoes_exclusao
      for select to authenticated using (owner_id = (select auth.uid()));
  end if;
end $$;

create table if not exists public.lixeira_exclusoes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  tabela text not null,
  linha jsonb not null,
  comando text,
  excluido_em timestamptz not null default now()
);
create index if not exists idx_lixeira_exclusoes_owner
  on public.lixeira_exclusoes (owner_id, excluido_em desc);
alter table public.lixeira_exclusoes enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='lixeira_exclusoes' and policyname='dono_le_lixeira') then
    create policy "dono_le_lixeira" on public.lixeira_exclusoes
      for select to authenticated using (owner_id = (select auth.uid()));
  end if;
end $$;

-- ── Passo 1: preparar (não apaga nada) ──────────────────────────────────────
create or replace function public.preparar_exclusao_dados(
  p_owner uuid,
  p_conversa uuid,
  p_sql text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- ── Passo 2: confirmar (exige mensagem NOVA do usuário depois do preparo) ───
create or replace function public.confirmar_exclusao_dados(
  p_owner uuid,
  p_conversa uuid,
  p_bilhete uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conf record;
  v_where text;
  v_backup jsonb;
  v_total integer;
begin
  select * into v_conf from public.confirmacoes_exclusao
  where id = p_bilhete and owner_id = p_owner and conversa_id = p_conversa;
  if v_conf is null then
    return jsonb_build_object('ok', false, 'erro', 'bilhete não encontrado — prepare a exclusão de novo');
  end if;
  if v_conf.usado_em is not null then
    return jsonb_build_object('ok', false, 'erro', 'esse bilhete já foi usado');
  end if;
  if v_conf.criado_em < now() - interval '30 minutes' then
    return jsonb_build_object('ok', false, 'erro', 'bilhete expirado (30 min) — prepare de novo');
  end if;

  -- Gate dos 2 turnos: precisa existir fala NOVA do usuário depois do preparo.
  if not exists (
    select 1 from public.mentor_mensagens m
    where m.conversa_id = p_conversa and m.papel = 'user' and m.criado_em > v_conf.criado_em
  ) then
    return jsonb_build_object('ok', false, 'erro',
      'ainda não houve confirmação do usuário. Mostre o que será excluído e espere ele responder — só então confirme.');
  end if;

  v_where := (regexp_match(v_conf.comando, '\ywhere\y(.*)$', 'i'))[1];

  perform set_config('search_path', 'public', true);
  perform set_config('statement_timeout', '15000', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_owner::text, 'role', 'authenticated')::text, true);

  begin
    -- Backup antes de sumir (lixeira invisível ao sistema, resgate 30 dias).
    execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from public.%I where %s) t',
                   v_conf.tabela, v_where) into v_backup;
    execute format(
      'with _r as (delete from public.%I where %s returning *) select count(*) from _r',
      v_conf.tabela, v_where
    ) into v_total;
  exception when others then
    return jsonb_build_object('ok', false, 'erro', 'falha ao excluir: ' || sqlerrm);
  end;

  insert into public.lixeira_exclusoes (owner_id, tabela, linha, comando)
  select p_owner, v_conf.tabela, l, v_conf.comando
  from jsonb_array_elements(coalesce(v_backup, '[]'::jsonb)) l;

  update public.confirmacoes_exclusao set usado_em = now() where id = p_bilhete;

  return jsonb_build_object('ok', true, 'etapa', 'excluido',
    'tabela', v_conf.tabela, 'linhas_excluidas', v_total);
end;
$$;

grant usage, create on schema public to consultor_dados_ro;
alter function public.preparar_exclusao_dados(uuid, uuid, text) owner to consultor_dados_ro;
alter function public.confirmar_exclusao_dados(uuid, uuid, uuid) owner to consultor_dados_ro;
revoke create on schema public from consultor_dados_ro;

revoke all on function public.preparar_exclusao_dados(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.confirmar_exclusao_dados(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.preparar_exclusao_dados(uuid, uuid, text) to service_role;
grant execute on function public.confirmar_exclusao_dados(uuid, uuid, uuid) to service_role;
;
