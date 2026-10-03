-- Remove a sobrecarga sem argumentos pra resolver ambiguidade no PostgREST.
-- A versao com p_incluir_inativos boolean DEFAULT false cobre os 2 casos:
-- chamadas sem args (default false) e com args (true).
DROP FUNCTION IF EXISTS public.cargos_visiveis_tenant();
;
