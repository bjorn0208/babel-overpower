-- Fase 3 · Captura disciplinada · normalização via vocabulário canônico

ALTER TABLE public.tag_candidates
  ADD COLUMN IF NOT EXISTS chave_canonica text,
  ADD COLUMN IF NOT EXISTS valor_canonico text,
  ADD COLUMN IF NOT EXISTS vocabulario_id uuid REFERENCES public.vocabulario_curadoria(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS normalizado_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_tag_candidates_chave_canonica ON public.tag_candidates (chave_canonica) WHERE chave_canonica IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tag_candidates_vocab_id ON public.tag_candidates (vocabulario_id) WHERE vocabulario_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.normalizar_tag(p_tag_text text, p_tenant_id uuid, p_nicho_id uuid DEFAULT NULL)
RETURNS TABLE(chave_canonica text, valor_canonico text, vocabulario_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_chave_raw text;
  v_valor_raw text;
  v_pos int;
BEGIN
  IF p_tag_text IS NULL OR length(trim(p_tag_text)) = 0 THEN
    RETURN;
  END IF;

  v_pos := position(':' IN p_tag_text);
  IF v_pos > 0 THEN
    v_chave_raw := lower(trim(substring(p_tag_text FROM 1 FOR v_pos - 1)));
    v_valor_raw := lower(trim(substring(p_tag_text FROM v_pos + 1)));
  ELSE
    v_chave_raw := lower(trim(p_tag_text));
    v_valor_raw := NULL;
  END IF;

  RETURN QUERY
  SELECT a.chave_canonica, COALESCE(a.valor_canonico, v_valor_raw), v.id
  FROM public.tag_vocabulario_alias a
  LEFT JOIN public.vocabulario_curadoria v
    ON v.chave = a.chave_canonica
    AND (v.escopo = 'plataforma'
         OR (v.escopo = 'nicho' AND v.nicho_id = p_nicho_id)
         OR (v.escopo = 'tenant' AND v.tenant_id = p_tenant_id))
    AND v.ativo
  WHERE lower(a.alias) = v_chave_raw
    AND (a.escopo = 'plataforma'
         OR (a.escopo = 'nicho' AND a.nicho_id = p_nicho_id)
         OR (a.escopo = 'tenant' AND a.tenant_id = p_tenant_id))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT v.chave, COALESCE(v_valor_raw, v.valor), v.id
    FROM public.vocabulario_curadoria v
    WHERE lower(v.chave) = v_chave_raw
      AND v.ativo
      AND (v.escopo = 'plataforma'
           OR (v.escopo = 'nicho' AND v.nicho_id = p_nicho_id)
           OR (v.escopo = 'tenant' AND v.tenant_id = p_tenant_id))
    ORDER BY CASE v.escopo WHEN 'tenant' THEN 1 WHEN 'nicho' THEN 2 ELSE 3 END
    LIMIT 1;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_tag_candidates_normalizar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r record;
BEGIN
  IF NEW.tag_text IS NULL OR length(trim(NEW.tag_text)) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO r FROM public.normalizar_tag(NEW.tag_text, NEW.tenant_id, NEW.nicho_id) LIMIT 1;

  IF FOUND THEN
    NEW.chave_canonica := r.chave_canonica;
    NEW.valor_canonico := r.valor_canonico;
    NEW.vocabulario_id := r.vocabulario_id;
    NEW.normalizado_em := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tag_candidates_normalizar ON public.tag_candidates;
CREATE TRIGGER trg_tag_candidates_normalizar
  BEFORE INSERT OR UPDATE OF tag_text ON public.tag_candidates
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_tag_candidates_normalizar();

-- Backfill via UPDATE forçando trigger (é mais simples que LATERAL)
UPDATE public.tag_candidates SET tag_text = tag_text WHERE chave_canonica IS NULL;

;
