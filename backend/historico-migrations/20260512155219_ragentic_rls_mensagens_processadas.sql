ALTER TABLE public.mensagens_processadas ENABLE ROW LEVEL SECURITY;
-- Tabela só de deduplicação interna — leitura/escrita só service_role
DROP POLICY IF EXISTS mensagens_processadas_sem_acesso ON public.mensagens_processadas;
CREATE POLICY mensagens_processadas_sem_acesso ON public.mensagens_processadas
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
;
