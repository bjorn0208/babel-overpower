-- 1) Adicionar 'indicacao' no check de type
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_type_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_type_check
  CHECK (type = ANY (ARRAY['divulgacao'::text,'venda'::text,'pos_venda'::text,'cobranca'::text,'agendamento'::text,'indicacao'::text]));

-- 2) Tabela de meta 1-1 com campaigns (so existe pra type='indicacao')
CREATE TABLE IF NOT EXISTS public.campaign_indicacao_meta (
  campaign_id uuid PRIMARY KEY REFERENCES public.campaigns(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cupom text NOT NULL,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  indicador_nome text NOT NULL,
  indicador_email text,
  indicador_telefone text,
  indicador_foto_url text,
  comissao_tipo text NOT NULL CHECK (comissao_tipo IN ('fixo','percentual')),
  comissao_valor numeric(10,2) NOT NULL CHECK (comissao_valor > 0),
  pagamento_valor numeric(10,2),
  pagamento_data date,
  pagamento_metodo text,
  comprovante_url text,
  observacao text,
  concluida_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS campaign_indicacao_meta_token_key
  ON public.campaign_indicacao_meta (token);
CREATE UNIQUE INDEX IF NOT EXISTS campaign_indicacao_meta_tenant_cupom_key
  ON public.campaign_indicacao_meta (tenant_id, lower(cupom));
CREATE INDEX IF NOT EXISTS campaign_indicacao_meta_tenant_id_idx
  ON public.campaign_indicacao_meta (tenant_id);

ALTER TABLE public.campaign_indicacao_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cim_select_own" ON public.campaign_indicacao_meta
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (SELECT p.parent_user_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.parent_user_id IS NOT NULL)
    OR public.is_platform_admin()
  );

CREATE POLICY "cim_mutate_own" ON public.campaign_indicacao_meta
  FOR ALL TO authenticated
  USING (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (SELECT p.parent_user_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.parent_user_id IS NOT NULL)
    OR public.is_platform_admin()
  )
  WITH CHECK (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (SELECT p.parent_user_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.parent_user_id IS NOT NULL)
    OR public.is_platform_admin()
  );

CREATE POLICY "cim_anon_select" ON public.campaign_indicacao_meta
  FOR SELECT TO anon
  USING (
    EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_indicacao_meta.campaign_id AND c.deleted_at IS NULL)
  );

CREATE POLICY "cim_service_role_all" ON public.campaign_indicacao_meta
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 3) Tabela de comissoes (1 linha por venda fechada via cupom)
CREATE TABLE IF NOT EXISTS public.campaign_indicacao_comissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  valor_comissao numeric(10,2) NOT NULL CHECK (valor_comissao >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, lead_id)
);

CREATE INDEX IF NOT EXISTS campaign_indicacao_comissoes_campaign_id_idx
  ON public.campaign_indicacao_comissoes (campaign_id);
CREATE INDEX IF NOT EXISTS campaign_indicacao_comissoes_lead_id_idx
  ON public.campaign_indicacao_comissoes (lead_id);
CREATE INDEX IF NOT EXISTS campaign_indicacao_comissoes_tenant_id_idx
  ON public.campaign_indicacao_comissoes (tenant_id);

ALTER TABLE public.campaign_indicacao_comissoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cic_select_own" ON public.campaign_indicacao_comissoes
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (SELECT p.parent_user_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.parent_user_id IS NOT NULL)
    OR public.is_platform_admin()
  );

CREATE POLICY "cic_mutate_own" ON public.campaign_indicacao_comissoes
  FOR ALL TO authenticated
  USING (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (SELECT p.parent_user_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.parent_user_id IS NOT NULL)
    OR public.is_platform_admin()
  )
  WITH CHECK (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (SELECT p.parent_user_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.parent_user_id IS NOT NULL)
    OR public.is_platform_admin()
  );

CREATE POLICY "cic_anon_select" ON public.campaign_indicacao_comissoes
  FOR SELECT TO anon
  USING (
    EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_indicacao_comissoes.campaign_id AND c.deleted_at IS NULL)
  );

