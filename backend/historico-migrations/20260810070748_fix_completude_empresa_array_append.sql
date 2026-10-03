-- Fix: `text[] || 'literal'` é ambíguo (Postgres tenta array||array e quebra o cast).
-- Troca por array_append com cast explícito.
CREATE OR REPLACE FUNCTION public.completude_empresa(p_tenant_id uuid)
RETURNS TABLE(pontuacao int, faltantes text[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  e public.empresas%ROWTYPE;
  v_pontos int := 0;
  v_faltas text[] := '{}';
  v_tem_produto boolean;
  v_tem_conhecimento boolean;
BEGIN
  SELECT * INTO e FROM public.empresas WHERE user_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, ARRAY['cadastro da empresa inteiro']::text[];
    RETURN;
  END IF;

  IF COALESCE(trim(e.nome), '') <> '' THEN v_pontos := v_pontos + 1; ELSE v_faltas := array_append(v_faltas, 'nome'::text); END IF;
  IF COALESCE(trim(e.descricao), '') <> '' THEN v_pontos := v_pontos + 1; ELSE v_faltas := array_append(v_faltas, 'descrição'::text); END IF;
  IF COALESCE(trim(e.missao), '') <> '' THEN v_pontos := v_pontos + 1; ELSE v_faltas := array_append(v_faltas, 'missão'::text); END IF;
  IF COALESCE(trim(e.valores), '') <> '' THEN v_pontos := v_pontos + 1; ELSE v_faltas := array_append(v_faltas, 'valores'::text); END IF;
  IF e.horario_funcionamento IS NOT NULL THEN v_pontos := v_pontos + 1; ELSE v_faltas := array_append(v_faltas, 'horário de funcionamento'::text); END IF;
  IF COALESCE(trim(e.cidade), '') <> '' OR COALESCE(trim(e.endereco), '') <> '' THEN v_pontos := v_pontos + 1; ELSE v_faltas := array_append(v_faltas, 'endereço/cidade'::text); END IF;
  IF COALESCE(trim(e.instagram), '') <> '' OR COALESCE(trim(e.site), '') <> ''
     OR COALESCE(trim(e.facebook), '') <> '' OR COALESCE(trim(e.whatsapp), '') <> '' THEN
    v_pontos := v_pontos + 1;
  ELSE v_faltas := array_append(v_faltas, 'rede social ou site'::text); END IF;
  IF COALESCE(trim(e.logo_url), '') <> '' THEN v_pontos := v_pontos + 1; ELSE v_faltas := array_append(v_faltas, 'logo'::text); END IF;

  SELECT EXISTS (SELECT 1 FROM public.produtos p WHERE p.user_id = p_tenant_id AND p.ativo) INTO v_tem_produto;
  IF v_tem_produto THEN v_pontos := v_pontos + 1; ELSE v_faltas := array_append(v_faltas, 'pelo menos 1 produto ativo'::text); END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.produto_conhecimento pc
    JOIN public.produtos p ON p.id = pc.produto_id
    WHERE p.user_id = p_tenant_id
  ) INTO v_tem_conhecimento;
  IF v_tem_conhecimento THEN v_pontos := v_pontos + 1; ELSE v_faltas := array_append(v_faltas, 'conhecimento de produto'::text); END IF;

  RETURN QUERY SELECT v_pontos * 10, v_faltas;
END;
$$;
;
