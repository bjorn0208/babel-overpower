
-- Adicionar coluna display_order nas 3 tabelas que o frontend espera

-- stores
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;

-- knowledge_items  
ALTER TABLE public.knowledge_items ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;

-- quick_actions
ALTER TABLE public.quick_actions ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;

-- Popular display_order com valores existentes onde possível
UPDATE public.knowledge_items SET display_order = priority WHERE display_order = 0 AND priority IS NOT NULL;
UPDATE public.quick_actions SET display_order = position WHERE display_order = 0 AND position IS NOT NULL;

;
