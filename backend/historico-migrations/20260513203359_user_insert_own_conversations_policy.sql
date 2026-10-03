-- Adiciona policy de INSERT em public.conversas pra usuários autenticados.
-- Necessária pra: Chat-Teste criar conversa fake (channel='teste') do próprio tenant,
-- e equipe (parent_user_id) também criar conversas no nome do dono.
-- Segue padrão das policies de UPDATE/DELETE já existentes na tabela.
CREATE POLICY "user_insert_own_conversations"
ON public.conversas
FOR INSERT
TO authenticated
WITH CHECK (
  (tenant_id = (SELECT auth.uid()))
  OR (tenant_id IN (
    SELECT profiles.parent_user_id
    FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.parent_user_id IS NOT NULL
  ))
);
;
