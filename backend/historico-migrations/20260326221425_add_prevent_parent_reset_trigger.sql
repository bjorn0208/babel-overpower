
CREATE OR REPLACE FUNCTION public.prevent_parent_reset()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.parent_user_id IS NOT NULL AND NEW.parent_user_id IS NULL
     AND current_setting('app.allow_parent_reset', true) IS DISTINCT FROM 'true'
  THEN
    RAISE EXCEPTION 'Cannot reset parent_user_id. Use remove_team_member RPC.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_prevent_parent_reset ON public.profiles;
CREATE TRIGGER trg_prevent_parent_reset BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.prevent_parent_reset();

;
