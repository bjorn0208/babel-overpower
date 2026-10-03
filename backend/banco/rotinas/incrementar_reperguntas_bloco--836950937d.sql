CREATE OR REPLACE FUNCTION public.incrementar_reperguntas_bloco(p_bloco_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  UPDATE public.blocos_conhecimento
     SET reperguntas = reperguntas + 1,
         updated_at  = now()
   WHERE id = p_bloco_id
     AND aprovado = false;
$function$

