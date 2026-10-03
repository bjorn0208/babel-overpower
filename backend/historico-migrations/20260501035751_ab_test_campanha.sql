
-- Fase 8: A/B semântico
-- Coluna de configuração do teste A/B na campanha
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS ab_test_config jsonb DEFAULT NULL;

-- Coluna de variação por lead na campanha
ALTER TABLE public.campaign_leads
  ADD COLUMN IF NOT EXISTS ab_variacao text DEFAULT NULL;

-- Constraint idempotente via DO block
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'campaign_leads_ab_variacao_check'
    AND conrelid = 'public.campaign_leads'::regclass
  ) THEN
    ALTER TABLE public.campaign_leads
      ADD CONSTRAINT campaign_leads_ab_variacao_check
      CHECK (ab_variacao IN ('a', 'b'));
  END IF;
END $$;

-- Índice para filtrar por variação dentro de uma campanha
CREATE INDEX IF NOT EXISTS idx_campaign_leads_ab_variacao
  ON public.campaign_leads (campaign_id, ab_variacao)
  WHERE ab_variacao IS NOT NULL;

-- Função trigger: split 50/50 automático ao inserir lead na campanha
CREATE OR REPLACE FUNCTION public.fn_assign_ab_variacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_config jsonb;
  v_count_a integer;
  v_count_b integer;
BEGIN
  SELECT ab_test_config INTO v_config
  FROM public.campaigns
  WHERE id = NEW.campaign_id;

  -- Só age se o teste A/B está ativo
  IF v_config IS NULL OR NOT coalesce((v_config->>'ativo')::boolean, false) THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count_a
  FROM public.campaign_leads
  WHERE campaign_id = NEW.campaign_id AND ab_variacao = 'a';

  SELECT COUNT(*) INTO v_count_b
  FROM public.campaign_leads
  WHERE campaign_id = NEW.campaign_id AND ab_variacao = 'b';

  NEW.ab_variacao := CASE WHEN v_count_a <= v_count_b THEN 'a' ELSE 'b' END;
  RETURN NEW;
END;
$$;

-- Trigger antes do INSERT
DROP TRIGGER IF EXISTS trigger_assign_ab_variacao ON public.campaign_leads;
CREATE TRIGGER trigger_assign_ab_variacao
  BEFORE INSERT ON public.campaign_leads
  FOR EACH ROW EXECUTE FUNCTION public.fn_assign_ab_variacao();

;
