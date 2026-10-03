-- RLS: owner pode ler o próprio canal Z-API (precisa pra mostrar foto WhatsApp no app Agente / Conversas / Chat-Teste).
CREATE POLICY canais_owner_select ON public.canais
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

COMMENT ON POLICY canais_owner_select ON public.canais IS
  'Dono do canal pode ler o próprio registro — habilita render da foto de perfil WhatsApp na UI.';
;
