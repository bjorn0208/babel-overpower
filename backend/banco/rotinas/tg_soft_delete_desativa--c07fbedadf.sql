CREATE OR REPLACE FUNCTION public.tg_soft_delete_desativa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Deletado => inativo, sempre. Restaurar (deleted_at = NULL) NÃO reativa automaticamente:
  -- religar é decisão explícita de quem restaura.
  IF NEW.deleted_at IS NOT NULL THEN
    NEW.ativo := false;
  END IF;
  RETURN NEW;
END;
$function$

