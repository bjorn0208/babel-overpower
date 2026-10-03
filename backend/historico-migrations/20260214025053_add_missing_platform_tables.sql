
-- ====================================================================
-- Migration: Criar tabelas faltantes para o frontend
-- Tabelas: platform_admins, representatives, admins, model_pricing,
--          platform_members, notification_settings, audit_logs,
--          chat_conversations, chat_participants, chat_messages,
--          notifications, guardrails, agent_templates, follow_up_rules
-- ====================================================================

-- 1. platform_admins
CREATE TABLE IF NOT EXISTS platform_admins (
    user_id    uuid        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. representatives
CREATE TABLE IF NOT EXISTS representatives (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           uuid        NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
    name              text        NOT NULL,
    email             text        NOT NULL,
    phone             text,
    referral_code     text        NOT NULL UNIQUE,
    commission_rate   numeric     NOT NULL DEFAULT 0.02,
    status            text        NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'inactive', 'archived', 'deleted')),
    last_login_at     timestamptz,
    accepted_terms_at timestamptz,
    created_by        uuid        NOT NULL REFERENCES auth.users (id),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 3. admins
CREATE TABLE IF NOT EXISTS admins (
    id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  uuid        NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
    name                     text        NOT NULL,
    email                    text        NOT NULL,
    phone                    text,
    representative_id        uuid        REFERENCES representatives (id) ON DELETE SET NULL,
    credit_balance           numeric     NOT NULL DEFAULT 0,
    tenant_limit             integer     NOT NULL DEFAULT 0,
    tenant_price_multiplier  numeric     NOT NULL DEFAULT 1.0,
    default_billing_type     text        NOT NULL DEFAULT 'credit'
                             CHECK (default_billing_type IN ('credit', 'monthly', 'message_count', 'conversation')),
    show_credits_to_tenants  boolean     NOT NULL DEFAULT true,
    show_message_counter     boolean     NOT NULL DEFAULT false,
    status                   text        NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'inactive', 'suspended', 'archived', 'deleted')),
    last_login_at            timestamptz,
    accepted_terms_at        timestamptz,
    created_by               uuid        NOT NULL REFERENCES auth.users (id),
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now()
);

