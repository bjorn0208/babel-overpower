-- ============================================================================
-- Destravar LGPD provisório pra fase de teste + traduzir "backfill"
-- ============================================================================

-- 1) Destravar B5 comparativo_nicho (modo teste interno)
UPDATE public.recursos_ativacao_curadoria
SET status = 'pausado',
    motivo_bloqueio = NULL,
    descricao_curta = 'Compara métricas anônimas do seu nicho com a média do mercado (MODO TESTE — sem dados reais ainda)',
    descricao_longa = 'B5 — Cron mensal agrega métricas de ≥10 tenants do mesmo nicho com k-anonimato + ruído ε-DP. Publicado em comparativo_nicho. NESTA FASE DE TESTE: ativado sem parecer LGPD oficial. Antes do uso comercial real, parecer jurídico precisa aprovar.'
WHERE chave_recurso = 'comparativo_nicho';

-- 2) Destravar Promoção entre nichos (modo teste interno)
UPDATE public.recursos_ativacao_curadoria
SET status = 'pausado',
    motivo_bloqueio = NULL,
    descricao_curta = 'Bloco que funciona em ≥3 tenants do mesmo nicho vira proposta de bloco do nicho (MODO TESTE)',
    descricao_longa = 'Cron semanal detecta blocos canônicos repetidos em ≥3 tenants do mesmo nicho. Gera candidato em candidatos_bloco pra aprovação humana. NESTA FASE DE TESTE: ativado sem parecer LGPD oficial. Depende de preenchimento retroativo de profiles.nicho_id (hoje 44/44 nulo). Antes do uso comercial real, parecer jurídico precisa aprovar.'
WHERE chave_recurso = 'promocao_cross_nicho';

-- 3) Traduzir qualquer "backfill" residual nos textos
UPDATE public.recursos_ativacao_curadoria
SET descricao_curta = replace(descricao_curta, 'backfill', 'preenchimento retroativo'),
    descricao_longa = replace(descricao_longa, 'backfill', 'preenchimento retroativo'),
    motivo_bloqueio = replace(coalesce(motivo_bloqueio, ''), 'backfill', 'preenchimento retroativo')
WHERE descricao_curta ILIKE '%backfill%' 
   OR descricao_longa ILIKE '%backfill%' 
   OR motivo_bloqueio ILIKE '%backfill%';

UPDATE public.recursos_ativacao_curadoria
SET descricao_curta = replace(descricao_curta, 'Backfill', 'Preenchimento retroativo'),
    descricao_longa = replace(descricao_longa, 'Backfill', 'Preenchimento retroativo'),
    motivo_bloqueio = replace(coalesce(motivo_bloqueio, ''), 'Backfill', 'Preenchimento retroativo')
WHERE descricao_curta LIKE '%Backfill%' 
   OR descricao_longa LIKE '%Backfill%' 
   OR motivo_bloqueio LIKE '%Backfill%';

;
