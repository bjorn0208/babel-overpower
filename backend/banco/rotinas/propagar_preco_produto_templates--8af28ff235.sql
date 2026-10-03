CREATE OR REPLACE FUNCTION public.propagar_preco_produto_templates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF COALESCE(NEW.preco_centavos, 0) > 0 AND (
       NEW.preco_centavos IS DISTINCT FROM OLD.preco_centavos OR
       NEW.entrada_centavos IS DISTINCT FROM OLD.entrada_centavos OR
       NEW.max_parcelas IS DISTINCT FROM OLD.max_parcelas OR
       NEW.valor_parcela_cravado_centavos IS DISTINCT FROM OLD.valor_parcela_cravado_centavos
     ) THEN
    UPDATE public.contratos_template SET produto_id = produto_id WHERE produto_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$

