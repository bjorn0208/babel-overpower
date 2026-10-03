-- App Consulta F1 — carteira em R$ por tenant: saldo + recargas + ledger

-- 3.4 Saldo materializado
CREATE TABLE IF NOT EXISTS public.consultas_saldo (
  tenant_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  saldo numeric(10,2) NOT NULL DEFAULT 0 CHECK (saldo >= 0),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.consultas_saldo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_le_proprio_saldo" ON public.consultas_saldo;
CREATE POLICY "tenant_le_proprio_saldo" ON public.consultas_saldo
  FOR SELECT TO authenticated USING (tenant_id = (select auth.uid()));
-- escrita só via RPC SECURITY DEFINER (service_role); sem policy de INSERT/UPDATE pra authenticated

-- 3.7 Pedidos de recarga (espelha pagamento do contrato)
CREATE TABLE IF NOT EXISTS public.consultas_recargas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pacote_id uuid REFERENCES public.consultas_pacotes(id),
  valor numeric(10,2) NOT NULL CHECK (valor > 0),     -- snapshot
  credito numeric(10,2) NOT NULL CHECK (credito > 0), -- snapshot
  chave_pix text,
  url_comprovante text,
  status text NOT NULL DEFAULT 'aguardando'
    CHECK (status IN ('aguardando','comprovante_enviado','aprovado','recusado')),
  aprovado_por uuid,
  aprovado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consultas_recargas_tenant_idx ON public.consultas_recargas (tenant_id);
CREATE INDEX IF NOT EXISTS consultas_recargas_pacote_idx ON public.consultas_recargas (pacote_id);
CREATE INDEX IF NOT EXISTS consultas_recargas_status_idx ON public.consultas_recargas (status);

ALTER TABLE public.consultas_recargas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_gere_proprias_recargas" ON public.consultas_recargas;
CREATE POLICY "tenant_gere_proprias_recargas" ON public.consultas_recargas
  FOR ALL TO authenticated
  USING (tenant_id = (select auth.uid()))
  WITH CHECK (tenant_id = (select auth.uid()));
DROP POLICY IF EXISTS "admin_le_recargas" ON public.consultas_recargas;
CREATE POLICY "admin_le_recargas" ON public.consultas_recargas
  FOR SELECT TO authenticated USING (public.eh_admin_plataforma());

-- 3.5 Ledger/extrato (fonte da verdade auditável)
CREATE TABLE IF NOT EXISTS public.consultas_carteira_mov (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('credito','debito','estorno')),
  valor numeric(10,2) NOT NULL CHECK (valor > 0),  -- sempre positivo; o tipo dá o sinal
  saldo_apos numeric(10,2) NOT NULL,
  consulta_id uuid REFERENCES public.consultas(id) ON DELETE SET NULL,
  recarga_id uuid REFERENCES public.consultas_recargas(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consultas_carteira_mov_tenant_idx ON public.consultas_carteira_mov (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS consultas_carteira_mov_consulta_idx ON public.consultas_carteira_mov (consulta_id) WHERE consulta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS consultas_carteira_mov_recarga_idx ON public.consultas_carteira_mov (recarga_id) WHERE recarga_id IS NOT NULL;

ALTER TABLE public.consultas_carteira_mov ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_le_proprio_extrato" ON public.consultas_carteira_mov;
CREATE POLICY "tenant_le_proprio_extrato" ON public.consultas_carteira_mov
  FOR SELECT TO authenticated USING (tenant_id = (select auth.uid()));
-- escrita só via RPC SECURITY DEFINER
;
