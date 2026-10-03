
-- Remove modulo do AGENTE DE IA de cobranca.
-- Mantem client_payments (pagamentos manuais via Financeiro).
-- Remove apenas colunas do ciclo de cobranca automatico + tabelas config/eventos + funcoes relacionadas.

SET search_path = public, auth;

-- 1) Cancela scheduled_actions do agente de cobranca (nao usa mais).
DELETE FROM public.scheduled_actions
WHERE action_type IN ('cobranca_parcela');

-- 2) Drop triggers e funcoes relacionadas a cobranca automatica.
DROP TRIGGER IF EXISTS trg_gerar_parcelas_on_sign ON public.contracts;
DROP FUNCTION IF EXISTS public.fn_gerar_parcelas_contrato() CASCADE;
DROP FUNCTION IF EXISTS public.sync_lead_cards_on_payment_proof() CASCADE;
DROP FUNCTION IF EXISTS public.trigger_cobranca_sweep() CASCADE;

-- 3) Drop tabelas especificas do agente de cobranca.
DROP TABLE IF EXISTS public.cobranca_eventos CASCADE;
DROP TABLE IF EXISTS public.cobranca_configs CASCADE;

-- 4) Remove colunas do ciclo de agente em client_payments.
-- Pagamentos manuais continuam funcionando pelas colunas basicas.
ALTER TABLE public.client_payments DROP COLUMN IF EXISTS cobranca_ativa;
ALTER TABLE public.client_payments DROP COLUMN IF EXISTS cobranca_tentativa_atual;
ALTER TABLE public.client_payments DROP COLUMN IF EXISTS nao_cobrar;
ALTER TABLE public.client_payments DROP COLUMN IF EXISTS comprovante_status;
ALTER TABLE public.client_payments DROP COLUMN IF EXISTS comprovante_url;

;
