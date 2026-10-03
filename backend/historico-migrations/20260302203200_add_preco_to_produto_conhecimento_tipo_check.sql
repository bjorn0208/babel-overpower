
ALTER TABLE produto_conhecimento DROP CONSTRAINT IF EXISTS produto_conhecimento_tipo_check;
ALTER TABLE produto_conhecimento ADD CONSTRAINT produto_conhecimento_tipo_check
  CHECK (tipo = ANY (ARRAY['conhecimento', 'objecao', 'faq', 'preco']));

;
