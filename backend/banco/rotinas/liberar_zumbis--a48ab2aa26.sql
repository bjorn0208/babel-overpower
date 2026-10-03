CREATE OR REPLACE FUNCTION public.liberar_zumbis(p_max_idade_minutos integer DEFAULT 15)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_count int;
  v_zumbis_outbox int := 0;
BEGIN
  UPDATE public.acoes_agendadas
     SET status = 'falhou',
         tentativas = 999,
         error_message = 'reaper:zumbi_processando_mais_de_' || p_max_idade_minutos || '_min'
   WHERE status = 'processando'
     AND COALESCE(executed_at, created_at) < now() - (p_max_idade_minutos || ' minutes')::interval;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- 2026-09-17 (varredura): o reaper só olhava acoes_agendadas. A bolha do
  -- outbox é marcada 'processando' e o envio dorme até 30s; se o worker morre
  -- nesse intervalo (Shutdown/EarlyDrop já aconteceu), ela ficava 'processando'
  -- pra sempre — o lead não recebia e nada acusava. Agora volta pra 'pendente'
  -- pro consumer tentar de novo (respeitando o teto de retries do consumer).
  -- Idade importa: bolha de horas atrás não pode ser despejada no lead agora.
  -- Até 6h → volta pra fila (o consumer respeita o teto de retries).
  -- Mais velha que isso → falhou, pra não mandar conversa fora de contexto.
  UPDATE public.caixa_saida_mensagens
     SET status = CASE
           WHEN COALESCE(updated_at, created_at) < now() - interval '6 hours' THEN 'falhou'
           WHEN COALESCE(retries, 0) >= 3 THEN 'falhou'
           ELSE 'pendente'
         END,
         retries = COALESCE(retries, 0) + 1,
         error_reason = 'reaper:zumbi_processando_mais_de_' || p_max_idade_minutos || '_min'
   WHERE status = 'processando'
     AND COALESCE(updated_at, created_at) < now() - (p_max_idade_minutos || ' minutes')::interval;

  GET DIAGNOSTICS v_zumbis_outbox = ROW_COUNT;
  IF v_zumbis_outbox > 0 THEN
    RAISE WARNING 'liberar_zumbis: % bolha(s) do outbox presas em processando foram liberadas', v_zumbis_outbox;
  END IF;

  RETURN v_count + v_zumbis_outbox;
END;
$function$

