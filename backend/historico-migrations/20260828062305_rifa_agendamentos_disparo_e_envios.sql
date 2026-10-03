-- Agendamentos de disparo da rifa: múltiplos horários, tipo de conteúdo,
-- contatos filtrados e tempo de descanso entre envios.
CREATE TABLE IF NOT EXISTS public.rifa_agendamentos_disparo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.profiles(id),
  rifa_id uuid NOT NULL REFERENCES public.rifas(id),
  horario time NOT NULL,
  tipo_conteudo text NOT NULL CHECK (tipo_conteudo IN ('foto', 'texto', 'video', 'foto_texto')),
  mensagem text,
  ativo boolean NOT NULL DEFAULT true,
  tempo_descanso_segundos integer NOT NULL DEFAULT 5,
  contatos_ids uuid[],
  ultima_execucao_dia date,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rifa_agendamentos_disparo_tenant_idx ON public.rifa_agendamentos_disparo (tenant_id);
CREATE INDEX IF NOT EXISTS rifa_agendamentos_disparo_rifa_idx ON public.rifa_agendamentos_disparo (rifa_id);
CREATE INDEX IF NOT EXISTS rifa_agendamentos_disparo_ativo_idx ON public.rifa_agendamentos_disparo (ativo) WHERE ativo = true;

ALTER TABLE public.rifa_agendamentos_disparo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rifa_agendamentos_disparo_tenant_tudo" ON public.rifa_agendamentos_disparo
  FOR ALL TO authenticated
  USING (tenant_id = (select auth.uid()))
  WITH CHECK (tenant_id = (select auth.uid()));

-- Histórico de envios (analytics ao vivo): sucesso/erro por contato, com a
-- mensagem enviada guardada pro ícone de olho no frontend.
CREATE TABLE IF NOT EXISTS public.rifa_disparo_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.profiles(id),
  agendamento_id uuid REFERENCES public.rifa_agendamentos_disparo(id) ON DELETE SET NULL,
  rifa_id uuid NOT NULL REFERENCES public.rifas(id),
  lista_disparo_id uuid REFERENCES public.rifa_lista_disparo(id) ON DELETE SET NULL,
  phone text NOT NULL,
  status text NOT NULL CHECK (status IN ('sucesso', 'erro')),
  mensagem_enviada text,
  erro_detalhe text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rifa_disparo_envios_tenant_idx ON public.rifa_disparo_envios (tenant_id);
CREATE INDEX IF NOT EXISTS rifa_disparo_envios_agendamento_idx ON public.rifa_disparo_envios (agendamento_id);
CREATE INDEX IF NOT EXISTS rifa_disparo_envios_criado_idx ON public.rifa_disparo_envios (criado_em DESC);

ALTER TABLE public.rifa_disparo_envios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rifa_disparo_envios_tenant_tudo" ON public.rifa_disparo_envios
  FOR ALL TO authenticated
  USING (tenant_id = (select auth.uid()))
  WITH CHECK (tenant_id = (select auth.uid()));

;
