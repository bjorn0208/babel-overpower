
-- Adicionar cor aos fluxos (cada fluxo = coluna do CRM)
ALTER TABLE flows ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#6B7280';

-- Definir cores para os fluxos existentes
UPDATE flows SET color = '#3B82F6' WHERE name = 'Novo';
UPDATE flows SET color = '#8B5CF6' WHERE name = 'Fluxo Limpa Nome';
UPDATE flows SET color = '#F59E0B' WHERE name = 'Fluxo Diagnostico';
UPDATE flows SET color = '#10B981' WHERE name = 'Fechado';

-- Sincronizar pipeline_stage com o nome do flow atual nos leads
UPDATE leads SET pipeline_stage = f.name
FROM flows f
WHERE leads.current_flow_id = f.id
AND (leads.pipeline_stage IS NULL OR leads.pipeline_stage != f.name);

;
