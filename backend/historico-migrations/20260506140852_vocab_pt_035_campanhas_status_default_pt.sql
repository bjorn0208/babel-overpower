-- Onda 6 PT-BR frontend: trocar default de campanhas.status de 'draft' (EN) pra 'rascunho' (PT)
-- O CHECK constraint já só aceita PT (rascunho/ativa/pausada/finalizada) desde Big Bang.
-- Default em EN era bug latente: INSERT sem status explícito falhava no CHECK.

ALTER TABLE public.campanhas ALTER COLUMN status SET DEFAULT 'rascunho';
;
