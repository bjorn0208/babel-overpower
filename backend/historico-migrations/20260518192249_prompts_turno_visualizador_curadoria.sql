-- Migration: prompts_turno — guarda o System Prompt literal montado pelo motor a cada turno.
-- Uso: visualizador "cérebro" (construção da mensagem) AGORA + Curadoria admin DEPOIS (mesmo recurso).
-- Decisões cravadas pelo Theus 2026-05-18: gravar SEMPRE (todo turno/tenant); retenção
-- configurável (coluna em config_plataforma; UI vem depois na Curadoria); limpeza por cron.
-- Padrão de RLS copiado de public.traces (traces_tenant_le): tenant vê o seu, super admin vê tudo.
-- Escrita é via service_role no motor (edge) — bypassa RLS, por isso só policy de SELECT.

set lock_timeout = '5s';
set statement_timeout = '30s';

create table if not exists public.prompts_turno (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  conversa_id     uuid not null references public.conversas(id) on delete cascade,
  agente_id       uuid,
  lead_id         uuid,
  modelo_llm      text,
  prompt_completo text not null,
  blocos          jsonb,
  criado_em       timestamptz not null default now()
);

comment on table public.prompts_turno is
  'System Prompt literal montado pelo motor ragentic por turno. Fonte única do visualizador de construção da mensagem e da Curadoria admin. Trilha com retenção (hard delete via cron, sem soft delete — igual traces). Escrita: service_role no motor.';

create index if not exists prompts_turno_conversa_criado_idx
  on public.prompts_turno (conversa_id, criado_em desc);
create index if not exists prompts_turno_tenant_idx
  on public.prompts_turno (tenant_id);
create index if not exists prompts_turno_criado_idx
  on public.prompts_turno (criado_em);

alter table public.prompts_turno enable row level security;

drop policy if exists prompts_turno_tenant_le on public.prompts_turno;
create policy prompts_turno_tenant_le on public.prompts_turno
  for select to authenticated
  using (
    tenant_id = (select auth.uid())
    or public.eh_super_admin((select auth.uid()))
  );

alter table public.config_plataforma
  add column if not exists retencao_prompts_turno_dias integer not null default 90;

comment on column public.config_plataforma.retencao_prompts_turno_dias is
  'Dias de retenção de public.prompts_turno antes da limpeza automática (cron). Editável pela Curadoria admin.';

create or replace function public.limpar_prompts_turno_expirados()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dias    integer;
  v_apagados integer;
begin
  select coalesce(max(retencao_prompts_turno_dias), 90) into v_dias
  from public.config_plataforma;

  delete from public.prompts_turno
  where criado_em < now() - (v_dias || ' days')::interval;

  get diagnostics v_apagados = row_count;
  return v_apagados;
end;
$$;

select cron.unschedule('limpar_prompts_turno')
where exists (select 1 from cron.job where jobname = 'limpar_prompts_turno');

select cron.schedule(
  'limpar_prompts_turno',
  '17 4 * * *',
  $$select public.limpar_prompts_turno_expirados();$$
);
;
