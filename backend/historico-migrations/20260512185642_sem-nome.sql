-- Onda 6: Vincular os 6 cargos globais a todos os agentes existentes.
-- Idempotente: usa NOT EXISTS para evitar duplicar.
INSERT INTO public.agente_cargo (agente_id, cargo_id, tenant_id, ativo, ordem)
SELECT a.id, c.id, COALESCE(a.owner_id, a.user_id), true, c.ordem
FROM public.agentes a
CROSS JOIN public.cargos c
WHERE c.escopo = 'global'
  AND c.ativo = true
  AND NOT EXISTS (
    SELECT 1 FROM public.agente_cargo ac
    WHERE ac.agente_id = a.id AND ac.cargo_id = c.id
  );
;
