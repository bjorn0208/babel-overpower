CREATE OR REPLACE FUNCTION public.gestao_registra_pagamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if old.pago_em is not null and (to_jsonb(new) - 'atualizado_em') is distinct from (to_jsonb(old) - 'atualizado_em') then
    insert into public.gestao_pagamentos_log (tabela, linha_id, cliente_id, acao, antes, depois, por)
    values (tg_table_name, old.id, old.cliente_id,
            case when new.deleted_at is not null and old.deleted_at is null then 'apagou' when new.pago_em is null then 'desmarcou' else 'alterou' end,
            to_jsonb(old), to_jsonb(new), (select auth.uid()));
  end if;
  return new;
end $function$

