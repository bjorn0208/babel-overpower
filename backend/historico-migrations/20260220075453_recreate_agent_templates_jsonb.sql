
-- Drop old agent_templates (flat columns) and recreate with JSONB for tree structure
DROP TABLE IF EXISTS agent_templates CASCADE;

CREATE TABLE agent_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL DEFAULT '',
  descricao text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'rascunho',
  modelo_principal text,
  identidade jsonb NOT NULL DEFAULT '[]'::jsonb,
  empresa jsonb NOT NULL DEFAULT '[]'::jsonb,
  produtos jsonb NOT NULL DEFAULT '[]'::jsonb,
  conhecimento jsonb NOT NULL DEFAULT '[]'::jsonb,
  fluxo jsonb NOT NULL DEFAULT '[]'::jsonb,
  guardrails jsonb NOT NULL DEFAULT '[]'::jsonb,
  followup jsonb NOT NULL DEFAULT '[]'::jsonb,
  contrato jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON agent_templates
  FOR EACH ROW
  EXECUTE FUNCTION extensions.moddatetime('updated_at');

-- RLS
ALTER TABLE agent_templates ENABLE ROW LEVEL SECURITY;

-- Helper function to check admin (avoids RLS recursion)
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND system_role = 'platform_admin'
  );
$$;

-- Only platform_admin can CRUD
CREATE POLICY "admin_all_agent_templates" ON agent_templates
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

;
