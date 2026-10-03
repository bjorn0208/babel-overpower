
-- SECURITY FIX: trigger NÃO deve ler parent_user_id do raw_user_meta_data
-- porque qualquer pessoa pode enviar metadata arbitrário via /auth/v1/signup.
-- O parent_user_id é setado pela edge function via UPDATE com service_role.
CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.email, '')
  );

  -- Criar agente automaticamente para o usuario
  -- Team members terão o user_agents deletado pela edge function após set do parent_user_id
  INSERT INTO public.user_agents (user_id, nome_agente)
  VALUES (new.id, '');

  RETURN new;
END;
$$;

;
