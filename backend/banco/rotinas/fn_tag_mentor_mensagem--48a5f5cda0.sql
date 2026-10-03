CREATE OR REPLACE FUNCTION public.fn_tag_mentor_mensagem()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.tags := public.fn_tags_do_texto(coalesce(new.conteudo, ''));
  return new;
end
$function$

