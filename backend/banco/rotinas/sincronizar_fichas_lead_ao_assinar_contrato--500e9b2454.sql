CREATE OR REPLACE FUNCTION public.sincronizar_fichas_lead_ao_assinar_contrato()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.assinado_em IS NOT NULL
     AND (OLD.assinado_em IS NULL OR OLD.assinado_em IS DISTINCT FROM NEW.assinado_em)
     AND NEW.conversa_id IS NOT NULL
  THEN
    UPDATE public.fichas_lead
    SET dados_capturados = jsonb_set(
          COALESCE(dados_capturados, '{}'::jsonb),
          '{contrato_assinado}',
          '"sim"'::jsonb,
          true
        ),
        updated_at = now()
    WHERE conversation_id = NEW.conversa_id;
  END IF;
  RETURN NEW;
END;
$function$

