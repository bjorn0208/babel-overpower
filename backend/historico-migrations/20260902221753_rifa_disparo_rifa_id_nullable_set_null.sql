-- Corrige inconsistência de design: rifas_config_tenant.rifa_disparo_id já é
-- SET NULL ao apagar a rifa, mas rifa_agendamentos_disparo.rifa_id e
-- rifa_disparo_envios.rifa_id eram NOT NULL + ON DELETE NO ACTION — impedia
-- apagar qualquer rifa referenciada, mesmo test/lixo, sem antes destruir o
-- histórico/agendamento (o que o Theus explicitamente não quer perder).
-- Rifa apagada = campanha não existe mais, mas o texto/histórico do disparo
-- fica (só perde o vínculo com a campanha).

ALTER TABLE public.rifa_agendamentos_disparo
  ALTER COLUMN rifa_id DROP NOT NULL,
  DROP CONSTRAINT rifa_agendamentos_disparo_rifa_id_fkey,
  ADD CONSTRAINT rifa_agendamentos_disparo_rifa_id_fkey
    FOREIGN KEY (rifa_id) REFERENCES public.rifas(id) ON DELETE SET NULL;

ALTER TABLE public.rifa_disparo_envios
  ALTER COLUMN rifa_id DROP NOT NULL,
  DROP CONSTRAINT rifa_disparo_envios_rifa_id_fkey,
  ADD CONSTRAINT rifa_disparo_envios_rifa_id_fkey
    FOREIGN KEY (rifa_id) REFERENCES public.rifas(id) ON DELETE SET NULL;

;
