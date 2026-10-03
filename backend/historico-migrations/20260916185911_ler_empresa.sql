create or replace function public.ler_empresa(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with mes as (select date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' as inicio),
  hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
  select jsonb_build_object(
    'empresa', (select jsonb_build_object('nome', e.nome, 'cidade', e.cidade, 'estado', e.estado, 'descricao', left(coalesce(e.descricao,''), 240))
                  from public.empresas e where e.user_id = p_tenant_id order by e.created_at limit 1),
    'nicho', (select n.nome_exibicao from public.profiles p left join public.nichos n on n.id = p.nicho_id where p.id = p_tenant_id),
    'equipe', (select count(*) from public.profiles f where f.parent_user_id = p_tenant_id and f.deleted_at is null),
    'produtos_ativos', (select count(*) from public.produtos pr where (pr.user_id = p_tenant_id or pr.owner_id = p_tenant_id) and pr.ativo),
    'canais_whatsapp', (select count(*) from public.canais c where c.user_id = p_tenant_id and c.type = 'whatsapp' and c.is_active),
    'leads', jsonb_build_object(
      'total', (select count(*) from public.leads l where l.tenant_id = p_tenant_id and l.deleted_at is null),
      'na_base', (select count(*) from public.leads l where l.tenant_id = p_tenant_id and l.deleted_at is null and l.location = 'base'),
      'quentes', (select count(*) from public.leads l where l.tenant_id = p_tenant_id and l.deleted_at is null and l.temperatura_lead = 'quente'),
      'novos_7d', (select count(*) from public.leads l where l.tenant_id = p_tenant_id and l.deleted_at is null and l.created_at >= now() - interval '7 days'),
      'novos_hoje', (select count(*) from public.leads l, hoje where l.tenant_id = p_tenant_id and l.deleted_at is null and (l.created_at at time zone 'America/Sao_Paulo')::date = hoje.d),
      'calados_7d', (select count(*) from public.leads l where l.tenant_id = p_tenant_id and l.deleted_at is null and l.ultima_resposta_lead_em < now() - interval '7 days' and l.ultima_resposta_lead_em >= now() - interval '30 days'),
      'quentes_sem_resposta_24h', (select count(*) from public.leads l where l.tenant_id = p_tenant_id and l.deleted_at is null and l.temperatura_lead = 'quente' and l.ultima_resposta_lead_em < now() - interval '24 hours'),
      'convertidos_mes', (select count(*) from public.leads l, mes where l.tenant_id = p_tenant_id and l.deleted_at is null and l.converted_at >= mes.inicio)
    ),
    'conversas', jsonb_build_object(
      'ativas', (select count(*) from public.conversas c where c.tenant_id = p_tenant_id and c.status <> 'encerrada'),
      'precisa_humano', (select count(*) from public.leads l where l.tenant_id = p_tenant_id and l.deleted_at is null and l.precisa_humano = true)
    ),
    'vendas_mes', jsonb_build_object(
      'pagos', (select count(*) from public.pagamentos_cliente pg, mes where pg.tenant_id = p_tenant_id and pg.status = 'pago' and pg.data_pagamento >= mes.inicio),
      'valor_pago', (select coalesce(sum(pg.valor),0) from public.pagamentos_cliente pg, mes where pg.tenant_id = p_tenant_id and pg.status = 'pago' and pg.data_pagamento >= mes.inicio),
      'a_receber_vencido', (select coalesce(sum(pg.valor),0) from public.pagamentos_cliente pg where pg.tenant_id = p_tenant_id and pg.status <> 'pago' and pg.data_vencimento < now()),
      'a_vencer_7d', (select coalesce(sum(pg.valor),0) from public.pagamentos_cliente pg where pg.tenant_id = p_tenant_id and pg.status <> 'pago' and pg.data_vencimento between now() and now() + interval '7 days')
    ),
    'contratos', jsonb_build_object(
      'assinados_mes', (select count(*) from public.contratos ct, mes where ct.tenant_id = p_tenant_id and ct.assinado_em >= mes.inicio),
      'parados_7d', (select count(*) from public.contratos ct where ct.tenant_id = p_tenant_id and ct.assinado_em is null and ct.created_at < now() - interval '7 days' and ct.created_at >= now() - interval '60 days')
    ),
    'campanhas', jsonb_build_object(
      'ativas', (select count(*) from public.campanhas cp where cp.tenant_id = p_tenant_id and cp.status = 'ativa' and cp.deleted_at is null),
      'leads_na_esteira', (select count(*) from public.leads_campanha lc join public.campanhas cp on cp.id = lc.campaign_id where cp.tenant_id = p_tenant_id and cp.status = 'ativa' and lc.state = 'ativo')
    ),
    'leads_da_babel_7d', (select count(*) from public.entregas_lead_babel eb where eb.tenant_id = p_tenant_id and eb.devolvido_em is null and eb.entregue_em >= now() - interval '7 days'),
    'gerado_em', now()
  );
$$;
revoke all on function public.ler_empresa(uuid) from public, anon;
grant execute on function public.ler_empresa(uuid) to authenticated, service_role;
;
