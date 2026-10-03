
-- Remove policy que expunha PIX/CNPJ/CPF dos indicados ao indicador.
DROP POLICY IF EXISTS "users_read_own_referrals" ON public.profiles;

-- Remove policy ampla que permitia membros do time verem dados sigilosos uns dos outros.
DROP POLICY IF EXISTS "profiles_select_team" ON public.profiles;

;
