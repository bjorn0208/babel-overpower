ALTER TABLE behavior_chunks
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS subcategoria text;
CREATE INDEX IF NOT EXISTS behavior_chunks_categoria_idx ON behavior_chunks(categoria, subcategoria);
;
