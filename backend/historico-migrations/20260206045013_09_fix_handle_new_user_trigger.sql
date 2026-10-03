
-- Fix: trigger agora define role e plan com defaults corretos
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email, role, plan, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'client'),
    'free',
    true
  );
  RETURN NEW;
END;
$$;

-- Criar profile faltante para diego@limpanome.com
INSERT INTO public.profiles (id, email, full_name, role, plan, is_active)
VALUES (
  'ee16043c-d578-417b-af32-0f204a8309ee',
  'diego@limpanome.com',
  'diego',
  'client',
  'free',
  true
)
ON CONFLICT (id) DO NOTHING;

;
