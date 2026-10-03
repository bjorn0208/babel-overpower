-- Leads com pipeline fechado mas sem converted_at (estado inconsistente).
UPDATE public.leads
SET converted_at = COALESCE(updated_at, created_at, now()),
    client_stage = COALESCE(client_stage, 'documentacao'),
    location = 'cliente',
    updated_at = now()
WHERE deleted_at IS NULL
  AND pipeline_stage = 'fechado'
  AND converted_at IS NULL
  AND COALESCE(location, 'atendimento') = 'atendimento';
;
