-- Onda 6.1 (v3) — Populate respeitando CHECK categoria + modo
INSERT INTO public.agendamentos_config (
  nome, descricao, categoria, modo, cron_expr, ativo, jobid_pg_cron,
  criado_em, atualizado_em, motivo_criacao
)
SELECT 
  j.jobname,
  CASE
    WHEN j.jobname LIKE 'limpar-%' OR j.jobname LIKE 'limpar_%' THEN 'Limpeza periódica: ' || j.jobname
    WHEN j.jobname LIKE 'cron-%' THEN 'Cron: ' || j.jobname
    WHEN j.jobname LIKE 'processar%' THEN 'Processamento: ' || j.jobname
    WHEN j.jobname LIKE 'curadoria-%' OR j.jobname LIKE 'tag_curadoria%' THEN 'Curadoria: ' || j.jobname
    ELSE j.jobname
  END,
  CASE
    WHEN j.jobname LIKE 'limpar-%' OR j.jobname LIKE 'limpar_%' OR j.jobname='rate_limit_limpar' THEN 'manutencao'
    WHEN j.jobname IN (
      'cron-humor-relacao','cron-leads-sumidos','cron-destilar-perfil-empresa',
      'cron-promover-blocos-meta','cron-retomar-agente','processar_tarefas_embedding',
      'processar-acompanhamentos','ragentic_tick'
    ) THEN 'agente_runtime'
    WHEN j.jobname IN (
      'curadoria-canario-monitor','traces_arquivar_antigos','reconciliar-armazenamento',
      'expirar-assinaturas-meianoite','sincronizar-feriados-anual'
    ) THEN 'analytics'
    WHEN j.jobname IN ('curadoria-cluster-lacunas','tag_curadoria_executar') THEN 'curadoria'
    WHEN j.jobname LIKE 'processar_campanhas%' THEN 'campanha'
    ELSE 'custom'
  END,
  'horario',
  j.schedule,
  j.active,
  j.jobid,
  now(), now(),
  'sync onda 6.1 — 2026-05-28'
FROM cron.job j
WHERE j.active = true
  AND NOT EXISTS (SELECT 1 FROM public.agendamentos_config ac WHERE ac.nome = j.jobname);

UPDATE public.agendamentos_config ac
SET cron_expr = j.schedule, jobid_pg_cron = j.jobid, ativo = j.active, atualizado_em = now()
FROM cron.job j
WHERE ac.nome = j.jobname
  AND (ac.cron_expr IS DISTINCT FROM j.schedule OR ac.jobid_pg_cron IS DISTINCT FROM j.jobid);

;
