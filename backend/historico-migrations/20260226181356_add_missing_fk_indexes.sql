
-- ============================================================
-- MIGRATION: Add missing FK indexes for performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_client_documents_lead_id
  ON public.client_documents (lead_id);

CREATE INDEX IF NOT EXISTS idx_client_documents_tenant_id
  ON public.client_documents (tenant_id);

CREATE INDEX IF NOT EXISTS idx_contracts_conversation_id
  ON public.contracts (conversation_id);

CREATE INDEX IF NOT EXISTS idx_contracts_tenant_id
  ON public.contracts (tenant_id);

CREATE INDEX IF NOT EXISTS idx_contratos_template_produto_id
  ON public.contratos_template (produto_id);

CREATE INDEX IF NOT EXISTS idx_contratos_template_user_id
  ON public.contratos_template (user_id);

CREATE INDEX IF NOT EXISTS idx_lead_cards_lead_id
  ON public.lead_cards (lead_id);

CREATE INDEX IF NOT EXISTS idx_llm_request_logs_provider_id
  ON public.llm_request_logs (provider_id);

CREATE INDEX IF NOT EXISTS idx_produto_conhecimento_produto_id
  ON public.produto_conhecimento (produto_id);

CREATE INDEX IF NOT EXISTS idx_produtos_user_id
  ON public.produtos (user_id);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_user_id
  ON public.purchase_orders (user_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_actions_conversation_id
  ON public.scheduled_actions (conversation_id);

CREATE INDEX IF NOT EXISTS idx_socios_empresa_id
  ON public.socios (empresa_id);

CREATE INDEX IF NOT EXISTS idx_store_pacotes_extra_plano_id
  ON public.store_pacotes_extra (plano_id);

CREATE INDEX IF NOT EXISTS idx_store_planos_modelo_llm_id
  ON public.store_planos (modelo_llm_id);

CREATE INDEX IF NOT EXISTS idx_user_agents_template_id
  ON public.user_agents (template_id);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plano_id
  ON public.user_subscriptions (plano_id);

;
