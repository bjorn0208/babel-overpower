
DROP TABLE IF EXISTS public.cargos CASCADE;
DROP TABLE IF EXISTS public.ferramentas_dinamicas CASCADE;

CREATE EXTENSION IF NOT EXISTS pgmq;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$ BEGIN CREATE TYPE public.cargo_tipologia AS ENUM ('atendimento','mentor','face_cliente','admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.escopo_ragentic AS ENUM ('global','nicho','tenant');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.trace_tipo AS ENUM ('porteiro','sintese','ferramenta','erro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.eh_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND system_role = 'admin');
$$;

CREATE TABLE public.cargos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escopo public.escopo_ragentic NOT NULL DEFAULT 'tenant',
  tenant_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  nicho_id uuid REFERENCES public.nichos(id) ON DELETE CASCADE,
  tipologia public.cargo_tipologia NOT NULL,
  nome text NOT NULL,
  descricao text,
  objetivo_principal text NOT NULL,
  campos_rastreio jsonb NOT NULL DEFAULT '[]'::jsonb,
  modelo_llm_padrao text,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cargos_escopo_consistente CHECK (
    (escopo='global' AND tenant_id IS NULL AND nicho_id IS NULL) OR
    (escopo='nicho'  AND tenant_id IS NULL AND nicho_id IS NOT NULL) OR
    (escopo='tenant' AND tenant_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX uk_cargos_global_tipologia_nome ON public.cargos(tipologia, nome) WHERE escopo='global';
CREATE INDEX idx_cargos_tenant ON public.cargos(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_cargos_nicho  ON public.cargos(nicho_id)  WHERE nicho_id  IS NOT NULL;
CREATE INDEX idx_cargos_tipologia_ativo ON public.cargos(tipologia, ativo);
ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cargos_ver_globais" ON public.cargos FOR SELECT TO authenticated USING (escopo='global');
CREATE POLICY "cargos_ver_tenant" ON public.cargos FOR SELECT TO authenticated USING (tenant_id=(SELECT auth.uid()));
CREATE POLICY "cargos_admin_globais" ON public.cargos FOR ALL TO authenticated
  USING (escopo='global' AND public.eh_super_admin((SELECT auth.uid())))
  WITH CHECK (escopo='global' AND public.eh_super_admin((SELECT auth.uid())));
CREATE POLICY "cargos_tenant_gerencia" ON public.cargos FOR ALL TO authenticated
  USING (escopo='tenant' AND tenant_id=(SELECT auth.uid()))
  WITH CHECK (escopo='tenant' AND tenant_id=(SELECT auth.uid()));

CREATE TABLE public.cargo_tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo_id uuid NOT NULL REFERENCES public.cargos(id) ON DELETE CASCADE,
  ordem int NOT NULL DEFAULT 0, titulo text NOT NULL, descricao text,
  ativo boolean NOT NULL DEFAULT true, criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cargo_tarefas_cargo ON public.cargo_tarefas(cargo_id, ordem);
ALTER TABLE public.cargo_tarefas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cargo_tarefas_ver" ON public.cargo_tarefas FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cargos c WHERE c.id=cargo_id));
CREATE POLICY "cargo_tarefas_admin" ON public.cargo_tarefas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cargos c WHERE c.id=cargo_id
    AND ((c.escopo='tenant' AND c.tenant_id=(SELECT auth.uid()))
      OR (c.escopo='global' AND public.eh_super_admin((SELECT auth.uid()))))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cargos c WHERE c.id=cargo_id
    AND ((c.escopo='tenant' AND c.tenant_id=(SELECT auth.uid()))
      OR (c.escopo='global' AND public.eh_super_admin((SELECT auth.uid()))))));

CREATE TABLE public.cargo_diretrizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo_id uuid NOT NULL REFERENCES public.cargos(id) ON DELETE CASCADE,
  ordem int NOT NULL DEFAULT 0, titulo text NOT NULL, descricao text,
  ativo boolean NOT NULL DEFAULT true, criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cargo_diretrizes_cargo ON public.cargo_diretrizes(cargo_id, ordem);
ALTER TABLE public.cargo_diretrizes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cargo_diretrizes_ver" ON public.cargo_diretrizes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cargos c WHERE c.id=cargo_id));
CREATE POLICY "cargo_diretrizes_admin" ON public.cargo_diretrizes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cargos c WHERE c.id=cargo_id
    AND ((c.escopo='tenant' AND c.tenant_id=(SELECT auth.uid()))
      OR (c.escopo='global' AND public.eh_super_admin((SELECT auth.uid()))))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cargos c WHERE c.id=cargo_id
    AND ((c.escopo='tenant' AND c.tenant_id=(SELECT auth.uid()))
      OR (c.escopo='global' AND public.eh_super_admin((SELECT auth.uid()))))));

