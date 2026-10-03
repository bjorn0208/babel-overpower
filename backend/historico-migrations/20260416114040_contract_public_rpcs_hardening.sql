
-- S1/S3/S4/S5: Endurece acesso publico a contratos via RPCs com whitelist + rate limit.
-- Anon nao fala mais direto com a tabela contracts: so via funcoes security definer.

SET search_path = public, auth;

-- ============================================================
-- Rate limit helper: inserido em rate_limits + checa quantidade
-- na janela de 1h antes de seguir.
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_public_rate_limit(
  p_identifier text,
  p_endpoint text,
  p_max_per_hour int DEFAULT 20
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $fn$
DECLARE
  v_count int;
BEGIN
  IF p_identifier IS NULL OR btrim(p_identifier) = '' THEN
    RAISE EXCEPTION 'identifier obrigatorio' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.rate_limits
  WHERE identifier = p_identifier
    AND endpoint = p_endpoint
    AND created_at > now() - interval '1 hour';

  IF v_count >= p_max_per_hour THEN
    RAISE EXCEPTION 'rate limit excedido' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.rate_limits (identifier, endpoint)
  VALUES (p_identifier, p_endpoint);
END;
$fn$;

REVOKE ALL ON FUNCTION public.check_public_rate_limit(text, text, int) FROM public;

-- ============================================================
-- S1: get_contract_by_token — whitelist de colunas publicas.
-- Nao expoe tenant_id, signer_data, selfie_url, document_url,
-- signature_ip, witness_* (sensiveis).
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_contract_by_token(p_token uuid)
RETURNS TABLE (
  id uuid,
  token uuid,
  title text,
  contract_text text,
  logo_url text,
  company_description text,
  company_name text,
  page_color text,
  client_data jsonb,
  status text,
  signed_at timestamptz,
  required_fields jsonb,
  selfie_instruction text,
  num_testemunhas integer,
  client_fields text[],
  payment_options jsonb,
  payment_method text,
  payment_position text,
  pix_key text,
  installment_link text,
  payment_proof_url text,
  pdf_url text,
  conversation_id uuid,
  agent_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $fn$
BEGIN
  IF p_token IS NULL THEN
    RAISE EXCEPTION 'token obrigatorio' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT c.id, c.token, c.title, c.contract_text, c.logo_url, c.company_description,
         c.company_name, c.page_color, c.client_data, c.status, c.signed_at,
         c.required_fields, c.selfie_instruction, c.num_testemunhas, c.client_fields,
         c.payment_options, c.payment_method, c.payment_position, c.pix_key,
         c.installment_link, c.payment_proof_url, c.pdf_url, c.conversation_id, c.agent_id
  FROM public.contracts c
  WHERE c.token = p_token
  LIMIT 1;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_contract_by_token(uuid) TO anon, authenticated;

-- ============================================================
-- S3: sign_contract_public — UPDATE controlado via whitelist.
-- So aceita campos de assinatura. Forca status pending -> awaiting_validation.
-- ============================================================
CREATE OR REPLACE FUNCTION public.sign_contract_public(
  p_token uuid,
  p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $fn$
DECLARE
  v_contract_id uuid;
  v_status text;
  v_now timestamptz := now();
BEGIN
  IF p_token IS NULL OR p_payload IS NULL THEN
    RAISE EXCEPTION 'token e payload obrigatorios' USING ERRCODE = '22023';
  END IF;

  SELECT id, status INTO v_contract_id, v_status
  FROM public.contracts
  WHERE token = p_token
  LIMIT 1;

  IF v_contract_id IS NULL THEN
    RAISE EXCEPTION 'contrato nao encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'contrato ja processado' USING ERRCODE = '42501';
  END IF;

  PERFORM public.check_public_rate_limit(p_token::text, 'sign_contract_public', 5);

  -- Whitelist: aceita apenas colunas de assinatura + metadados de cliente.
  UPDATE public.contracts
  SET
    status = 'awaiting_validation',
    signed_at = v_now,
    signature_ip = COALESCE(p_payload->>'signature_ip', 'unknown'),
    contract_hash = p_payload->>'contract_hash',
    client_data = COALESCE(p_payload->'client_data', client_data),
    payment_method = COALESCE(p_payload->>'payment_method', payment_method),
    contract_text = COALESCE(p_payload->>'contract_text', contract_text),
    signer_data = COALESCE(p_payload->'signer_data', signer_data),
    selfie_url = p_payload->>'selfie_url',
    document_url = p_payload->>'document_url',
    signature_url = p_payload->>'signature_url',
    witness_data = COALESCE(p_payload->'witness_data', witness_data),
    witness_selfie_url = p_payload->>'witness_selfie_url',
    witness_document_url = p_payload->>'witness_document_url',
    witness_signature_url = p_payload->>'witness_signature_url',
    witness_signed_at = CASE WHEN p_payload ? 'witness_signed_at' THEN v_now ELSE witness_signed_at END,
    witness_ip = p_payload->>'witness_ip'
  WHERE id = v_contract_id;

  RETURN v_contract_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.sign_contract_public(uuid, jsonb) TO anon, authenticated;

-- ============================================================
-- submit_payment_proof_public — so atualiza payment_proof_url.
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_payment_proof_public(
  p_token uuid,
  p_proof_url text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $fn$
DECLARE
  v_contract_id uuid;
BEGIN
  IF p_token IS NULL OR p_proof_url IS NULL OR btrim(p_proof_url) = '' THEN
    RAISE EXCEPTION 'token e url obrigatorios' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_contract_id
  FROM public.contracts
  WHERE token = p_token
  LIMIT 1;

  IF v_contract_id IS NULL THEN
    RAISE EXCEPTION 'contrato nao encontrado' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.check_public_rate_limit(p_token::text, 'submit_payment_proof_public', 5);

  UPDATE public.contracts
  SET payment_proof_url = p_proof_url
  WHERE id = v_contract_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.submit_payment_proof_public(uuid, text) TO anon, authenticated;

-- ============================================================
-- set_contract_pdf_url_public — so atualiza pdf_url apos assinatura.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_contract_pdf_url_public(
  p_token uuid,
  p_pdf_url text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $fn$
DECLARE
  v_contract_id uuid;
  v_status text;
BEGIN
  IF p_token IS NULL OR p_pdf_url IS NULL OR btrim(p_pdf_url) = '' THEN
    RAISE EXCEPTION 'token e pdf_url obrigatorios' USING ERRCODE = '22023';
  END IF;

  SELECT id, status INTO v_contract_id, v_status
  FROM public.contracts
  WHERE token = p_token
  LIMIT 1;

  IF v_contract_id IS NULL THEN
    RAISE EXCEPTION 'contrato nao encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_status NOT IN ('awaiting_validation', 'signed') THEN
    RAISE EXCEPTION 'status invalido para pdf_url' USING ERRCODE = '42501';
  END IF;

  PERFORM public.check_public_rate_limit(p_token::text, 'set_contract_pdf_url_public', 3);

  UPDATE public.contracts
  SET pdf_url = p_pdf_url
  WHERE id = v_contract_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.set_contract_pdf_url_public(uuid, text) TO anon, authenticated;

-- ============================================================
-- S1 + S5: revoga acesso direto do anon a tabela contracts.
-- Dai em diante anon so consegue operar via RPCs acima.
-- ============================================================
DROP POLICY IF EXISTS anon_select_by_token ON public.contracts;
DROP POLICY IF EXISTS anon_sign_pending_contract ON public.contracts;

-- FK: rate_limits precisa de indice na coluna identifier+endpoint pra consulta rapida.
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier_endpoint
  ON public.rate_limits (identifier, endpoint, created_at DESC);

;
