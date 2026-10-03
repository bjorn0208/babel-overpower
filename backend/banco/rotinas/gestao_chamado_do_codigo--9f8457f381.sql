CREATE OR REPLACE FUNCTION public.gestao_chamado_do_codigo(p_codigo text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select c.id from public.gestao_chamados c
   where c.deleted_at is null and c.numero::text = regexp_replace(btrim(coalesce(p_codigo, '')), '^(ch-?|#)?0*', '', 'i') $function$

