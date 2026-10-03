
-- ========================================================
-- Migration: pii_mascaramento
-- Fase 2 · PLANO-UNIFICADO-campanha-base · 2026-05-01
-- ========================================================

-- PART 1 · Tabela lead_cofre_pii
CREATE TABLE IF NOT EXISTS public.lead_cofre_pii (
  lead_id    uuid        PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  tenant_id  uuid        NOT NULL REFERENCES public.profiles(id),
  cpf_real   text,
  cnpj_real  text,
  cpf_masked text,
  cnpj_masked text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_cofre_pii_tenant
  ON public.lead_cofre_pii (tenant_id);

ALTER TABLE public.lead_cofre_pii ENABLE ROW LEVEL SECURITY;

-- Apenas o dono do tenant acessa o cofre completo
CREATE POLICY "cofre_pii_owner_all" ON public.lead_cofre_pii
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT auth.uid()))
  WITH CHECK (tenant_id = (SELECT auth.uid()));

-- Platform admin lê tudo (auditoria)
CREATE POLICY "cofre_pii_platform_admin" ON public.lead_cofre_pii
  FOR SELECT TO authenticated
  USING ((SELECT public.is_platform_admin()));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_cofre_pii_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_cofre_pii_updated_at ON public.lead_cofre_pii;
CREATE TRIGGER trg_cofre_pii_updated_at
  BEFORE UPDATE ON public.lead_cofre_pii
  FOR EACH ROW EXECUTE FUNCTION public.tg_cofre_pii_updated_at();

-- PART 2 · Funções helper de mascaramento
CREATE OR REPLACE FUNCTION public.mascarar_cpf(p_cpf text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT '***.***.***-' || right(regexp_replace(p_cpf, '\D', '', 'g'), 2)
$$;

CREATE OR REPLACE FUNCTION public.mascarar_cnpj(p_cnpj text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT '**.***.***/****-' || right(regexp_replace(p_cnpj, '\D', '', 'g'), 2)
$$;

-- PART 3 · Função principal de extração + mascaramento de PII de um lead
CREATE OR REPLACE FUNCTION public.extrair_pii_lead(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id uuid;
  v_tags      text[];
  v_tag       text;
  v_chave     text;
  v_valor     text;
  v_digitos   text;
  v_cpf       text := NULL;
  v_cnpj      text := NULL;
  v_novas     text[] := '{}';
  v_mascarado text;
BEGIN
  SELECT tenant_id, COALESCE(tags, '{}')
  INTO v_tenant_id, v_tags
  FROM public.leads WHERE id = p_lead_id AND deleted_at IS NULL;

  IF v_tenant_id IS NULL THEN RETURN; END IF;

  FOREACH v_tag IN ARRAY v_tags LOOP
    v_chave := split_part(v_tag, ':', 1);
    v_valor := substring(v_tag from position(':' in v_tag) + 1);
    v_digitos := regexp_replace(v_valor, '\D', '', 'g');

    IF v_chave IN ('cpf', 'documento_pessoal') AND length(v_digitos) = 11 THEN
      v_cpf := COALESCE(v_cpf, v_digitos);
      v_mascarado := public.mascarar_cpf(v_digitos);
      v_novas := array_append(v_novas, v_chave || ':' || v_mascarado);

    ELSIF v_chave = 'cnpj' AND length(v_digitos) = 14 THEN
      v_cnpj := COALESCE(v_cnpj, v_digitos);
      v_mascarado := public.mascarar_cnpj(v_digitos);
      v_novas := array_append(v_novas, v_chave || ':' || v_mascarado);

    ELSIF v_chave = 'documento' AND length(v_digitos) = 11 THEN
      v_cpf := COALESCE(v_cpf, v_digitos);
      v_mascarado := public.mascarar_cpf(v_digitos);
      v_novas := array_append(v_novas, v_chave || ':' || v_mascarado);

    ELSIF v_chave = 'documento' AND length(v_digitos) = 14 THEN
      v_cnpj := COALESCE(v_cnpj, v_digitos);
      v_mascarado := public.mascarar_cnpj(v_digitos);
      v_novas := array_append(v_novas, v_chave || ':' || v_mascarado);

    ELSE
      v_novas := array_append(v_novas, v_tag);
    END IF;
  END LOOP;

  IF v_cpf IS NOT NULL OR v_cnpj IS NOT NULL THEN
    INSERT INTO public.lead_cofre_pii (lead_id, tenant_id, cpf_real, cnpj_real, cpf_masked, cnpj_masked)
    VALUES (
      p_lead_id, v_tenant_id, v_cpf, v_cnpj,
      CASE WHEN v_cpf IS NOT NULL THEN public.mascarar_cpf(v_cpf) END,
      CASE WHEN v_cnpj IS NOT NULL THEN public.mascarar_cnpj(v_cnpj) END
    )
    ON CONFLICT (lead_id) DO UPDATE SET
      cpf_real    = COALESCE(EXCLUDED.cpf_real,   public.lead_cofre_pii.cpf_real),
      cnpj_real   = COALESCE(EXCLUDED.cnpj_real,  public.lead_cofre_pii.cnpj_real),
      cpf_masked  = COALESCE(EXCLUDED.cpf_masked,  public.lead_cofre_pii.cpf_masked),
      cnpj_masked = COALESCE(EXCLUDED.cnpj_masked, public.lead_cofre_pii.cnpj_masked),
      updated_at  = now();

    UPDATE public.leads SET tags = v_novas WHERE id = p_lead_id;
  END IF;
END;
$$;

-- PART 4 · Backfill dos leads com PII exposto
DO $$
DECLARE
  v_lead_id uuid;
BEGIN
  FOR v_lead_id IN
    SELECT DISTINCT l.id
    FROM public.leads l,
      unnest(l.tags) AS t
    WHERE l.deleted_at IS NULL
      AND split_part(t, ':', 1) IN ('cpf', 'cnpj', 'documento_pessoal', 'documento')
      AND length(regexp_replace(
            substring(t from position(':' in t) + 1),
            '\D', '', 'g'
          )) IN (11, 14)
  LOOP
    PERFORM public.extrair_pii_lead(v_lead_id);
  END LOOP;
END $$;

;
