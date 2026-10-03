CREATE OR REPLACE FUNCTION public.pacotes_conhecimento_blocos_fts_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.fts := to_tsvector('portuguese'::regconfig, coalesce(NEW.titulo, '') || ' ' || coalesce(NEW.conteudo, ''));
  RETURN NEW;
END;
$function$

