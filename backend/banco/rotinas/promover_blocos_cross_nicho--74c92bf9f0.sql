CREATE OR REPLACE FUNCTION public.promover_blocos_cross_nicho()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$

