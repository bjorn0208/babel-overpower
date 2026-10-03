
-- ============================================================
-- MIGRATION: Inline agent data into user_agents
-- Removes template dependency - each user owns their agent data
-- ============================================================

-- 1. Add agent data columns to user_agents
ALTER TABLE public.user_agents
  ADD COLUMN IF NOT EXISTS identidade jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS fluxo jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS configuracao jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS modelo_principal text,
  ADD COLUMN IF NOT EXISTS temperatura numeric DEFAULT 0.7,
  ADD COLUMN IF NOT EXISTS max_tokens integer DEFAULT 1024;

-- 2. Copy data from agent_templates to each user_agents row
UPDATE public.user_agents ua
SET
  identidade = at.identidade,
  fluxo = at.fluxo,
  configuracao = at.configuracao,
  modelo_principal = at.modelo_principal,
  temperatura = at.temperatura,
  max_tokens = at.max_tokens
FROM public.agent_templates at
WHERE at.id = ua.template_id;

-- 3. Make template_id nullable (no longer required)
ALTER TABLE public.user_agents
  ALTER COLUMN template_id DROP NOT NULL;

-- 4. Remap knowledge_chunks.agent_id from agent_templates.id to user_agents.id
-- For the personal template (Roberta: 57273e47 -> 4f654d3d)
UPDATE public.knowledge_chunks
SET agent_id = '4f654d3d-ffe7-4853-a5f4-3c530e2a7b77'
WHERE agent_id = '57273e47-56e3-4e6e-b1ca-98cdc1bcdb83';

-- For shared template (Diego: 8942d655 -> 666d7fe1)
-- First clone knowledge for Diego
UPDATE public.knowledge_chunks
SET agent_id = '666d7fe1-6f1b-4a76-9c88-5d582c7dcbb3'
WHERE agent_id = '8942d655-e5d1-44d2-bb1c-63f65c09be2c';

-- Then duplicate knowledge for Raquel (ba832aaa)
INSERT INTO public.knowledge_chunks (agent_id, title, content, category, tags, embedding, fts, created_at)
SELECT 'ba832aaa-28ab-4767-a8b9-1023fd37ac95', title, content, category, tags, embedding, fts, created_at
FROM public.knowledge_chunks
WHERE agent_id = '666d7fe1-6f1b-4a76-9c88-5d582c7dcbb3';

-- 5. Remap leads.agent_id
UPDATE public.leads
SET agent_id = '4f654d3d-ffe7-4853-a5f4-3c530e2a7b77'
WHERE agent_id = '57273e47-56e3-4e6e-b1ca-98cdc1bcdb83';

-- For shared template leads - map by tenant_id
UPDATE public.leads
SET agent_id = '666d7fe1-6f1b-4a76-9c88-5d582c7dcbb3'
WHERE agent_id = '8942d655-e5d1-44d2-bb1c-63f65c09be2c'
AND tenant_id = '1ec3f624-6555-482f-9b38-59579efd8016';

UPDATE public.leads
SET agent_id = 'ba832aaa-28ab-4767-a8b9-1023fd37ac95'
WHERE agent_id = '8942d655-e5d1-44d2-bb1c-63f65c09be2c'
AND tenant_id = '755f399f-a1fe-4b98-bfb5-32533ac59779';

-- Silvia's leads that were on shared template -> map to her user_agent
UPDATE public.leads
SET agent_id = '4f654d3d-ffe7-4853-a5f4-3c530e2a7b77'
WHERE agent_id = '8942d655-e5d1-44d2-bb1c-63f65c09be2c'
AND tenant_id = 'e843a629-ac44-41fa-a28e-9c3da861c9de';

-- 6. Remap lead_cards.agent_id
UPDATE public.lead_cards lc
SET agent_id = l.agent_id
FROM public.leads l
WHERE l.id = lc.lead_id
AND lc.agent_id != l.agent_id;

-- 7. Remap scheduled_actions.agent_id via conversation -> lead -> tenant
UPDATE public.scheduled_actions sa
SET agent_id = l.agent_id
FROM public.conversations c
JOIN public.leads l ON l.id = c.lead_id
WHERE c.id = sa.conversation_id
AND sa.agent_id != l.agent_id;

-- 8. Update load_agent_context RPC to read from user_agents
CREATE OR REPLACE FUNCTION public.load_agent_context(p_agent_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'agent', jsonb_build_object(
      'id', ua.id,
      'identidade', ua.identidade,
      'fluxo', ua.fluxo,
      'configuracao', ua.configuracao,
      'modelo_principal', ua.modelo_principal,
      'temperatura', ua.temperatura,
      'max_tokens', ua.max_tokens
    ),
    'tenant_id', ua.user_id,
    'empresa_nome', COALESCE(e.nome, ''),
    'subscription', CASE WHEN s.id IS NOT NULL THEN jsonb_build_object(
      'id', s.id,
      'status', s.status,
      'max_conversas', s.max_conversas,
      'conversas_usadas', s.conversas_usadas,
      'plano_id', s.plano_id
    ) ELSE NULL END
  )
  FROM user_agents ua
  LEFT JOIN empresas e ON e.user_id = ua.user_id
  LEFT JOIN user_subscriptions s ON s.user_id = ua.user_id AND s.status = 'active'
  WHERE ua.id = p_agent_id
  LIMIT 1;
$$;

-- 9. Update get_minha_rede to use user_agents.id 
-- (no change needed - it queries profiles, not agents)

-- 10. Update hybrid_search to work with new agent_id (user_agents.id)
-- (no change needed - it uses p_agent_id parameter which will now receive user_agents.id)

;
