CREATE OR REPLACE FUNCTION public.sync_lead_cards_on_contract_signed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.signed_at IS NOT NULL
     AND (OLD.signed_at IS NULL OR OLD.signed_at IS DISTINCT FROM NEW.signed_at)
     AND NEW.conversation_id IS NOT NULL
  THEN
    UPDATE public.lead_cards
    SET dados_capturados = jsonb_set(
          COALESCE(dados_capturados, '{}'::jsonb),
          '{contrato_assinado}',
          '"sim"'::jsonb,
          true
        ),
        updated_at = now()
    WHERE conversation_id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_lead_cards_on_payment_proof()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.payment_proof_url IS NOT NULL
     AND OLD.payment_proof_url IS NULL
     AND NEW.conversation_id IS NOT NULL
  THEN
    UPDATE public.lead_cards
    SET dados_capturados = jsonb_set(
          COALESCE(dados_capturados, '{}'::jsonb),
          '{comprovante_validado}',
          'true'::jsonb,
          true
        ),
        updated_at = now()
    WHERE conversation_id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lead_cards_contract_signed ON public.contracts;
CREATE TRIGGER trg_sync_lead_cards_contract_signed
  AFTER UPDATE OF signed_at ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_lead_cards_on_contract_signed();

DROP TRIGGER IF EXISTS trg_sync_lead_cards_payment_proof ON public.contracts;
CREATE TRIGGER trg_sync_lead_cards_payment_proof
  AFTER UPDATE OF payment_proof_url ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_lead_cards_on_payment_proof();
;
