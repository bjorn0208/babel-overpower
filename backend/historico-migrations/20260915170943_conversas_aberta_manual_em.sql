ALTER TABLE public.conversas ADD COLUMN IF NOT EXISTS aberta_manual_em timestamp with time zone;
COMMENT ON COLUMN public.conversas.aberta_manual_em IS 'Quando alguém da equipe iniciou a conversa pelo número (Nova conversa / Agente aborda). Lead na Base com esse campo preenchido aparece no app Conversas sem sair da Base.';
;
