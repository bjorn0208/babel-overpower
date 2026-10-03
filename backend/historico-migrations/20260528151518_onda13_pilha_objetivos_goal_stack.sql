-- ============================================================================
-- Onda 13 — Goal Stack (pilha_objetivos)
-- Stack de objetivos abertos por conversa. Agente lembra a meta entre turnos.
-- Lab leitura #33. Porteiro abre/fecha; Síntese lê no topo do prompt.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pilha_objetivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL REFERENCES public.conversas(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  lead_id uuid,
  objetivo text NOT NULL,                          -- ex: "acompanhar se cachorro do lead foi encontrado"
  contexto text,                                   -- 1-2 frases de contexto
  origem text NOT NULL DEFAULT 'porteiro',         -- 'porteiro' | 'sintese' | 'manual'
  status text NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto','fechado','expirado')),
  prioridade integer NOT NULL DEFAULT 5            -- 1=alta, 10=baixa
    CHECK (prioridade BETWEEN 1 AND 10),
  criado_em timestamptz NOT NULL DEFAULT now(),
  fechado_em timestamptz,
  motivo_fechamento text,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pilha_obj_conversa_status
  ON public.pilha_objetivos(conversa_id, status, prioridade)
  WHERE deleted_at IS NULL AND status = 'aberto';

CREATE INDEX IF NOT EXISTS idx_pilha_obj_tenant
  ON public.pilha_objetivos(tenant_id, criado_em DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.pilha_objetivos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pilha_obj_tenant_own ON public.pilha_objetivos;
CREATE POLICY pilha_obj_tenant_own ON public.pilha_objetivos
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT auth.uid()))
  WITH CHECK (tenant_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS pilha_obj_admin_all ON public.pilha_objetivos;
CREATE POLICY pilha_obj_admin_all ON public.pilha_objetivos
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role IN ('admin','platform_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role IN ('admin','platform_admin')
  ));

-- Trigger atualizado_em
CREATE OR REPLACE FUNCTION public.tg_pilha_obj_atualizado()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pilha_obj_atualizado ON public.pilha_objetivos;
CREATE TRIGGER trg_pilha_obj_atualizado
  BEFORE UPDATE ON public.pilha_objetivos
  FOR EACH ROW EXECUTE FUNCTION public.tg_pilha_obj_atualizado();

-- RPC abrir objetivo (idempotente — se já tem objetivo semelhante aberto, atualiza)
CREATE OR REPLACE FUNCTION public.abrir_objetivo_pilha(
  p_conversa_id uuid,
  p_tenant_id uuid,
  p_objetivo text,
  p_contexto text DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_prioridade integer DEFAULT 5,
  p_origem text DEFAULT 'porteiro'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Limite duro: max 5 objetivos abertos por conversa
  IF (SELECT count(*) FROM public.pilha_objetivos 
      WHERE conversa_id = p_conversa_id AND status = 'aberto' AND deleted_at IS NULL) >= 5 THEN
    -- Fecha o mais antigo automaticamente
    UPDATE public.pilha_objetivos 
    SET status = 'expirado', fechado_em = now(), motivo_fechamento = 'limite excedido (max 5)'
    WHERE id = (SELECT id FROM public.pilha_objetivos 
                WHERE conversa_id = p_conversa_id AND status = 'aberto' AND deleted_at IS NULL
                ORDER BY criado_em ASC LIMIT 1);
  END IF;

  -- Não duplicar: se já tem objetivo igual aberto, retorna ele
  SELECT id INTO v_id FROM public.pilha_objetivos
  WHERE conversa_id = p_conversa_id 
    AND status = 'aberto' 
    AND deleted_at IS NULL
    AND lower(objetivo) = lower(p_objetivo)
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.pilha_objetivos
    (conversa_id, tenant_id, lead_id, objetivo, contexto, prioridade, origem)
  VALUES
    (p_conversa_id, p_tenant_id, p_lead_id, p_objetivo, p_contexto, p_prioridade, p_origem)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.abrir_objetivo_pilha TO authenticated, anon, service_role;

-- RPC fechar objetivo
CREATE OR REPLACE FUNCTION public.fechar_objetivo_pilha(
  p_objetivo_id uuid,
  p_motivo text DEFAULT 'atendido'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.pilha_objetivos
  SET status = 'fechado', fechado_em = now(), motivo_fechamento = p_motivo
  WHERE id = p_objetivo_id AND status = 'aberto';
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fechar_objetivo_pilha TO authenticated, anon, service_role;

;
