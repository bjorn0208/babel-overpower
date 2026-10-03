CREATE OR REPLACE FUNCTION public.prevenir_mudanca_campo_critico()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Bypass explicito via setting de sessao (usado por RPCs admin como remove_team_member)
  IF current_setting('app.bypass_profile_guard', true) = 'true' THEN
    RETURN NEW;
  END IF;
  -- Retrocompat: tambem aceita o setting antigo app.allow_parent_reset
  IF current_setting('app.allow_parent_reset', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Bloqueia mudanca de system_role (previne auto-promocao a platform_admin)
  IF OLD.system_role IS DISTINCT FROM NEW.system_role THEN
    RAISE EXCEPTION 'Nao e permitido alterar system_role sem bypass autorizado.'
      USING ERRCODE = '42501';
  END IF;

  -- Bloqueia qualquer mudanca em parent_user_id (promocao/democao entre tenant/team)
  IF OLD.parent_user_id IS DISTINCT FROM NEW.parent_user_id THEN
    RAISE EXCEPTION 'Nao e permitido alterar parent_user_id sem bypass autorizado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$

