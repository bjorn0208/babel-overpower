-- Leads já marcados como fechados/convertidos que ficaram com location='atendimento'
-- (fluxo antigo sem atualizar location). O módulo Clientes filtra por location='cliente'.
UPDATE public.leads
SET location = 'cliente', updated_at = now()
WHERE deleted_at IS NULL
  AND converted_at IS NOT NULL
  AND pipeline_stage = 'fechado'
  AND location = 'atendimento';
;
