
-- Backup reversível dos templates ativos ANTES da conversão [CAMPO] -> {{campo}}.
-- Recuperação: UPDATE contratos_template t SET conteudo=b.conteudo, campos_obrigatorios=b.campos_obrigatorios
--              FROM contratos_template_backup_chave_dupla_2026_05_16 b WHERE b.id=t.id;
CREATE TABLE IF NOT EXISTS public.contratos_template_backup_chave_dupla_2026_05_16 AS
SELECT id, user_id, nome, conteudo, campos_obrigatorios, now() AS snapshot_em
FROM public.contratos_template
WHERE ativo = true;

ALTER TABLE public.contratos_template_backup_chave_dupla_2026_05_16
  ADD COLUMN IF NOT EXISTS id_pk bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;

ALTER TABLE public.contratos_template_backup_chave_dupla_2026_05_16 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dono_ve_proprio_backup"
  ON public.contratos_template_backup_chave_dupla_2026_05_16;
CREATE POLICY "dono_ve_proprio_backup"
  ON public.contratos_template_backup_chave_dupla_2026_05_16
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE INDEX IF NOT EXISTS contratos_template_backup_chave_dupla_2026_05_16_id_idx
  ON public.contratos_template_backup_chave_dupla_2026_05_16 (id);

;
