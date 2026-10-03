-- Onda 15 parcial — religar 3 gavetas finais (emocao requer criar RPC primeiro)
UPDATE public.config_chamadas_llm
SET gavetas_ativas = gavetas_ativas || '{
  "prova_social": {"ativo": true, "piso": 0.40, "top_n": 2},
  "acao_pausa": {"ativo": true, "piso": 0.40, "top_n": 1},
  "manipulacao": {"ativo": true, "piso": 0.65, "top_n": 1}
}'::jsonb
WHERE chave = 'sintese' AND escopo = 'global';
;
