
-- Fix: contracts.lead_id aponta pra lead_cards.id ao inves de leads.id
-- Corrigir via conversations (lead_cards → conversation → leads)
UPDATE public.contracts c
SET lead_id = conv.lead_id
FROM public.lead_cards lc
JOIN public.conversations conv ON conv.id = lc.conversation_id
WHERE c.lead_id = lc.id
  AND c.origem = 'agente'
  AND conv.lead_id IS NOT NULL;

-- Remover converted_at de leads criados via chat-test (nao deviam ter sido convertidos)
UPDATE public.leads
SET converted_at = NULL, client_stage = NULL
WHERE phone LIKE 'chat-test%' AND converted_at IS NOT NULL;

;
