CREATE OR REPLACE FUNCTION public.rifa_reservas_viram_divida()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_qtd integer := 0;
  v_p record;
  v_valor_unit integer;
begin
  for v_p in
    select pr.id, pr.tenant_id, pr.rifa_id, pr.nome, pr.phone, pr.numeros,
           pr.valor_centavos, pr.qtd_numeros,
           (r.data_sorteio_prevista + coalesce(r.hora_sorteio, '20:00'::time))
             at time zone 'America/Sao_Paulo' as sorteio_em
    from public.pedidos_rifa pr
    join public.rifas r on r.id = pr.rifa_id
    where pr.status = 'reservado'
      and pr.divida_gerada_em is null
      and r.status = 'ativa'
      and r.deleted_at is null
      -- Sem data cadastrada não existe "uma hora antes" — a dívida desse caso continua
      -- nascendo no sorteio, como sempre foi.
      and r.data_sorteio_prevista is not null
      and (r.data_sorteio_prevista + coalesce(r.hora_sorteio, '20:00'::time))
            at time zone 'America/Sao_Paulo' <= now() + interval '1 hour'
    limit 200
  loop
    -- Rateia o valor do pedido pelos números pra respeitar promoção ("10 por R$ 80" não pode
    -- virar dívida de preço cheio).
    v_valor_unit := greatest(1, round(v_p.valor_centavos::numeric / greatest(1, coalesce(v_p.qtd_numeros, 1)))::int);

    insert into public.rifa_dividas (tenant_id, rifa_id, numero, nome, phone, valor_centavos, origem, sorteio_em)
    select v_p.tenant_id, v_p.rifa_id, n, v_p.nome, v_p.phone, v_valor_unit, 'reserva', v_p.sorteio_em
    from unnest(coalesce(v_p.numeros, '{}')) n
    on conflict (rifa_id, numero) do nothing;

    -- O número CONTINUA reservado no nome da pessoa: nada é apagado de `numeros_rifa`.
    -- `expira_em` zerado só pra tirar o pedido de qualquer varredura de expiração.
    update public.pedidos_rifa
    set divida_gerada_em = now(), expira_em = null, updated_at = now()
    where id = v_p.id;

    v_qtd := v_qtd + 1;
  end loop;
  return v_qtd;
end;
$function$

