
-- 1) Renome físico das tabelas
ALTER TABLE public.agentes_usuario RENAME TO agentes;
ALTER TABLE public.crenca_conversa RENAME TO prancheta;

-- 2) Views de compatibilidade (writable — Postgres atualiza views simples direto)
CREATE OR REPLACE VIEW public.agentes_usuario AS
  SELECT * FROM public.agentes;

CREATE OR REPLACE VIEW public.crenca_conversa AS
  SELECT * FROM public.prancheta;

-- Garante que as views herdam permissões compatíveis
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agentes_usuario TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crenca_conversa TO authenticated, service_role;

-- security_invoker: a view aplica RLS da tabela base como o usuário chamador
ALTER VIEW public.agentes_usuario SET (security_invoker = true);
ALTER VIEW public.crenca_conversa SET (security_invoker = true);

-- 3) Comentários documentando o renome
COMMENT ON TABLE public.agentes IS 'Agentes (renomeado de agentes_usuario na Onda 7). View public.agentes_usuario mantém compat até remoção do código legado.';
COMMENT ON TABLE public.prancheta IS 'Prancheta de raciocínio do agente (renomeado de crenca_conversa na Onda 7). View public.crenca_conversa mantém compat até remoção do código legado.';
COMMENT ON VIEW public.agentes_usuario IS 'DEPRECATED: usar public.agentes. View de compat da Onda 7.';
COMMENT ON VIEW public.crenca_conversa IS 'DEPRECATED: usar public.prancheta. View de compat da Onda 7.';

;
