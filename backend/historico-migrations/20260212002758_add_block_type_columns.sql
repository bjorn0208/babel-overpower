
-- Add new columns to block_type_definitions for the universal builder
ALTER TABLE block_type_definitions ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE block_type_definitions ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE block_type_definitions ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#6B7280';
ALTER TABLE block_type_definitions ADD COLUMN IF NOT EXISTS config_schema JSONB DEFAULT '{}';
ALTER TABLE block_type_definitions ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Add canvas position data to blocks
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS position_x REAL DEFAULT 0;
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS position_y REAL DEFAULT 0;
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS width REAL;
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS height REAL;

-- Add stage tracking to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS stage_source TEXT DEFAULT 'flow';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_stage TEXT;

;
