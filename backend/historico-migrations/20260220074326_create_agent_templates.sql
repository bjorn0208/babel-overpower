
-- Habilitar extensao moddatetime
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

CREATE TABLE public.agent_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  system_prompt text DEFAULT '',
  llm_model text DEFAULT 'openai/gpt-4o-mini',
  temperature numeric DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 2),
  max_tokens integer DEFAULT 2048 CHECK (max_tokens > 0),
  avatar_url text DEFAULT NULL,
  category text DEFAULT '',
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.agent_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_templates_admin_select ON public.agent_templates
  FOR SELECT USING (is_platform_admin());

CREATE POLICY agent_templates_admin_insert ON public.agent_templates
  FOR INSERT WITH CHECK (is_platform_admin());

CREATE POLICY agent_templates_admin_update ON public.agent_templates
  FOR UPDATE USING (is_platform_admin());

CREATE POLICY agent_templates_admin_delete ON public.agent_templates
  FOR DELETE USING (is_platform_admin());

CREATE POLICY agent_templates_user_select ON public.agent_templates
  FOR SELECT USING (is_active = true);

CREATE TRIGGER set_updated_at_agent_templates
  BEFORE UPDATE ON public.agent_templates
  FOR EACH ROW
  EXECUTE FUNCTION extensions.moddatetime(updated_at);

;
