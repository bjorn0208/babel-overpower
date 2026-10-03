
CREATE TABLE IF NOT EXISTS public.conversation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  old_agent_enabled boolean,
  new_agent_enabled boolean,
  old_status text,
  new_status text,
  changed_by uuid,
  is_service_role boolean,
  changed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversation_audit_conv
  ON public.conversation_audit(conversation_id, changed_at DESC);

CREATE OR REPLACE FUNCTION public.audit_conversation_changes()
RETURNS trigger AS $$
BEGIN
  IF OLD.agent_enabled IS DISTINCT FROM NEW.agent_enabled
     OR OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.conversation_audit (
      conversation_id, old_agent_enabled, new_agent_enabled,
      old_status, new_status, changed_by, is_service_role
    ) VALUES (
      NEW.id, OLD.agent_enabled, NEW.agent_enabled,
      OLD.status, NEW.status,
      auth.uid(),
      COALESCE(current_setting('role', true) = 'service_role', false)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_conversations ON public.conversations;
CREATE TRIGGER trg_audit_conversations
AFTER UPDATE ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.audit_conversation_changes();

ALTER TABLE public.conversation_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_read_conversation_audit ON public.conversation_audit
  FOR SELECT TO authenticated
  USING (is_platform_admin());

CREATE POLICY srv_conversation_audit ON public.conversation_audit
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

;
