-- Esteira de disparo em 2 estágios + pausa geral (spec Theus 2026-09-06).
--
-- Problema que motiva: hoje o botão "Testar agora" chama o worker com
-- `agendamento_id` e ele dispara pros ALVOS REAIS, só pulando a checagem de
-- horário. Não existe teste de verdade, e não existe como parar um disparo em
-- andamento.

-- 1) Carimbo do teste no próprio agendamento.
--    `teste_em` é o que libera o estágio 2. Fica desatualizado de propósito
--    quando o dono edita a mensagem depois de testar (comparado com
--    `atualizado_em`), obrigando a testar de novo antes de mandar pra lista.
alter table public.rifa_agendamentos_disparo
  add column if not exists teste_em timestamptz,
  add column if not exists teste_phone text;

comment on column public.rifa_agendamentos_disparo.teste_em is
  'Quando o disparo foi testado com sucesso no número do dono. Libera o disparo real; vale só enquanto for >= atualizado_em.';
comment on column public.rifa_agendamentos_disparo.teste_phone is
  'Número que recebeu o teste — fica registrado pra auditoria de "testei e foi pra onde?".';

-- 2) Pausa geral e número de teste, por tenant.
alter table public.rifas_config_tenant
  add column if not exists disparos_pausados boolean not null default false,
  add column if not exists disparos_pausados_em timestamptz,
  add column if not exists disparos_telefone_teste text;

comment on column public.rifas_config_tenant.disparos_pausados is
  'Freio de mão: worker para antes de cada envio enquanto true. Vale pro disparo manual E pro cron.';
comment on column public.rifas_config_tenant.disparos_telefone_teste is
  'Número que recebe o disparo de teste. Vazio = usa o WhatsApp conectado do tenant (canais.whatsapp_phone).';

;
