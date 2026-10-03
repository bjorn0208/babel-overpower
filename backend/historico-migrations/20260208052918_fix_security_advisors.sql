
-- Habilitar RLS nas novas tabelas
ALTER TABLE message_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_queue" ON message_queue
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_locks" ON lead_locks
  FOR ALL USING (auth.role() = 'service_role');

-- Fixar search_path (com assinatura explícita para funções ambíguas)
ALTER FUNCTION acquire_lead_lock(UUID) SET search_path = public;
ALTER FUNCTION pipeline_preflight(UUID, TEXT) SET search_path = public;
ALTER FUNCTION settle_credits(UUID, UUID, INT, INT, UUID, BOOLEAN, BOOLEAN) SET search_path = public;
ALTER FUNCTION dequeue_grouped_messages(UUID, TEXT) SET search_path = public;
ALTER FUNCTION complete_queue_messages(UUID[], TEXT, TEXT) SET search_path = public;
ALTER FUNCTION try_acquire_lead_lock(UUID, TEXT, TEXT, INT) SET search_path = public;
ALTER FUNCTION release_lead_lock(UUID, TEXT, TEXT) SET search_path = public;

-- Dropar versão antiga da hybrid_knowledge_search e fixar a nova
DROP FUNCTION IF EXISTS hybrid_knowledge_search(UUID, TEXT, TEXT, INT);
ALTER FUNCTION hybrid_knowledge_search(UUID, TEXT, INT, TEXT) SET search_path = public;

;
