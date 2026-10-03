-- N números autorizados a falar com o assistente financeiro (com rótulo de quem é).
-- financeiro_config_tenant.ativo continua sendo o portão geral do recurso;
-- numero_dono legado é backfillado pra cá e deixa de ser lido pelo webhook.
CREATE TABLE IF NOT EXISTS public.financeiro_numeros_autorizados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  numero text NOT NULL,
  rotulo text,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financeiro_numeros_digitos CHECK (numero ~ '^[0-9]{10,15}$')
);

COMMENT ON TABLE public.financeiro_numeros_autorizados IS 'Números de WhatsApp autorizados a enviar comprovantes/gastos pro assistente financeiro do tenant; rotulo identifica quem é (autoria nos lançamentos).';

-- Um número ativo só pode pertencer a 1 tenant (evita roteamento ambíguo no webhook)
CREATE UNIQUE INDEX IF NOT EXISTS uk_financeiro_numeros_ativo
  ON public.financeiro_numeros_autorizados (numero) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_financeiro_numeros_tenant
  ON public.financeiro_numeros_autorizados (tenant_id) WHERE ativo = true;

ALTER TABLE public.financeiro_numeros_autorizados ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'financeiro_numeros_tenant_all') THEN
    CREATE POLICY "financeiro_numeros_tenant_all" ON public.financeiro_numeros_autorizados
      FOR ALL TO authenticated
      USING (tenant_id = (select auth.uid()))
      WITH CHECK (tenant_id = (select auth.uid()));
  END IF;
END $$;

-- Backfill do número único legado
INSERT INTO public.financeiro_numeros_autorizados (tenant_id, numero, rotulo, ativo)
SELECT c.tenant_id, c.numero_dono, 'Dono', true
FROM public.financeiro_config_tenant c
WHERE c.numero_dono IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.financeiro_numeros_autorizados n
    WHERE n.tenant_id = c.tenant_id AND n.numero = c.numero_dono
  );
;
