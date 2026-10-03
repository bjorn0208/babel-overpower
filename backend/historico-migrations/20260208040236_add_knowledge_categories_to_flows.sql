ALTER TABLE flows ADD COLUMN IF NOT EXISTS knowledge_categories TEXT[] DEFAULT '{}';
;
