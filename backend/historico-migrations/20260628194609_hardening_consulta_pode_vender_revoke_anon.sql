
-- consulta_pode_vender bypassa RLS (SECURITY DEFINER) e só faz sentido pra tenant logado
-- ou chamada interna (service_role). Visitante anônimo não tem por que executá-la.
REVOKE EXECUTE ON FUNCTION public.consulta_pode_vender(uuid) FROM anon;

;
