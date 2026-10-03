-- ============================================================
-- PARTE 1 · DML · Limpa orfaos atuais em agentes_usuario.fluxo
-- ============================================================

-- 1.A) Remove qualificadores_produto cujo produto_id nao existe mais
WITH alvos AS (
  SELECT
    au.id,
    au.fluxo,
    COALESCE(
      jsonb_agg(qp ORDER BY ord)
        FILTER (WHERE EXISTS (SELECT 1 FROM public.produtos p WHERE p.id::text = qp->>'produto_id')),
      '[]'::jsonb
    ) AS quals_validos
  FROM public.agentes_usuario au,
       LATERAL jsonb_array_elements(COALESCE(au.fluxo->'qualificacao'->'qualificadores_produto','[]'::jsonb)) WITH ORDINALITY AS t(qp, ord)
  WHERE au.fluxo->'qualificacao'->'qualificadores_produto' IS NOT NULL
  GROUP BY au.id, au.fluxo
)
UPDATE public.agentes_usuario au
SET fluxo = jsonb_set(
  au.fluxo,
  '{qualificacao,qualificadores_produto}',
  a.quals_validos,
  false
),
updated_at = now()
FROM alvos a
WHERE au.id = a.id
  AND au.fluxo->'qualificacao'->'qualificadores_produto' <> a.quals_validos;

-- 1.B) Remove midias_envio cujo produto_midia_id nao existe mais (todas as fases)
DO $$
DECLARE
  v_fase text;
  v_agente record;
BEGIN
  FOR v_fase IN SELECT unnest(ARRAY['saudacao','qualificacao','apresentacao','negociacao','fechado'])
  LOOP
    FOR v_agente IN
      SELECT au.id, au.fluxo
      FROM public.agentes_usuario au
      WHERE jsonb_typeof(au.fluxo->v_fase->'midias_envio') = 'array'
    LOOP
      DECLARE
        v_midias_validas jsonb;
      BEGIN
        SELECT COALESCE(
          jsonb_agg(m ORDER BY ord)
            FILTER (WHERE EXISTS (SELECT 1 FROM public.produto_midias pm WHERE pm.id::text = m->>'produto_midia_id')),
          '[]'::jsonb
        )
        INTO v_midias_validas
        FROM jsonb_array_elements(v_agente.fluxo->v_fase->'midias_envio') WITH ORDINALITY AS t(m, ord);

        IF v_midias_validas IS DISTINCT FROM v_agente.fluxo->v_fase->'midias_envio' THEN
          UPDATE public.agentes_usuario
          SET fluxo = jsonb_set(fluxo, ARRAY[v_fase, 'midias_envio'], v_midias_validas, false),
              updated_at = now()
          WHERE id = v_agente.id;
        END IF;
      END;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================
-- PARTE 2 · DDL · Triggers de cascata pra prevenir reincidencia
-- ============================================================

-- 2.A) Funcao limpa fluxo quando produto e deletado
CREATE OR REPLACE FUNCTION public.cleanup_fluxo_on_produto_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

DROP TRIGGER IF EXISTS trg_cleanup_fluxo_on_produto_delete ON public.produtos;
CREATE TRIGGER trg_cleanup_fluxo_on_produto_delete
  AFTER DELETE ON public.produtos
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_fluxo_on_produto_delete();

-- 2.B) Funcao limpa fluxo quando produto_midia e deletada
CREATE OR REPLACE FUNCTION public.cleanup_fluxo_on_produto_midia_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

DROP TRIGGER IF EXISTS trg_cleanup_fluxo_on_produto_midia_delete ON public.produto_midias;
CREATE TRIGGER trg_cleanup_fluxo_on_produto_midia_delete
  AFTER DELETE ON public.produto_midias
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_fluxo_on_produto_midia_delete();
;
