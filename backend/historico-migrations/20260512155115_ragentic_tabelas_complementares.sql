-- ---- restante das tabelas Ragentic ---------------------------------------
CREATE TABLE IF NOT EXISTS public.tools_do_agente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_id uuid NOT NULL REFERENCES public.agentes(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  schema_zod jsonb NOT NULL DEFAULT '{}'::jsonb,
  endpoint_url text,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tools_do_agente_agente_idx ON public.tools_do_agente (agente_id, ativo);
ALTER TABLE public.tools_do_agente ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tools_do_agente_via_agente ON public.tools_do_agente;
CREATE POLICY tools_do_agente_via_agente ON public.tools_do_agente FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agentes a WHERE a.id = agente_id AND a.owner_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.agentes a WHERE a.id = agente_id AND a.owner_id = (select auth.uid())));

CREATE TABLE IF NOT EXISTS public.testes_ab_blocos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bloco_a_id uuid REFERENCES public.blocos_conhecimento(id) ON DELETE CASCADE,
  bloco_b_id uuid REFERENCES public.blocos_conhecimento(id) ON DELETE CASCADE,
  metrica text NOT NULL,
  resultado jsonb DEFAULT '{}'::jsonb,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz
);
ALTER TABLE public.testes_ab_blocos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS testes_ab_admin ON public.testes_ab_blocos;
CREATE POLICY testes_ab_admin ON public.testes_ab_blocos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'));

CREATE TABLE IF NOT EXISTS public.tags_vocabulario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  agente_id uuid REFERENCES public.agentes(id) ON DELETE CASCADE,
  chave text NOT NULL,
  valor text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agente_id, chave, valor)
);
CREATE INDEX IF NOT EXISTS tags_vocabulario_agente_idx ON public.tags_vocabulario (agente_id, chave);
ALTER TABLE public.tags_vocabulario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tags_vocab_tenant ON public.tags_vocabulario;
CREATE POLICY tags_vocab_tenant ON public.tags_vocabulario FOR ALL TO authenticated
  USING (owner_id = (select auth.uid())) WITH CHECK (owner_id = (select auth.uid()));

CREATE TABLE IF NOT EXISTS public.intencoes_pendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL REFERENCES public.conversas(id) ON DELETE CASCADE,
  intencao text NOT NULL,
  dados jsonb DEFAULT '{}'::jsonb,
  resolvida_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS intencoes_conversa_idx ON public.intencoes_pendentes (conversa_id, resolvida_em);
ALTER TABLE public.intencoes_pendentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS intencoes_via_conversa ON public.intencoes_pendentes;
CREATE POLICY intencoes_via_conversa ON public.intencoes_pendentes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversas c WHERE c.id = conversa_id AND c.tenant_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.conversas c WHERE c.id = conversa_id AND c.tenant_id = (select auth.uid())));

CREATE TABLE IF NOT EXISTS public.eventos_lead (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  conversa_id uuid REFERENCES public.conversas(id) ON DELETE SET NULL,
  tipo text NOT NULL,
  carga jsonb DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS eventos_lead_cliente_idx ON public.eventos_lead (cliente_id, criado_em DESC);
ALTER TABLE public.eventos_lead ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eventos_lead_via_cliente ON public.eventos_lead;
CREATE POLICY eventos_lead_via_cliente ON public.eventos_lead FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = cliente_id AND c.owner_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = cliente_id AND c.owner_id = (select auth.uid())));

CREATE TABLE IF NOT EXISTS public.compromissos_do_lead (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  conversa_id uuid REFERENCES public.conversas(id) ON DELETE SET NULL,
  titulo text NOT NULL,
  quando timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'agendado',
  carga jsonb DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS compromissos_cliente_idx ON public.compromissos_do_lead (cliente_id, quando);
ALTER TABLE public.compromissos_do_lead ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compromissos_via_cliente ON public.compromissos_do_lead;
CREATE POLICY compromissos_via_cliente ON public.compromissos_do_lead FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = cliente_id AND c.owner_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = cliente_id AND c.owner_id = (select auth.uid())));

CREATE TABLE IF NOT EXISTS public.metricas_agente_diario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_id uuid NOT NULL REFERENCES public.agentes(id) ON DELETE CASCADE,
  dia date NOT NULL,
  metricas jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (agente_id, dia)
);
ALTER TABLE public.metricas_agente_diario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS metricas_agente_via_agente ON public.metricas_agente_diario;
CREATE POLICY metricas_agente_via_agente ON public.metricas_agente_diario FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agentes a WHERE a.id = agente_id AND a.owner_id = (select auth.uid())));

CREATE TABLE IF NOT EXISTS public.movimentos_financeiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  valor numeric NOT NULL,
  descricao text,
  carga jsonb DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mov_fin_owner_idx ON public.movimentos_financeiros (owner_id, criado_em DESC);
ALTER TABLE public.movimentos_financeiros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mov_fin_tenant ON public.movimentos_financeiros;
CREATE POLICY mov_fin_tenant ON public.movimentos_financeiros FOR ALL TO authenticated
  USING (owner_id = (select auth.uid())) WITH CHECK (owner_id = (select auth.uid()));

CREATE TABLE IF NOT EXISTS public.pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  valor numeric NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  metodo text,
  carga jsonb DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pagamentos_owner_idx ON public.pagamentos (owner_id, criado_em DESC);
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pagamentos_tenant ON public.pagamentos;
CREATE POLICY pagamentos_tenant ON public.pagamentos FOR ALL TO authenticated
  USING (owner_id = (select auth.uid())) WITH CHECK (owner_id = (select auth.uid()));

CREATE TABLE IF NOT EXISTS public.configuracoes_sistema (
  chave text PRIMARY KEY,
  valor jsonb NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.configuracoes_sistema ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS config_sistema_admin ON public.configuracoes_sistema;
CREATE POLICY config_sistema_admin ON public.configuracoes_sistema FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'));

CREATE TABLE IF NOT EXISTS public.carrinho_da_conversa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL REFERENCES public.conversas(id) ON DELETE CASCADE,
  produto_id uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  quantidade integer NOT NULL DEFAULT 1,
  preco_unitario numeric NOT NULL DEFAULT 0,
  adicionado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS carrinho_conversa_idx ON public.carrinho_da_conversa (conversa_id);
ALTER TABLE public.carrinho_da_conversa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS carrinho_via_conversa ON public.carrinho_da_conversa;
CREATE POLICY carrinho_via_conversa ON public.carrinho_da_conversa FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversas c WHERE c.id = conversa_id AND c.tenant_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.conversas c WHERE c.id = conversa_id AND c.tenant_id = (select auth.uid())));

CREATE TABLE IF NOT EXISTS public.mensagens_processadas (
  zapi_message_id text PRIMARY KEY,
  processado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orcamento_uso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  agente_id uuid REFERENCES public.agentes(id) ON DELETE SET NULL,
  modelo text NOT NULL,
  tokens_entrada bigint NOT NULL DEFAULT 0,
  tokens_saida bigint NOT NULL DEFAULT 0,
  custo numeric NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orc_uso_owner_idx ON public.orcamento_uso (owner_id, criado_em DESC);
ALTER TABLE public.orcamento_uso ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orc_uso_tenant ON public.orcamento_uso;
CREATE POLICY orc_uso_tenant ON public.orcamento_uso FOR ALL TO authenticated
  USING (owner_id = (select auth.uid())) WITH CHECK (owner_id = (select auth.uid()));
;
