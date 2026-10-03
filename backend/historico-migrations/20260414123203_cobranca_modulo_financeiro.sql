
-- =========================================================================
-- MÓDULO COBRANÇA NO FINANCEIRO
-- Cobrança automática de parcelas atrasadas via agente de IA
-- =========================================================================

SET search_path = public, auth;

-- -------------------------------------------------------------------------
-- 1) EXTENSÃO client_payments: colunas de cobrança
-- -------------------------------------------------------------------------
ALTER TABLE public.client_payments
  ADD COLUMN IF NOT EXISTS cobranca_ativa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cobranca_tentativa_atual integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comprovante_status text NOT NULL DEFAULT 'pendente'
    CHECK (comprovante_status IN ('pendente','aguardando_validacao','validado','rejeitado')),
  ADD COLUMN IF NOT EXISTS comprovante_rejected_motivo text,
  ADD COLUMN IF NOT EXISTS nao_cobrar boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_client_payments_cobranca_sweep
  ON public.client_payments (tenant_id, status, data_vencimento)
  WHERE cobranca_ativa = false AND nao_cobrar = false AND status = 'pendente';

CREATE INDEX IF NOT EXISTS idx_client_payments_cobranca_ativa
  ON public.client_payments (tenant_id, lead_id)
  WHERE cobranca_ativa = true;

-- -------------------------------------------------------------------------
-- 2) cobranca_configs: 1 linha por tenant
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cobranca_configs (
  tenant_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  dias_apos_vencimento integer NOT NULL DEFAULT 1 CHECK (dias_apos_vencimento >= 0),
  tentativas jsonb NOT NULL DEFAULT '[
    {"ordem":1,"quando":{"tipo":"tempo_relativo","valor":0,"unidade":"dias","base":"agora"},"tom":"empatico"},
    {"ordem":2,"quando":{"tipo":"tempo_relativo","valor":3,"unidade":"dias","base":"agora"},"tom":"direto"},
    {"ordem":3,"quando":{"tipo":"tempo_relativo","valor":7,"unidade":"dias","base":"agora"},"tom":"final"}
  ]'::jsonb,
  janela_horario jsonb NOT NULL DEFAULT '{"inicio":"09:00","fim":"18:00"}'::jsonb,
  dias_uteis_apenas boolean NOT NULL DEFAULT true,
  escalar_humano_apos_ultima boolean NOT NULL DEFAULT true,
  permitir_override_lead_agenda boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_cobranca_configs_updated_at ON public.cobranca_configs;
CREATE TRIGGER trg_cobranca_configs_updated_at
  BEFORE UPDATE ON public.cobranca_configs
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

ALTER TABLE public.cobranca_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cobranca_configs tenant owner" ON public.cobranca_configs;
CREATE POLICY "cobranca_configs tenant owner" ON public.cobranca_configs
  FOR ALL
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

-- -------------------------------------------------------------------------
-- 3) cobranca_eventos: audit log + histórico por ficha
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cobranca_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.client_payments(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN (
    'ciclo_iniciado',
    'tentativa_enviada',
    'data_prometida_pelo_lead',
    'retomou_apos_promessa_falha',
    'comprovante_recebido',
    'comprovante_validado',
    'comprovante_rejeitado',
    'ciclo_pausado_manual',
    'baixa_manual',
    'escalado_humano',
    'ciclo_encerrado',
    'marcado_nao_cobrar'
  )),
  tentativa integer,
  tom text,
  usuario_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cobranca_eventos_tenant ON public.cobranca_eventos (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cobranca_eventos_lead ON public.cobranca_eventos (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cobranca_eventos_payment ON public.cobranca_eventos (payment_id, created_at DESC);

ALTER TABLE public.cobranca_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cobranca_eventos tenant read" ON public.cobranca_eventos;
CREATE POLICY "cobranca_eventos tenant read" ON public.cobranca_eventos
  FOR SELECT USING (tenant_id = auth.uid());

DROP POLICY IF EXISTS "cobranca_eventos tenant insert" ON public.cobranca_eventos;
CREATE POLICY "cobranca_eventos tenant insert" ON public.cobranca_eventos
  FOR INSERT WITH CHECK (tenant_id = auth.uid());

-- -------------------------------------------------------------------------
-- 4) pg_cron: sweep diário 08:00 BRT (11:00 UTC) chamando edge function
-- -------------------------------------------------------------------------
-- Nota: o agendamento é criado mas o invoke HTTP será feito pela edge function
-- externa. Aqui só registramos uma função interna que o cron dispara diariamente.

CREATE OR REPLACE FUNCTION public.trigger_cobranca_sweep()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  -- Chama a edge function cron-sweep-cobranca via pg_net
  -- URL + service_role_key precisam estar em vault ou hardcoded se permitido
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'edge_functions_url' LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'Vault sem edge_functions_url/service_role_key — cron sweep ignorado';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/cron-sweep-cobranca',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;

-- Agendar 11:00 UTC diariamente = 08:00 BRT
DO $$
BEGIN
  PERFORM cron.unschedule('cobranca_sweep_diario');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cobranca_sweep_diario',
  '0 11 * * *',
  $$SELECT public.trigger_cobranca_sweep();$$
);

;
