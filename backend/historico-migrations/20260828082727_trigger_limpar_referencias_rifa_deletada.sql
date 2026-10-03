-- Quando uma rifa é soft-deletada, limpa/desativa TUDO que apontava pra ela
-- em vez de deixar referência morta silenciosa. Sintoma real (2026-08-28,
-- tenant Fabrício): "Fabrício 2" foi deletada, mas rifas_config_tenant.
-- rifa_disparo_id e rifa_agendamentos_disparo.rifa_id continuaram apontando
-- pra ela — cron rodava, achava a rifa deletada, pulava em silêncio, e o
-- botão "ver imagem atual" também puxava dados da rifa morta.
CREATE OR REPLACE FUNCTION public.tg_rifas_limpar_referencias_ao_deletar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    -- Config do tenant: volta pra "automática" (ativa mais recente) em vez
    -- de apontar pra rifa morta.
    UPDATE public.rifas_config_tenant
    SET rifa_disparo_id = NULL, updated_at = now()
    WHERE rifa_disparo_id = NEW.id;

    -- Agendamentos automáticos: desliga (não deleta — histórico/config
    -- preservados) pra ficar visível na UI que precisa de atenção, em vez
    -- de continuar "ativo" sendo pulado pelo cron pra sempre em silêncio.
    UPDATE public.rifa_agendamentos_disparo
    SET ativo = false, atualizado_em = now()
    WHERE rifa_id = NEW.id AND ativo = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rifas_limpar_referencias_ao_deletar ON public.rifas;
CREATE TRIGGER trg_rifas_limpar_referencias_ao_deletar
  AFTER UPDATE ON public.rifas
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
  EXECUTE FUNCTION public.tg_rifas_limpar_referencias_ao_deletar();

;