CREATE TABLE public.ferramentas_dinamicas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escopo public.escopo_ragentic NOT NULL DEFAULT 'global',
  tenant_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_tool text NOT NULL,
  descricao text NOT NULL,
  schema_zod jsonb NOT NULL,
  endpoint_url text NOT NULL,
  metodo text NOT NULL DEFAULT 'POST',
  dominio_allowlist text NOT NULL,
  precisa_aprovacao boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uk_ferramentas_dinamicas_global_nome ON public.ferramentas_dinamicas(nome_tool) WHERE escopo='global';
ALTER TABLE public.ferramentas_dinamicas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ferramentas_ver_globais" ON public.ferramentas_dinamicas FOR SELECT TO authenticated USING (escopo='global');
CREATE POLICY "ferramentas_ver_tenant" ON public.ferramentas_dinamicas FOR SELECT TO authenticated USING (tenant_id=(SELECT auth.uid()));
CREATE POLICY "ferramentas_admin" ON public.ferramentas_dinamicas FOR ALL TO authenticated
  USING (public.eh_super_admin((SELECT auth.uid())))
  WITH CHECK (public.eh_super_admin((SELECT auth.uid())));

CREATE TABLE public.cargo_ferramentas (
  cargo_id uuid NOT NULL REFERENCES public.cargos(id) ON DELETE CASCADE,
  ferramenta_id uuid NOT NULL REFERENCES public.ferramentas_dinamicas(id) ON DELETE CASCADE,
  obrigatoria boolean NOT NULL DEFAULT false,
  ordem int NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cargo_id, ferramenta_id)
);
ALTER TABLE public.cargo_ferramentas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cargo_ferramentas_ver" ON public.cargo_ferramentas FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cargos c WHERE c.id=cargo_id));
CREATE POLICY "cargo_ferramentas_admin_global" ON public.cargo_ferramentas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cargos c WHERE c.id=cargo_id AND c.escopo='global')
    AND public.eh_super_admin((SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cargos c WHERE c.id=cargo_id AND c.escopo='global')
    AND public.eh_super_admin((SELECT auth.uid())));
CREATE POLICY "cargo_ferramentas_tenant" ON public.cargo_ferramentas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cargos c WHERE c.id=cargo_id AND c.escopo='tenant' AND c.tenant_id=(SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cargos c WHERE c.id=cargo_id AND c.escopo='tenant' AND c.tenant_id=(SELECT auth.uid())));

CREATE TABLE public.agente_cargo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_id uuid NOT NULL REFERENCES public.agentes_usuario(id) ON DELETE CASCADE,
  cargo_id uuid NOT NULL REFERENCES public.cargos(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  ordem int NOT NULL DEFAULT 0,
  vira_coluna_kanban boolean NOT NULL DEFAULT false,
  rotulo_coluna text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agente_id, cargo_id)
);
CREATE INDEX idx_agente_cargo_agente ON public.agente_cargo(agente_id, ativo, ordem);
CREATE INDEX idx_agente_cargo_tenant ON public.agente_cargo(tenant_id);
ALTER TABLE public.agente_cargo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agente_cargo_tenant" ON public.agente_cargo FOR ALL TO authenticated
  USING (tenant_id=(SELECT auth.uid())) WITH CHECK (tenant_id=(SELECT auth.uid()));

CREATE TABLE public.agente_cargo_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_cargo_id uuid NOT NULL REFERENCES public.agente_cargo(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('tarefa','diretriz')),
  ref_catalogo_id uuid,
  acao text NOT NULL CHECK (acao IN ('adicionar','sobrescrever','remover')),
  titulo text, descricao text,
  ordem int NOT NULL DEFAULT 0, ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_overrides_vinculo ON public.agente_cargo_overrides(agente_cargo_id, tipo, ordem);
ALTER TABLE public.agente_cargo_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "overrides_tenant" ON public.agente_cargo_overrides FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agente_cargo ac WHERE ac.id=agente_cargo_id AND ac.tenant_id=(SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.agente_cargo ac WHERE ac.id=agente_cargo_id AND ac.tenant_id=(SELECT auth.uid())));

CREATE TABLE public.traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agente_id uuid REFERENCES public.agentes_usuario(id) ON DELETE SET NULL,
  lead_id uuid, conversa_id uuid, turno_id uuid,
  cargo_id uuid REFERENCES public.cargos(id) ON DELETE SET NULL,
  tipo public.trace_tipo NOT NULL,
  modelo_llm text, prompt_resumo text, raciocinio_interno text,
  decisao jsonb, confianca numeric(4,3),
  latencia_ms int, custo_tokens_in int, custo_tokens_out int,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_traces_tenant_data ON public.traces(tenant_id, criado_em DESC);
CREATE INDEX idx_traces_conversa ON public.traces(conversa_id, criado_em);
CREATE INDEX idx_traces_lead ON public.traces(lead_id, criado_em DESC);
CREATE INDEX idx_traces_cargo_tipo ON public.traces(cargo_id, tipo, criado_em DESC);
ALTER TABLE public.traces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "traces_tenant_le" ON public.traces FOR SELECT TO authenticated
  USING (tenant_id=(SELECT auth.uid()) OR public.eh_super_admin((SELECT auth.uid())));

