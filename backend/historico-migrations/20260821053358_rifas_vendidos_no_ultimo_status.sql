-- Status só posta quando HÁ VENDA NOVA (pedido do Dominic, 2026-08-21):
-- o cron de 30min compara os vendidos atuais com o snapshot do último post.
alter table public.rifas add column if not exists vendidos_no_ultimo_status integer;
comment on column public.rifas.vendidos_no_ultimo_status is
  'Qtd de números pagos no momento do último post de Status. Cron só posta de novo quando o valor muda (venda nova). NULL = nunca postou. O botão de teste ignora e sempre posta.';
;
