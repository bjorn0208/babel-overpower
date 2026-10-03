
-- Adiciona coluna `canal` em mentor_conversas pra distinguir o canal interno
-- entre Mentor (canal_atuacao='interno' do dono do tenant) e Curadoria (cargo
-- Curadoria que o platform_admin usa no app /admin/curadoria).
--
-- Aditiva, default 'mentor' → comportamento atual de TODAS as mentor_conversas
-- existentes preservado. Quando o frontend Curadoria criar conversa nova, vai
-- gravar canal='curadoria' explicitamente.

ALTER TABLE public.mentor_conversas
  ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'mentor'
    CHECK (canal IN ('mentor','curadoria'));

-- Indice parcial pra listagem rapida de conversas Curadoria por owner
CREATE INDEX IF NOT EXISTS idx_mentor_conversas_canal_curadoria
  ON public.mentor_conversas(owner_id, atualizado_em DESC)
  WHERE canal = 'curadoria';

COMMENT ON COLUMN public.mentor_conversas.canal IS
'Canal interno: mentor (canal_atuacao=interno do dono do tenant, padrão) ou curadoria (cargo Curadoria usado por platform_admin no app /admin/curadoria). Adicionado 2026-05-27 (Onda 2C.8 do app Curadoria fullscreen).';

;
