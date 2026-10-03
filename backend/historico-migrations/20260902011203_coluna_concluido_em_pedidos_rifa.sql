alter table public.pedidos_rifa
  add column if not exists concluido_em timestamptz generated always as (coalesce(pago_em, updated_at)) stored;

drop index if exists pedidos_rifa_concluido_em_idx;
create index if not exists pedidos_rifa_concluido_em_idx
  on public.pedidos_rifa (tenant_id, concluido_em)
  where status in ('pago', 'rejeitado', 'expirado', 'cancelado');

;
