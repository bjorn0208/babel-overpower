-- Soft-delete de profiles (membros de equipe removidos pelo tenant).
-- Padrão inviolável do projeto: deleted_at, nunca apagar de vez.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.profiles.deleted_at IS
  'Soft-delete: membro de equipe removido pelo tenant. NULL = ativo. Listagens de equipe filtram IS NULL.';

-- Índice parcial pra listagem de equipe ativa (parent_user_id já é o filtro principal).
CREATE INDEX IF NOT EXISTS idx_profiles_parent_ativos
  ON public.profiles (parent_user_id)
  WHERE deleted_at IS NULL AND parent_user_id IS NOT NULL;
;
