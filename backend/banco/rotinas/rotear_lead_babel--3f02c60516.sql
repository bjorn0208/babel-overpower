CREATE OR REPLACE FUNCTION public.rotear_lead_babel(p_lead_babel_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_lead      public.leads_babel%rowtype;
  v_hoje      date := (now() at time zone 'America/Sao_Paulo')::date;
  v_escolhido record;
  v_entrega   uuid;
begin
  select * into v_lead from public.leads_babel where id = p_lead_babel_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'lead_nao_encontrado');
  end if;
  if v_lead.campanha_babel_id is null then
    return jsonb_build_object('ok', false, 'erro', 'lead_sem_campanha');
  end if;
  if v_lead.status <> 'pronto' then
    return jsonb_build_object('ok', false, 'erro', 'lead_nao_esta_pronto', 'status', v_lead.status);
  end if;
  perform pg_advisory_xact_lock(hashtext(v_lead.campanha_babel_id::text));
  with elegiveis as (
    select p.tenant_id, p.peso, p.criado_em as entrou_em,
           (select count(*) from public.entregas_lead_babel e
             where e.campanha_babel_id = p.campanha_babel_id and e.tenant_id = p.tenant_id
               and e.devolvido_em is null and e.deleted_at is null) as entregues,
           (select count(*) from public.entregas_lead_babel e
             where e.campanha_babel_id = p.campanha_babel_id and e.tenant_id = p.tenant_id
               and e.devolvido_em is null and e.deleted_at is null
               and (e.entregue_em at time zone 'America/Sao_Paulo')::date = v_hoje) as entregues_hoje,
           (select count(*) from public.entregas_lead_babel e
             where e.campanha_babel_id = p.campanha_babel_id
               and e.devolvido_em is null and e.deleted_at is null
               and e.entregue_em >= p.criado_em) as total_desde_que_entrou,
           p.teto_total, p.limite_dia
      from public.campanhas_babel_participantes p
      join public.campanhas_babel c on c.id = p.campanha_babel_id
                                   and c.status = 'ativa' and c.deleted_at is null
     where p.campanha_babel_id = v_lead.campanha_babel_id
       and p.pausado = false and p.deleted_at is null
  ),
  aptos as (
    select * from elegiveis
     where (teto_total is null or entregues < teto_total)
       and (limite_dia is null or entregues_hoje < limite_dia)
  ),
  soma as (select sum(peso) as soma_peso from aptos),
  ranqueado as (
    select a.tenant_id, a.entregues,
           (a.peso / s.soma_peso) * a.total_desde_que_entrou as alvo,
           ((a.peso / s.soma_peso) * a.total_desde_que_entrou) - a.entregues as atraso,
           a.peso
      from aptos a cross join soma s
  )
  select tenant_id, entregues, alvo, atraso
    into v_escolhido
    from ranqueado
   order by atraso desc, peso desc, entregues asc, tenant_id
   limit 1;
  if v_escolhido.tenant_id is null then
    return jsonb_build_object('ok', false, 'erro', 'ninguem_elegivel');
  end if;
  insert into public.entregas_lead_babel (lead_babel_id, campanha_babel_id, tenant_id, motivo_escolha)
  values (p_lead_babel_id, v_lead.campanha_babel_id, v_escolhido.tenant_id,
          format('%s lead(s) atrás do alvo (alvo %s, entregues %s)',
                 round(v_escolhido.atraso::numeric, 2), round(v_escolhido.alvo::numeric, 2), v_escolhido.entregues))
  returning id into v_entrega;
  update public.leads_babel
     set status = 'entregue', atualizado_em = now()
   where id = p_lead_babel_id;
  return jsonb_build_object('ok', true, 'entrega_id', v_entrega, 'tenant_id', v_escolhido.tenant_id,
                            'motivo', format('%s lead(s) atrás do alvo', round(v_escolhido.atraso::numeric, 2)));
end;
$function$

