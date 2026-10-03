-- Filtro do calendário (2026-06-11): de onde veio o evento — manual (humano) ou agente.
ALTER TABLE public.eventos_agenda ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eventos_agenda_origem_check') THEN
    ALTER TABLE public.eventos_agenda ADD CONSTRAINT eventos_agenda_origem_check CHECK (origem IN ('manual','agente'));
  END IF;
END $$;

-- RPC do agente passa a marcar a origem do evento
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def FROM pg_proc WHERE proname = 'agendar_reuniao_lead';
  IF position('INSERT INTO public.eventos_agenda (tenant_id, criado_por, titulo, tipo, inicio_em, fim_em, sala_reuniao_id, cor)' IN v_def) = 0 THEN
    RAISE EXCEPTION 'trecho esperado não encontrado — abortando';
  END IF;
  v_def := replace(v_def,
    'INSERT INTO public.eventos_agenda (tenant_id, criado_por, titulo, tipo, inicio_em, fim_em, sala_reuniao_id, cor)
  VALUES (p_tenant_id, p_tenant_id, v_titulo, ''reuniao'', p_inicio, p_inicio + (v_dur || '' minutes'')::interval, v_sala_id, ''azul'')',
    'INSERT INTO public.eventos_agenda (tenant_id, criado_por, titulo, tipo, inicio_em, fim_em, sala_reuniao_id, cor, origem)
  VALUES (p_tenant_id, p_tenant_id, v_titulo, ''reuniao'', p_inicio, p_inicio + (v_dur || '' minutes'')::interval, v_sala_id, ''azul'', ''agente'')');
  EXECUTE v_def;
END $$;
;
