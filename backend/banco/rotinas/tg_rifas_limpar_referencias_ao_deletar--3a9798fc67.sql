CREATE OR REPLACE FUNCTION public.tg_rifas_limpar_referencias_ao_deletar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$

