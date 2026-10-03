-- ---- mentor (copiloto estratégico do dono) -------------------------------
CREATE TABLE IF NOT EXISTS public.mentor_conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  titulo text NOT NULL DEFAULT 'Conversa com Mentor',
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mentor_conversas_owner_idx ON public.mentor_conversas (owner_id, atualizado_em DESC);
ALTER TABLE public.mentor_conversas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mentor_conversas_tenant ON public.mentor_conversas;
CREATE POLICY mentor_conversas_tenant ON public.mentor_conversas FOR ALL TO authenticated
  USING (owner_id = (select auth.uid())) WITH CHECK (owner_id = (select auth.uid()));

CREATE TABLE IF NOT EXISTS public.mentor_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL REFERENCES public.mentor_conversas(id) ON DELETE CASCADE,
  papel text NOT NULL CHECK (papel IN ('user','assistant','system','tool')),
  conteudo text,
  tool_calls jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mentor_mensagens_conversa_idx ON public.mentor_mensagens (conversa_id, criado_em);
ALTER TABLE public.mentor_mensagens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mentor_mensagens_via_conversa ON public.mentor_mensagens;
CREATE POLICY mentor_mensagens_via_conversa ON public.mentor_mensagens FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mentor_conversas c WHERE c.id = conversa_id AND c.owner_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.mentor_conversas c WHERE c.id = conversa_id AND c.owner_id = (select auth.uid())));

-- ---- traces_do_turno (observabilidade granular) --------------------------
CREATE TABLE IF NOT EXISTS public.traces_do_turno (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid REFERENCES public.conversas(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  carga jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS traces_do_turno_conversa_idx ON public.traces_do_turno (conversa_id, criado_em DESC);
ALTER TABLE public.traces_do_turno ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS traces_via_conversa ON public.traces_do_turno;
CREATE POLICY traces_via_conversa ON public.traces_do_turno FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversas c WHERE c.id = conversa_id AND c.tenant_id = (select auth.uid())));

-- ---- episodios (memória episódica) ---------------------------------------
CREATE TABLE IF NOT EXISTS public.episodios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  agente_id uuid REFERENCES public.agentes(id) ON DELETE SET NULL,
  conversa_id uuid REFERENCES public.conversas(id) ON DELETE SET NULL,
  resumo text NOT NULL,
  importancia numeric NOT NULL DEFAULT 0.5,
  tags text[] DEFAULT '{}'::text[],
  carga jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS episodios_owner_idx ON public.episodios (owner_id, criado_em DESC);
ALTER TABLE public.episodios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS episodios_tenant ON public.episodios;
CREATE POLICY episodios_tenant ON public.episodios FOR ALL TO authenticated
  USING (owner_id = (select auth.uid())) WITH CHECK (owner_id = (select auth.uid()));

-- ---- propostas de aprendizado / sono (auto-curadoria) --------------------
CREATE TABLE IF NOT EXISTS public.propostas_aprendizado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_id uuid REFERENCES public.agentes(id) ON DELETE CASCADE,
  origem text NOT NULL,
  conteudo jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aceita','rejeitada')),
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS propostas_aprendizado_agente_idx ON public.propostas_aprendizado (agente_id, status, criado_em DESC);
ALTER TABLE public.propostas_aprendizado ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS propostas_aprendizado_admin ON public.propostas_aprendizado;
CREATE POLICY propostas_aprendizado_admin ON public.propostas_aprendizado FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'));

CREATE TABLE IF NOT EXISTS public.propostas_do_sono (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem text NOT NULL,
  conteudo jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aceita','rejeitada')),
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.propostas_do_sono ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS propostas_do_sono_admin ON public.propostas_do_sono;
CREATE POLICY propostas_do_sono_admin ON public.propostas_do_sono FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'));

-- ---- simulação (cenários e execuções) ------------------------------------
CREATE TABLE IF NOT EXISTS public.cenarios_simulacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  agente_id uuid REFERENCES public.agentes(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text DEFAULT '',
  modo text NOT NULL CHECK (modo IN ('scripted','adversarial','agente_vs_agente','treino_vendedor')),
  persona_lead jsonb DEFAULT '{}'::jsonb,
  turnos_scripted jsonb DEFAULT '[]'::jsonb,
  criterios_sucesso jsonb DEFAULT '[]'::jsonb,
  max_turnos integer DEFAULT 10,
  modelo_lead text DEFAULT 'google/gemini-2.5-flash',
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cenarios_owner_idx ON public.cenarios_simulacao (owner_id, criado_em DESC);
ALTER TABLE public.cenarios_simulacao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cenarios_tenant ON public.cenarios_simulacao;
CREATE POLICY cenarios_tenant ON public.cenarios_simulacao FOR ALL TO authenticated
  USING (owner_id = (select auth.uid())) WITH CHECK (owner_id = (select auth.uid()));

CREATE TABLE IF NOT EXISTS public.execucoes_simulacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cenario_id uuid REFERENCES public.cenarios_simulacao(id) ON DELETE SET NULL,
  agente_id uuid NOT NULL REFERENCES public.agentes(id) ON DELETE CASCADE,
  conversa_id uuid REFERENCES public.conversas(id) ON DELETE SET NULL,
  modo text NOT NULL,
  status text NOT NULL DEFAULT 'em_execucao',
  bolhas jsonb DEFAULT '[]'::jsonb,
  resultado jsonb DEFAULT '{}'::jsonb,
  erro text,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz
);
CREATE INDEX IF NOT EXISTS execucoes_owner_idx ON public.execucoes_simulacao (owner_id, iniciado_em DESC);
ALTER TABLE public.execucoes_simulacao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS execucoes_tenant ON public.execucoes_simulacao;
CREATE POLICY execucoes_tenant ON public.execucoes_simulacao FOR ALL TO authenticated
  USING (owner_id = (select auth.uid())) WITH CHECK (owner_id = (select auth.uid()));
;
