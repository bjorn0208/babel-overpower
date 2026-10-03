CREATE OR REPLACE FUNCTION public._kit_txt(p text, p_agente text, p_empresa text, p_pix text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select replace(replace(replace(p, '{AGENTE}', p_agente), '{EMPRESA}', p_empresa), '{PIX_INFO}', p_pix)
$function$

