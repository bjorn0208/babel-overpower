-- View v_compromissos_agente: era compat layer pre-Big-Bang.
-- Filtrava status='pending' mas dados reais agora sao 'pendente' (21k linhas).
-- Retornava sempre vazio. Zero callers no codigo (so types gerados).
DROP VIEW IF EXISTS public.v_compromissos_agente;
;
