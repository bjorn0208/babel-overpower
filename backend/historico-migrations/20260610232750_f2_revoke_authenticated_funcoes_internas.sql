-- Defesa multitenant: as funções F1/F2 são chamadas SÓ por edge (service_role).
-- buscar_produto_fuzzy com GRANT authenticated deixaria tenant logado passar
-- p_tenant_id de outro tenant (SECURITY DEFINER fura RLS). Revoga.
REVOKE EXECUTE ON FUNCTION public.buscar_produto_fuzzy(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.calcular_plano_pagamento(jsonb) FROM authenticated;
;
