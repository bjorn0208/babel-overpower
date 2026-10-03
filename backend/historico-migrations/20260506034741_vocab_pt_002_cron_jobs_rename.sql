
-- Migration 2 — Rename de cron jobs (21)
DO $$
DECLARE
  pair JSONB;
  v_velho TEXT;
  v_novo TEXT;
  v_schedule TEXT;
  v_command TEXT;
  v_count INT := 0;
  mapeamento JSONB := '[
    ["calcular_style_profile_hourly", "calcular_perfil_estilo_horario"],
    ["cleanup-api-usage-logs", "limpar-logs-uso-api"],
    ["cleanup-conversation-locks", "limpar-travas-conversa"],
    ["cleanup-expired-lead-locks", "limpar-travas-lead-expiradas"],
    ["cleanup-llm-request-logs", "limpar-logs-requisicao-llm"],
    ["cleanup-message-buffer", "limpar-buffer-mensagens"],
    ["cleanup-pending-delivery", "limpar-entregas-pendentes"],
    ["cleanup-rate-limits", "limpar-limites-taxa"],
    ["cleanup-typing-state", "limpar-estado-digitacao"],
    ["cleanup-webhook-debug", "limpar-debug-webhook"],
    ["cleanup-webhook-dedup", "limpar-dedup-webhook"],
    ["cron-promover-meta-chunks", "cron-promover-blocos-meta"],
    ["curadoria-canary-monitor", "curadoria-canario-monitor"],
    ["curadoria-cluster-gaps", "curadoria-cluster-lacunas"],
    ["expire-subscriptions-midnight", "expirar-assinaturas-meianoite"],
    ["process-followups", "processar-acompanhamentos"],
    ["process_campaigns_every_10min", "processar_campanhas_a_cada_10min"],
    ["process_embedding_jobs", "processar_tarefas_embedding"],
    ["reconcile-storage", "reconciliar-armazenamento"],
    ["sync-feriados-anual", "sincronizar-feriados-anual"],
    ["tag_curadoria_run", "tag_curadoria_executar"],
    ["cron-sweep-triggers-temporais", "cron-varrer-gatilhos-temporais"]
  ]'::jsonb;
BEGIN
  FOR pair IN SELECT * FROM jsonb_array_elements(mapeamento) LOOP
    v_velho := pair->>0;
    v_novo := pair->>1;
    
    SELECT schedule, command INTO v_schedule, v_command
    FROM cron.job WHERE jobname = v_velho;
    
    IF FOUND THEN
      PERFORM cron.unschedule(v_velho);
      PERFORM cron.schedule(v_novo, v_schedule, v_command);
      v_count := v_count + 1;
      RAISE NOTICE 'Renomeado: % -> %', v_velho, v_novo;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Total de cron jobs renomeados: %', v_count;
END $$;

-- Validação
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM cron.job
  WHERE jobname IN (
    'calcular_style_profile_hourly','cleanup-api-usage-logs','cleanup-conversation-locks',
    'cleanup-expired-lead-locks','cleanup-llm-request-logs','cleanup-message-buffer',
    'cleanup-pending-delivery','cleanup-rate-limits','cleanup-typing-state',
    'cleanup-webhook-debug','cleanup-webhook-dedup','cron-promover-meta-chunks',
    'curadoria-canary-monitor','curadoria-cluster-gaps','expire-subscriptions-midnight',
    'process-followups','process_campaigns_every_10min','process_embedding_jobs',
    'reconcile-storage','sync-feriados-anual','tag_curadoria_run','cron-sweep-triggers-temporais'
  );
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Validação falhou: % cron jobs com nome velho', v_count;
  END IF;
END $$;

;
