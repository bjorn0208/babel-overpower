-- Adiciona soft delete pra leads. Frontend já chama UPDATE deleted_at = now()
-- mas a coluna não existia, fazendo Postgrest aceitar e ignorar silenciosamente.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Índice parcial pra otimizar listagens que filtram leads ativos.
CREATE INDEX IF NOT EXISTS idx_leads_active
  ON public.leads (tenant_id)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.leads.deleted_at IS
  'Soft delete — populado pelo botão Deletar da Ficha. NULL = ativo.';
;
