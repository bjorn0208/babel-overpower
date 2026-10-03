CREATE OR REPLACE FUNCTION public.rifa_reembolsar_pedido(p_pedido uuid, p_numeros integer[] DEFAULT NULL::integer[], p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_p public.pedidos_rifa%rowtype;
  v_r public.rifas%rowtype;
  v_alvo integer[];
  v_resto integer[];
  v_reembolso integer;
  v_motivo text := coalesce(nullif(btrim(p_motivo), ''), 'Desistência com reembolso');
begin
  select * into v_p from public.pedidos_rifa where id = p_pedido for update;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'pedido_nao_encontrado');
  end if;
  if v_p.tenant_id is distinct from (select auth.uid()) then
    return jsonb_build_object('ok', false, 'erro', 'sem_permissao');
  end if;
  if v_p.status <> 'pago' then
    return jsonb_build_object('ok', false, 'erro', 'so_pedido_pago (' || v_p.status || ')');
  end if;

  select * into v_r from public.rifas where id = v_p.rifa_id for update;
  if v_r.status = 'sorteada' or v_r.numero_sorteado is not null or v_r.sorteada_em is not null then
    return jsonb_build_object('ok', false, 'erro', 'rifa_ja_sorteada');
  end if;

  -- Sem lista = pedido inteiro. Número que não é deste pedido invalida a chamada toda.
  v_alvo := coalesce(p_numeros, v_p.numeros);
  select coalesce(array_agg(distinct n order by n), '{}') into v_alvo from unnest(v_alvo) n;
  if cardinality(v_alvo) = 0 then
    return jsonb_build_object('ok', false, 'erro', 'nenhum_numero');
  end if;
  if not (v_alvo <@ v_p.numeros) then
    return jsonb_build_object('ok', false, 'erro', 'numero_fora_do_pedido');
  end if;
  select coalesce(array_agg(n order by n), '{}') into v_resto from unnest(v_p.numeros) n where n <> all(v_alvo);

  -- Rateio pelo que o comprador pagou (respeita promoção); pedido inteiro devolve o valor cheio.
  v_reembolso := case when cardinality(v_resto) = 0 then v_p.valor_centavos
    else round(v_p.valor_centavos::numeric * cardinality(v_alvo) / greatest(1, cardinality(v_p.numeros)))::int end;

  delete from public.numeros_rifa where pedido_id = v_p.id and numero = any(v_alvo);

  -- Status do WhatsApp (Fabrício 10/09): número devolvido tem que aparecer na cartela. O
  -- cron-status-rifa (a cada 2 min) só posta quando a CONTAGEM de ocupados muda — um reembolso
  -- e uma reserva no mesmo intervalo empatam e nada sai. Snapshot nulo = "mudou": o próximo giro
  -- regera a cartela e posta, mesmo se a rifa ficou sem nenhum número ocupado.
  update public.rifas set vendidos_no_ultimo_status = null where id = v_r.id;

  update public.rifas
  set cotas_premiadas = (
        select jsonb_agg(case
          when c->>'pedido_ganhador' = v_p.id::text and (c->>'numero')::int = any(v_alvo)
            then c - 'pedido_ganhador' - 'ganhador_nome'
          else c end)
        from jsonb_array_elements(cotas_premiadas) c),
      updated_at = now()
  where id = v_r.id and jsonb_typeof(cotas_premiadas) = 'array' and jsonb_array_length(cotas_premiadas) > 0;

  if cardinality(v_resto) = 0 then
    update public.pedidos_rifa
    set status = 'cancelado', expira_em = null,
        reembolsado_em = now(), reembolso_centavos = reembolso_centavos + v_reembolso,
        numeros_reembolsados = numeros_reembolsados || v_alvo, motivo_reembolso = v_motivo,
        updated_at = now()
    where id = v_p.id;
  else
    update public.pedidos_rifa
    set numeros = v_resto, qtd_numeros = cardinality(v_resto), valor_centavos = valor_centavos - v_reembolso,
        reembolsado_em = now(), reembolso_centavos = reembolso_centavos + v_reembolso,
        numeros_reembolsados = numeros_reembolsados || v_alvo, motivo_reembolso = v_motivo,
        updated_at = now()
    where id = v_p.id;
  end if;

  return jsonb_build_object('ok', true,
    'status', case when cardinality(v_resto) = 0 then 'cancelado' else 'pago' end,
    'numeros_liberados', to_jsonb(v_alvo), 'numeros_restantes', to_jsonb(v_resto),
    'reembolso_centavos', v_reembolso);
end;
$function$

