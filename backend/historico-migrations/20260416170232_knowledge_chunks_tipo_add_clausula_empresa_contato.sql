
SET search_path = public, auth;

ALTER TABLE public.knowledge_chunks DROP CONSTRAINT IF EXISTS knowledge_chunks_tipo_check;

ALTER TABLE public.knowledge_chunks ADD CONSTRAINT knowledge_chunks_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'apresentacao'::text,
    'valor'::text,
    'resposta'::text,
    'pagamento'::text,
    'processo'::text,
    'clausula_contrato'::text,
    'contato'::text,
    'empresa'::text
  ]));

;
