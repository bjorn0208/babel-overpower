
-- Fix multinivel_comissoes: colunas NOT NULL impedem SET NULL das FKs
-- Reverter FKs pra CASCADE (comissoes sao deletadas junto com o usuario)
ALTER TABLE public.multinivel_comissoes
  DROP CONSTRAINT IF EXISTS multinivel_comissoes_purchase_order_id_fkey;
ALTER TABLE public.multinivel_comissoes
  ADD CONSTRAINT multinivel_comissoes_purchase_order_id_fkey
  FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id)
  ON DELETE CASCADE;

ALTER TABLE public.multinivel_comissoes
  DROP CONSTRAINT IF EXISTS multinivel_comissoes_origem_id_fkey;
ALTER TABLE public.multinivel_comissoes
  ADD CONSTRAINT multinivel_comissoes_origem_id_fkey
  FOREIGN KEY (origem_id) REFERENCES public.profiles(id)
  ON DELETE CASCADE;

ALTER TABLE public.multinivel_comissoes
  DROP CONSTRAINT IF EXISTS multinivel_comissoes_beneficiario_id_fkey;
ALTER TABLE public.multinivel_comissoes
  ADD CONSTRAINT multinivel_comissoes_beneficiario_id_fkey
  FOREIGN KEY (beneficiario_id) REFERENCES public.profiles(id)
  ON DELETE CASCADE;

-- Tambem garantir que knowledge_chunks limpa (sem FK, precisa ser manual na RPC)
-- Reescrever RPC com limpeza completa
CREATE OR REPLACE FUNCTION public.admin_delete_users(p_user_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_role text;
  v_uid uuid;
  v_deleted int := 0;
BEGIN
  -- Verificar que caller é platform_admin
  SELECT system_role INTO v_caller_role
  FROM public.profiles
  WHERE id = (SELECT auth.uid())
  LIMIT 1;

  IF v_caller_role IS DISTINCT FROM 'platform_admin' THEN
    RAISE EXCEPTION 'Apenas administradores podem deletar usuarios';
  END IF;

  -- Não permitir deletar a si mesmo
  IF (SELECT auth.uid()) = ANY(p_user_ids) THEN
    RAISE EXCEPTION 'Voce nao pode deletar sua propria conta';
  END IF;

  -- Limpar knowledge_chunks (sem FK, precisa manual)
  DELETE FROM public.knowledge_chunks
  WHERE agent_id IN (SELECT id FROM public.user_agents WHERE user_id = ANY(p_user_ids));

  -- Limpar dados orfaos (conversations/leads sem FK pra profiles)
  DELETE FROM public.leads
  WHERE id IN (
    SELECT l.id FROM public.leads l
    JOIN public.conversations c ON c.lead_id = l.id
    WHERE c.tenant_id = ANY(p_user_ids)
  );

  DELETE FROM public.conversations
  WHERE tenant_id = ANY(p_user_ids);

  -- Deletar de auth.users (CASCADE deleta profiles + todos os deps)
  FOREACH v_uid IN ARRAY p_user_ids LOOP
    DELETE FROM auth.users WHERE id = v_uid;
    v_deleted := v_deleted + 1;
  END LOOP;

  RETURN jsonb_build_object('deleted', v_deleted);
END;
$$;

;
