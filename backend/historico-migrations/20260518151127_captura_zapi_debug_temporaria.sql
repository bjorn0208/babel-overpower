-- Tabela TEMPORÁRIA de debug: captura o payload bruto do Z-API do canal do Diego
-- pra cravar por que o presence/digitando não popula estado_digitacao.
-- Será DROPADA na reversão (ver md de operação 1305 de 2026-05-18).
create table if not exists public.captura_zapi_debug (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  instance_id text,
  payload jsonb not null
);

create index if not exists captura_zapi_debug_criado_em_idx
  on public.captura_zapi_debug (criado_em desc);

alter table public.captura_zapi_debug enable row level security;

-- Tabela de debug efêmera: só service_role (webhook) escreve; service_role
-- ignora RLS. Policy restritiva nega qualquer acesso via authenticated/anon
-- (cumpre a regra inviolável "RLS + 1 policy na mesma migration").
drop policy if exists captura_zapi_debug_sem_acesso on public.captura_zapi_debug;
create policy captura_zapi_debug_sem_acesso
  on public.captura_zapi_debug
  for all
  to authenticated
  using (false)
  with check (false);
;
