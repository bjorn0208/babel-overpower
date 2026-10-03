CREATE OR REPLACE FUNCTION public.vigia_bolhas_barradas()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_total   integer;
  v_detalhe jsonb;
begin
  select count(*), coalesce(jsonb_agg(jsonb_build_object(
           'tenant', coalesce(p.full_name, c.tenant_id::text),
           'motivo', c.error_reason,
           'conteudo', left(c.content, 200),
           'quando', c.created_at
         ) order by c.created_at desc), '[]'::jsonb)
    into v_total, v_detalhe
    from public.caixa_saida_mensagens c
    left join public.profiles p on p.id = c.tenant_id
   where c.error_reason in ('link_contrato_fantasma', 'placeholder_nao_resolvido')
     and c.created_at > now() - interval '24 hours';

  if v_total = 0 then
    return 0;
  end if;

  insert into public.alertas_operacao (tipo, severidade, resumo, detalhes)
  values (
    'bolha_barrada',
    case when v_total >= 5 then 'critico' else 'alerta' end,
    v_total || ' bolha(s) barradas nas últimas 24h por link de contrato inventado ou placeholder não resolvido',
    jsonb_build_object('total', v_total, 'ocorrencias', v_detalhe)
  );

  return v_total;
end $function$

