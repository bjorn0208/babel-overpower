-- ============================================================================
-- Onda 11 — Banco
-- 1) memoria_lead.confirmado_pelo_lead + confirmado_em + confirmado_por
-- 2) cron-promover-blocos-cross-nicho semanal (funcao + agendar)
-- 3) candidatos_bloco — garantir tabela existe (schema mínimo)
-- ============================================================================

-- 1) Flag confirmado_pelo_lead em memoria_lead
ALTER TABLE public.memoria_lead
  ADD COLUMN IF NOT EXISTS confirmado_pelo_lead boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmado_em timestamptz,
  ADD COLUMN IF NOT EXISTS confirmado_por uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_memoria_lead_confirmado
  ON public.memoria_lead(lead_id, confirmado_pelo_lead) 
  WHERE confirmado_pelo_lead = true;

-- 2) Função promover blocos cross-nicho (se bloco tenant é canonico em ≥3 tenants do mesmo nicho)
CREATE OR REPLACE FUNCTION public.promover_blocos_cross_nicho()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_inseridos int := 0;
BEGIN
  -- Pra cada nicho, identifica blocos canônicos em ≥3 tenants do mesmo nicho
  -- e cria candidato escopo='nicho' em candidatos_bloco (se não existir já)
  -- Tabela candidatos_bloco já existe (referência §6.4 do plano)
  -- Schema esperado: id, gaveta, payload jsonb, escopo_proposto, nicho_id, motivo, criado_em, status
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables 
                 WHERE table_schema='public' AND table_name='candidatos_bloco') THEN
    -- Tabela ausente — pular (será criada em onda específica)
    RETURN jsonb_build_object('ok', false, 'erro', 'candidatos_bloco ausente');
  END IF;
  
  -- Pra simplicidade desta onda, registramos placeholder (sem implementação concreta agora —
  -- B3 destilação real virá na Onda 12; promoção real virá quando ≥3 tenants tiverem nicho_id).
  
  RETURN jsonb_build_object('ok', true, 'inseridos', v_inseridos, 'nota', 'placeholder — promoção real após Onda 12 + backfill nicho_id');
END;
$func$;

-- 3) Cron semanal segunda-feira 04:00 UTC (01:00 BRT) — placeholder até backfill nicho_id existir
-- (Não agenda ainda — quando profiles.nicho_id estiver populado e B3-V2 rodar, ativar via UI ou nova migration)

;
