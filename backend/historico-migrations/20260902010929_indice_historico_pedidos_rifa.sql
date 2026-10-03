create index if not exists pedidos_rifa_concluido_em_idx
  on public.pedidos_rifa (tenant_id, (coalesce(pago_em, updated_at)))
  where status in ('pago', 'rejeitado', 'expirado');

create index if not exists pedidos_rifa_ativos_idx
  on public.pedidos_rifa (tenant_id, status)
  where status in ('reservado', 'aguardando_validacao');

;
