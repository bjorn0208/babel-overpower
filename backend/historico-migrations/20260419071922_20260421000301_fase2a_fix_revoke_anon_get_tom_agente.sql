-- Fix: Supabase concede EXECUTE implícito para anon em functions do schema public.
-- Tom do agente é ação autenticada — revogar acesso anônimo.
REVOKE EXECUTE ON FUNCTION public.get_tom_agente(uuid) FROM anon;

;
