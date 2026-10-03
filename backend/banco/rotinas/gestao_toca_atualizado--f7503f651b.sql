CREATE OR REPLACE FUNCTION public.gestao_toca_atualizado()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin new.atualizado_em := now(); return new; end $function$

