-- Tijolo 1 · CommandBar "ChatGPT da empresa" — tool universal de leitura.
-- 1) Allowlist de tabelas consultáveis pela LLM do canal interno.
-- 2) RPC esquema_consulta_dados(): mapa tabela→colunas das permitidas (a LLM
--    descobre o vocabulário real antes de escrever o SELECT).
-- 3) RPC consultar_dados_leitura(): executa SELECT da LLM com impersonação do
--    dono (RLS vale como se ele consultasse), allowlist verificada pelo PLANO
--    de execução (imune a truque de sintaxe), timeout e limite de linhas.
-- Só service_role executa as RPCs — o cliente nunca chama direto.

set lock_timeout = '2s';
set statement_timeout = '30s';

-- ── 1. Allowlist ────────────────────────────────────────────────────────────
create table if not exists public.tabelas_consulta_permitidas (
  tabela text primary key,
  descricao text not null default '',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

alter table public.tabelas_consulta_permitidas enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tabelas_consulta_permitidas'
      and policyname = 'leitura_authenticated'
  ) then
    create policy "leitura_authenticated" on public.tabelas_consulta_permitidas
      for select to authenticated using (true);
  end if;
end $$;

insert into public.tabelas_consulta_permitidas (tabela, descricao) values
  ('leads', 'Contatos e clientes do tenant. fase_cliente preenchida = cliente convertido; fase_pipeline = etapa de pré-venda.'),
  ('conversas', 'Sessões de conversa entre lead e agente (canal, status, datas).'),
  ('mensagens', 'Mensagens individuais das conversas (grande — sempre agregue ou limite).'),
  ('fichas_lead', 'Ficha consolidada do lead (dados capturados pelo agente).'),
  ('memoria_lead', 'Fatos que o agente memorizou sobre cada lead.'),
  ('engajamento_lead', 'Pontuação de engajamento por lead (frio/morno/quente).'),
  ('compromissos', 'Compromissos agendados pelo agente com leads.'),
  ('eventos_agenda', 'Eventos da agenda do tenant.'),
  ('disponibilidade', 'Janelas de disponibilidade da agenda.'),
  ('contratos', 'Contratos gerados/assinados.'),
  ('contrato_itens', 'Itens (produtos/valores) de cada contrato.'),
  ('contratos_template', 'Modelos de contrato do tenant.'),
  ('produtos', 'Catálogo de produtos do tenant.'),
  ('produto_conhecimento', 'Conhecimento vinculado a produto.'),
  ('categorias_produto', 'Categorias de produto.'),
  ('tipos_de_produto', 'Tipos de produto.'),
  ('empresas', 'Dados da empresa do tenant.'),
  ('socios', 'Sócios da empresa.'),
  ('perfil_empresa', 'Perfil destilado da empresa (como o tenant vende).'),
  ('campanhas', 'Campanhas outbound.'),
  ('fases_campanha', 'Fases de cada campanha.'),
  ('leads_campanha', 'Leads dentro de campanhas.'),
  ('movimentos_financeiros', 'Lançamentos do caixa (entradas/saídas).'),
  ('contas_a_pagar', 'Contas e dívidas a pagar.'),
  ('metas_financeiras', 'Metas de compra/investimento.'),
  ('categorias_financeiras', 'Categorias do caixa.'),
  ('tickets_conversa', 'Tickets/handoffs abertos nas conversas.'),
  ('carrinho_da_conversa', 'Carrinho de produtos por conversa.'),
  ('consultas', 'Consultas de CPF/crédito executadas (app Consulta).'),
  ('consultas_saldo', 'Saldo de consultas do tenant.')
on conflict (tabela) do nothing;

-- ── 2. RPC esquema ──────────────────────────────────────────────────────────
create or replace function public.esquema_consulta_dados()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(
      t.tabela,
      jsonb_build_object('descricao', t.descricao, 'colunas', t.colunas)
    ),
    '{}'::jsonb
  )
  from (
    select p.tabela,
           p.descricao,
           (
             select jsonb_agg(c.column_name || ' ' || c.data_type order by c.ordinal_position)
             from information_schema.columns c
             where c.table_schema = 'public' and c.table_name = p.tabela
           ) as colunas
    from public.tabelas_consulta_permitidas p
    where p.ativo
  ) t;
$$;

revoke all on function public.esquema_consulta_dados() from public;
revoke all on function public.esquema_consulta_dados() from anon;
revoke all on function public.esquema_consulta_dados() from authenticated;
grant execute on function public.esquema_consulta_dados() to service_role;

-- ── 3. RPC de execução segura ───────────────────────────────────────────────
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

  -- Rebaixa a sessão pro papel do dono: a partir daqui a RLS vale como se o
  -- próprio usuário consultasse. set_config(local=true) reverte no fim da tx.
  perform set_config('search_path', 'public', true);
  perform set_config('statement_timeout', '8000', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_owner::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);

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

revoke all on function public.consultar_dados_leitura(uuid, text, integer) from public;
revoke all on function public.consultar_dados_leitura(uuid, text, integer) from anon;
revoke all on function public.consultar_dados_leitura(uuid, text, integer) from authenticated;
grant execute on function public.consultar_dados_leitura(uuid, text, integer) to service_role;
;
