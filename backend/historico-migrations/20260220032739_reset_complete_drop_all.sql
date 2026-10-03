
-- ============================================
-- RESET COMPLETO: DROP ALL TABLES, FUNCTIONS, TRIGGERS
-- Projeto: Limpa Nome IA (pdamarjxcmkzbhqxtapl)
-- Data: 2026-02-20
-- ============================================

-- 1. Drop all tables with CASCADE (handles FKs, triggers, policies automatically)
DROP TABLE IF EXISTS public.webhook_debug_log CASCADE;
DROP TABLE IF EXISTS public.webhook_dedup CASCADE;
DROP TABLE IF EXISTS public.verification_responses CASCADE;
DROP TABLE IF EXISTS public.unanswered_questions CASCADE;
DROP TABLE IF EXISTS public.tenant_configs CASCADE;
DROP TABLE IF EXISTS public.subscriptions CASCADE;
DROP TABLE IF EXISTS public.service_phases CASCADE;
DROP TABLE IF EXISTS public.security_patterns CASCADE;
DROP TABLE IF EXISTS public.security_incidents CASCADE;
DROP TABLE IF EXISTS public.representatives CASCADE;
DROP TABLE IF EXISTS public.rate_limits CASCADE;
DROP TABLE IF EXISTS public.role_permissions CASCADE;
DROP TABLE IF EXISTS public.profile_roles CASCADE;
DROP TABLE IF EXISTS public.platform_members CASCADE;
DROP TABLE IF EXISTS public.platform_configs CASCADE;
DROP TABLE IF EXISTS public.platform_admins CASCADE;
DROP TABLE IF EXISTS public.plans CASCADE;
DROP TABLE IF EXISTS public.permissions CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.notification_settings CASCADE;
DROP TABLE IF EXISTS public.model_pricing CASCADE;
DROP TABLE IF EXISTS public.message_queue CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.llm_models CASCADE;
DROP TABLE IF EXISTS public.lead_locks CASCADE;
DROP TABLE IF EXISTS public.lead_fields CASCADE;
DROP TABLE IF EXISTS public.leads CASCADE;
DROP TABLE IF EXISTS public.knowledge_items CASCADE;
DROP TABLE IF EXISTS public.invitations CASCADE;
DROP TABLE IF EXISTS public.guardrails CASCADE;
DROP TABLE IF EXISTS public.follow_up_rules CASCADE;
DROP TABLE IF EXISTS public.flows CASCADE;
DROP TABLE IF EXISTS public.flow_stage_mapping CASCADE;
DROP TABLE IF EXISTS public.credit_wallets CASCADE;
DROP TABLE IF EXISTS public.credit_transactions CASCADE;
DROP TABLE IF EXISTS public.credit_packages CASCADE;
DROP TABLE IF EXISTS public.conversation_locks CASCADE;
DROP TABLE IF EXISTS public.conversations CASCADE;
DROP TABLE IF EXISTS public.contracts CASCADE;
DROP TABLE IF EXISTS public.config_options CASCADE;
DROP TABLE IF EXISTS public.clients CASCADE;
DROP TABLE IF EXISTS public.chat_participants CASCADE;
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.chat_conversations CASCADE;
DROP TABLE IF EXISTS public.channels CASCADE;
DROP TABLE IF EXISTS public.capture_type_definitions CASCADE;
DROP TABLE IF EXISTS public.block_type_definitions CASCADE;
DROP TABLE IF EXISTS public.block_edges CASCADE;
DROP TABLE IF EXISTS public.blocks CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.api_usage CASCADE;
DROP TABLE IF EXISTS public.agents CASCADE;
DROP TABLE IF EXISTS public.agent_templates CASCADE;
DROP TABLE IF EXISTS public.agent_instructions CASCADE;
DROP TABLE IF EXISTS public.admins CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.roles CASCADE;
DROP TABLE IF EXISTS public.tenants CASCADE;

-- 2. Drop all functions
DROP FUNCTION IF EXISTS public.acquire_conversation_lock CASCADE;
DROP FUNCTION IF EXISTS public.acquire_lead_lock CASCADE;
DROP FUNCTION IF EXISTS public.add_credits CASCADE;
DROP FUNCTION IF EXISTS public.calculate_credits CASCADE;
DROP FUNCTION IF EXISTS public.check_rate_limit CASCADE;
DROP FUNCTION IF EXISTS public.check_security CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_webhook_dedup CASCADE;
DROP FUNCTION IF EXISTS public.clone_agent_to_tenant CASCADE;
DROP FUNCTION IF EXISTS public.complete_queue_messages CASCADE;
DROP FUNCTION IF EXISTS public.debit_credits CASCADE;
DROP FUNCTION IF EXISTS public.dequeue_grouped_messages CASCADE;
DROP FUNCTION IF EXISTS public.get_active_instructions CASCADE;
DROP FUNCTION IF EXISTS public.get_config CASCADE;
DROP FUNCTION IF EXISTS public.get_user_role CASCADE;
DROP FUNCTION IF EXISTS public.get_user_tenant_id CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user CASCADE;
DROP FUNCTION IF EXISTS public.has_permission CASCADE;
DROP FUNCTION IF EXISTS public.hybrid_knowledge_search CASCADE;
DROP FUNCTION IF EXISTS public.is_platform_admin CASCADE;
DROP FUNCTION IF EXISTS public.is_tenant_unlimited CASCADE;
DROP FUNCTION IF EXISTS public.pipeline_preflight CASCADE;
DROP FUNCTION IF EXISTS public.release_conversation_lock CASCADE;
DROP FUNCTION IF EXISTS public.release_lead_lock CASCADE;
DROP FUNCTION IF EXISTS public.settle_credits CASCADE;
DROP FUNCTION IF EXISTS public.try_acquire_lead_lock CASCADE;
DROP FUNCTION IF EXISTS public.update_conversation_counts CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at CASCADE;

;
