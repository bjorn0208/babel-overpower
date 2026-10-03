
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS canvas_position JSONB DEFAULT '{"x": 0, "y": 0}';

;
