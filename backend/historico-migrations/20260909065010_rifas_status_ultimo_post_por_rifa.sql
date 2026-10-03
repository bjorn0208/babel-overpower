-- Quando a rifa foi ao Status pela última vez, POR RIFA (Δ 2026-09-09).
-- Existia só `rifas_config_tenant.status_ultimo_post_em`, que é do tenant inteiro — não dá pra
-- saber se ESTA rifa está há uma hora sem aparecer. A regra nova do Theus precisa disso: sem
-- venda por 1h, republica a última cartela pra rifa não sumir da vitrine.

alter table public.rifas
  add column if not exists status_ultimo_post_em timestamptz;

comment on column public.rifas.status_ultimo_post_em is
  'Último post desta rifa no Status do WhatsApp. Usado para republicar a cartela quando passa 1h sem venda nova.';
;
