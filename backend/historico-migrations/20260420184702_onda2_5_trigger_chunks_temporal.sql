
-- =============================================================================
-- Onda 2.5 — trigger_chunks: suporte a condição temporal
-- =============================================================================

-- 1. Novas colunas -----------------------------------------------------------

ALTER TABLE public.trigger_chunks
  ADD COLUMN IF NOT EXISTS condicao_tipo text NOT NULL DEFAULT 'frase'
    CHECK (condicao_tipo IN (
      'frase',
      'silencio_pos_fase',
      'nao_assinou_contrato',
      'nao_enviou_comprovante',
      'nao_respondeu_proposta'
    )),
  ADD COLUMN IF NOT EXISTS tempo_aguardar_minutos integer,
  ADD COLUMN IF NOT EXISTS fase_aplicavel text;

-- 2. Comentários descritivos -------------------------------------------------

COMMENT ON COLUMN public.trigger_chunks.condicao_tipo IS
  'Tipo de condição que dispara o trigger: '
  '''frase'' = match semântico em fala do lead; '
  '''silencio_pos_fase'' = lead não respondeu após N minutos de uma fase; '
  '''nao_assinou_contrato'' = contrato enviado mas não assinado após N min; '
  '''nao_enviou_comprovante'' = pagamento pendente sem comprovante após N min; '
  '''nao_respondeu_proposta'' = proposta enviada sem resposta após N min.';

COMMENT ON COLUMN public.trigger_chunks.tempo_aguardar_minutos IS
  'Minutos de espera antes de disparar (obrigatório quando condicao_tipo != ''frase'').';

COMMENT ON COLUMN public.trigger_chunks.fase_aplicavel IS
  'Fase da conversa em que o trigger é relevante: '
  'saudacao | apresentacao | valor | negociacao | contrato | pagamento | '
  'pos_venda | reengajamento. NULL = qualquer fase.';

-- 3. CHECK: tempo obrigatório para triggers temporais -----------------------

ALTER TABLE public.trigger_chunks
  DROP CONSTRAINT IF EXISTS trigger_chunks_temporal_tempo_ck;

ALTER TABLE public.trigger_chunks
  ADD CONSTRAINT trigger_chunks_temporal_tempo_ck
  CHECK (
    condicao_tipo = 'frase'
    OR tempo_aguardar_minutos IS NOT NULL
  );

-- 4. Índice temporal: worker varre por tipo+ativo+fase ----------------------

CREATE INDEX IF NOT EXISTS idx_trigger_chunks_temporal
  ON public.trigger_chunks (condicao_tipo, ativo, fase_aplicavel)
  WHERE condicao_tipo != 'frase' AND ativo = true;

-- 5. Índice escopo+tipo: worker filtra por nicho do tenant ------------------

CREATE INDEX IF NOT EXISTS idx_trigger_chunks_escopo_tipo
  ON public.trigger_chunks (escopo, nicho_id, condicao_tipo)
  WHERE ativo = true;

-- 6. RPC buscar_triggers_temporais ------------------------------------------

CREATE OR REPLACE FUNCTION public.buscar_triggers_temporais(
  p_condicao_tipo    text,
  p_escopo           text    DEFAULT NULL,
  p_nicho_id         uuid    DEFAULT NULL,
  p_tenant_id        uuid    DEFAULT NULL,
  p_fase_aplicavel   text    DEFAULT NULL
)
RETURNS TABLE(
  id                     uuid,
  nome_trigger           text,
  tempo_aguardar_minutos integer,
  acao_disparada         text,
  acao_payload           jsonb,
  fase_aplicavel         text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT
    tc.id,
    tc.nome_trigger,
    tc.tempo_aguardar_minutos,
    tc.acao_disparada,
    tc.acao_payload,
    tc.fase_aplicavel
  FROM public.trigger_chunks tc
  WHERE tc.ativo = true
    AND tc.condicao_tipo = p_condicao_tipo
    AND (
      p_fase_aplicavel IS NULL
      OR tc.fase_aplicavel = p_fase_aplicavel
      OR tc.fase_aplicavel IS NULL
    )
    AND (
      (p_escopo = 'global' AND tc.escopo = 'global')
      OR (p_escopo = 'nicho'
          AND tc.escopo IN ('global', 'nicho')
          AND (tc.nicho_id = p_nicho_id OR tc.escopo = 'global'))
      OR (p_escopo = 'tenant'
          AND (
            tc.escopo = 'global'
            OR (tc.escopo = 'nicho' AND tc.nicho_id = p_nicho_id)
            OR (tc.escopo = 'tenant' AND tc.tenant_id = p_tenant_id)
          ))
      OR p_escopo IS NULL
    )
  ORDER BY
    CASE tc.escopo
      WHEN 'tenant' THEN 1
      WHEN 'nicho'  THEN 2
      WHEN 'global' THEN 3
      ELSE 4
    END,
    tc.tempo_aguardar_minutos ASC;
$$;

GRANT EXECUTE ON FUNCTION public.buscar_triggers_temporais(text, text, uuid, uuid, text)
  TO authenticated, service_role;

;
