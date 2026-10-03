-- Onda 1: unificar papel admin/usuário
-- user_roles aceita apenas 'admin' | 'user' (CHECK existente). Mantemos.

-- 1. Backfill admins
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM public.profiles
WHERE system_role = 'platform_admin'
  AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = profiles.id AND ur.role = 'admin');

-- 2. Backfill usuários comuns
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'user' FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id);

-- 3. Função canônica de checagem
CREATE OR REPLACE FUNCTION public.tem_papel(_user_id uuid, _papel text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_papel);
$$;

-- 4. Trigger sincronia profiles -> user_roles
CREATE OR REPLACE FUNCTION public.sincronizar_user_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.system_role = 'platform_admin' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = NEW.id AND role = 'admin';
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sincronizar_user_role ON public.profiles;
CREATE TRIGGER trg_sincronizar_user_role
AFTER INSERT OR UPDATE OF system_role ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sincronizar_user_role();

-- 5. Garantir unique constraint user_id+role
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_user_id_role_key') THEN
    ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);
  END IF;
END$$;
;
