-- Trigger `retentar_acoes_agendadas_falhas` reseta status='falhou' pra 'pendente'
-- quando tentativas < 3. Zumbis (presos em processando ha >15min) nao devem
-- entrar em retry — eram presumivelmente travados por outro motivo.
-- Fix: setar tentativas=999 no reaper pra escapar do trigger.
CREATE OR REPLACE FUNCTION public.liberar_zumbis(
  p_max_idade_minutos int DEFAULT 15
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.acoes_agendadas
     SET status = 'falhou',
         tentativas = 999,
         error_message = 'reaper:zumbi_processando_mais_de_' || p_max_idade_minutos || '_min'
   WHERE status = 'processando'
     AND COALESCE(executed_at, created_at) < now() - (p_max_idade_minutos || ' minutes')::interval;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
;
