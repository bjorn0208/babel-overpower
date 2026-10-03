-- F1 do plano commandbar/cargos (Theus 2026-05-27 06:28 BRT):
-- Cargo Admin (tipologia='admin') só deve ser visto por platform_admin.
-- Hoje policy cargos_ver_globais libera escopo='global' pra todo authenticated,
-- vazando o cargo Admin pra qualquer tenant via SELECT direto OU pela RPC
-- cargos_visiveis_tenant. Defesa em servidor: tira o admin do escopo do tenant.
--
-- Admin global continua visível via cargos_admin_lista (eh_admin_plataforma()),
-- que já existe e filtra system_role='platform_admin'. Sem perda pra super-admin.

DROP POLICY IF EXISTS cargos_ver_globais ON public.cargos;

CREATE POLICY cargos_ver_globais ON public.cargos
  FOR SELECT
  TO authenticated
  USING (
    escopo = 'global'::escopo_ragentic
    AND tipologia <> 'admin'::cargo_tipologia
  );

COMMENT ON POLICY cargos_ver_globais ON public.cargos IS
  'Tenant comum vê globais não-Admin. Admin global tem policy própria (cargos_admin_lista via eh_admin_plataforma()). F1 cargos/commandbar 2026-05-27.';
;
