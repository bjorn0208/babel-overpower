-- Tabela de observability para acessos públicos a contratos.
-- Cada RPC get_contract_by_token registra UA+IP — base para diagnosticar "só abre no Chrome".
CREATE TABLE IF NOT EXISTS public.contract_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token uuid NOT NULL,
  event text NOT NULL,
  user_agent text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_access_log_token ON public.contract_access_log(token);
CREATE INDEX IF NOT EXISTS idx_contract_access_log_created_at ON public.contract_access_log(created_at DESC);

ALTER TABLE public.contract_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "srv_contract_access_log" ON public.contract_access_log;
CREATE POLICY "srv_contract_access_log" ON public.contract_access_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_read_contract_access_log" ON public.contract_access_log;
CREATE POLICY "admin_read_contract_access_log" ON public.contract_access_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.system_role = 'platform_admin'
    )
  );

-- Recria RPC: inclui origem no RETURN + grava log de acesso (best-effort).
DROP FUNCTION IF EXISTS public.get_contract_by_token(uuid);

CREATE OR REPLACE FUNCTION public.get_contract_by_token(p_token uuid)
RETURNS TABLE(
  id uuid, token uuid, title text, contract_text text, logo_url text,
  company_description text, company_name text, page_color text,
  client_data jsonb, status text, signed_at timestamp with time zone,
  required_fields jsonb, selfie_instruction text, num_testemunhas integer,
  client_fields text[], payment_options jsonb, payment_method text,
  payment_position text, pix_key text, installment_link text,
  payment_proof_url text, pdf_url text, conversation_id uuid, agent_id uuid,
  origem text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_user_agent text;
  v_ip text;
  v_headers jsonb;
BEGIN
  IF p_token IS NULL THEN
    RAISE EXCEPTION 'token obrigatorio' USING ERRCODE = '22023';
  END IF;

  -- Log best-effort: nunca quebra carregamento do contrato
  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
    v_user_agent := v_headers->>'user-agent';
    v_ip := COALESCE(
      split_part(v_headers->>'x-forwarded-for', ',', 1),
      v_headers->>'cf-connecting-ip'
    );
    INSERT INTO public.contract_access_log (token, event, user_agent, ip)
    VALUES (p_token, 'load', v_user_agent, v_ip);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN QUERY
  SELECT c.id, c.token, c.title, c.contract_text, c.logo_url, c.company_description,
         c.company_name, c.page_color, c.client_data, c.status, c.signed_at,
         c.required_fields, c.selfie_instruction, c.num_testemunhas, c.client_fields,
         c.payment_options, c.payment_method, c.payment_position, c.pix_key,
         c.installment_link, c.payment_proof_url, c.pdf_url, c.conversation_id, c.agent_id,
         c.origem
  FROM public.contracts c
  WHERE c.token = p_token
  LIMIT 1;
END;
$function$;

-- Permissões explícitas (anon/authenticated já tinham via GRANT anterior, mas garantimos aqui)
GRANT EXECUTE ON FUNCTION public.get_contract_by_token(uuid) TO anon, authenticated, service_role;
;
