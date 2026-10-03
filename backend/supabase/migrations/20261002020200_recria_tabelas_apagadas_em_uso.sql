-- Recria tabelas apagadas que funções do banco ainda usam (AUDITORIA-BACK B-01/B-05).
-- - activity_logs: apagada em 20260415191508_drop_activity_logs_and_log_activity.sql, mas
--   exportar_meus_dados() e solicitar_exclusao_conta() (LGPD, chamadas pelo front) gravam nela.
--   Sem a tabela, o pedido de exclusão de conta se perdia e a exportação falhava sempre.
--   Recriada só a tabela (a função log_activity e seus triggers continuam fora).
-- - produto_template_conhecimento / produto_template_midias / repropostas_lead_campanha:
--   apagadas em 20260509230545_sem-nome.sql ("órfãs, zero refs no frontend"), mas usadas por:
--     copiar_templates_produto_para_novo_tenant (trigger AFTER INSERT em profiles → cadastro
--     de tenant falha quando o nicho tem templates), integracao_provisionar_conta (edge
--     integracao-comercial), enviar_reproposta (edge processar-acompanhamentos) e
--     obter_metricas_campanha.
-- DDL e policies copiadas das migrations originais; repropostas_lead_campanha nunca teve
-- migration (foi criada direto no banco) — colunas inferidas das funções que a usam.
-- Todas as funções consumidoras são SECURITY DEFINER (dono postgres → passam pela RLS).
-- Idempotente.

-- activity_logs (original: 20260303100349_add_activity_logs_and_lgpd.sql)
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb default '{}',
  ip_address text,
  created_at timestamptz not null default now()
);
create index if not exists idx_activity_logs_user_id_created_at
  on public.activity_logs (user_id, created_at desc);
alter table public.activity_logs enable row level security;
drop policy if exists activity_logs_user_read on public.activity_logs;
create policy activity_logs_user_read on public.activity_logs
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists activity_logs_admin_read on public.activity_logs;
create policy activity_logs_admin_read on public.activity_logs
  for select to authenticated using (public.eh_admin_plataforma());
drop policy if exists activity_logs_insert on public.activity_logs;
create policy activity_logs_insert on public.activity_logs
  for insert to authenticated with check (user_id = (select auth.uid()));

-- produto_template_* (original: 20260416113517_20260416_09_produto_templates.sql)
create table if not exists public.produto_template_conhecimento (
  id uuid primary key default gen_random_uuid(),
  produto_template_id uuid not null references public.produto_templates(id) on delete cascade,
  tipo text,
  titulo text,
  conteudo text,
  ordem int,
  created_at timestamptz not null default now()
);
create index if not exists produto_template_conhecimento_pai_idx
  on public.produto_template_conhecimento (produto_template_id);

create table if not exists public.produto_template_midias (
  id uuid primary key default gen_random_uuid(),
  produto_template_id uuid not null references public.produto_templates(id) on delete cascade,
  arquivo_url text not null,
  arquivo_nome text,
  arquivo_tipo text,
  descricao text,
  ordem int,
  created_at timestamptz not null default now()
);
create index if not exists produto_template_midias_pai_idx
  on public.produto_template_midias (produto_template_id);

-- repropostas_lead_campanha (inferida de enviar_reproposta / obter_metricas_campanha)
create table if not exists public.repropostas_lead_campanha (
  id uuid primary key default gen_random_uuid(),
  campaign_lead_id uuid not null references public.leads_campanha(id) on delete cascade,
  texto text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists repropostas_lead_campanha_cl_idx
  on public.repropostas_lead_campanha (campaign_lead_id);

-- RLS + policies iguais às de produto_templates (service_role e platform_admin)
do $$
declare t text;
begin
  foreach t in array array['produto_template_conhecimento','produto_template_midias','repropostas_lead_campanha']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists service_role_all on public.%I', t);
    execute format('create policy service_role_all on public.%I for all to service_role using (true) with check (true)', t);
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format('create policy admin_all on public.%I for all to authenticated using (public.eh_admin_plataforma()) with check (public.eh_admin_plataforma())', t);
  end loop;
end $$;
