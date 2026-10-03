CREATE OR REPLACE FUNCTION public.avisar_dono_reservas_vencidas()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_qtd integer := 0;
  v_g record;
begin
  for v_g in
    select pr.tenant_id, pr.rifa_id, r.titulo,
           array_agg(pr.id) as ids,
           count(*) as n,
           string_agg(
             coalesce(pr.nome, 'Sem nome') || ' (' || array_to_string(pr.numeros, ', ') || ') R$ ' ||
             replace(to_char(pr.valor_centavos / 100.0, 'FM999999990D00'), '.', ','),
             ' · ' order by pr.created_at) as lista
    from public.pedidos_rifa pr
    join public.rifas r on r.id = pr.rifa_id
    where pr.status = 'reservado'
      and pr.expira_em is not null
      and pr.expira_em < now()
      and pr.aviso_dono_em is null
      and pr.divida_gerada_em is null
      and pr.divida_dispensada_em is null
      and r.status = 'ativa'
      and r.deleted_at is null
    group by pr.tenant_id, pr.rifa_id, r.titulo
  loop
    insert into public.notificacoes (user_id, tipo, icone, titulo, mensagem, acao, acao_label)
    values (
      v_g.tenant_id, 'aviso', 'rifa',
      'Reservas sem pagamento — ' || v_g.titulo,
      v_g.n || ' reserva(s) passaram do prazo de pagamento sem pagar: ' || v_g.lista ||
        '. Em Rifas > Pedidos, escolha "Mandar pra dívida" ou "Não cobrar". Se não decidir, ' ||
        'o sorteio lança como dívida, como sempre.',
      'rifas', 'Abrir Rifas'
    );
    update public.pedidos_rifa set aviso_dono_em = now() where id = any(v_g.ids);
    v_qtd := v_qtd + v_g.n;
  end loop;
  return v_qtd;
end;
$function$

