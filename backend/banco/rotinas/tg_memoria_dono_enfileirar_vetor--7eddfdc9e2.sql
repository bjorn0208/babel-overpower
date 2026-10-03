CREATE OR REPLACE FUNCTION public.tg_memoria_dono_enfileirar_vetor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'UPDATE' and new.fato is not distinct from old.fato then
    return new;
  end if;
  if new.fato is not null and trim(new.fato) <> '' then
    perform pgmq.send('embedding_jobs', jsonb_build_object('table', 'memoria_dono', 'row_id', new.id,
      'text', trim(coalesce(new.categoria, '') || ' — ' || new.fato)));
    new.embedding_status := 'pendente';
  end if;
  return new;
end;
$function$

