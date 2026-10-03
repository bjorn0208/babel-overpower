CREATE OR REPLACE FUNCTION public.herdar_nicho_id_do_parent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.parent_user_id IS NOT NULL THEN
    SELECT nicho_id INTO NEW.nicho_id
      FROM public.profiles
     WHERE id = NEW.parent_user_id;
  END IF;
  RETURN NEW;
END;
$function$

