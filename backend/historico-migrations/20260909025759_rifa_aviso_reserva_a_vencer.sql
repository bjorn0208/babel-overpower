-- Aviso ANTES da reserva vencer (Fase 3 do plano de Rifas, 2026-09-08).
--
-- Hoje o único cron que olha reserva é `expirar_reservas_rifa` (*/5min), e ele só apaga: o
-- comprador descobre que perdeu os números quando volta e eles já foram. 11 pedidos estão
-- parados em `reservado` e ninguém foi lembrado. Este cron manda UMA bolha ~10 min antes do
-- prazo, com número, valor, PIX e link do pedido.
--
-- Alcance de propósito estreito: só pedido com `conversa_id` (veio do agente ou do link com
-- conversa aberta) e conversa não encerrada. Pedido digitado no painel não tem conversa e não
-- recebe nada — quem cobra ali é o dono.

alter table public.pedidos_rifa
  add column if not exists aviso_expiracao_em timestamptz;

comment on column public.pedidos_rifa.aviso_expiracao_em is
  'Quando o lembrete de "sua reserva está pra vencer" foi enfileirado. Null = ainda não avisado. Garante 1 aviso por pedido.';

create index if not exists pedidos_rifa_aviso_pendente_idx
  on public.pedidos_rifa (expira_em)
  where status = 'reservado' and aviso_expiracao_em is null and conversa_id is not null;

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
  v_link text;
  v_base text := 'https://www.plataformalimpa.com.br';
begin
  for v_p in
    select pr.id, pr.tenant_id, pr.conversa_id, pr.numeros, pr.valor_centavos,
           pr.chave_publica as pedido_token, pr.expira_em,
           r.chave_publica as rifa_token, r.titulo,
           coalesce(rc.chave_pix, pf.chave_pix) as chave_pix
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
    limit 50
  loop
    v_link := v_base || '/rifa/' || v_p.rifa_token::text || '?pedido=' || v_p.pedido_token::text;
    v_texto :=
      'Oi! Passando pra lembrar: seus números da rifa "' || v_p.titulo || '" (' ||
      array_to_string(v_p.numeros, ', ') || ') estão reservados até as ' ||
      to_char(v_p.expira_em at time zone 'America/Sao_Paulo', 'HH24:MI') ||
      '. Depois disso eles voltam pro sorteio. Valor: R$ ' ||
      to_char(v_p.valor_centavos / 100.0, 'FM999G990D00') ||
      case when v_p.chave_pix is not null then ' — PIX: ' || v_p.chave_pix else '' end ||
      '. Assim que pagar, é só mandar o comprovante aqui ou por este link: ' || v_link;

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

comment on function public.avisar_reservas_rifa_a_vencer() is
  'Manda 1 lembrete por pedido ~10 min antes da reserva expirar (número, valor, PIX e link). Roda no cron avisar_reservas_rifa, */5min, logo antes do expirar_reservas_rifa.';

revoke all on function public.avisar_reservas_rifa_a_vencer() from public, anon, authenticated;

select cron.unschedule('avisar_reservas_rifa') where exists (
  select 1 from cron.job where jobname = 'avisar_reservas_rifa'
);
select cron.schedule('avisar_reservas_rifa', '*/5 * * * *', $cron$select public.avisar_reservas_rifa_a_vencer()$cron$);
;
