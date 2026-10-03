CREATE OR REPLACE FUNCTION public.tg_vocab_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM pg_notify('vocabulario_atualizado', '');
  RETURN COALESCE(NEW, OLD);
END;
$function$

