CREATE OR REPLACE FUNCTION public.blocos_conhecimento_fts_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.fts := to_tsvector('portuguese', coalesce(NEW.title, '') || ' ' || coalesce(NEW.content, ''));
  RETURN NEW;
END;
$function$

