-- Bug: em 6 das 9 gavetas do Hub de Conhecimento, a policy de leitura do
-- tenant amarra a visibilidade da PRÓPRIA linha ('escopo=tenant/produto') ao
-- mesmo `ativo=true` usado pra global/nicho. O soft-delete (excluirBloco)
-- grava exatamente `ativo=false` — a linha vira invisível pra política de
-- leitura no MESMO instante em que a escrita tenta acontecer, e o Postgres
-- recusa com "new row violates row-level security policy" (42501). Resultado:
-- excluir (e, em blocos_procedurais, também o `deleted_at`) nunca funciona
-- pra tenant algum nessas 6 tabelas — falha silenciosa, sem toast na UI.
-- Fix: `ativo=true` (e `deleted_at is null`) passam a valer só pros ramos
-- global/nicho (ativação do admin/plataforma). O ramo do PRÓPRIO tenant fica
-- sempre visível pro dono — a lista já filtra `deleted_at is null` no client
-- (use-hub-conhecimento.ts), então nada muda pro usuário além de destravar
-- excluir/reativar. Testado e validado no ambiente local antes de aplicar.

alter policy "user_read_own_blocos" on public.blocos_conhecimento
  using (
    (
      (escopo = 'global' and ativo = true)
      or (escopo = 'nicho' and ativo = true and nicho_id = (select p.nicho_id from public.profiles p where p.id = (select auth.uid())))
      or (escopo = 'tenant' and agente_id in (select ua.id from public.agentes ua where ua.user_id = (select auth.uid())))
    )
    and not exists (
      select 1 from public.overrides_tenant_blocos_conhecimento o
      where o.bloco_id = blocos_conhecimento.id and o.tenant_id = (select auth.uid()) and o.ativo = false
    )
  );

alter policy "tenant_read_blocos" on public.blocos_comportamento
  using (
    (
      (escopo = 'global' and ativo = true)
      or (escopo = 'nicho' and ativo = true and nicho_id = (select p.nicho_id from public.profiles p where p.id = (select auth.uid())))
      or (escopo = 'tenant' and tenant_id = (select auth.uid()))
      or (escopo = 'produto' and tenant_id = (select auth.uid()))
    )
    and not exists (
      select 1 from public.overrides_tenant_blocos_comportamento o
      where o.bloco_id = blocos_comportamento.id and o.tenant_id = (select auth.uid()) and o.ativo = false
    )
  );

alter policy "tenant_read_blocos_gatilho" on public.blocos_gatilho
  using (
    (
      (escopo = 'global' and ativo = true)
      or (escopo = 'nicho' and ativo = true and nicho_id = (select p.nicho_id from public.profiles p where p.id = (select auth.uid())))
      or (escopo = any (array['tenant','produto']) and tenant_id = (select auth.uid()))
    )
    and not exists (
      select 1 from public.overrides_tenant_blocos_gatilho o
      where o.bloco_id = blocos_gatilho.id and o.tenant_id = (select auth.uid()) and o.ativo = false
    )
  );

alter policy "tenant_read_blocos_humanizacao" on public.blocos_humanizacao
  using (
    (
      (escopo = 'global' and ativo = true)
      or (escopo = 'nicho' and ativo = true and nicho_id = (select p.nicho_id from public.profiles p where p.id = (select auth.uid())))
      or (escopo = any (array['tenant','produto']) and tenant_id = (select auth.uid()))
    )
    and not exists (
      select 1 from public.overrides_tenant_blocos_humanizacao o
      where o.bloco_id = blocos_humanizacao.id and o.tenant_id = (select auth.uid()) and o.ativo = false
    )
  );

alter policy "tenant_read_blocos_procedurais" on public.blocos_procedurais
  using (
    (escopo = 'global' and ativo = true and deleted_at is null)
    or (tenant_id = (select auth.uid()))
  );

alter policy "auth_read_variation" on public.blocos_variacao
  using (
    (
      (escopo = 'global' and ativo = true)
      or (escopo = 'nicho' and ativo = true and nicho_id = (select p.nicho_id from public.profiles p where p.id = (select auth.uid())))
      or (escopo = 'tenant' and tenant_id = (select auth.uid()))
    )
    and not exists (
      select 1 from public.overrides_tenant_blocos_variacao o
      where o.bloco_id = blocos_variacao.id and o.tenant_id = (select auth.uid()) and o.ativo = false
    )
  );
;
