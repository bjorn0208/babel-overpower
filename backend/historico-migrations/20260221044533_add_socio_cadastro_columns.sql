
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tipo_pessoa text CHECK (tipo_pessoa IN ('pf', 'pj')),
  ADD COLUMN IF NOT EXISTS razao_social text,
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS chave_pix text;

;