CREATE POLICY "cic_service_role_all" ON public.campaign_indicacao_comissoes
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 4) Trigger updated_at em meta
CREATE OR REPLACE FUNCTION public.tg_campaign_indicacao_meta_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaign_indicacao_meta_updated_at ON public.campaign_indicacao_meta;
CREATE TRIGGER campaign_indicacao_meta_updated_at
BEFORE UPDATE ON public.campaign_indicacao_meta
FOR EACH ROW EXECUTE FUNCTION public.tg_campaign_indicacao_meta_updated_at();

-- 5) Reescreve seed_campaign_phases pra reconhecer 'indicacao'
CREATE OR REPLACE FUNCTION public.seed_campaign_phases()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE
  v_phases jsonb;
BEGIN
  v_phases := CASE NEW.type
    WHEN 'divulgacao' THEN '[
      {"slug":"aguardando","label":"Aguardando","order_index":0,"is_final_positive":false},
      {"slug":"abordado","label":"Abordado","order_index":1,"is_final_positive":false},
      {"slug":"respondeu","label":"Respondeu","order_index":2,"is_final_positive":false},
      {"slug":"pediu_info","label":"Pediu info","order_index":3,"is_final_positive":false},
      {"slug":"engajou","label":"Engajou","order_index":4,"is_final_positive":true}
    ]'::jsonb
    WHEN 'venda' THEN '[
      {"slug":"aguardando","label":"Aguardando","order_index":0,"is_final_positive":false},
      {"slug":"abordado","label":"Abordado","order_index":1,"is_final_positive":false},
      {"slug":"interessado","label":"Interessado","order_index":2,"is_final_positive":false},
      {"slug":"com_objecao","label":"Com objeção","order_index":3,"is_final_positive":false},
      {"slug":"negociando","label":"Negociando","order_index":4,"is_final_positive":false},
      {"slug":"comprou","label":"Comprou","order_index":5,"is_final_positive":true}
    ]'::jsonb
    WHEN 'pos_venda' THEN '[
      {"slug":"aguardando","label":"Aguardando","order_index":0,"is_final_positive":false},
      {"slug":"abordado","label":"Abordado","order_index":1,"is_final_positive":false},
      {"slug":"respondeu","label":"Respondeu","order_index":2,"is_final_positive":false},
      {"slug":"recomprou","label":"Recomprou","order_index":3,"is_final_positive":true}
    ]'::jsonb
    WHEN 'cobranca' THEN '[
      {"slug":"aguardando","label":"Aguardando","order_index":0,"is_final_positive":false},
      {"slug":"tentativa","label":"Tentativa","order_index":1,"is_final_positive":false},
      {"slug":"negociando","label":"Negociando","order_index":2,"is_final_positive":false},
      {"slug":"comprovante_enviado","label":"Comprovante enviado","order_index":3,"is_final_positive":false},
      {"slug":"pagou","label":"Pagou","order_index":4,"is_final_positive":true}
    ]'::jsonb
    WHEN 'agendamento' THEN '[
      {"slug":"aguardando","label":"Aguardando","order_index":0,"is_final_positive":false},
      {"slug":"abordado","label":"Abordado","order_index":1,"is_final_positive":false},
      {"slug":"negociando_horario","label":"Negociando horário","order_index":2,"is_final_positive":false},
      {"slug":"agendado","label":"Agendado","order_index":3,"is_final_positive":false},
      {"slug":"compareceu","label":"Compareceu","order_index":4,"is_final_positive":true}
    ]'::jsonb
    WHEN 'indicacao' THEN '[
      {"slug":"saudacao","label":"Saudação","order_index":0,"is_final_positive":false},
      {"slug":"apresentacao","label":"Apresentação","order_index":1,"is_final_positive":false},
      {"slug":"negociacao","label":"Negociação","order_index":2,"is_final_positive":false},
      {"slug":"fechado","label":"Fechado","order_index":3,"is_final_positive":true}
    ]'::jsonb
  END;

  INSERT INTO public.campaign_phases (campaign_id, slug, label, order_index, is_final_positive)
  SELECT NEW.id, p->>'slug', p->>'label', (p->>'order_index')::int, (p->>'is_final_positive')::bool
  FROM jsonb_array_elements(v_phases) p;

  RETURN NEW;
END;
$function$;
;
