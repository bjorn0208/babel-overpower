-- Memória episódica sem esquecimento físico (Curadoria v2 · F3 · pedido Theus 2026-04-30)
-- Episódio NUNCA some — só perde peso no ranking via função de recência.
-- Humano esquece, agente do Theus não precisa dessa limitação.

-- 1) Desativar cron antigo de decay
UPDATE public.cronjobs_config
   SET ativo = false,
       descricao = COALESCE(descricao,'') || ' [DESATIVADO 2026-04-30: episódios não decaem mais — substituído por peso_recencia_episodio em runtime]'
 WHERE nome = 'cron-decay-episodios';

-- 2) Reativar episódios que o decay antigo havia desativado (NÃO reativa se foi
--    desativado por outcome — outcome=descartado ou similar permanece ativa=false)
UPDATE public.episodic_memory
   SET ativa = true,
       atualizado_em = now()
 WHERE ativa = false
   AND (outcome IS NULL OR outcome = '' OR outcome = 'decay');

-- 3) Resetar decay_factor pra 1.0 — campo deprecated mas mantido pra retrocompatibilidade
UPDATE public.episodic_memory
   SET decay_factor = 1.0
 WHERE decay_factor < 1.0;

COMMENT ON COLUMN public.episodic_memory.decay_factor IS 'DEPRECATED 2026-04-30. Não use. O peso de recência é calculado em runtime via public.peso_recencia_episodio(criado_em). Coluna mantida por retrocompatibilidade — sempre 1.0.';

-- 4) Função de peso de recência (RAG do agente multiplica score × relevancia × peso_recencia)
--    Fórmula half-life: peso = 2^(-dias_desde/half_life_dias)
--    Half-life padrão = 60 dias (episódio de 2 meses vale 50% · 1 ano vale ~8%)
--    Mas nunca zera — RAG sempre acessa.
CREATE OR REPLACE FUNCTION public.peso_recencia_episodio(
  p_criado_em timestamptz,
  p_half_life_dias numeric DEFAULT 60
) RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT POWER(
    2.0,
    -1.0 * (EXTRACT(EPOCH FROM (now() - p_criado_em)) / 86400.0) / GREATEST(p_half_life_dias, 1.0)
  )::numeric;
$$;

COMMENT ON FUNCTION public.peso_recencia_episodio(timestamptz, numeric) IS
'Calcula peso de recência (0,1] de um episódio dado seu timestamp. Quanto mais antigo, menor o peso, mas nunca zera. Half-life padrão 60 dias (60d=0.5, 120d=0.25, 1ano≈0.08). RAG do agente multiplica score × relevancia × peso_recencia pra ranquear episódios. Substitui o decay físico antigo (cron-decay-episodios desativado).';

;
