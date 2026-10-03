-- Onda B.1 — Atribuição humana de conversas (membro da equipe responsavel).
-- A RLS atual já cobre o isolamento (user_read_tenant_conversations dá acesso
-- ao tenant + membros via parent_user_id), entao a coluna eh apenas atribuicao.
ALTER TABLE public.conversas
  ADD COLUMN IF NOT EXISTS responsavel_id uuid
  REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.conversas.responsavel_id IS
  'Membro da equipe atribuido como dono da conversa (UX de atribuicao). RLS continua por tenant_id.';

-- Index parcial pra agilizar filtro por responsavel (Mestre vai filtrar isso).
CREATE INDEX IF NOT EXISTS idx_conversas_responsavel_id
  ON public.conversas (responsavel_id)
  WHERE responsavel_id IS NOT NULL;
;
