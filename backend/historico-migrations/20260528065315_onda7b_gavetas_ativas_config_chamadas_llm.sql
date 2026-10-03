-- ============================================================================
-- Onda 7B — Adicionar gavetas_ativas jsonb em config_chamadas_llm
-- Permite configurar piso/top_n por gaveta runtime via Curadoria UI.
-- Popula default pra 'sintese' com 3 primeiras gavetas religadas.
-- ============================================================================

ALTER TABLE public.config_chamadas_llm
  ADD COLUMN IF NOT EXISTS gavetas_ativas jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.config_chamadas_llm.gavetas_ativas IS
'Mapa de gavetas RAG ativas pra esta chamada. Formato: {"<gaveta>": {"ativo": bool, "piso": numeric, "top_n": int}}. Editável via Curadoria UI; motor lê em runtime.';

-- Seed: configurar 3 primeiras gavetas religadas na chamada "sintese"
-- regras_operacionais: piso 0.0 (sempre top_n) + top_n 5
-- anti_padroes: piso 0.35 + top_n 3
-- humanizacao: piso 0.30 + top_n 2
UPDATE public.config_chamadas_llm
SET gavetas_ativas = '{
  "regras_operacionais": {"ativo": true, "piso": 0.0, "top_n": 5},
  "anti_padroes": {"ativo": true, "piso": 0.35, "top_n": 3},
  "humanizacao": {"ativo": true, "piso": 0.30, "top_n": 2}
}'::jsonb
WHERE chave = 'sintese' AND escopo = 'global';

;
