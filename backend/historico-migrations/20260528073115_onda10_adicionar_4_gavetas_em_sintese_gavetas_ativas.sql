-- Onda 10 — Adicionar 4 gavetas a sintese.gavetas_ativas (cumulativo com 7B)
UPDATE public.config_chamadas_llm
SET gavetas_ativas = gavetas_ativas || '{
  "variacao": {"ativo": true, "piso": 0.35, "top_n": 2},
  "gatilho": {"ativo": true, "piso": 0.35, "top_n": 3},
  "procedurais": {"ativo": true, "piso": 0.35, "top_n": 3},
  "meta": {"ativo": true, "piso": 0.30, "top_n": 2}
}'::jsonb
WHERE chave = 'sintese' AND escopo = 'global';

;
