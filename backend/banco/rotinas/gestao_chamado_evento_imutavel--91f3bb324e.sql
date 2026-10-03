CREATE OR REPLACE FUNCTION public.gestao_chamado_evento_imutavel()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception 'gestao: registro da linha do tempo não pode ser alterado nem apagado' using errcode = '42501';
end $function$

