CREATE OR REPLACE FUNCTION public.admin_publicar_pacote_loja(p_pacote_id uuid, p_preco_mensal numeric DEFAULT NULL::numeric, p_publicado boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_pc public.pacotes_conhecimento%ROWTYPE;
  v_app uuid;
BEGIN
  IF NOT public.eh_admin_plataforma() THEN
    RAISE EXCEPTION 'apenas admin' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_pc FROM public.pacotes_conhecimento WHERE id = p_pacote_id AND origem = 'admin';
  IF v_pc.id IS NULL THEN
    RAISE EXCEPTION 'pacote admin % não encontrado', p_pacote_id USING ERRCODE = 'P0002';
  END IF;

  IF v_pc.loja_aplicativo_id IS NULL THEN
    INSERT INTO public.loja_aplicativos (slug, nome, descricao, icone, categoria, preco_mensal, is_active, ordem)
    VALUES ('pacote-' || replace(v_pc.id::text, '-', ''), v_pc.nome, v_pc.descricao, v_pc.icone,
            'conhecimento', p_preco_mensal, p_publicado, v_pc.ordem)
    RETURNING id INTO v_app;
    UPDATE public.pacotes_conhecimento SET loja_aplicativo_id = v_app WHERE id = v_pc.id;
  ELSE
    v_app := v_pc.loja_aplicativo_id;
    UPDATE public.loja_aplicativos
       SET nome = v_pc.nome, descricao = v_pc.descricao, icone = v_pc.icone,
           preco_mensal = p_preco_mensal, is_active = p_publicado, ordem = v_pc.ordem
     WHERE id = v_app;
  END IF;

  -- Pacote de nicho: o item da Loja também fica restrito ao nicho.
  DELETE FROM public.aplicativos_nicho WHERE aplicativo_id = v_app;
  IF v_pc.nicho_id IS NOT NULL THEN
    INSERT INTO public.aplicativos_nicho (aplicativo_id, nicho_id) VALUES (v_app, v_pc.nicho_id);
  END IF;

  RETURN v_app;
END;
$function$

