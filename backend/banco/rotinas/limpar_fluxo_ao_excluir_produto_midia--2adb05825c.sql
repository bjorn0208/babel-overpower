CREATE OR REPLACE FUNCTION public.limpar_fluxo_ao_excluir_produto_midia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_agent record;
  v_fase text;
  v_midias_validas jsonb;
BEGIN
  FOR v_agent IN
    SELECT au.id, au.fluxo
    FROM public.agentes_usuario au
    WHERE au.fluxo IS NOT NULL
  LOOP
    FOR v_fase IN SELECT unnest(ARRAY['saudacao','qualificacao','apresentacao','negociacao','fechado'])
    LOOP
      IF jsonb_typeof(v_agent.fluxo->v_fase->'midias_envio') = 'array'
         AND v_agent.fluxo->v_fase->'midias_envio' @> jsonb_build_array(jsonb_build_object('produto_midia_id', OLD.id::text)) THEN
        SELECT COALESCE(
          jsonb_agg(m ORDER BY ord)
            FILTER (WHERE m->>'produto_midia_id' <> OLD.id::text),
          '[]'::jsonb
        )
        INTO v_midias_validas
        FROM jsonb_array_elements(v_agent.fluxo->v_fase->'midias_envio') WITH ORDINALITY AS t(m, ord);

        UPDATE public.agentes_usuario
        SET fluxo = jsonb_set(fluxo, ARRAY[v_fase, 'midias_envio'], v_midias_validas, false),
            updated_at = now()
        WHERE id = v_agent.id;
      END IF;
    END LOOP;
  END LOOP;

  RETURN OLD;
END;
$function$

