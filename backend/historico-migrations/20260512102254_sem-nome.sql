
ALTER VIEW public.vw_metricas_motor_dia SET (security_invoker = true);
ALTER VIEW public.vw_metricas_ferramentas_dia SET (security_invoker = true);

REVOKE EXECUTE ON FUNCTION public.fn_rate_limit_consumir(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_rate_limit_limpar() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_saude_motor() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_metricas_motor(uuid, integer) FROM PUBLIC, anon;

;
