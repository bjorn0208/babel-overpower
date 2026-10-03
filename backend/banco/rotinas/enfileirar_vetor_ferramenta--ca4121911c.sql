CREATE OR REPLACE FUNCTION public.enfileirar_vetor_ferramenta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_texto text;
begin
  v_texto := trim(coalesce(new.nome_tool, '') || ' ' || coalesce(new.descricao, ''));
  if v_texto <> '' then
    perform pgmq.send(
      'embedding_jobs',
      jsonb_build_object('table', 'ferramentas_dinamicas', 'row_id', new.id, 'text', v_texto)
    );
  end if;
  return null;
end;
$function$

