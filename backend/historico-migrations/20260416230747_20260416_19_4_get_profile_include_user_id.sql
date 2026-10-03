-- Inclui user_id no retorno de public_get_profile pra possibilitar form de testimonial anon
-- (é uuid, não dado sensível — usado só como FK na tabela)

CREATE OR REPLACE FUNCTION public_get_profile(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
  v_profile jsonb;
  v_empresa jsonb;
  v_services jsonb;
  v_gallery jsonb;
  v_testimonials jsonb;
BEGIN
  SELECT pp.user_id INTO v_user_id
  FROM public_profile pp
  WHERE pp.slug = p_slug AND pp.is_active = true;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT to_jsonb(pp) INTO v_profile
  FROM public_profile pp WHERE pp.user_id = v_user_id;

  SELECT jsonb_build_object(
    'nome', e.nome,
    'descricao', e.descricao,
    'endereco', e.endereco,
    'bairro', e.bairro,
    'cidade', e.cidade,
    'estado', e.estado,
    'cep', e.cep,
    'instagram', e.instagram,
    'facebook', e.facebook,
    'tiktok', e.tiktok,
    'whatsapp', e.whatsapp,
    'youtube', e.youtube,
    'site', e.site,
    'logo_url', e.logo_url,
    'banner_url', e.banner_url
  ) INTO v_empresa
  FROM empresas e WHERE e.user_id = v_user_id LIMIT 1;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', s.id, 'nome', s.nome, 'descricao', s.descricao,
      'foto_url', s.foto_url, 'preco_text', s.preco_text, 'ordem', s.ordem
    ) ORDER BY s.ordem
  ), '[]'::jsonb) INTO v_services
  FROM public_services s WHERE s.user_id = v_user_id;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', g.id, 'titulo', g.titulo, 'descricao', g.descricao,
      'foto_url', g.foto_url, 'ordem', g.ordem
    ) ORDER BY g.ordem
  ), '[]'::jsonb) INTO v_gallery
  FROM public_gallery g WHERE g.user_id = v_user_id;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', t.id, 'autor_nome', t.autor_nome, 'autor_foto_url', t.autor_foto_url,
      'texto', t.texto, 'nota', t.nota, 'created_at', t.created_at
    ) ORDER BY t.created_at DESC
  ), '[]'::jsonb) INTO v_testimonials
  FROM public_testimonials t
  WHERE t.user_id = v_user_id AND t.aprovado = true;

  RETURN jsonb_build_object(
    'profile', v_profile,
    'empresa', v_empresa,
    'services', v_services,
    'gallery', v_gallery,
    'testimonials', v_testimonials,
    'user_id', v_user_id
  );
END;
$$;
;
