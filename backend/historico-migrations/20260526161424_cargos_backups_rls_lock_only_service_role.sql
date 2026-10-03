-- Backups de 2026-05-26 ficam acessiveis APENAS via service_role (sem policies = bloqueia anon/authenticated).
-- Sao snapshots de rollback rapido, nao devem aparecer em nenhuma consulta de cliente.
ALTER TABLE public.cargos_backup_2026_05_26 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cargo_ferramentas_backup_2026_05_26 ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.cargos_backup_2026_05_26 IS
  'Snapshot pre-fix duplicacao cargos (2026-05-26). RLS habilitado sem policies = so service_role acessa. Manter por 30 dias.';
COMMENT ON TABLE public.cargo_ferramentas_backup_2026_05_26 IS
  'Snapshot pre-fix duplicacao cargos (vinculos ferramentas, 2026-05-26). RLS habilitado sem policies = so service_role acessa. Manter por 30 dias.';
;
