-- P1 Raio-X 2026-09-04: backup_malu_contrato_20260904 estava em public SEM RLS
-- (dado de contrato de tenant legivel por anon via PostgREST). Trava com RLS sem
-- policy (default-deny p/ anon/authenticated; service_role continua acessando),
-- alinhando ao padrao dos demais backups. Zero referencias (views/FK) — sem risco.
ALTER TABLE public.backup_malu_contrato_20260904 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.backup_malu_contrato_20260904 FROM anon, authenticated;
;
