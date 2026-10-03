CREATE OR REPLACE FUNCTION public.rifa_sorteio_em(p_rifa uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when r.data_sorteio_prevista is null then null else
    (r.data_sorteio_prevista + coalesce(
      r.hora_sorteio,
      (select public.rifa_normalizar_hora(ri.hora_sorteio)
         from public.rifa_imagens ri
        where ri.rifa_id = r.id and ri.deleted_at is null and ri.hora_sorteio is not null
        order by ri.created_at desc
        limit 1),
      public.rifa_hora_padrao_metodo(r.metodo_sorteio, r.data_sorteio_prevista),
      time '20:00'
    )) at time zone 'America/Sao_Paulo'
  end
  from public.rifas r
  where r.id = p_rifa
$function$

