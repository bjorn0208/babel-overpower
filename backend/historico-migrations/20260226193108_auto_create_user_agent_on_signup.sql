
-- Atualizar trigger handle_new_user para tambem criar user_agent automaticamente
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.email, '')
  );

  -- Criar agente automaticamente para o usuario
  insert into public.user_agents (user_id, nome_agente)
  values (new.id, '');

  return new;
end;
$$;

;
