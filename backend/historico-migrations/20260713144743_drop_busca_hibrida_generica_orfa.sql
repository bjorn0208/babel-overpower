-- Órfã desde o Big-Bang Rename (callers migraram pras busca_hibrida_* com sufixo).
-- Perigosa: lia blocos_conhecimento sem filtrar ativo nem deleted_at — se alguém a chamasse
-- por engano, o furo do bloco fantasma (incidente 2026-07-13) voltava inteiro.
DROP FUNCTION IF EXISTS public.busca_hibrida(
  text, text, uuid, integer, double precision, double precision, integer, text[]
);
;
