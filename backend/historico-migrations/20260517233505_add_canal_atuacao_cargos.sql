-- Migration: add_canal_atuacao_cargos
-- Decisão Theus 2026-05-17: 3 valores interno|externo|ambos (estilo lab)
-- RLS intacta · idempotente · backfill por tipologia real

ALTER TABLE public.cargos
  ADD COLUMN IF NOT EXISTS canal_atuacao text NOT NULL DEFAULT 'ambos';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cargos_canal_atuacao_check'
      AND conrelid = 'public.cargos'::regclass
  ) THEN
    ALTER TABLE public.cargos
      ADD CONSTRAINT cargos_canal_atuacao_check
        CHECK (canal_atuacao IN ('interno', 'externo', 'ambos'));
  END IF;
END $$;

COMMENT ON COLUMN public.cargos.canal_atuacao IS
  'Com quem o cargo fala: interno=dono/workbench (mentor,admin); externo=lead/cliente/whatsapp (atendimento,face_cliente); ambos=qualquer interlocutor. Roteador da edge usa para filtrar antes do porteiro.';

CREATE INDEX IF NOT EXISTS idx_cargos_agente_canal_ativo
  ON public.cargos (agente_id, canal_atuacao)
  WHERE ativo = true;

UPDATE public.cargos
SET canal_atuacao = CASE tipologia::text
  WHEN 'mentor'       THEN 'interno'
  WHEN 'admin'        THEN 'interno'
  WHEN 'atendimento'  THEN 'externo'
  WHEN 'face_cliente' THEN 'externo'
  ELSE 'ambos'
END
WHERE canal_atuacao = 'ambos';
;
