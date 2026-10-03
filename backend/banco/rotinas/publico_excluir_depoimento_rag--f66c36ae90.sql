CREATE OR REPLACE FUNCTION public.publico_excluir_depoimento_rag()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.rag_bloco_id IS NOT NULL THEN
    DELETE FROM blocos_conhecimento WHERE id = OLD.rag_bloco_id;
  END IF;
  RETURN OLD;
END;
$function$

