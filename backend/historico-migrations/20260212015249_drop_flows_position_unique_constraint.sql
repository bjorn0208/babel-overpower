
-- Remover constraint única de posição (impede criar e reordenar)
DROP INDEX IF EXISTS idx_flows_agent_position;

-- Manter um índice normal para performance de ordenação
CREATE INDEX IF NOT EXISTS idx_flows_agent_position_sort ON flows (agent_id, position);

;