CREATE TABLE public.ferramentas_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agente_id uuid REFERENCES public.agentes_usuario(id) ON DELETE SET NULL,
  cargo_id uuid REFERENCES public.cargos(id) ON DELETE SET NULL,
  ferramenta_id uuid REFERENCES public.ferramentas_dinamicas(id) ON DELETE SET NULL,
  nome_ferramenta text NOT NULL,
  trace_id uuid REFERENCES public.traces(id) ON DELETE SET NULL,
  entrada jsonb, saida jsonb,
  status text NOT NULL CHECK (status IN ('sucesso','erro','pendente_aprovacao')),
  erro_msg text, latencia_ms int,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ferramentas_log_tenant_data ON public.ferramentas_log(tenant_id, criado_em DESC);
CREATE INDEX idx_ferramentas_log_ferr_status ON public.ferramentas_log(nome_ferramenta, status, criado_em DESC);
ALTER TABLE public.ferramentas_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ferramentas_log_tenant_le" ON public.ferramentas_log FOR SELECT TO authenticated
  USING (tenant_id=(SELECT auth.uid()) OR public.eh_super_admin((SELECT auth.uid())));

CREATE TABLE public.gatilhos_reativos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escopo public.escopo_ragentic NOT NULL DEFAULT 'tenant',
  tenant_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  nicho_id uuid REFERENCES public.nichos(id) ON DELETE CASCADE,
  cargo_id uuid REFERENCES public.cargos(id) ON DELETE SET NULL,
  origem text NOT NULL CHECK (origem IN ('blocos_gatilho','automacao_blocos','novo')),
  ref_legado_id uuid,
  cenario text NOT NULL,
  acao_tipo text NOT NULL,
  acao_carga jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_gatilhos_tenant_cargo ON public.gatilhos_reativos(tenant_id, cargo_id, ativo);
CREATE INDEX idx_gatilhos_origem_ref ON public.gatilhos_reativos(origem, ref_legado_id);
ALTER TABLE public.gatilhos_reativos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gatilhos_ver_globais" ON public.gatilhos_reativos FOR SELECT TO authenticated USING (escopo='global');
CREATE POLICY "gatilhos_tenant" ON public.gatilhos_reativos FOR ALL TO authenticated
  USING (escopo='tenant' AND tenant_id=(SELECT auth.uid()))
  WITH CHECK (escopo='tenant' AND tenant_id=(SELECT auth.uid()));
CREATE POLICY "gatilhos_admin_globais" ON public.gatilhos_reativos FOR ALL TO authenticated
  USING (escopo='global' AND public.eh_super_admin((SELECT auth.uid())))
  WITH CHECK (escopo='global' AND public.eh_super_admin((SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.set_atualizado_em()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.atualizado_em = now(); RETURN NEW; END $$;
CREATE TRIGGER trg_cargos_atualizado BEFORE UPDATE ON public.cargos
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();
CREATE TRIGGER trg_agente_cargo_atualizado BEFORE UPDATE ON public.agente_cargo
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();

DO $$ BEGIN PERFORM pgmq.create('fila_zapi_inbound'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('fila_porteiro');     EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('fila_sintese');      EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('fila_caixa_saida');  EXCEPTION WHEN OTHERS THEN NULL; END $$;

INSERT INTO public.cargos (escopo, tipologia, nome, descricao, objetivo_principal, campos_rastreio) VALUES
  ('global','atendimento','Atendimento','Porteiro/triagem. Sempre o primeiro a entrar. Lê a mensagem, decide qual cargo deve responder e ativa.','Compreender a demanda do contato e rotear para o cargo certo no menor número de turnos possível.','["intencao_principal","urgencia","cargo_sugerido"]'::jsonb),
  ('global','mentor','Mentor','Conversa com o dono do tenant (não com cliente final). Orienta uso da plataforma.','Ajudar o usuário-tenant a operar a plataforma e tomar decisões sobre os agentes.','["topico_atual","duvida_aberta"]'::jsonb),
  ('global','face_cliente','Vendedor','Conduz a venda quando o atendimento identifica intenção de compra.','Levar o lead da curiosidade ao fechamento, disparando contrato quando apropriado.','["produto_foco","objecoes","fase_funil","valor_aceito"]'::jsonb),
  ('global','face_cliente','Financeiro','Trata cobrança, pagamento, status de fatura.','Resolver pendências financeiras do lead.','["fatura_id","forma_pagamento_preferida","status_pagamento"]'::jsonb),
  ('global','face_cliente','Suporte','Trata dúvidas operacionais e problemas técnicos do contato já cliente.','Resolver o ticket no menor tempo possível ou escalar pra humano.','["categoria_problema","passos_tentados","gravidade"]'::jsonb),
  ('global','admin','Admin','Cargo único global. Só super-admin enxerga. Acesso amplo a queries e operações.','Apoiar o super-admin na operação cross-tenant da plataforma.','["acao_solicitada","escopo_query"]'::jsonb);

;
