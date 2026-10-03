-- Reserva não paga vira DÍVIDA uma hora antes do sorteio, e o número NÃO volta pro pote.
-- Regra cravada pelo Theus em 2026-09-09: é a regra da rifa de rua — pegou o número, deve.
-- Quem perdoa e devolve o número pro pote é o dono, na mão (rejeitar o pedido já faz isso).
--
-- O que sai de cena: o cron `expirar_reservas_rifa`, que apagava os `numeros_rifa` e marcava o
-- pedido como `expirado` assim que `expira_em` passava. A função continua existindo (nada que
-- chame por fora quebra), mas sai do agendamento.

alter table public.pedidos_rifa
  add column if not exists divida_gerada_em timestamptz;

comment on column public.pedidos_rifa.divida_gerada_em is
  'Quando a reserva não paga virou dívida (1h antes do sorteio). Null = ainda não virou. Garante 1 conversão por pedido.';

create index if not exists pedidos_rifa_divida_pendente_idx
  on public.pedidos_rifa (rifa_id)
  where status = 'reservado' and divida_gerada_em is null;

create or replace function public.rifa_reservas_viram_divida()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

comment on function public.rifa_reservas_viram_divida() is
  'Uma hora antes do sorteio, toda reserva não paga vira dívida (1 linha por número). O número NÃO volta pro pote — só sai se o dono rejeitar o pedido. Cron rifa_reservas_viram_divida, */10min.';

revoke all on function public.rifa_reservas_viram_divida() from public, anon, authenticated;

-- Cron novo entra, cron que devolvia número sai.
select cron.unschedule('rifa_reservas_viram_divida') where exists (
  select 1 from cron.job where jobname = 'rifa_reservas_viram_divida'
);
select cron.schedule('rifa_reservas_viram_divida', '*/10 * * * *', $cron$select public.rifa_reservas_viram_divida()$cron$);

select cron.unschedule('expirar_reservas_rifa') where exists (
  select 1 from cron.job where jobname = 'expirar_reservas_rifa'
);
;
