-- Adiciona evidencia heuristica_pt_br nos 3 requisitos role=assistant do escopo nicho limpa_nome.
-- Cohere rerank entrega 0.22-0.30 em pt-BR coloquial; heuristica complementar da 0.85 quando bate.
-- Embeddings preservados (so evidencias muda; trigger update so dispara em descricao_curta/_semantica).

UPDATE public.fase_requisitos
SET evidencias = evidencias || '[{
  "role": "assistant",
  "tipo": "heuristica_pt_br",
  "flags": "i",
  "regex": "\\b(bom\\s+dia|boa\\s+tarde|boa\\s+noite|ol[áa]|me\\s+chamo|sou\\s+\\w+|prazer\\s+em\\s+conhecer|aqui\\s+(?:e|fala)\\s+\\w+)\\b",
  "janela_turnos": 3,
  "score_quando_bate": 0.85
}]'::jsonb,
updated_at = now()
WHERE id = 'beea4776-57e2-4dc8-b7ef-33a8d920012c'; -- saudacao/1

UPDATE public.fase_requisitos
SET evidencias = evidencias || '[{
  "role": "assistant",
  "tipo": "heuristica_pt_br",
  "flags": "i",
  "regex": "\\b(processo\\s+jur[íi]dico|remo[çc][ãa]o\\s+(?:legal|das?\\s+negativ)|negativa[çc][ãa]o|serasa|spc|boa\\s+vista|cenprot|limpa(?:r|mos|gem)|destrava|blinda|score|cr[eé]dito|c[íi]vel|cdc|c[óo]digo\\s+de\\s+defesa)\\b",
  "janela_turnos": 3,
  "score_quando_bate": 0.85
}]'::jsonb,
updated_at = now()
WHERE id = '1feab83a-4f2f-40a8-8097-d2ef2bb30231'; -- apresentacao/1

UPDATE public.fase_requisitos
SET evidencias = evidencias || '[{
  "role": "assistant",
  "tipo": "heuristica_pt_br",
  "flags": "i",
  "regex": "\\b(R\\$\\s*\\d|\\d+\\s*reais|[àa]\\s+vista|parcelad|entrada\\s+de|parcelas?\\s+de|investimento|valor|custa|s[ãa]o\\s+R?\\$?\\s*\\d|por\\s+R?\\$?\\s*\\d|de\\s+R?\\$?\\s*\\d|condi[çc][ãa]o\\s+especial)\\b",
  "janela_turnos": 3,
  "score_quando_bate": 0.85
}]'::jsonb,
updated_at = now()
WHERE id = 'f292f753-fa5a-4fbc-9423-32492d4e2595'; -- negociacao/1
;
