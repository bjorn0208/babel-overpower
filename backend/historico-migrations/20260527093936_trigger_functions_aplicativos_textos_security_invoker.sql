-- Trigger functions de updated_at não precisam de SECURITY DEFINER (só
-- alteram NEW antes do INSERT/UPDATE — quem dispara é o trigger interno
-- do Postgres em nome do user, que já tem permissão de UPDATE via RLS).
-- Trocar pra SECURITY INVOKER fecha o advisor "security_definer_function_executable".

CREATE OR REPLACE FUNCTION public.tg_loja_aplicativos_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_arquivos_textos_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

;
