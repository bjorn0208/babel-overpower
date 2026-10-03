CREATE OR REPLACE FUNCTION public._tg_derivar_template_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.conteudo_comum IS NULL
     OR (
       TG_OP = 'UPDATE' AND (
         NEW.conteudo IS DISTINCT FROM OLD.conteudo
         OR NEW.valor_a_vista IS DISTINCT FROM OLD.valor_a_vista
         OR NEW.campos_obrigatorios IS DISTINCT FROM OLD.campos_obrigatorios
         OR NEW.chave_pix IS DISTINCT FROM OLD.chave_pix
         OR NEW.link_parcelamento IS DISTINCT FROM OLD.link_parcelamento
         OR NEW.posicao_pagamento IS DISTINCT FROM OLD.posicao_pagamento
         OR NEW.instrucao_selfie IS DISTINCT FROM OLD.instrucao_selfie
         OR NEW.num_testemunhas IS DISTINCT FROM OLD.num_testemunhas
         OR NEW.produto_id IS DISTINCT FROM OLD.produto_id
       )
     )
  THEN
    -- BLINDAGEM (B5): derivar metadados inertes JAMAIS aborta o save do template.
    BEGIN
      PERFORM public.derivar_template_v2(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'derivar_template_v2 falhou para template % (save preservado): %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$function$

