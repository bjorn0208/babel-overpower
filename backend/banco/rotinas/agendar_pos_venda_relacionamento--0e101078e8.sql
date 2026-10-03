CREATE OR REPLACE FUNCTION public.agendar_pos_venda_relacionamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_agente uuid;
  v_cfg jsonb;
  v_horas jsonb;
  v_total int;
  v_i int := 0;
  v_h jsonb;
begin
  if new.conversa_id is null then return new; end if;
  begin
    v_agente := coalesce(new.agente_id, (select c.agente_id from public.conversas c where c.id = new.conversa_id));
    if v_agente is null then return new; end if;
    select a.configuracao -> 'pos_venda_relacionamento' into v_cfg from public.agentes_usuario a where a.id = v_agente;
    if v_cfg is null or coalesce((v_cfg ->> 'ativo')::boolean, false) = false then return new; end if;

    v_horas := case when jsonb_typeof(v_cfg -> 'horas') = 'array' then v_cfg -> 'horas' else '[1,3,5]'::jsonb end;
    v_total := jsonb_array_length(v_horas);
    -- Idempotente: contrato reassinado/atualizado não duplica os toques.
    if exists (select 1 from public.acoes_agendadas x
                where x.conversation_id = new.conversa_id and x.action_type = 'pos_venda_relacionamento'
                  and x.carga ->> 'contrato_id' = new.id::text) then
      return new;
    end if;
    for v_h in select * from jsonb_array_elements(v_horas) loop
      v_i := v_i + 1;
      insert into public.acoes_agendadas (conversation_id, agente_id, tenant_id, lead_id, action_type, scheduled_at, status, carga)
      values (new.conversa_id, v_agente, new.tenant_id, new.lead_id, 'pos_venda_relacionamento',
              new.assinado_em + make_interval(mins => (v_h::text::numeric * 60)::int), 'pendente',
              jsonb_build_object('tentativa', v_i, 'total_tentativas', v_total, 'contrato_id', new.id,
                                 'silencio_min_minutos', coalesce((v_cfg ->> 'silencio_min_minutos')::int, 40),
                                 'origem', 'trigger_contrato_assinado'));
    end loop;
  exception when others then
    raise warning 'agendar_pos_venda_relacionamento falhou (contrato %): %', new.id, sqlerrm;
  end;
  return new;
end;
$function$

