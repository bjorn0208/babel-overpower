-- O lembrete de reserva a vencer não pode nascer em conversa do Chat de Teste (Δ 2026-09-09).
-- Achado ao conferir o que estava na fila antes do Theus plugar o WhatsApp real: havia UM pedido
-- reservado numa conversa `channel='teste'` (phone `__chat_teste_…`), que geraria bolha na caixa
-- de saída. O consumidor não conseguiria entregar (o telefone não existe), mas sobra lixo na
-- fila e ruído no histórico do Chat de Teste. Filtro por canal, na origem.

create or replace function public.avisar_reservas_rifa_a_vencer()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qtd integer := 0;
  v_p record;
  v_texto text;
begin
  for v_p in
    select pr.id, pr.tenant_id, pr.conversa_id, pr.numeros, pr.valor_centavos, pr.expira_em,
           r.titulo, coalesce(rc.chave_pix, pf.chave_pix) as chave_pix
    from public.pedidos_rifa pr
    join public.rifas r on r.id = pr.rifa_id
    join public.conversas c on c.id = pr.conversa_id
    left join public.profiles pf on pf.id = pr.tenant_id
    left join public.rifas_config_tenant rc on rc.tenant_id = pr.tenant_id
    where pr.status = 'reservado'
      and pr.aviso_expiracao_em is null
      and pr.conversa_id is not null
      and pr.expira_em is not null
      and pr.expira_em > now()
      and pr.expira_em <= now() + interval '10 minutes'
      and c.status <> 'encerrada'
      and coalesce(c.channel, '') <> 'teste'
    limit 50
  loop
    v_texto :=
      'Oi! Passando pra lembrar: seus números da rifa "' || v_p.titulo || '" (' ||
      array_to_string(v_p.numeros, ', ') || ') estão reservados até as ' ||
      to_char(v_p.expira_em at time zone 'America/Sao_Paulo', 'HH24:MI') ||
      '. Depois disso eles voltam pro sorteio. Valor: R$ ' ||
      replace(to_char(v_p.valor_centavos / 100.0, 'FM999999990D00'), '.', ',') ||
      case when v_p.chave_pix is not null then ' — PIX: ' || v_p.chave_pix else '' end ||
      '. Assim que pagar, é só mandar o comprovante aqui na conversa que eu confirmo 😉';

    insert into public.caixa_saida_mensagens
      (tenant_id, conversation_id, status, content, bubble_order, scheduled_at, carga)
    values
      (v_p.tenant_id, v_p.conversa_id, 'pendente', v_texto, 0, now(),
       jsonb_build_object('origem', 'cron_aviso_reserva_rifa', 'pedido_id', v_p.id));

    update public.pedidos_rifa set aviso_expiracao_em = now(), updated_at = now()
    where id = v_p.id;
    v_qtd := v_qtd + 1;
  end loop;
  return v_qtd;
end;
$$;

revoke all on function public.avisar_reservas_rifa_a_vencer() from public, anon, authenticated;
;
