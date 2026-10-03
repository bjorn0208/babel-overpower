CREATE OR REPLACE FUNCTION public.tg_vocab_atualizado_em()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN NEW.atualizado_em := now(); RETURN NEW; END; $function$

