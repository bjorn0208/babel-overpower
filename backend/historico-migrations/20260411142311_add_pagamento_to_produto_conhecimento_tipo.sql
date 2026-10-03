ALTER TABLE produto_conhecimento DROP CONSTRAINT produto_conhecimento_tipo_check; ALTER TABLE produto_conhecimento ADD CONSTRAINT produto_conhecimento_tipo_check CHECK (tipo = ANY (ARRAY['conhecimento'::text, 'objecao'::text, 'faq'::text, 'preco'::text, 'pagamento'::text]));
;
