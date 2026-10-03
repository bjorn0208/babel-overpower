
-- Add missing columns to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_stage text DEFAULT 'novo';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_temperature text DEFAULT 'cold';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_source text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS total_debt numeric;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS product text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE leads ADD COLUMN IF NOT EXISTS needs_human_help boolean DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS total_messages integer DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score integer DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Add updated_at to conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- RLS: users can read their own conversations (tenant_id = user or parent)
CREATE POLICY user_read_tenant_conversations ON conversations FOR SELECT
USING (
  tenant_id = auth.uid()
  OR tenant_id IN (SELECT parent_user_id FROM profiles WHERE id = auth.uid() AND parent_user_id IS NOT NULL)
);

-- RLS: users can read leads that belong to them
CREATE POLICY user_read_own_leads ON leads FOR SELECT
USING (
  tenant_id = auth.uid()
  OR tenant_id IN (SELECT parent_user_id FROM profiles WHERE id = auth.uid() AND parent_user_id IS NOT NULL)
);

-- RLS: users can read messages from their own conversations
CREATE POLICY user_read_own_messages ON messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
    AND (
      c.tenant_id = auth.uid()
      OR c.tenant_id IN (SELECT parent_user_id FROM profiles WHERE id = auth.uid() AND parent_user_id IS NOT NULL)
    )
  )
);

-- RLS: users can insert messages in their own conversations (human mode)
CREATE POLICY user_insert_own_messages ON messages FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
    AND (
      c.tenant_id = auth.uid()
      OR c.tenant_id IN (SELECT parent_user_id FROM profiles WHERE id = auth.uid() AND parent_user_id IS NOT NULL)
    )
  )
);

-- RLS: users can update their own conversations (toggle status)
CREATE POLICY user_update_own_conversations ON conversations FOR UPDATE
USING (
  tenant_id = auth.uid()
  OR tenant_id IN (SELECT parent_user_id FROM profiles WHERE id = auth.uid() AND parent_user_id IS NOT NULL)
);

;
