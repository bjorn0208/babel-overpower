-- Bloco 0 do plano-mãe (2026-09-16): o gasto de LLM passa a ter dono (tenant) e teto.
set lock_timeout = '5s';
set statement_timeout = '60s';

alter table public.logs_requisicao_llm add column if not exists tenant_id uuid;
create index if not exists logs_requisicao_llm_tenant_mes_idx
  on public.logs_requisicao_llm (tenant_id, created_at)
  where tenant_id is not null;

create table if not exists public.orcamento_llm_tenant (
  tenant_id        uuid primary key references public.profiles(id) on delete cascade,
  teto_mensal_usd  numeric(10,2) not null default 5.00,
  aviso_pct        smallint not null default 80,
  corte_pct        smallint not null default 100,
  ativo            boolean not null default true,
  observacao       text,
  atualizado_em    timestamptz not null default now()
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orcamento_llm_tenant_pct_check') then
    alter table public.orcamento_llm_tenant add constraint orcamento_llm_tenant_pct_check
      check (aviso_pct between 1 and 100 and corte_pct between aviso_pct and 500 and teto_mensal_usd >= 0);
  end if;
end $$;

alter table public.orcamento_llm_tenant enable row level security;
drop policy if exists orcamento_llm_admin on public.orcamento_llm_tenant;
create policy orcamento_llm_admin on public.orcamento_llm_tenant
  for all to authenticated
  using (public.eh_admin_plataforma())
  with check (public.eh_admin_plataforma());
drop policy if exists orcamento_llm_tenant_le on public.orcamento_llm_tenant;
create policy orcamento_llm_tenant_le on public.orcamento_llm_tenant
  for select to authenticated
  using (tenant_id = (select auth.uid()));

create or replace function public.custo_llm_tenant_mes(p_tenant_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(l.custo_total), 0)::numeric
    from public.logs_requisicao_llm l
   where l.tenant_id = p_tenant_id
     and l.created_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
$$;
revoke all on function public.custo_llm_tenant_mes(uuid) from public, anon;
grant execute on function public.custo_llm_tenant_mes(uuid) to authenticated, service_role;

create or replace function public.pode_gastar_llm(p_tenant_id uuid, p_teto_padrao_usd numeric default 5.00)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_teto   numeric := p_teto_padrao_usd;
  v_aviso  smallint := 80;
  v_corte  smallint := 100;
  v_ativo  boolean := true;
  v_gasto  numeric;
  v_pct    numeric;
  v_modo   text;
begin
  select teto_mensal_usd, aviso_pct, corte_pct, ativo
    into v_teto, v_aviso, v_corte, v_ativo
    from public.orcamento_llm_tenant where tenant_id = p_tenant_id;
  if not found then
    v_teto := p_teto_padrao_usd;
  end if;
  v_gasto := public.custo_llm_tenant_mes(p_tenant_id);
  v_pct := case when v_teto > 0 then round((v_gasto / v_teto) * 100, 1) else 0 end;
  v_modo := case
    when not v_ativo or v_teto <= 0 then 'normal'
    when v_pct >= v_corte then 'bloqueado'
    when v_pct >= v_aviso then 'economico'
    else 'normal' end;
  return jsonb_build_object('ok', true, 'modo', v_modo, 'gasto_usd', round(v_gasto, 4),
                            'teto_usd', v_teto, 'pct', v_pct);
end;
$$;
revoke all on function public.pode_gastar_llm(uuid, numeric) from public, anon;
grant execute on function public.pode_gastar_llm(uuid, numeric) to authenticated, service_role;
;