-- 4. model_pricing
CREATE TABLE IF NOT EXISTS model_pricing (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id        text        NOT NULL UNIQUE,
    model_name      text        NOT NULL,
    price_per_token numeric     NOT NULL,
    is_available    boolean     NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 5. platform_members
CREATE TABLE IF NOT EXISTS platform_members (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid        NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
    owner_type    text        NOT NULL
                  CHECK (owner_type IN ('super_admin', 'admin')),
    owner_id      uuid,
    name          text        NOT NULL,
    permissions   jsonb       NOT NULL DEFAULT '{}',
    status        text        NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'inactive')),
    last_login_at timestamptz,
    created_by    uuid        NOT NULL REFERENCES auth.users (id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 6. notification_settings
CREATE TABLE IF NOT EXISTS notification_settings (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    key          text        NOT NULL UNIQUE,
    label        text        NOT NULL,
    description  text,
    is_enabled   boolean     NOT NULL DEFAULT true,
    threshold    jsonb,
    notify_roles jsonb       NOT NULL DEFAULT '[]',
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 7. audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES auth.users (id),
    action      text        NOT NULL,
    target_type text        NOT NULL,
    target_id   uuid,
    details     jsonb       NOT NULL DEFAULT '{}',
    ip_address  text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- 8. chat_conversations
CREATE TABLE IF NOT EXISTS chat_conversations (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    type       text        NOT NULL CHECK (type IN ('direct', 'group')),
    title      text,
    created_by uuid        NOT NULL REFERENCES auth.users (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 9. chat_participants
CREATE TABLE IF NOT EXISTS chat_participants (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid        NOT NULL REFERENCES chat_conversations (id) ON DELETE CASCADE,
    user_id         uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    role            text        NOT NULL DEFAULT 'member'
                    CHECK (role IN ('owner', 'member')),
    joined_at       timestamptz NOT NULL DEFAULT now(),
    last_read_at    timestamptz,
    UNIQUE (conversation_id, user_id)
);

-- 10. chat_messages
CREATE TABLE IF NOT EXISTS chat_messages (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid        NOT NULL REFERENCES chat_conversations (id) ON DELETE CASCADE,
    sender_id       uuid        NOT NULL REFERENCES auth.users (id),
    content         text,
    message_type    text        NOT NULL DEFAULT 'text'
                    CHECK (message_type IN ('text', 'image', 'pdf', 'file')),
    file_url        text,
    file_name       text,
    file_size       integer,
    metadata        jsonb       NOT NULL DEFAULT '{}',
    is_ai_processed boolean     NOT NULL DEFAULT false,
    ai_result       jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- 11. notifications
CREATE TABLE IF NOT EXISTS notifications (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    type       text        NOT NULL,
    title      text        NOT NULL,
    message    text        NOT NULL,
    is_read    boolean     NOT NULL DEFAULT false,
    metadata   jsonb       NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 12. guardrails (frontend espera 'guardrails', SQL original usa 'guardrail_items')
CREATE TABLE IF NOT EXISTS guardrails (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    scope       text NOT NULL DEFAULT 'agent'
                CHECK (scope IN ('global', 'agent')),
    tenant_id   uuid REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id    uuid REFERENCES agents(id) ON DELETE CASCADE,
    direction   text NOT NULL CHECK (direction IN ('input', 'output')),
    match_type  text NOT NULL DEFAULT 'contains'
                CHECK (match_type IN ('exact', 'contains', 'regex')),
    pattern     text NOT NULL,
    action      text NOT NULL DEFAULT 'block'
                CHECK (action IN ('block', 'replace', 'flag')),
    response    text,
    replacement text,
    priority    integer DEFAULT 0,
    is_active   boolean DEFAULT true,
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now()
);

-- 13. agent_templates
CREATE TABLE IF NOT EXISTS agent_templates (
    id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name             text NOT NULL UNIQUE,
    description      text,
    niche            text,
    icon             text,
    system_prompt_template text NOT NULL DEFAULT '',
    welcome_message      text DEFAULT 'Ola! Como posso ajudar?',
    fallback_message     text DEFAULT 'Desculpe, nao entendi. Pode reformular?',
    no_answer_message    text DEFAULT 'Otima pergunta! Vou verificar com a equipe.',
    hallucination_fallback text DEFAULT 'Deixa eu verificar essa informacao!',
    temperature          numeric(3,2) DEFAULT 0.7,
    max_tokens           integer DEFAULT 1024,
    max_history          integer DEFAULT 20,
    flow_template         jsonb NOT NULL DEFAULT '[]',
    kb_categories_template jsonb DEFAULT '[]',
    synonyms_template     jsonb DEFAULT '[]',
    guardrails_template   jsonb DEFAULT '[]',
    settings_template     jsonb DEFAULT '{}',
    status           text NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'inactive', 'draft')),
    created_by       uuid,
    created_at       timestamptz DEFAULT now(),
    updated_at       timestamptz DEFAULT now()
);

-- 14. follow_up_rules
CREATE TABLE IF NOT EXISTS follow_up_rules (
    id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id         uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    name             text NOT NULL,
    trigger_event    text NOT NULL
                     CHECK (trigger_event IN (
                       'no_response', 'step_stuck', 'flow_completed',
                       'conversation_closed', 'contact_inactive', 'custom'
                     )),
    trigger_delay    integer NOT NULL,
    trigger_max_fires integer DEFAULT 1,
    condition        jsonb DEFAULT '{}',
    action_type      text NOT NULL
                     CHECK (action_type IN (
                       'send_message', 'send_notification', 'add_tag',
                       'change_step', 'transfer_human', 'archive_conversation'
                     )),
    action_config    jsonb NOT NULL,
    is_active        boolean DEFAULT true,
    created_at       timestamptz DEFAULT now(),
    updated_at       timestamptz DEFAULT now()
);

-- Habilitar Realtime para chat e notificacoes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;

;
