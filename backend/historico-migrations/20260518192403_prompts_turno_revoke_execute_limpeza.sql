-- Fix de segurança (advisor): limpar_prompts_turno_expirados é SECURITY DEFINER e estava
-- exposta via /rest/v1/rpc a anon/authenticated — qualquer um podia disparar o DELETE em massa.
-- Só o cron (roda como owner/postgres) deve executá-la. Revoga EXECUTE das roles públicas.
revoke execute on function public.limpar_prompts_turno_expirados() from public;
revoke execute on function public.limpar_prompts_turno_expirados() from anon;
revoke execute on function public.limpar_prompts_turno_expirados() from authenticated;
;
