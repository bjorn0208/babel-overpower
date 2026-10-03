
-- Cache de classificacao de intent via LLM (Camada 1 - LLM Fallback).
-- Quando regex retorna desconhecido, chama Gemini Flash. Cache evita re-chamada
-- para padroes repetidos e reduz custo significativamente.
CREATE TABLE IF NOT EXISTS public.intent_classification_cache (
  msg_hash text PRIMARY KEY,
  msg_normalizada text NOT NULL,
  intent_classificado text NOT NULL,
  hits int DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  last_hit_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intent_cache_hits ON public.intent_classification_cache(hits DESC, last_hit_at DESC);

-- Sem RLS — apenas service_role acessa via edge function (cache global, sem PII)
ALTER TABLE public.intent_classification_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_intent_cache" ON public.intent_classification_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Funcao para incrementar hit count (atomico)
CREATE OR REPLACE FUNCTION public.intent_cache_hit(p_hash text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.intent_classification_cache
  SET hits = hits + 1, last_hit_at = now()
  WHERE msg_hash = p_hash
  RETURNING intent_classificado;
$$;

;
