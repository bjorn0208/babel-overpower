CREATE OR REPLACE FUNCTION public.limpar_fluxo_ao_excluir_produto()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_agent record;
  v_quals_validos jsonb;
BEGIN
  FOR v_agent IN
    SELECT au.id, au.fluxo
    FROM public.agentes_usuario au
    WHERE jsonb_typeof(au.fluxo->'qualificacao'->'qualificadores_produto') = 'array'
      AND au.fluxo->'qualificacao'->'qualificadores_produto' @> jsonb_build_array(jsonb_build_object('produto_id', OLD.id::text))
  LOOP
    SELECT COALESCE(
      jsonb_agg(qp ORDER BY ord)
        FILTER (WHERE qp->>'produto_id' <> OLD.id::text),
      '[]'::jsonb
    )
    INTO v_quals_validos
    FROM jsonb_array_elements(v_agent.fluxo->'qualificacao'->'qualificadores_produto') WITH ORDINALITY AS t(qp, ord);

    UPDATE public.agentes_usuario
    SET fluxo = jsonb_set(fluxo, '{qualificacao,qualificadores_produto}', v_quals_validos, false),
        updated_at = now()
    WHERE id = v_agent.id;
  END LOOP;

  RETURN OLD;
END;
$function$

