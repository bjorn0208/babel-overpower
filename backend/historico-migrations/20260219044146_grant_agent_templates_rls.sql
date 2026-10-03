-- Habilitar RLS
ALTER TABLE public.agent_templates ENABLE ROW LEVEL SECURITY;

-- Qualquer autenticado pode ler templates
CREATE POLICY "agent_templates_select_authenticated"
  ON public.agent_templates
  FOR SELECT
  TO authenticated
  USING (true);

-- Apenas platform_admin pode inserir/atualizar/deletar
CREATE POLICY "agent_templates_admin_all"
  ON public.agent_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_platform_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_platform_admin = true
    )
  );
;
