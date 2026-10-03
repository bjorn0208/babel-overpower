-- F3a (blueprint v3 §2): miolo no produto + snapshot de formulário/exigências no contrato.

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS clausulas_contrato text,                      -- MIOLO (cláusulas do produto)
  ADD COLUMN IF NOT EXISTS campos_cliente jsonb NOT NULL DEFAULT '[]',   -- [{slug,rotulo,tipo,obrigatorio}]
  ADD COLUMN IF NOT EXISTS exigencias jsonb;                             -- null = herda do tenant/molde

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS campos_formulario jsonb,  -- snapshot: união dedup dos campos (página lê daqui)
  ADD COLUMN IF NOT EXISTS exigencias jsonb,         -- snapshot: união mais exigente
  ADD COLUMN IF NOT EXISTS molde_versao text;        -- versão do molde usado (auditoria)
;
