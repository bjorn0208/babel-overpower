-- Adiciona coluna descricao à tabela produtos
-- Necessária para compatibilidade com sync-chunks (edge fn v15 seleciona esse campo)
-- Campo é TEXT nullable sem default (valor null para registros existentes)
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS descricao TEXT DEFAULT NULL;
;
