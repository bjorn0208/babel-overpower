-- Fix de fuso na slots_disponiveis (2026-06-11): `'data hora'::timestamptz AT TIME ZONE 'SP'`
-- interpretava o horário configurado como UTC e devolvia timestamp sem fuso re-lido como UTC
-- (09:00 BRT virava 03:00). Correto: `::timestamp AT TIME ZONE 'SP'` (literal É horário de SP → timestamptz).
-- Backup em _migration_rpc_backup ('slots_disponiveis__pre_fix_fuso').
CREATE OR REPLACE FUNCTION public.slots_disponiveis(p_tenant_id uuid, p_dia date, p_pessoa_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(slot_inicio timestamp with time zone, pessoa_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_weekday   integer := EXTRACT(DOW FROM p_dia)::integer;
  v_timezone  text    := 'America/Sao_Paulo';
  v_disp      record;
  v_slot      timestamptz;
  v_slot_fim  timestamptz;
  v_fim_janela timestamptz;
  v_busy      boolean;
BEGIN
  FOR v_disp IN
    SELECT d.id, d.pessoa_id, d.hora_inicio, d.hora_fim,
           d.duracao_slot_min, d.buffer_min
    FROM   public.disponibilidade d
    WHERE  d.tenant_id = p_tenant_id
      AND  d.weekday   = v_weekday
      AND  d.ativo     = true
      AND  (p_pessoa_id IS NULL OR d.pessoa_id = p_pessoa_id)
  LOOP
    v_slot       := (p_dia || ' ' || v_disp.hora_inicio)::timestamp AT TIME ZONE v_timezone;
    v_fim_janela := (p_dia || ' ' || v_disp.hora_fim)::timestamp   AT TIME ZONE v_timezone;

    LOOP
      v_slot_fim := v_slot + (v_disp.duracao_slot_min || ' minutes')::interval;

      EXIT WHEN v_slot_fim > v_fim_janela;

      -- verificar conflito com compromissos existentes
      SELECT EXISTS (
        SELECT 1
        FROM   public.compromissos c
        WHERE  c.tenant_id  = p_tenant_id
          AND  c.status     = 'pendente'
          AND  (p_pessoa_id IS NULL OR c.pessoa_responsavel_id = v_disp.pessoa_id)
          AND  c.scheduled_at >= v_slot
          AND  c.scheduled_at <  v_slot_fim
      ) INTO v_busy;

      IF NOT v_busy THEN
        slot_inicio := v_slot;
        pessoa_id   := v_disp.pessoa_id;
        RETURN NEXT;
      END IF;

      v_slot := v_slot_fim + (v_disp.buffer_min || ' minutes')::interval;
    END LOOP;
  END LOOP;
END;
$function$;
;
