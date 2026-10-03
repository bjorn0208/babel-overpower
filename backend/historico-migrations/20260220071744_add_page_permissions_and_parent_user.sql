
-- Permissoes granulares por pagina
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS page_permissions text[] DEFAULT '{}';

-- Membro de equipe: aponta pro usuario dono
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS parent_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE DEFAULT NULL;

-- Index pra buscar membros de equipe de um usuario
CREATE INDEX IF NOT EXISTS idx_profiles_parent_user_id ON public.profiles(parent_user_id) WHERE parent_user_id IS NOT NULL;

;
