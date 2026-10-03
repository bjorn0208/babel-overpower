-- Mentor de Disparo — segmentação de leads (desfecho/dias sem resposta/mês)
-- + disparo fixo (texto/foto/vídeo), generalizando o padrão já em produção
-- do app Rifas (rifa_agendamentos_disparo/rifa_disparo_envios).
--
-- Plano: ~/.claude/plans/inherited-tickling-flame.md
-- Operação: documentos/operacao/2026-08/2026-08-28/0627-concluido-mentor-disparo-lead.md

-- ---------------------------------------------------------------------------
-- 1. leads.ultima_resposta_lead_em — proxy correto de "dias sem resposta"
--
-- leads.updated_at NÃO serve (tocado ad hoc por qualquer edição de ficha,
-- não especificamente por resposta do lead). Fonte de verdade real é
-- MAX(mensagens.created_at) WHERE role='user' — materializa aqui via
-- trigger pra virar critério de busca ao vivo sem recalcular agregação
-- toda hora.
-- ---------------------------------------------------------------------------

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ultima_resposta_lead_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_ultima_resposta_lead_em
  ON public.leads USING btree (tenant_id, ultima_resposta_lead_em)
  WHERE deleted_at IS NULL;

-- Backfill único a partir do histórico real de mensagens.
UPDATE public.leads l
SET ultima_resposta_lead_em = sub.ultima
FROM (
  SELECT c.lead_id, MAX(m.created_at) AS ultima
  FROM public.mensagens m
  JOIN public.conversas c ON c.id = m.conversation_id
  WHERE m.role = 'user' AND c.lead_id IS NOT NULL
  GROUP BY c.lead_id
) sub
WHERE l.id = sub.lead_id
  AND (l.ultima_resposta_lead_em IS DISTINCT FROM sub.ultima);

CREATE OR REPLACE FUNCTION public.trg_atualizar_ultima_resposta_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lead_id uuid;
BEGIN
  IF NEW.role <> 'user' THEN
    RETURN NEW;
  END IF;

  SELECT lead_id INTO v_lead_id FROM public.conversas WHERE id = NEW.conversation_id;

  IF v_lead_id IS NOT NULL THEN
    UPDATE public.leads
    SET ultima_resposta_lead_em = NEW.created_at
    WHERE id = v_lead_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_ultima_resposta ON public.mensagens;
CREATE TRIGGER trg_leads_ultima_resposta
  AFTER INSERT ON public.mensagens
  FOR EACH ROW
  WHEN (NEW.role = 'user')
  EXECUTE FUNCTION public.trg_atualizar_ultima_resposta_lead();

-- ---------------------------------------------------------------------------
-- 2. listas_disparo_lead — público salvo/reutilizável (critério de busca)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.listas_disparo_lead (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  nome text NOT NULL,
  criterios jsonb NOT NULL DEFAULT '{}'::jsonb,
  lead_ids uuid[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT listas_disparo_lead_pkey PRIMARY KEY (id),
  CONSTRAINT listas_disparo_lead_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.profiles(id)
);

ALTER TABLE public.listas_disparo_lead ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "listas_disparo_lead_tenant_all" ON public.listas_disparo_lead;
CREATE POLICY "listas_disparo_lead_tenant_all" ON public.listas_disparo_lead
  FOR ALL TO authenticated
  USING (
    tenant_id = (select auth.uid())
    OR tenant_id IN (SELECT parent_user_id FROM public.profiles WHERE id = (select auth.uid()) AND parent_user_id IS NOT NULL)
    OR (select public.eh_admin_plataforma())
  )
  WITH CHECK (
    tenant_id = (select auth.uid())
    OR tenant_id IN (SELECT parent_user_id FROM public.profiles WHERE id = (select auth.uid()) AND parent_user_id IS NOT NULL)
    OR (select public.eh_admin_plataforma())
  );

CREATE INDEX IF NOT EXISTS idx_listas_disparo_lead_tenant
  ON public.listas_disparo_lead USING btree (tenant_id)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. disparos_lead — agendamento de disparo fixo (generaliza rifa_agendamentos_disparo)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.disparos_lead (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  lista_disparo_id uuid,
  nome text NOT NULL,
  horario time,
  tipo_conteudo text NOT NULL CHECK (tipo_conteudo = ANY (ARRAY['foto'::text, 'texto'::text, 'video'::text, 'foto_texto'::text])),
  mensagem text,
  midia_url text,
  contatos_ids uuid[],
  tempo_descanso_segundos integer NOT NULL DEFAULT 5,
  ativo boolean NOT NULL DEFAULT true,
  ultima_execucao_dia date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT disparos_lead_pkey PRIMARY KEY (id),
  CONSTRAINT disparos_lead_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.profiles(id),
  CONSTRAINT disparos_lead_lista_disparo_id_fkey FOREIGN KEY (lista_disparo_id) REFERENCES public.listas_disparo_lead(id) ON DELETE SET NULL
);

ALTER TABLE public.disparos_lead ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "disparos_lead_tenant_all" ON public.disparos_lead;
CREATE POLICY "disparos_lead_tenant_all" ON public.disparos_lead
  FOR ALL TO authenticated
  USING (
    tenant_id = (select auth.uid())
    OR tenant_id IN (SELECT parent_user_id FROM public.profiles WHERE id = (select auth.uid()) AND parent_user_id IS NOT NULL)
    OR (select public.eh_admin_plataforma())
  )
  WITH CHECK (
    tenant_id = (select auth.uid())
    OR tenant_id IN (SELECT parent_user_id FROM public.profiles WHERE id = (select auth.uid()) AND parent_user_id IS NOT NULL)
    OR (select public.eh_admin_plataforma())
  );

CREATE INDEX IF NOT EXISTS idx_disparos_lead_ativos
  ON public.disparos_lead USING btree (tenant_id)
  WHERE ativo = true;

CREATE INDEX IF NOT EXISTS idx_disparos_lead_lista
  ON public.disparos_lead USING btree (lista_disparo_id)
  WHERE lista_disparo_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. disparos_lead_envios — log de cada tentativa (generaliza rifa_disparo_envios)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.disparos_lead_envios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  disparo_id uuid,
  lead_id uuid,
  phone text,
  status text NOT NULL CHECK (status = ANY (ARRAY['sucesso'::text, 'erro'::text])),
  mensagem_enviada text,
  erro_detalhe text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT disparos_lead_envios_pkey PRIMARY KEY (id),
  CONSTRAINT disparos_lead_envios_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.profiles(id),
  CONSTRAINT disparos_lead_envios_disparo_id_fkey FOREIGN KEY (disparo_id) REFERENCES public.disparos_lead(id) ON DELETE SET NULL,
  CONSTRAINT disparos_lead_envios_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL
);

ALTER TABLE public.disparos_lead_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "disparos_lead_envios_tenant_select" ON public.disparos_lead_envios;
CREATE POLICY "disparos_lead_envios_tenant_select" ON public.disparos_lead_envios
  FOR SELECT TO authenticated
  USING (
    tenant_id = (select auth.uid())
    OR tenant_id IN (SELECT parent_user_id FROM public.profiles WHERE id = (select auth.uid()) AND parent_user_id IS NOT NULL)
    OR (select public.eh_admin_plataforma())
  );

CREATE INDEX IF NOT EXISTS idx_disparos_lead_envios_disparo
  ON public.disparos_lead_envios USING btree (disparo_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_disparos_lead_envios_tenant
  ON public.disparos_lead_envios USING btree (tenant_id, created_at DESC);

;
