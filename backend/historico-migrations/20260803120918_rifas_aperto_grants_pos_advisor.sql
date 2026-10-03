-- Aperto pós-advisor (app Rifas): default privileges do Supabase concedem EXECUTE
-- a anon/authenticated em função nova — revogar onde o papel não tem vez.
-- RPCs públicas (obter_rifa/reservar/obter_pedido/comprovante) mantêm anon de propósito.

revoke execute on function public.sortear_rifa(uuid, integer) from anon;
revoke execute on function public.confirmar_pagamento_pedido_rifa(uuid, boolean, text) from anon;
revoke execute on function public.rifa_pode_vender(uuid) from anon;
revoke execute on function public.expirar_reservas_rifa() from anon, authenticated;

-- Bucket público dispensa policy de SELECT (URL pública não passa por RLS);
-- policy só permitia LISTAR o bucket inteiro via API — superfície desnecessária.
drop policy if exists rifas_leitura_publica_anexos on storage.objects;
;
