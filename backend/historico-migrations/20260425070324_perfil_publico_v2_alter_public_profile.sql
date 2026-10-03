
ALTER TABLE public.public_profile
  ADD COLUMN IF NOT EXISTS agent_nome text,
  ADD COLUMN IF NOT EXISTS chips jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS agent_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS quick_replies jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.public_profile.agent_nome IS 'Nome humano do agente exibido no chat (ex: Aurora). Default null = usa fallback do produto.';
COMMENT ON COLUMN public.public_profile.chips IS 'Array de chips no header. Cada item: {label:text, icon:text?, tone:text?}.';
COMMENT ON COLUMN public.public_profile.agent_capabilities IS 'Array de strings descrevendo capacidades (ex: ["agendar","orçar"]).';
COMMENT ON COLUMN public.public_profile.quick_replies IS 'Array de botões quick reply no chat: [{label:text, message_to_send:text}].';

;
