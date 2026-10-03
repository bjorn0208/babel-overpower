
-- Fix blocking FK constraints: NO ACTION → SET NULL / CASCADE
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_tenant_id_fkey;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.multinivel_comissoes DROP CONSTRAINT IF EXISTS multinivel_comissoes_origem_id_fkey;
ALTER TABLE public.multinivel_comissoes ADD CONSTRAINT multinivel_comissoes_origem_id_fkey
  FOREIGN KEY (origem_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.multinivel_comissoes DROP CONSTRAINT IF EXISTS multinivel_comissoes_beneficiario_id_fkey;
ALTER TABLE public.multinivel_comissoes ADD CONSTRAINT multinivel_comissoes_beneficiario_id_fkey
  FOREIGN KEY (beneficiario_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.multinivel_saques DROP CONSTRAINT IF EXISTS multinivel_saques_user_id_fkey;
ALTER TABLE public.multinivel_saques ADD CONSTRAINT multinivel_saques_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_referred_by_fkey;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_referred_by_fkey
  FOREIGN KEY (referred_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- RPC: admin deleta usuarios (limpa orfaos + deleta auth.users que cascateia pra profiles)
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

  -- Limpar dados orfaos (sem FK pra profiles)
  DELETE FROM public.leads
  WHERE id IN (
    SELECT l.id FROM public.leads l
    JOIN public.conversations c ON c.lead_id = l.id
    WHERE c.tenant_id = ANY(p_user_ids)
  );

  DELETE FROM public.conversations
  WHERE tenant_id = ANY(p_user_ids);

  -- Deletar de auth.users (CASCADE deleta profiles + todos os deps CASCADE)
  FOREACH v_uid IN ARRAY p_user_ids LOOP
    DELETE FROM auth.users WHERE id = v_uid;
    v_deleted := v_deleted + 1;
  END LOOP;

  RETURN jsonb_build_object('deleted', v_deleted);
END;
$$;

;
