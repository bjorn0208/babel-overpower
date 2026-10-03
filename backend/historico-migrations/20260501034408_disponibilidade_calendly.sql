-- Migration 04 · disponibilidade_calendly
-- Disponibilidade por pessoa/weekday + extensão de compromissos

CREATE TABLE IF NOT EXISTS public.disponibilidade (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pessoa_id        uuid        REFERENCES public.profiles(id) ON DELETE CASCADE,
  weekday          integer     NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  hora_inicio      time        NOT NULL,
  hora_fim         time        NOT NULL,
  duracao_slot_min integer     NOT NULL DEFAULT 30,
  buffer_min       integer     NOT NULL DEFAULT 5,
  ativo            boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (hora_fim > hora_inicio)
);

CREATE INDEX IF NOT EXISTS disponibilidade_tenant_pessoa_weekday_idx
  ON public.disponibilidade (tenant_id, pessoa_id, weekday)
  WHERE ativo = true;

ALTER TABLE public.disponibilidade ENABLE ROW LEVEL SECURITY;

CREATE POLICY "disponibilidade_tenant" ON public.disponibilidade
  FOR ALL TO authenticated
  USING  (tenant_id = (SELECT auth.uid()))
  WITH CHECK (tenant_id = (SELECT auth.uid()));

-- Colunas extras em compromissos
ALTER TABLE public.compromissos
  ADD COLUMN IF NOT EXISTS pessoa_responsavel_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS duracao_min           integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS lembretes_config      jsonb   DEFAULT '[{"minutos":1440},{"minutos":60}]'::jsonb,
  ADD COLUMN IF NOT EXISTS confirmacao_lead_em   timestamptz,
  ADD COLUMN IF NOT EXISTS link_call             text,
  ADD COLUMN IF NOT EXISTS local_presencial      text;

-- RPC: gera slots disponíveis pra um dia e tenant
-- Subtrai os slots já reservados em compromissos pendentes
CREATE OR REPLACE FUNCTION public.slots_disponiveis(
  p_tenant_id uuid,
  p_dia       date,
  p_pessoa_id uuid DEFAULT NULL
)
RETURNS TABLE(slot_inicio timestamptz, pessoa_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_weekday   integer := EXTRACT(DOW FROM p_dia)::integer;
  v_timezone  text    := 'America/Sao_Paulo';
  v_disp      record;
  v_slot      timestamptz;
  v_slot_fim  timestamptz;
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
    v_slot := (p_dia || ' ' || v_disp.hora_inicio)::timestamptz AT TIME ZONE v_timezone;

    LOOP
      v_slot_fim := v_slot + (v_disp.duracao_slot_min || ' minutes')::interval;

      EXIT WHEN v_slot_fim >
        (p_dia || ' ' || v_disp.hora_fim)::timestamptz AT TIME ZONE v_timezone;

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
$$;
;
