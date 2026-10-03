-- Fonte da verdade do preço = catálogo (produtos). A foto gravada no template
-- (valor_a_vista/opcoes_parcelamento/produtos_aceitos) desatualizava quando o
-- produto mudava de preço — caso Diego 2026-08-10: contrato saiu 1117 com o
-- produto valendo 597 (foto de 10/06). Agora a foto se regrava sozinha:
--  1) BEFORE trigger no template puxa o preço vivo do produto a cada save;
--  2) AFTER trigger no produto propaga mudança de preço pros templates dele;
--  3) backfill corrige as fotos velhas existentes.
-- Produto sem preço cravado (preco_centavos nulo/0) não mexe na foto.

CREATE OR REPLACE FUNCTION public.sincronizar_foto_preco_template()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_p RECORD;
BEGIN
  IF NEW.produto_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.preco_centavos, p.entrada_centavos, p.max_parcelas, p.valor_parcela_cravado_centavos
    INTO v_p
  FROM public.produtos p
  WHERE p.id = NEW.produto_id AND COALESCE(p.preco_centavos, 0) > 0;

  IF NOT FOUND THEN
    RETURN NEW; -- produto sem preço cravado: foto do template continua valendo
  END IF;

  NEW.valor_a_vista := round(v_p.preco_centavos::numeric / 100, 2);

  IF COALESCE(v_p.max_parcelas, 0) > 0 AND COALESCE(v_p.valor_parcela_cravado_centavos, 0) > 0 THEN
    NEW.opcoes_parcelamento := jsonb_build_array(jsonb_build_object(
      'parcelas',      v_p.max_parcelas,
      'entrada',       round(COALESCE(v_p.entrada_centavos, 0)::numeric / 100, 2),
      'valor_parcela', round(v_p.valor_parcela_cravado_centavos::numeric / 100, 2),
      'valor_total',   round((COALESCE(v_p.entrada_centavos, 0)
                        + v_p.max_parcelas * v_p.valor_parcela_cravado_centavos)::numeric / 100, 2)
    ));
  END IF;

  -- Construtor coerente: elementos de produtos_aceitos do mesmo produto
  -- ganham o preço vivo também.
  IF NEW.produtos_aceitos IS NOT NULL AND jsonb_typeof(NEW.produtos_aceitos) = 'array' THEN
    SELECT jsonb_agg(
      CASE WHEN (e ->> 'produto_id') = NEW.produto_id::text THEN
        e || jsonb_build_object(
          'preco_avista', round(v_p.preco_centavos::numeric / 100, 2),
          'preco_pendente', false,
          'parcelamento', jsonb_build_object(
            'entrada',               round(COALESCE(v_p.entrada_centavos, 0)::numeric / 100, 2),
            'max_parcelas',          COALESCE(v_p.max_parcelas, 0),
            'total_parcelado',       0,
            'valor_parcelado_total', round((COALESCE(v_p.entrada_centavos, 0)
                                      + COALESCE(v_p.max_parcelas, 0) * COALESCE(v_p.valor_parcela_cravado_centavos, 0))::numeric / 100, 2)
          )
        )
      ELSE e END
      ORDER BY ord)
      INTO NEW.produtos_aceitos
    FROM jsonb_array_elements(NEW.produtos_aceitos) WITH ORDINALITY AS t(e, ord);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contratos_template_foto_preco ON public.contratos_template;
CREATE TRIGGER trg_contratos_template_foto_preco
  BEFORE INSERT OR UPDATE ON public.contratos_template
  FOR EACH ROW EXECUTE FUNCTION public.sincronizar_foto_preco_template();

-- Propagação: preço do produto mudou → update no-op nos templates vinculados
-- só pra disparar o BEFORE trigger acima (lógica da foto vive num lugar só).
CREATE OR REPLACE FUNCTION public.propagar_preco_produto_templates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

DROP TRIGGER IF EXISTS trg_produtos_propaga_preco ON public.produtos;
CREATE TRIGGER trg_produtos_propaga_preco
  AFTER UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.propagar_preco_produto_templates();

-- Backfill: regrava a foto de todo template com produto vinculado.
UPDATE public.contratos_template SET produto_id = produto_id WHERE produto_id IS NOT NULL;

-- down (referência):
-- DROP TRIGGER IF EXISTS trg_produtos_propaga_preco ON public.produtos;
-- DROP TRIGGER IF EXISTS trg_contratos_template_foto_preco ON public.contratos_template;
-- DROP FUNCTION IF EXISTS public.propagar_preco_produto_templates();
-- DROP FUNCTION IF EXISTS public.sincronizar_foto_preco_template();
;
