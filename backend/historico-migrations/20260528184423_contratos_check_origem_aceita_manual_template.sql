-- Estende contracts_origem_check pra aceitar 'manual_template'
-- (gerado pela RPC criar_contrato_livre_de_template, criada em 28/05).
-- 'manual_template' distingue contratos gerados no painel Gerador usando
-- um template existente (mesma página pública que o agente entrega) de
-- 'manual' (texto livre) e 'agente' (gerado via chat).

ALTER TABLE public.contratos DROP CONSTRAINT IF EXISTS contracts_origem_check;
ALTER TABLE public.contratos
  ADD CONSTRAINT contracts_origem_check
  CHECK (origem = ANY (ARRAY['agente'::text, 'manual'::text, 'manual_template'::text]));
;
