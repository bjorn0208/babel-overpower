
-- Modificar trigger para ler parent_user_id e page_permissions do metadata do signup
-- Isso garante que team members já nascem com parent_user_id correto (atômico)
-- e NÃO criam user_agents desnecessário
CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_parent_user_id uuid;
  v_permissions text[];
BEGIN
  -- Ler parent_user_id do metadata (se vier do fluxo de criação de team member)
  v_parent_user_id := (new.raw_user_meta_data->>'parent_user_id')::uuid;

  -- Ler page_permissions do metadata
  IF new.raw_user_meta_data ? 'page_permissions' THEN
    SELECT array_agg(val)
    INTO v_permissions
    FROM jsonb_array_elements_text(new.raw_user_meta_data->'page_permissions') AS val;
  END IF;

  INSERT INTO public.profiles (id, full_name, email, parent_user_id, page_permissions)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.email, ''),
    v_parent_user_id,
    coalesce(v_permissions, '{}'::text[])
  );

  -- Criar agente SOMENTE para usuários principais (não team members)
  IF v_parent_user_id IS NULL THEN
    INSERT INTO public.user_agents (user_id, nome_agente)
    VALUES (new.id, '');
  END IF;

  RETURN new;
END;
$$;

;
