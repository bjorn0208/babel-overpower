-- Disparo do bom-dia da rifa deixa de ser diário: só terça (2) e sábado (6).
-- Pedido do Theus 2026-08-24. Followup acompanha (só faz sentido em dia de saudação).
-- Down: alter_job de volta pra '0 10 * * *' e '0 15 * * *'.
SELECT cron.alter_job(jobid, schedule => '0 10 * * 2,6')
FROM cron.job WHERE jobname = 'rifa_bom_dia_saudacao';

SELECT cron.alter_job(jobid, schedule => '0 15 * * 2,6')
FROM cron.job WHERE jobname = 'rifa_bom_dia_followup';
;
